use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::pin::Pin;

use anyhow::{Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use serde_with::{MapSkipError, serde_as};
use tauri::{AppHandle, Runtime};
use tokio::sync::mpsc;
use tokio::time::{Duration, Instant, Sleep};

use crate::WidgetsExt;
use crate::catalog::{WidgetCatalog, WidgetConfigValue, WidgetSettings};

/// The widget catalog format written by this build.
///
/// The file is an envelope with `version` and `widgets`. Geometry is stored as
/// fractions of the canvas size, so a widget keeps its relative placement when
/// restored on a screen with a different resolution.
const PERSISTED_VERSION: u64 = 2;

/// The logical (CSS pixel) size of the canvas.
///
/// Widget geometry is normalized against this size when it is written to disk
/// and de-normalized when it is read back.
#[derive(Debug, Clone, Copy)]
pub struct CanvasSize {
    /// The logical width in pixels.
    pub width: f64,
    /// The logical height in pixels.
    pub height: f64,
}

/// A widget in the persisted catalog.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedWidget {
    settings: PersistedSettings,
}

/// The widget map in the persisted catalog.
#[serde_as]
#[derive(Debug, Deserialize)]
struct NormalizedWidgets(
    #[serde_as(deserialize_as = "MapSkipError<_, _>")] BTreeMap<String, NormalizedWidget>,
);

/// Widget settings as stored on disk.
///
/// Position and size, including the geometry remembered while fullscreen, are
/// fractions of the canvas size. Opacity, stacking, fullscreen, and widget
/// options stay absolute.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSettings {
    /// The left edge as a fraction of the canvas width.
    pub x: f64,
    /// The top edge as a fraction of the canvas height.
    pub y: f64,
    /// The width as a fraction of the canvas width.
    pub width: f64,
    /// The height as a fraction of the canvas height.
    pub height: f64,
    /// The opacity in percentage.
    pub opacity: u8,
    /// The background opacity in percentage.
    pub background_opacity: u8,
    /// The z-index.
    pub z_index: i16,
    /// Whether the widget should be loaded on the canvas or not.
    pub is_loaded: bool,
    /// Whether the widget fills the canvas.
    pub fullscreen: bool,
    /// The windowed left edge as a fraction of the canvas width.
    pub windowed_x: f64,
    /// The windowed top edge as a fraction of the canvas height.
    pub windowed_y: f64,
    /// The windowed width as a fraction of the canvas width.
    pub windowed_width: f64,
    /// The windowed height as a fraction of the canvas height.
    pub windowed_height: f64,
    /// Widget-specific options.
    pub config: BTreeMap<String, WidgetConfigValue>,
}

impl PersistedSettings {
    /// Read every persisted widget setting from `path`.
    ///
    /// An empty map is returned when the file does not exist. Entries that
    /// cannot be parsed are skipped. Any other file shape is an error.
    pub fn load_all(path: &Path) -> Result<BTreeMap<String, Self>> {
        if !path.exists() {
            return Ok(BTreeMap::new());
        }

        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let value: serde_json::Value = serde_json::from_reader(reader)?;
        let version = value
            .get("version")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| anyhow!("widgets.json is missing `version`"))?;
        if version != PERSISTED_VERSION {
            bail!("Unsupported widgets.json format version: {version}");
        }

        let widgets = value
            .get("widgets")
            .cloned()
            .ok_or_else(|| anyhow!("widgets.json is missing the `widgets` map"))?;
        let widgets: NormalizedWidgets = serde_json::from_value(widgets)?;
        Ok(widgets
            .0
            .into_iter()
            .map(|(id, widget)| (id, widget.settings))
            .collect())
    }

    /// Turn normalized settings into runtime pixel settings bounded by `size`.
    pub fn into_settings(self, size: CanvasSize) -> WidgetSettings {
        let (x, y, width, height) = place(self.x, self.y, self.width, self.height, size);
        let (windowed_x, windowed_y, windowed_width, windowed_height) = place(
            self.windowed_x,
            self.windowed_y,
            self.windowed_width,
            self.windowed_height,
            size,
        );

        WidgetSettings {
            x,
            y,
            width,
            height,
            opacity: self.opacity.clamp(1, 100),
            background_opacity: self.background_opacity.clamp(0, 100),
            z_index: self.z_index,
            is_loaded: self.is_loaded,
            fullscreen: self.fullscreen,
            windowed_x,
            windowed_y,
            windowed_width,
            windowed_height,
            config: self.config,
        }
    }
}

