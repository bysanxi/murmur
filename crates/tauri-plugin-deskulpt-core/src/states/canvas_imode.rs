//! State management for canvas interaction mode.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::Result;
use deskulpt_common::event::Event;
use deskulpt_common::window::DeskulptWindow;
use parking_lot::RwLock;
use seqlock::SeqLock;
use tauri::{App, AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindow};
use tauri_plugin_deskulpt_settings::SettingsExt;
use tauri_plugin_deskulpt_settings::model::{CanvasImode, SettingsPatch};
use tauri_plugin_deskulpt_widgets::WidgetsExt;

use crate::events::ShowToastEvent;

/// Layout information of the canvas.
#[derive(Copy, Clone)]
struct CanvasLayout {
    /// Physical x-coordinate.
    x: f64,
    /// Physical y-coordinate.
    y: f64,
    /// Inverse of the scale factor.
    inv_scale: f64,
}

/// Managed state for canvas interaction mode.
struct CanvasImodeState {
    /// Lock for serializing `set_ignore_cursor_events` calls.
    lock: RwLock<()>,
    /// Layout information of the canvas.
    ///
    /// We use [`SeqLock`] here for low-overhead and lock-free reads in the
    /// global mousemove event listener which cannot afford blocking, thanks to
    /// the fact that [`CanvasLayout`] is [`Copy`]. Writers must be rare, which
    /// is the case here since they only happen when the canvas is moved or
    /// rescaled, mostly on startup.
    layout: SeqLock<CanvasLayout>,
}

/// Whether the global mousemove listener is enabled.
static LISTENING_MOUSEMOVE: AtomicBool = AtomicBool::new(false);
/// Last click-through state applied by the listener.
static CURSOR_IGNORED: AtomicBool = AtomicBool::new(true);

/// Extension trait for operations on canvas interaction mode.
pub trait CanvasImodeStateExt<R: Runtime>: Manager<R> + SettingsExt<R> {
    /// Initialize state management for canvas interaction mode.
    ///
    /// This will also hook into settings changes and global mousemove events
    /// and update the canvas interaction mode accordingly.
    fn manage_canvas_imode(&self) -> Result<()> {
        let canvas = DeskulptWindow::Canvas.webview_window(self)?;
        let canvas_position = canvas.inner_position()?;
        let canvas_layout = CanvasLayout {
            x: canvas_position.x as f64,
            y: canvas_position.y as f64,
            inv_scale: 1.0 / canvas.scale_factor()?,
        };
        self.manage(CanvasImodeState {
            lock: RwLock::new(()),
            layout: SeqLock::new(canvas_layout),
        });

        let canvas_cloned = canvas.clone();
        std::thread::spawn(move || {
            // Delay the start of mousemove listener to avoid interfering with
            // canvas initialization, which is in most cases the heaviest period
            // of writes to states that the mousemove listener may read; users
            // commonly won't notice such delay because window creation and
            // widgets rendering also take time.
            std::thread::sleep(Duration::from_secs(1));

            if let Err(e) = listen_to_mousemove(canvas_cloned) {
                eprintln!("Failed to listen to global mousemove events: {}", e);
            }
        });

        let imode = self.settings().read().canvas_imode.clone();
        if imode == CanvasImode::Auto || imode == CanvasImode::Float {
            LISTENING_MOUSEMOVE.store(true, Ordering::Release);
        }

        #[cfg(windows)]
        {
            let app_handle = self.app_handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    let app_handle = app_handle.clone();
                    let main_thread = app_handle.clone();
                    if app_handle
                        .run_on_main_thread(move || {
                            let Ok(canvas) = DeskulptWindow::Canvas.webview_window(&main_thread)
                            else {
                                return;
                            };
                            if let Err(error) = crate::window::desktop::maintain(&canvas) {
                                tracing::error!(
                                    "Failed to keep canvas behind desktop icons: {error:#}"
                                );
                            }
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            });
        }

        self.settings().on_canvas_imode_change(move |_, new| {
            if let Err(e) = on_new_canvas_imode(&canvas, new) {
                tracing::error!("Failed to update canvas interaction mode: {}", e);
            }
        });

        Ok(())
    }

    /// Set the position of the canvas.
    ///
    /// This should be called whenever the canvas is moved.
    fn set_canvas_position(&self, position: &PhysicalPosition<i32>) {
        let state = self.state::<CanvasImodeState>();
        let mut layout = state.layout.lock_write();
        layout.x = position.x as f64;
        layout.y = position.y as f64;
    }

    /// Set the scale factor of the canvas.
    ///
    /// This should be called whenever the canvas scale factor changes.
    fn set_canvas_scale_factor(&self, scale_factor: f64) {
        let state = self.state::<CanvasImodeState>();
        let mut layout = state.layout.lock_write();
        layout.inv_scale = 1.0 / scale_factor;
    }

    /// Toggle the interaction mode of the canvas.
    ///
    /// If the current mode is float or sink, it switches to the other mode. If
    /// the current mode is auto, it is no-op since auto mode is not toggleable.
    fn toggle_canvas_imode(&self) -> Result<()> {
        self.settings().update_with(|settings| SettingsPatch {
            canvas_imode: match settings.canvas_imode {
                CanvasImode::Auto => None,
                CanvasImode::Float => Some(CanvasImode::Sink),
                CanvasImode::Sink => Some(CanvasImode::Float),
            },
            ..Default::default()
        })?;
        Ok(())
    }
}

