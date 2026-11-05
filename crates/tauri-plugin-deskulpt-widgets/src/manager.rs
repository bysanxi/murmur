//! Deskulpt widgets manager and its APIs.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use deskulpt_common::event::Event;
use deskulpt_common::outcome::Outcome;
use deskulpt_common::window::DeskulptWindow;
use parking_lot::{Mutex, RwLock};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_deskulpt_settings::SettingsExt;
use tauri_plugin_deskulpt_settings::model::SettingsPatch;

use crate::catalog::{WidgetCatalog, WidgetConfigValue, WidgetSettingsPatch};
use crate::events::UpdateEvent;
use crate::persist::{
    CanvasSize, PersistWorkerHandle, PersistedSettings, PersistedWidgetCatalogView,
};
use crate::registry::{
    RegistryIndex, RegistryIndexFetcher, RegistryWidgetFetcher, RegistryWidgetPreview,
    RegistryWidgetReference,
};
use crate::render::{RenderWorkerHandle, RenderWorkerTask};

/// Tracks when persisted widget geometry has been converted to canvas pixels.
enum GeometryState {
    /// Settings read from disk, not yet converted because the canvas size was
    /// unknown while the catalog was loaded.
    Pending(BTreeMap<String, PersistedSettings>),
    /// Conversion has run. Records the canvas size it used so that writes
    /// normalize against the same reference.
    Ready(CanvasSize),
}

fn wants_tap(settings: &crate::catalog::WidgetSettings) -> bool {
    matches!(
        settings.config.get("touch"),
        Some(WidgetConfigValue::Text(mode)) if mode == "feed" || mode == "watch"
    )
}

/// Where starter widget sources are read from when installing or syncing.
fn starter_source_root<R: Runtime>(app_handle: &AppHandle<R>) -> Result<PathBuf> {
    if cfg!(debug_assertions) {
        // Dev always mirrors the workspace tree so edits apply without waiting
        // for a resource rebundle into target/debug.
        let root =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/widgets/starter");
        Ok(dunce::simplified(&root).to_path_buf())
    } else {
        Ok(app_handle
            .path()
            .resource_dir()?
            .join("resources")
            .join("widgets")
            .join("starter"))
    }
}