/// Turn a normalized rectangle into whole pixels bounded by `size`.
///
/// Sizes are capped by the canvas so a widget can always be brought fully on
/// screen, while positions are clamped into what is left. An unusable size
/// falls back to the default widget size.
fn place(x: f64, y: f64, width: f64, height: f64, size: CanvasSize) -> (i32, i32, u32, u32) {
    let default = WidgetSettings::default();
    let width = pixel_size(width, size.width).unwrap_or(default.width);
    let height = pixel_size(height, size.height).unwrap_or(default.height);

    let max_x = (size.width.round() as i64 - width as i64).clamp(0, i32::MAX as i64);
    let max_y = (size.height.round() as i64 - height as i64).clamp(0, i32::MAX as i64);

    (
        (x.clamp(0.0, 1.0) * size.width)
            .round()
            .clamp(0.0, max_x as f64) as i32,
        (y.clamp(0.0, 1.0) * size.height)
            .round()
            .clamp(0.0, max_y as f64) as i32,
        width,
        height,
    )
}

/// Convert a normalized size into whole pixels.
///
/// Returns `None` when the fraction or the extent is unusable, so callers can
/// fall back to a default size.
fn pixel_size(fraction: f64, extent: f64) -> Option<u32> {
    if !fraction.is_finite() || fraction <= 0.0 || !extent.is_finite() || extent <= 0.0 {
        return None;
    }

    let limit = extent.round().max(1.0);
    Some((fraction * extent).round().clamp(1.0, limit) as u32)
}

/// Divide `value` by `extent`, falling back to `0.0` for an unusable extent.
fn ratio(value: f64, extent: f64) -> f64 {
    if extent.is_finite() && extent > 0.0 {
        value / extent
    } else {
        0.0
    }
}

/// Turn runtime pixel settings into settings normalized against `size`.
fn normalize(settings: &WidgetSettings, size: CanvasSize) -> PersistedSettings {
    PersistedSettings {
        x: ratio(settings.x as f64, size.width),
        y: ratio(settings.y as f64, size.height),
        width: ratio(settings.width as f64, size.width),
        height: ratio(settings.height as f64, size.height),
        opacity: settings.opacity,
        background_opacity: settings.background_opacity,
        z_index: settings.z_index,
        is_loaded: settings.is_loaded,
        fullscreen: settings.fullscreen,
        windowed_x: ratio(settings.windowed_x as f64, size.width),
        windowed_y: ratio(settings.windowed_y as f64, size.height),
        windowed_width: ratio(settings.windowed_width as f64, size.width),
        windowed_height: ratio(settings.windowed_height as f64, size.height),
        config: settings.config.clone(),
    }
}

/// A view of the widget catalog for persistence.
///
/// The catalog is serialized with geometry normalized against [`Self::size`].
#[derive(Debug)]
pub struct PersistedWidgetCatalogView<'a> {
    /// The widget catalog to persist.
    pub catalog: &'a WidgetCatalog,
    /// The canvas size the geometry is normalized against.
    pub size: CanvasSize,
}

impl PersistedWidgetCatalogView<'_> {
    /// Persist the widget catalog to disk.
    pub fn persist(&self, path: &Path) -> Result<()> {
        let file = File::create(path)?;
        let writer = BufWriter::new(file);
        serde_json::to_writer(writer, self)?;
        Ok(())
    }
}