impl<R: Runtime> CanvasImodeStateExt<R> for App<R> {}
impl<R: Runtime> CanvasImodeStateExt<R> for AppHandle<R> {}

/// Handler for canvas interaction mode changes.
///
/// This updates the canvas click-through state and the mousemove event
/// listener's behavior according to the given mode. It also emits a toast
/// notification to the canvas, but failure to do so is non-fatal and will not
/// result in an error.
fn on_new_canvas_imode<R: Runtime>(canvas: &WebviewWindow<R>, mode: &CanvasImode) -> Result<()> {
    let embed = *mode == CanvasImode::Sink;
    match mode {
        CanvasImode::Auto => {
            LISTENING_MOUSEMOVE.store(true, Ordering::Release);
            #[cfg(windows)]
            {
                crate::window::desktop::apply(canvas, false)?;
                restore_surface(canvas)?;
            }
        },
        CanvasImode::Sink | CanvasImode::Float => {
            // Set the flag with write lock acquired to avoid racing with the
            // mousemove hook on setting `ignore_cursor_events`
            let state = canvas.state::<CanvasImodeState>();
            let _guard = state.lock.write();
            // Float keeps the listener so a miss falls through to the desktop.
            // Sink captures nothing.
            LISTENING_MOUSEMOVE.store(!embed, Ordering::Release);
            CURSOR_IGNORED.store(true, Ordering::Release);
            if embed {
                canvas.set_ignore_cursor_events(true)?;
                #[cfg(windows)]
                crate::window::desktop::apply(canvas, true)?;
            } else {
                #[cfg(windows)]
                crate::window::desktop::apply(canvas, false)?;
                canvas.set_ignore_cursor_events(true)?;
                // Tauri rewrites the window style on the UI thread after this
                // returns. Restore the maximized window after that rewrite.
                #[cfg(windows)]
                restore_surface(canvas)?;
            }
        },
    }

    if let Err(e) = ShowToastEvent::Success(format!("Canvas interaction mode: {mode:?}"))
        .emit_to(canvas, DeskulptWindow::Canvas)
    {
        tracing::error!("Failed to emit ShowToastEvent to canvas: {}", e);
    }

    Ok(())
}

/// Put the canvas back into the maximized top-level window after a detach.
///
/// Queued on the UI thread so it runs after Tauri's own style update.
#[cfg(windows)]
fn restore_surface<R: Runtime>(canvas: &WebviewWindow<R>) -> Result<()> {
    let canvas = canvas.clone();
    canvas.clone().run_on_main_thread(move || {
        if let Err(error) = crate::window::desktop::release_surface(&canvas) {
            tracing::error!("Failed to restore the canvas window: {error:#}");
        }
    })?;
    Ok(())
}

/// Global mousemove event listener.
///
/// If the cheap check on [`LISTENING_MOUSEMOVE`] gives false, the hook will
/// short-circuit immediately, effectively disabling the listener. Otherwise,
/// it will check whether the mouse is over any widget in the canvas. If so, the
/// canvas will accept cursor events; otherwise, it will ignore them.
fn listen_to_mousemove<R: Runtime>(canvas: WebviewWindow<R>) -> Result<()> {
    global_mousemove::listen(move |event| {
        if !LISTENING_MOUSEMOVE.load(Ordering::Acquire) {
            return;
        }

        let state = canvas.state::<CanvasImodeState>();
        let canvas_layout = state.layout.read();

        let global_mousemove::MouseMoveEvent { x, y } = event;

        // For macOS, mousemove coordinates are in logical coordinates, so
        // only canvas physical position needs to be scaled
        #[cfg(target_os = "macos")]
        let scaled_x = x - canvas_layout.x * canvas_layout.inv_scale;
        #[cfg(target_os = "macos")]
        let scaled_y = y - canvas_layout.y * canvas_layout.inv_scale;

        // For other platforms, mousemove coordinates are in physical
        // coordinates, so they need to be scaled together with canvas position
        #[cfg(not(target_os = "macos"))]
        let scaled_x = (x - canvas_layout.x) * canvas_layout.inv_scale;
        #[cfg(not(target_os = "macos"))]
        let scaled_y = (y - canvas_layout.y) * canvas_layout.inv_scale;

        let Some(mouse_over_widget) = canvas.widgets().try_covers_point(scaled_x, scaled_y) else {
            return; // Avoid blocking
        };

        // Avoid redundant calls by checking if the state has really changed
        let should_ignore_cursor = !mouse_over_widget;
        if should_ignore_cursor != CURSOR_IGNORED.load(Ordering::Acquire) {
            // Check the flag with read lock acquired to avoid racing with the
            // writers on setting `ignore_cursor_events`
            let state = canvas.state::<CanvasImodeState>();
            let _guard = match state.lock.try_read() {
                Some(guard) => guard,
                None => return, // Avoid blocking
            };

            if !LISTENING_MOUSEMOVE.load(Ordering::Acquire) {
                return;
            }
            CURSOR_IGNORED.store(should_ignore_cursor, Ordering::Release);
            if let Err(e) = canvas.set_ignore_cursor_events(should_ignore_cursor) {
                eprintln!("Failed to set cursor events state: {e}");
            }
        }
    })?;

    Ok(())
}