/// Copy every file under `src` into `dst`, creating directories as needed.
/// Files that exist only in `dst` (runtime caches, etc.) are left alone.
fn mirror_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst).with_context(|| format!("Failed to create {}", dst.display()))?;
    for entry in
        std::fs::read_dir(src).with_context(|| format!("Failed to read {}", src.display()))?
    {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if file_type.is_dir() {
            mirror_dir(&entry.path(), &to)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), &to).with_context(|| {
                format!(
                    "Failed to copy {} → {}",
                    entry.path().display(),
                    to.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Manager for Deskulpt widgets.
pub struct WidgetsManager<R: Runtime> {
    /// The Tauri app handle.
    app_handle: AppHandle<R>,
    /// The widgets directory.
    dir: PathBuf,
    /// The widget catalog.
    catalog: RwLock<WidgetCatalog>,
    /// The path where widgets are persisted.
    persist_path: PathBuf,
    /// The persisted geometry awaiting the canvas size, and the size it was
    /// converted against.
    geometry: Mutex<GeometryState>,
    /// The handle for the render worker.
    render_worker: RenderWorkerHandle,
    /// The handle for the persist worker.
    persist_worker: PersistWorkerHandle,
}

impl<R: Runtime> WidgetsManager<R> {
    /// Initialize the [`WidgetsManager`].
    ///
    /// The catalog will be populated with widgets in the widgets directory, and
    /// the persisted settings file will be read. Since the canvas does not
    /// exist yet while plugins are being set up, persisted geometry stays
    /// unconverted until [`Self::ensure_geometry_ready`] runs. A render worker
    /// and a persist worker will be started immediately.
    pub fn new(app_handle: AppHandle<R>) -> Result<Self> {
        let dir = if cfg!(debug_assertions) {
            app_handle.path().resource_dir()?
        } else {
            app_handle.path().document_dir()?.join("Deskulpt")
        };
        let dir = dunce::simplified(&dir).join("widgets");
        std::fs::create_dir_all(&dir)?;

        let mut catalog = WidgetCatalog::default();
        catalog.reload_all(&dir)?;

        let persist_path = app_handle.path().app_local_data_dir()?.join("widgets.json");
        let pending = PersistedSettings::load_all(&persist_path).unwrap_or_else(|e| {
            tracing::error!("Failed to load persisted widgets: {e:?}");
            BTreeMap::new()
        });

        let render_worker = RenderWorkerHandle::new(app_handle.clone());
        let persist_worker = PersistWorkerHandle::new(app_handle.clone())?;

        Ok(Self {
            app_handle,
            dir,
            catalog: RwLock::new(catalog),
            persist_path,
            geometry: Mutex::new(GeometryState::Pending(pending)),
            render_worker,
            persist_worker,
        })
    }

    /// The logical size of the canvas window.
    fn canvas_size(&self) -> Result<CanvasSize> {
        let canvas = DeskulptWindow::Canvas.webview_window(&self.app_handle)?;
        let physical = canvas.inner_size()?;
        let scale = canvas.scale_factor()?;
        let size = CanvasSize {
            width: physical.width as f64 / scale,
            height: physical.height as f64 / scale,
        };
        if !size.width.is_finite()
            || !size.height.is_finite()
            || size.width <= 0.0
            || size.height <= 0.0
        {
            bail!(
                "Canvas has no usable size yet: {}x{}",
                size.width,
                size.height
            );
        }
        Ok(size)
    }

    /// Convert persisted widget geometry into canvas pixels.
    ///
    /// Widget geometry is stored normalized against the canvas, which is not
    /// known while plugins are being set up, so the conversion is deferred
    /// until the first API call that touches widget geometry. It runs at
    /// most once; the canvas size it performed against is recorded and
    /// reused when writing back to disk so that runtime pixels and
    /// persisted fractions always agree.
    ///
    /// Returns the recorded canvas size.
    fn ensure_geometry_ready(&self) -> Result<CanvasSize> {
        let mut state = self.geometry.lock();

        let pending = match &mut *state {
            GeometryState::Ready(size) => return Ok(*size),
            GeometryState::Pending(pending) => pending,
        };

        let size = self.canvas_size()?;

        let mut catalog = self.catalog.write();
        for (id, settings) in std::mem::take(pending) {
            if let Some(widget) = catalog.0.get_mut(&id) {
                widget.settings = settings.into_settings(size);
                widget.fill_option_defaults();
            }
        }
        drop(catalog);

        *state = GeometryState::Ready(size);
        Ok(size)
    }

    /// Get the widgets directory.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Update the settings of a widget with a patch.
    ///
    /// An error is returned if the widget does not exist.
    pub fn update_settings(&self, id: &str, patch: WidgetSettingsPatch) -> Result<()> {
        self.ensure_geometry_ready()?;
        let mut catalog = self.catalog.write();
        let widget = catalog
            .0
            .get_mut(id)
            .ok_or_else(|| anyhow!("Widget not found: {id}"))?;

        let changed = widget.settings.apply_patch(patch);
        if changed {
            UpdateEvent(&catalog).emit(&self.app_handle)?;
            self.persist_worker.notify()?;
        }
        Ok(())
    }

    /// Try to check if a point is covered by any widget geometrically.
    ///
    /// This method is non-blocking and might return `None` if the widget
    /// catalog is currently locked for writing.
    pub fn try_covers_point(&self, x: f64, y: f64) -> Option<bool> {
        // Hit-testing reads pixel geometry, so it needs the same conversion the
        // read/write paths do; without it a still-pending catalog would be
        // tested against unconverted defaults.
        let canvas = self.ensure_geometry_ready().ok()?;
        let catalog = self.catalog.try_read()?;
        // A fullscreen widget stays click-through unless it asked to take taps
        // (feed or watch). Other widgets include a margin outside the box: the
        // resize handles sit on that rim, and a tight test makes them
        // click-through.
        const RESIZE_MARGIN: f64 = 16.0;
        let covers = catalog.0.values().any(|widget| {
            let settings = &widget.settings;
            if !settings.is_loaded {
                return false;
            }
            // A fullscreen wallpaper stays click-through. Taps are delivered
            // separately so the desktop keeps its own menu.
            if settings.fullscreen {
                return false;
            }
            // A frame that fills the canvas is wallpaper, not a hit target.
            if settings.width as f64 >= canvas.width * 0.9
                && settings.height as f64 >= canvas.height * 0.9
            {
                return false;
            }
            let left = settings.x as f64 - RESIZE_MARGIN;
            let top = settings.y as f64 - RESIZE_MARGIN;
            let right = settings.x as f64 + settings.width as f64 + RESIZE_MARGIN;
            let bottom = settings.y as f64 + settings.height as f64 + RESIZE_MARGIN;
            x >= left && x <= right && y >= top && y <= bottom
        });
        Some(covers)
    }

    /// The id of the topmost widget at this canvas point that asked for a tap.
    ///
    /// Coordinates are logical pixels of the canvas. A fullscreen widget is
    /// tested by its box, so a click on a smaller widget above it is not a tap.
    ///
    /// The outer `Option` is `None` while the catalog is locked; the inner one
    /// is `None` when no widget at the point asked for a tap.
    pub fn try_tap_point(&self, x: f64, y: f64) -> Option<Option<String>> {
        self.ensure_geometry_ready().ok()?;
        let catalog = self.catalog.try_read()?;
        let mut best: Option<(i16, Option<&str>)> = None;
        for (id, widget) in catalog.0.iter() {
            let settings = &widget.settings;
            let left = settings.x as f64;
            let top = settings.y as f64;
            let right = left + settings.width as f64;
            let bottom = top + settings.height as f64;
            if x < left || x > right || y < top || y > bottom {
                continue;
            }
            match best {
                Some((z, _)) if settings.z_index < z => {},
                _ => best = Some((settings.z_index, wants_tap(settings).then_some(id.as_str()))),
            }
        }
        Some(best.and_then(|(_, id)| id.map(str::to_string)))
    }

    /// Persist the current widgets to disk.
    pub fn persist(&self) -> Result<()> {
        let size = self.ensure_geometry_ready()?;
        let catalog = self.catalog.read();
        PersistedWidgetCatalogView {
            catalog: &catalog,
            size,
        }
        .persist(&self.persist_path)?;
        Ok(())
    }

    /// Reload a specific widget by its ID.
    ///
    /// This method loads the widget manifest from the corresponding widget
    /// directory and updates the catalog entry for that widget. This could be
    /// an addition, removal, or modification. It then syncs the settings with
    /// the updated catalog. If any step fails, an error is returned.
    pub fn reload(&self, id: &str) -> Result<()> {
        self.ensure_geometry_ready()?;
        let widget_dir = self.dir.join(id);

        let mut catalog = self.catalog.write();
        catalog.reload(&widget_dir, id)?;

        UpdateEvent(&catalog).emit(&self.app_handle)?;
        self.persist_worker.notify()?;
        Ok(())
    }

    /// Reload all widgets.
    ///
    /// This method loads a new widget catalog from the widgets directory and
    /// replaces the existing catalog. It then syncs the settings with the
    /// updated catalog. If any step fails, an error is returned.
    pub fn reload_all(&self) -> Result<()> {
        self.ensure_geometry_ready()?;
        let mut catalog = self.catalog.write();
        catalog.reload_all(&self.dir)?;

        UpdateEvent(&catalog).emit(&self.app_handle)?;
        self.persist_worker.notify()?;
        Ok(())
    }

    /// Render a specific widget by its ID.
    ///
    /// This method submits a render task for the specified widget to the render
    /// worker. If the widget does not exist in the catalog or if task
    /// submission fails, an error is returned. This method is non-blocking and
    /// does not wait for the task to complete.
    pub fn render(&self, id: &str) -> Result<()> {
        let catalog = self.catalog.read();
        let widget = catalog
            .0
            .get(id)
            .ok_or_else(|| anyhow!("Widget {id} does not exist in the catalog"))?;

        if let Outcome::Ok(manifest) = &widget.manifest {
            self.render_worker.process(RenderWorkerTask::Render {
                id: id.to_string(),
                entry: manifest.entry.clone(),
            })?;
        }
        Ok(())
    }

    /// Render all widgets in the catalog.
    ///
    /// This method submits render tasks for all widgets in the catalog to the
    /// render worker. If any task submission fails, an error containing all
    /// accumulated errors is returned. This method is non-blocking and does not
    /// wait for the tasks to complete.
    pub fn render_all(&self) -> Result<()> {
        let catalog = self.catalog.read();

        let mut errors = vec![];
        for (id, widget) in catalog.0.iter() {
            if let Outcome::Ok(manifest) = &widget.manifest
                && let Err(e) = self.render_worker.process(RenderWorkerTask::Render {
                    id: id.clone(),
                    entry: manifest.entry.clone(),
                })
            {
                errors.push(e.context(format!("Failed to send render task for widget {id}")));
            }
        }

        if !errors.is_empty() {
            let message = errors
                .into_iter()
                .map(|e| format!("{e:?}"))
                .collect::<Vec<_>>()
                .join("\n");
            bail!(message);
        }

        Ok(())
    }

    /// Refresh a specific widget by its ID.
    ///
    /// This is equivalent to reloading that widget with [`Self::reload`] then
    /// rendering it with [`Self::render`].
    ///
    /// Tauri command: [`crate::commands::refresh`].
    pub fn refresh(&self, id: &str) -> Result<()> {
        self.reload(id)?;
        self.render(id)?;
        Ok(())
    }

    /// Refresh all widgets.
    ///
    /// This is equivalent to reloading all widgets with [`Self::reload_all`]
    /// then rendering all widgets with [`Self::render_all`].
    ///
    /// Tauri command: [`crate::commands::refresh_all`].
    pub fn refresh_all(&self) -> Result<()> {
        self.reload_all()?;
        self.render_all()?;
        Ok(())
    }

    /// Add starter widgets if not already added.
    ///
    /// If the starter widgets have not been marked as added, this method will
    /// copy the starter widgets from the bundled resources to the widgets base
    /// directory. Failure to add individual starter widgets will be logged as
    /// errors, but will not prevent others from being added, and will not cause
    /// this method to return an error. However, only if all starter widgets are
    /// added successfully will the settings be updated to mark them as added.
    ///
    /// In debug builds this always re-mirrors from the workspace
    /// `resources/widgets/starter` tree into the installed widget dirs, so
    /// edits land on the next launch without a reinstall. Runtime-only files
    /// already in the destination (e.g. caches) are left alone.
    ///
    /// Release builds stay idempotent: once every starter has been added,
    /// subsequent calls are no-ops.
    pub fn maybe_add_starter(&self) -> Result<()> {
        #[cfg(not(debug_assertions))]
        if self.app_handle.settings().read().starter_widgets_added {
            return Ok(());
        }

        let src_root = starter_source_root(&self.app_handle)?;

        let mut has_error = false;
        for (widget_id, widget) in [
            ("@murmur.pond", "pond"),
            ("@murmur.denghua", "denghua"),
            ("@murmur.radio", "radio"),
        ] {
            let src = src_root.join(widget);
            let dst = self.dir.join(widget_id);

            #[cfg(not(debug_assertions))]
            if dst.exists() {
                tracing::debug!(%widget_id, "Starter widget already exists, skipping");
                continue;
            }

            let syncing = cfg!(debug_assertions) && dst.exists();
            let result = if syncing {
                mirror_dir(&src, &dst)
                    .with_context(|| format!("Failed to sync starter widget {widget_id}"))
            } else {
                copy_dir::copy_dir(&src, &dst)
                    .map(|_| ())
                    .with_context(|| format!("Failed to add starter widget {widget_id}"))
            };

            match result {
                Ok(()) => {
                    if syncing {
                        tracing::info!(%widget_id, "Synced starter widget from source");
                    } else {
                        tracing::info!(%widget_id, "Added starter widget");
                    }
                },
                Err(e) => {
                    has_error = true;
                    tracing::error!(
                        error = ?e,
                        %widget_id,
                        src = %src.display(),
                        dst = %dst.display(),
                        "Failed to add starter widget",
                    );
                },
            }
        }

        if !has_error {
            self.app_handle.settings().update(SettingsPatch {
                starter_widgets_added: Some(true),
                ..Default::default()
            })?;
        }
        Ok(())
    }

    /// Fetch the widgets registry index.
    ///
    /// Before fetching, this method ensures that the catalog is up-to-date by
    /// reloading all widgets. This is necessary for the frontend to know which
    /// widgets are already installed.
    pub async fn fetch_registry_index(&self) -> Result<RegistryIndex> {
        self.reload_all()?;

        let cache_dir = self.app_handle.path().app_cache_dir()?;
        let fetcher = RegistryIndexFetcher::new(&cache_dir);
        fetcher.fetch().await
    }

    /// Preview a widget from the registry.
    pub async fn preview(&self, widget: &RegistryWidgetReference) -> Result<RegistryWidgetPreview> {
        RegistryWidgetFetcher::default().preview(widget).await
    }

    /// Install a widget from the registry.
    ///
    /// If the widget already exists locally, an error is returned. After
    /// installation, the widget is automatically refreshed to update the
    /// catalog and render it.
    pub async fn install(&self, widget: &RegistryWidgetReference) -> Result<()> {
        let id = widget.local_id();
        let widget_dir = self.dir.join(&id);
        if widget_dir.exists() {
            bail!("Widget {id} already installed");
        }

        RegistryWidgetFetcher::default()
            .install(&widget_dir, widget)
            .await?;

        self.refresh(&id)?;
        Ok(())
    }

    /// Uninstall a widget from the registry.
    ///
    /// If the widget does not exist locally, an error is returned. After
    /// uninstallation, the widget is automatically reloaded to remove it from
    /// the catalog.
    pub async fn uninstall(&self, widget: &RegistryWidgetReference) -> Result<()> {
        let id = widget.local_id();
        let widget_dir = self.dir.join(&id);
        if !widget_dir.exists() {
            bail!("Widget {id} is not installed");
        }
        tokio::fs::remove_dir_all(&widget_dir)
            .await
            .with_context(|| format!("Failed to remove directory {}", widget_dir.display()))?;

        self.reload(&id)?;
        Ok(())
    }

    /// Upgrade a widget from the registry.
    ///
    /// If the widget does not exist locally, an error is returned. After
    /// upgrading, the widget is automatically refreshed to update the catalog
    /// and render it.
    pub async fn upgrade(&self, widget: &RegistryWidgetReference) -> Result<()> {
        let id = widget.local_id();
        let widget_dir = self.dir.join(&id);
        if !widget_dir.exists() {
            bail!("Widget {id} is not installed");
        }

        // TODO: We should ideally perform some form of backup to allow rollback
        // on failure, to avoid leaving the widget in a broken state
        tokio::fs::remove_dir_all(&widget_dir)
            .await
            .with_context(|| format!("Failed to remove directory {}", widget_dir.display()))?;

        RegistryWidgetFetcher::default()
            .install(&widget_dir, widget)
            .await?;

        self.refresh(&id)?;
        Ok(())
    }
}