impl Serialize for PersistedWidgetCatalogView<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        PersistedFileView {
            version: PERSISTED_VERSION,
            widgets: PersistedWidgetsView {
                catalog: self.catalog,
                size: self.size,
            },
        }
        .serialize(serializer)
    }
}

/// The on-disk envelope.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedFileView<'a> {
    version: u64,
    widgets: PersistedWidgetsView<'a>,
}

/// The widget map, normalized on the fly.
#[derive(Debug)]
struct PersistedWidgetsView<'a> {
    catalog: &'a WidgetCatalog,
    size: CanvasSize,
}

impl Serialize for PersistedWidgetsView<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;

        let mut map = serializer.serialize_map(Some(self.catalog.0.len()))?;
        for (id, widget) in &self.catalog.0 {
            map.serialize_entry(
                id,
                &NormalizedWidget {
                    settings: normalize(&widget.settings, self.size),
                },
            )?;
        }
        map.end()
    }
}

/// Debounce duration for persistence.
const PERSIST_DEBOUNCE: Duration = Duration::from_millis(500);

/// The worker for persisting widgets.
struct PersistWorker<R: Runtime> {
    /// The Tauri app handle.
    app_handle: AppHandle<R>,
    /// The receiver for incoming persist notifications.
    rx: mpsc::UnboundedReceiver<()>,
    /// Whether a persist task is pending.
    pending: bool,
    /// The debounce timer for persistence.
    debounce: Pin<Box<Sleep>>,
}

impl<R: Runtime> PersistWorker<R> {
    /// Create a new [`PersistWorker`] instance.
    fn new(app_handle: AppHandle<R>, rx: mpsc::UnboundedReceiver<()>) -> Self {
        Self {
            app_handle,
            rx,
            pending: false,
            debounce: Box::pin(tokio::time::sleep(PERSIST_DEBOUNCE)),
        }
    }

    /// Run the worker event loop.
    ///
    /// This function will run indefinitely until the worker channel is closed.
    async fn run(mut self) {
        loop {
            tokio::select! {
                _ = &mut self.debounce, if self.pending => {
                    self.on_deadline();
                },
                task = self.rx.recv() => match task {
                    Some(_) => self.handle_task(),
                    None => break,
                },
            }
        }
    }

    /// Fire the persist operation when the debounce timer elapses.
    fn on_deadline(&mut self) {
        self.pending = false;
        if let Err(e) = self.app_handle.widgets().persist() {
            tracing::error!("Failed to persist widgets: {e:?}");
        }
    }

    /// Handle an incoming persist task.
    fn handle_task(&mut self) {
        self.pending = true;
        self.debounce
            .as_mut()
            .reset(Instant::now() + PERSIST_DEBOUNCE);
    }
}

/// Handle for communicating with the persistence worker.
pub struct PersistWorkerHandle(mpsc::UnboundedSender<()>);

impl PersistWorkerHandle {
    /// Create a new [`PersistWorkerHandle`] instance.
    ///
    /// This immediately spawns a dedicated worker on Tauri's singleton async
    /// runtime that listens for incoming notifications and processes them with
    /// debouncing.
    pub fn new<R: Runtime>(app_handle: AppHandle<R>) -> Result<Self> {
        let (tx, rx) = mpsc::unbounded_channel();
        tauri::async_runtime::spawn(async move {
            PersistWorker::new(app_handle, rx).run().await;
        });
        Ok(Self(tx))
    }

    /// Instruct the worker to persist the widget catalog.
    ///
    /// This does not block. The task is sent to the worker for asynchronous
    /// processing and does not wait for completion. The worker will debounce
    /// multiple notifications within a short time frame. An error is returned
    /// only if task submission fails, but not if task processing fails.
    pub fn notify(&self) -> Result<()> {
        Ok(self.0.send(())?)
    }
}
