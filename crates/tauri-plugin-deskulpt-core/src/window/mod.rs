//! Deskulpt windows.

#[cfg(windows)]
pub(crate) mod desktop;
mod script;

use anyhow::Result;
use deskulpt_common::window::DeskulptWindow;
use script::{CanvasInitJS, PortalInitJS};
use tauri::{App, AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deskulpt_settings::SettingsExt;
use tauri_plugin_deskulpt_settings::model::{CanvasImode, Theme};

use crate::states::CanvasImodeStateExt;

/// Extention trait for window-related operations.
pub trait WindowExt<R: Runtime>: Manager<R> + SettingsExt<R> {
    /// Open Deskulpt portal.
    ///
    /// If the portal already exists, it will be focused. Otherwise it will be
    /// created first.
    fn open_portal(&self) -> Result<()>
    where
        Self: Sized,
    {
        if let Ok(portal) = DeskulptWindow::Portal.webview_window(self) {
            portal.set_focus()?;
            return Ok(());
        }

        let settings = self.settings().read();
        let init_js = PortalInitJS::generate(&settings)?;

        // https://www.radix-ui.com/colors: "Slate 1" colors
        let background_color = match settings.theme {
            Theme::Light => (252, 252, 253), // #FCFCFD
            Theme::Dark => (17, 17, 19),     // #111113
        };

        let portal = WebviewWindowBuilder::new(
            self,
            DeskulptWindow::Portal,
            WebviewUrl::App("packages/deskulpt-portal/index.html".into()),
        )
        .title("三息之间")
        .background_color(background_color.into())
        .inner_size(800.0, 500.0)
        .center()
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .initialization_script(&init_js)
        .build()?;

        #[cfg(windows)]
        set_taskbar_icon(&portal);

        portal.set_focus()?;

        Ok(())
    }

    /// Create Deskulpt canvas.
    fn create_canvas(&self) -> Result<()>
    where
        Self: Sized,
    {
        let settings = self.settings().read();
        let init_js = CanvasInitJS::generate(&settings)?;
        let canvas = WebviewWindowBuilder::new(
            self,
            DeskulptWindow::Canvas,
            WebviewUrl::App("packages/deskulpt-canvas/index.html".into()),
        )
        .title("murmur")
        .maximized(true)
        .transparent(true)
        .decorations(false)
        .always_on_bottom(true)
        // TODO: Remove when the following issue is fixed:
        // https://github.com/tauri-apps/tauri/issues/9597
        .visible(false)
        // Unsupported on macOS; see below for activation policy
        .skip_taskbar(true)
        .initialization_script(&init_js)
        .shadow(false)
        .build()?;

        // TODO: Remove when the following issue is fixed:
        // https://github.com/tauri-apps/tauri/issues/9597
        canvas.show()?;

        let app_handle = self.app_handle().clone();
        canvas.on_window_event(move |event| match event {
            WindowEvent::Moved(position) => {
                app_handle.set_canvas_position(position);
            },
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                app_handle.set_canvas_scale_factor(*scale_factor);
            },
            _ => {},
        });

        if settings.canvas_imode == CanvasImode::Sink {
            // Click-through rewrites the window style, so parent afterwards.
            canvas.set_ignore_cursor_events(true)?;
            #[cfg(windows)]
            if let Err(error) = desktop::apply(&canvas, true) {
                tracing::error!("Failed to place canvas behind desktop icons: {error:#}");
            }
        } else if settings.canvas_imode == CanvasImode::Float {
            // Misses pass through until the pointer is over a widget.
            canvas.set_ignore_cursor_events(true)?;
        }

        Ok(())
    }
}

impl<R: Runtime> WindowExt<R> for App<R> {}
impl<R: Runtime> WindowExt<R> for AppHandle<R> {}

/// Install the full-resolution icon into every slot the shell reads.
///
/// The taskbar gets its button icon from whichever source answers first —
/// `WM_GETICON` (`ICON_BIG`/`ICON_SMALL`), the window class icon, or an
/// extraction from the exe — and scales whatever it receives up to the 24px
/// taskbar slot. `icon.ico` no longer ships a 16x16 layer (its first entry,
/// also the default window icon, is 24x24), so every source now yields the
/// same 24px bitmap and the taskbar renders it 1:1 without upscaling.
#[cfg(windows)]
fn set_taskbar_icon<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use once_cell::sync::OnceCell;
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIcon, GCLP_HICONSM, ICON_BIG, ICON_SMALL, SendMessageW, SetClassLongPtrW, WM_SETICON,
    };

    /// The icon's edge length in pixels.
    const SIZE: i32 = 24;

    /// The `24x24` layer of `icon.ico`, row-major RGBA.
    static RGBA: &[u8] = include_bytes!("../../icons/taskbar-24x24.rgba");

    /// `HICON` wraps a raw pointer, so it is not `Send`/`Sync`. The handle is
    /// valid for the whole process — it is never destroyed — and the cell is
    /// only read after initialization, which makes sharing it safe.
    #[derive(Clone, Copy)]
    struct TaskbarIcon(windows::Win32::UI::WindowsAndMessaging::HICON);
    unsafe impl Send for TaskbarIcon {}
    unsafe impl Sync for TaskbarIcon {}

    static ICON: OnceCell<Option<TaskbarIcon>> = OnceCell::new();

    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd,
        Err(error) => {
            tracing::error!("Failed to get window hwnd for taskbar icon: {error}");
            return;
        },
    };

    let Some(TaskbarIcon(icon)) = ICON.get_or_init(|| {
        let mut bgra = RGBA.to_vec();
        let mut mask = Vec::with_capacity(RGBA.len() / 4);
        for pixel in bgra.chunks_mut(4) {
            mask.push(pixel[3].wrapping_sub(u8::MAX));
            pixel.swap(0, 2);
        }
        unsafe {
            match CreateIcon(None, SIZE, SIZE, 1, 32, mask.as_ptr(), bgra.as_ptr()) {
                Ok(icon) => Some(TaskbarIcon(icon)),
                Err(error) => {
                    tracing::error!("Failed to create taskbar icon: {error}");
                    None
                },
            }
        }
    }) else {
        return;
    };

    unsafe {
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as _)),
        );
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_SMALL as usize)),
            Some(LPARAM(icon.0 as _)),
        );
        SetClassLongPtrW(hwnd, GCLP_HICONSM, icon.0 as _);
    }
}
