//! Local CORS-enabled radio stream proxy.
//!
//! Station streams rarely send `Access-Control-Allow-Origin`, so a webview
//! `AnalyserNode` attached via `createMediaElementSource` gets silent zeros.
//! This loopback proxy re-serves the upstream bytes with
//! `Access-Control-Allow-Origin: *`.

use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{debug, info, warn};

/// Fixed loopback address the radio widget hardcodes.
pub const BIND: &str = "127.0.0.1:17865";

/// Spawn the proxy on the Tauri async runtime. Failures are logged; the app
/// still runs — playback falls back to the raw station URL without VU.
pub fn spawn() {
    tauri::async_runtime::spawn(async {
        if let Err(error) = serve().await {
            warn!(%error, "radio stream proxy stopped");
        }
    });
}

async fn serve() -> Result<()> {
    let listener = TcpListener::bind(BIND)
        .await
        .with_context(|| format!("bind radio proxy at {BIND}"))?;
    info!(addr = BIND, "radio stream proxy listening");

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .connect_timeout(Duration::from_secs(15))
        // Live radio is an open-ended response; never apply a total timeout.
        .pool_max_idle_per_host(0)
        .build()
        .context("build radio proxy client")?;

    loop {
        let (sock, _) = listener.accept().await?;
        let client = client.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = handle(sock, &client).await {
                debug!(%error, "radio proxy request failed");
            }
        });
    }
}

async fn handle(mut sock: TcpStream, client: &reqwest::Client) -> Result<()> {
    let mut buf = vec![0u8; 16_384];
    let n = sock.read(&mut buf).await?;
    if n == 0 {
        return Ok(());
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");

    if method.eq_ignore_ascii_case("OPTIONS") {
        sock.write_all(
            b"HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: *\r\n\
Access-Control-Max-Age: 86400\r\n\
Connection: close\r\n\r\n",
        )
        .await?;
        return Ok(());
    }

    if !method.eq_ignore_ascii_case("GET") && !method.eq_ignore_ascii_case("HEAD") {
        return write_text(&mut sock, 405, "method not allowed").await;
    }

    let Some(url) = extract_upstream(target) else {
        return write_text(&mut sock, 400, "missing u query").await;
    };
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return write_text(&mut sock, 400, "url must be http(s)").await;
    }

    let upstream = match client
        .get(&url)
        .header(USER_AGENT, "murmur-radio/0.3")
        .header("Icy-MetaData", "0")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(error) => {
            return write_text(&mut sock, 502, &format!("upstream: {error}")).await;
        },
    };

    let status = upstream.status().as_u16();
    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");

    let header = format!(
        "HTTP/1.1 {status} \r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: \
         *\r\nAccess-Control-Expose-Headers: *\r\nCache-Control: no-store\r\nConnection: \
         close\r\n\r\n"
    );
    sock.write_all(header.as_bytes()).await?;

    if method.eq_ignore_ascii_case("HEAD") {
        return Ok(());
    }

    let mut upstream = upstream;
    while let Some(chunk) = upstream.chunk().await? {
        if sock.write_all(&chunk).await.is_err() {
            // Client hung up (station change / pause) — normal for live
            // streams.
            break;
        }
    }
    Ok(())
}

fn extract_upstream(path_and_query: &str) -> Option<String> {
    let query = path_and_query.split_once('?')?.1;
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        if key == "u" && !value.is_empty() {
            return Some(value.into_owned());
        }
    }
    None
}

async fn write_text(sock: &mut TcpStream, status: u16, body: &str) -> Result<()> {
    let header = format!(
        "HTTP/1.1 {status} \r\nContent-Type: text/plain; \
         charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: \
         close\r\n\r\n{body}",
        body.len()
    );
    sock.write_all(header.as_bytes()).await?;
    Ok(())
}
