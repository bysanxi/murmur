// Audio playback for one station stream. Streams are long-lived HTTP
// responses, so the player is a single <audio> element: switching is a
// pause, a src swap, and a fresh play(). A stream that errors or stays
// silent past CONNECT_MS is reported dead so the caller can move on —
// plenty of directory entries point at servers that went away.
//
// VU follow: route through the local CORS proxy (127.0.0.1:17865), then
// createMediaElementSource → AnalyserNode → destination. captureStream
// cannot drive the meter; AnalyserNode + getByteFrequencyData is required.
// crossOrigin must be set before src. AudioContext must be running before
// MediaElementSource is created, or the webview goes silent.

const CONNECT_MS = 12_000;
const PROXY_BASE = "http://127.0.0.1:17865/";

function viaProxy(url) {
  return `${PROXY_BASE}?u=${encodeURIComponent(url)}`;
}

/// host: { onState(state, station), onDead(station, reason) }
///
/// states: "idle" | "connecting" | "playing" | "paused" | "blocked"
///   blocked = the webview refused to start without a user gesture.
export function createPlayer(host) {
  const audio = new Audio();
  audio.preload = "none";
  audio.crossOrigin = "anonymous";

  let station = null;
  let connectTimer = 0;
  let generation = 0;
  let volume = 0.6;
  let state = "idle";
  let useProxy = true;

  let ctx = null;
  let mediaSource = null;
  let analyser = null;
  let freq = null;
  let tapReady = false;
  let smoothLevel = 0;
  let smoothBass = 0;
  let peakLevel = 0;
  let peakBass = 0;
  let bassAvg = 0.08;

  function clearConnect() {
    clearTimeout(connectTimer);
    connectTimer = 0;
  }

  function emit(next) {
    state = next;
    host.onState?.(next, station);
  }

  function die(reason) {
    clearConnect();
    const dead = station;
    station = null;
    generation += 1;
    state = "idle";
    audio.pause();
    audio.removeAttribute("src");
    if (dead) host.onDead?.(dead, reason);
  }

  /// Ensure AudioContext is running, then wire MediaElementSource once.
  async function ensureTap() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = ctx || new AC();
      if (ctx.state === "suspended") await ctx.resume();
      if (ctx.state !== "running") return false;
      if (!mediaSource) {
        mediaSource = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.65;
        mediaSource.connect(analyser);
        analyser.connect(ctx.destination);
        freq = new Uint8Array(analyser.frequencyBinCount);
      }
      tapReady = true;
      return true;
    } catch {
      tapReady = false;
      return false;
    }
  }

  function playUrl(url) {
    if (useProxy) {
      audio.crossOrigin = "anonymous";
      audio.src = viaProxy(url);
    } else {
      // Raw streams usually lack ACAO; drop CORS mode so <audio> can still play.
      audio.removeAttribute("crossorigin");
      audio.src = url;
    }
    audio.volume = volume;
  }

  audio.addEventListener("playing", () => {
    clearConnect();
    emit("playing");
  });
  audio.addEventListener("pause", () => {
    if (station && connectTimer === 0 && !audio.ended) emit("paused");
  });
  audio.addEventListener("error", () => {
    if (!station) return;
    // Proxy may be down (dev without rebuild); fall back to raw URL once.
    if (useProxy && station.url) {
      useProxy = false;
      const mine = generation;
      playUrl(station.url);
      const started = audio.play();
      if (started) {
        started.catch(() => {
          if (mine === generation && station) die("error");
        });
      }
      return;
    }
    die("error");
  });

  return {
    get station() {
      return station;
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number(next) || 0));
      audio.volume = volume;
    },
    play(next) {
      if (!next?.url) return;
      clearConnect();
      generation += 1;
      const mine = generation;
      station = next;
      useProxy = true;
      emit("connecting");
      connectTimer = setTimeout(() => {
        if (mine === generation && station) die("timeout");
      }, CONNECT_MS);

      void (async () => {
        // Resume + wire before play so MediaElementSource owns the graph
        // while the context is already running (avoids silent hijack).
        await ensureTap();
        if (mine !== generation || !station) return;
        playUrl(next.url);
        try {
          await audio.play();
          if (mine === generation) await ensureTap();
        } catch (error) {
          if (mine !== generation || !station) return;
          if (error?.name === "NotAllowedError") {
            clearConnect();
            emit("blocked");
            return;
          }
          // Proxy path failed — try raw URL (sound only, no VU).
          if (useProxy) {
            useProxy = false;
            playUrl(next.url);
            try {
              await audio.play();
            } catch (again) {
              if (mine !== generation || !station) return;
              if (again?.name === "NotAllowedError") {
                clearConnect();
                emit("blocked");
                return;
              }
              die("error");
            }
            return;
          }
          die("error");
        }
      })();
    },
    resume() {
      if (!station) return;
      const mine = generation;
      clearConnect();
      connectTimer = setTimeout(() => {
        if (mine === generation && station) die("timeout");
      }, CONNECT_MS);
      void (async () => {
        await ensureTap();
        if (mine !== generation || !station) return;
        try {
          await audio.play();
          if (mine === generation) await ensureTap();
        } catch {
          if (mine === generation && station) die("error");
        }
      })();
    },
    pause() {
      clearConnect();
      audio.pause();
    },
    stop() {
      clearConnect();
      station = null;
      generation += 1;
      audio.pause();
      audio.removeAttribute("src");
      emit("idle");
    },
    /// VU-style level/bass from AnalyserNode (0..1).
    levels() {
      if (state !== "playing") {
        smoothLevel *= 0.85;
        smoothBass *= 0.85;
        peakLevel *= 0.9;
        peakBass *= 0.9;
        return { level: smoothLevel, bass: smoothBass };
      }
      if (ctx?.state === "suspended") {
        void ctx.resume();
      }
      if (!tapReady || !analyser || !freq) {
        return { level: smoothLevel, bass: smoothBass };
      }

      analyser.getByteFrequencyData(freq);
      const n = freq.length;
      const use = Math.max(8, Math.floor(n / 3));
      const lowN = Math.min(12, use);
      let low = 0;
      let body = 0;
      let energy = 0;
      for (let i = 0; i < use; i += 1) {
        const v = freq[i] / 255;
        energy += v;
        if (i < lowN) low += v;
        else body += v;
      }
      // All zeros → graph not fed yet; don't invent a beat.
      if (energy < 0.001) {
        smoothLevel *= 0.92;
        smoothBass *= 0.92;
        return { level: smoothLevel, bass: smoothBass };
      }

      const bassRaw = low / lowN;
      const bodyRaw = body / Math.max(1, use - lowN);
      const bass = Math.log1p(bassRaw * 4) / Math.log1p(4);
      const bodyN = Math.log1p(bodyRaw * 4) / Math.log1p(4);

      bassAvg = bassAvg * 0.88 + bass * 0.12;
      const onset = Math.max(0, bass - bassAvg * 1.1);
      const level = Math.min(1, bodyN * 0.85 + bass * 0.35 + onset * 2.4);
      const bassOut = Math.min(1, bass * 0.9 + onset * 2.0);

      smoothLevel = smoothLevel * 0.7 + level * 0.3;
      smoothBass = smoothBass * 0.7 + bassOut * 0.3;
      if (smoothLevel > peakLevel) peakLevel = smoothLevel;
      else peakLevel = Math.max(smoothLevel, peakLevel - 0.045);
      if (smoothBass > peakBass) peakBass = smoothBass;
      else peakBass = Math.max(smoothBass, peakBass - 0.04);

      return { level: peakLevel, bass: peakBass };
    },
    destroy() {
      clearConnect();
      station = null;
      generation += 1;
      audio.pause();
      audio.removeAttribute("src");
      try {
        mediaSource?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      mediaSource = null;
      analyser = null;
      freq = null;
      tapReady = false;
      void ctx?.close();
      ctx = null;
    },
  };
}
