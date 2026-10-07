//! Forward left clicks into the wallpaper.
//!
//! The canvas sits under the desktop icons and stays click-through, so the
//! page never sees the pointer. A low-level hook still sees the button, and
//! the page handles it when a widget asked for taps.

use std::sync::OnceLock;
use std::sync::mpsc::{SyncSender, sync_channel};

use tauri::{Runtime, WebviewWindow};
use tauri_plugin_deskulpt_widgets::WidgetsExt;

const WH_MOUSE_LL: i32 = 14;
const WM_LBUTTONDOWN: usize = 0x0201;
const LLMHF_INJECTED: u32 = 1;

static TAP_TX: OnceLock<SyncSender<(f64, f64)>> = OnceLock::new();

#[repr(C)]
struct Point {
    x: i32,
    y: i32,
}

#[repr(C)]
struct HookPoint {
    x: i32,
    y: i32,
    mouse_data: u32,
    flags: u32,
    time: u32,
    extra: usize,
}

#[repr(C)]
struct Msg {
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
    time: u32,
    x: i32,
    y: i32,
}

/// Screen position of the window's client origin, and whether it is embedded.
pub(crate) fn client_point(hwnd: isize) -> Option<(i32, i32, bool)> {
    let mut origin = Point { x: 0, y: 0 };
    if unsafe { ClientToScreen(hwnd, &mut origin) } == 0 {
        return None;
    }
    let embedded = unsafe { GetParent(hwnd) } != 0;
    Some((origin.x, origin.y, embedded))
}

/// Start the click hook.
///
/// `to_logical` maps a screen point into canvas logical pixels. It runs off
/// the hook thread.
pub fn listen<R, F>(canvas: WebviewWindow<R>, to_logical: F)
where
    R: Runtime,
    F: Fn(f64, f64) -> Option<(f64, f64)> + Send + 'static,
{
    let (tx, rx) = sync_channel(4);
    let _ = TAP_TX.set(tx);

    std::thread::spawn(|| {
        if let Err(error) = hook_loop() {
            eprintln!("Failed to listen for wallpaper taps: {error}");
        }
    });

    std::thread::spawn(move || {
        while let Ok((screen_x, screen_y)) = rx.recv() {
            let Some((x, y)) = to_logical(screen_x, screen_y) else {
                continue;
            };
            if !x.is_finite() || !y.is_finite() {
                continue;
            }
            if canvas.widgets().try_tap_point(x, y) != Some(true) {
                continue;
            }
            let _ = canvas.eval(format!("window.__murmurPondTap?.({x:.3},{y:.3})"));
        }
    });
}

fn hook_loop() -> Result<(), u32> {
    unsafe {
        let hook = SetWindowsHookExW(WH_MOUSE_LL, hook_proc, 0, 0);
        if hook == 0 {
            return Err(1);
        }
        let mut message = std::mem::zeroed::<Msg>();
        while GetMessageW(&mut message, 0, 0, 0) > 0 {}
    }
    Ok(())
}

unsafe extern "system" fn hook_proc(code: i32, wparam: usize, lparam: isize) -> isize {
    if code >= 0 && wparam == WM_LBUTTONDOWN && lparam != 0 {
        let event = unsafe { &*(lparam as *const HookPoint) };
        if event.flags & LLMHF_INJECTED == 0
            && let Some(tx) = TAP_TX.get()
        {
            let _ = tx.try_send((event.x as f64, event.y as f64));
        }
    }
    unsafe { CallNextHookEx(0, code, wparam, lparam) }
}

#[link(name = "user32")]
unsafe extern "system" {
    fn SetWindowsHookExW(
        id: i32,
        proc: unsafe extern "system" fn(i32, usize, isize) -> isize,
        module: isize,
        thread: u32,
    ) -> isize;
    fn CallNextHookEx(hook: isize, code: i32, wparam: usize, lparam: isize) -> isize;
    fn GetMessageW(message: *mut Msg, hwnd: isize, min: u32, max: u32) -> i32;
    fn ClientToScreen(hwnd: isize, point: *mut Point) -> i32;
    fn GetParent(hwnd: isize) -> isize;
}
