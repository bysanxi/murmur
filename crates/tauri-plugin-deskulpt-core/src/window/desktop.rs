//! Place the canvas behind the Windows desktop icons.
//!
//! Explorer keeps the wallpaper in `Progman` and the icons in
//! `SHELLDLL_DefView`. Sending `Progman` the undocumented `0x052C` message
//! splits off a `WorkerW` between them. Up through Windows 11 23H2 that
//! `WorkerW` is a top-level window. From 24H2 both windows are children of
//! `Progman`, so the canvas is parented to `Progman` and ordered directly under
//! the icons.

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};

use anyhow::{Context, Result};
use tauri::{Runtime, WebviewWindow};

const GWL_STYLE: i32 = -16;
const GWL_EXSTYLE: i32 = -20;
const WS_POPUP: u32 = 0x8000_0000;
const WS_CHILD: u32 = 0x4000_0000;
const WS_VISIBLE: u32 = 0x1000_0000;
const WS_EX_LAYERED: u32 = 0x0008_0000;
const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_SHOWWINDOW: u32 = 0x0040;
const SWP_NOZORDER: u32 = 0x0004;
const LWA_ALPHA: u32 = 0x0000_0002;
const MONITOR_DEFAULTTONEAREST: u32 = 2;

static EMBED: AtomicBool = AtomicBool::new(false);
static HOST: AtomicIsize = AtomicIsize::new(0);
static ICONS: AtomicIsize = AtomicIsize::new(0);
static LAYERED: AtomicBool = AtomicBool::new(false);
static EXSTYLE_SAVED: AtomicBool = AtomicBool::new(false);
static ORIGINAL_EXSTYLE: AtomicI32 = AtomicI32::new(0);
static PLACED_LEFT: AtomicI32 = AtomicI32::new(0);
static PLACED_TOP: AtomicI32 = AtomicI32::new(0);
static PLACED_RIGHT: AtomicI32 = AtomicI32::new(0);
static PLACED_BOTTOM: AtomicI32 = AtomicI32::new(0);

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
struct BlurBehind {
    flags: u32,
    enable: i32,
    region: isize,
    transition: i32,
}

const DWM_BB_ENABLE: u32 = 0x1;
const DWM_BB_BLURREGION: u32 = 0x2;

#[repr(C)]
struct MonitorInfo {
    cb_size: u32,
    rc_monitor: Rect,
    rc_work: Rect,
    dw_flags: u32,
}

#[cfg(target_pointer_width = "64")]
unsafe fn get_long(hwnd: isize, index: i32) -> u32 {
    unsafe { GetWindowLongPtrW(hwnd, index) as u32 }
}

#[cfg(target_pointer_width = "64")]
unsafe fn set_long(hwnd: isize, index: i32, value: u32) {
    unsafe { SetWindowLongPtrW(hwnd, index, value as isize) };
}

#[cfg(target_pointer_width = "32")]
unsafe fn get_long(hwnd: isize, index: i32) -> u32 {
    unsafe { GetWindowLongW(hwnd, index) as u32 }
}

#[cfg(target_pointer_width = "32")]
unsafe fn set_long(hwnd: isize, index: i32, value: u32) {
    unsafe { SetWindowLongW(hwnd, index, value as i32) };
}

/// Sink mode keeps the canvas behind the icons. Any other mode returns it to a
/// normal top-level window.
pub fn apply<R: Runtime>(window: &WebviewWindow<R>, embed: bool) -> Result<()> {
    EMBED.store(embed, Ordering::Release);
    let hwnd = window.hwnd()?.0 as isize;
    if embed {
        let _ = window.unmaximize();
        embed_hwnd(hwnd)
    } else if unsafe { GetParent(hwnd) } != 0 {
        detach_hwnd(hwnd)?;
        window.set_always_on_bottom(true)?;
        Ok(())
    } else {
        Ok(())
    }
}

/// Re-hang the canvas after Explorer restarts or the monitor size changes.
pub fn maintain<R: Runtime>(window: &WebviewWindow<R>) -> Result<()> {
    let hwnd = window.hwnd()?.0 as isize;
    if !EMBED.load(Ordering::Acquire) {
        if unsafe { GetParent(hwnd) } != 0 {
            detach_hwnd(hwnd)?;
            window.set_always_on_bottom(true)?;
        }
        return Ok(());
    }

    let host = HOST.load(Ordering::Acquire);
    let parent = unsafe { GetParent(hwnd) };
    let host_alive = host != 0 && unsafe { IsWindow(host) } != 0;
    if !host_alive || parent != host {
        let _ = window.unmaximize();
        return embed_hwnd(hwnd);
    }

    let monitor = monitor_rect(hwnd).context("canvas monitor is unavailable")?;
    if monitor
        != (Rect {
            left: PLACED_LEFT.load(Ordering::Acquire),
            top: PLACED_TOP.load(Ordering::Acquire),
            right: PLACED_RIGHT.load(Ordering::Acquire),
            bottom: PLACED_BOTTOM.load(Ordering::Acquire),
        })
    {
        place(hwnd, host)?;
    }
    Ok(())
}

fn embed_hwnd(hwnd: isize) -> Result<()> {
    find_layer().context("desktop icon layer was not found")?;
    if !EXSTYLE_SAVED.swap(true, Ordering::AcqRel) {
        ORIGINAL_EXSTYLE.store(
            unsafe { get_long(hwnd, GWL_EXSTYLE) } as i32,
            Ordering::Release,
        );
    }

    let host = HOST.load(Ordering::Acquire);
    unsafe {
        let mut style = get_long(hwnd, GWL_STYLE);
        style &= !WS_POPUP;
        style |= WS_CHILD | WS_VISIBLE;
        set_long(hwnd, GWL_STYLE, style);

        let mut exstyle = get_long(hwnd, GWL_EXSTYLE);
        exstyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
        // Tauri's click-through flag adds WS_EX_LAYERED. That, together with
        // the empty DWM blur region used for a transparent window,
        // drops the WebView2 surface once the window is a desktop
        // child.
        exstyle &= !WS_EX_LAYERED;
        if LAYERED.load(Ordering::Acquire) {
            exstyle |= WS_EX_LAYERED;
        }
        set_long(hwnd, GWL_EXSTYLE, exstyle);
        if LAYERED.load(Ordering::Acquire) {
            SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        }
        set_blur_behind(hwnd, false);
        SetParent(hwnd, host);
    }
    place(hwnd, host)?;
    Ok(())
}

fn detach_hwnd(hwnd: isize) -> Result<()> {
    unsafe {
        SetParent(hwnd, 0);
        let mut style = get_long(hwnd, GWL_STYLE);
        style &= !WS_CHILD;
        style |= WS_POPUP | WS_VISIBLE;
        set_long(hwnd, GWL_STYLE, style);
        if EXSTYLE_SAVED.load(Ordering::Acquire) {
            set_long(
                hwnd,
                GWL_EXSTYLE,
                ORIGINAL_EXSTYLE.load(Ordering::Acquire) as u32,
            );
        }
        set_blur_behind(hwnd, true);
    }

    let monitor = monitor_rect(hwnd).context("canvas monitor is unavailable")?;
    let width = monitor.right - monitor.left;
    let height = monitor.bottom - monitor.top;
    unsafe {
        SetWindowPos(
            hwnd,
            1, // HWND_BOTTOM
            monitor.left,
            monitor.top,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
    remember_placement(monitor);
    Ok(())
}

fn place(hwnd: isize, host: isize) -> Result<()> {
    let monitor = monitor_rect(hwnd).context("canvas monitor is unavailable")?;
    let mut mapped = monitor;
    unsafe {
        MapWindowPoints(0, host, &mut mapped, 2);
        let width = mapped.right - mapped.left;
        let height = mapped.bottom - mapped.top;
        let icons = ICONS.load(Ordering::Acquire);
        if icons != 0 {
            SetWindowPos(
                hwnd,
                icons,
                mapped.left,
                mapped.top,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        } else {
            SetWindowPos(
                hwnd,
                0,
                mapped.left,
                mapped.top,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOZORDER,
            );
        }
    }
    remember_placement(monitor);
    Ok(())
}

fn set_blur_behind(hwnd: isize, enabled: bool) {
    unsafe {
        if enabled {
            let region = CreateRectRgn(0, 0, -1, -1);
            let blur = BlurBehind {
                flags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
                enable: 1,
                region,
                transition: 0,
            };
            DwmEnableBlurBehindWindow(hwnd, &blur);
            DeleteObject(region);
        } else {
            let blur = BlurBehind {
                flags: DWM_BB_ENABLE,
                enable: 0,
                region: 0,
                transition: 0,
            };
            DwmEnableBlurBehindWindow(hwnd, &blur);
        }
    }
}

fn remember_placement(monitor: Rect) {
    PLACED_LEFT.store(monitor.left, Ordering::Release);
    PLACED_TOP.store(monitor.top, Ordering::Release);
    PLACED_RIGHT.store(monitor.right, Ordering::Release);
    PLACED_BOTTOM.store(monitor.bottom, Ordering::Release);
}

fn find_layer() -> Result<()> {
    let progman = find_top("Progman").context("Progman is not running")?;
    let mut unused = 0usize;
    unsafe {
        // Spawn the wallpaper WorkerW. Both parameter pairs are used by
        // Explorer.
        SendMessageTimeoutW(progman, 0x052C, 0xD, 1, 0, 1000, &mut unused);
        SendMessageTimeoutW(progman, 0x052C, 0, 0, 0, 1000, &mut unused);
    }

    let inner_icons = find_child(progman, 0, "SHELLDLL_DefView");
    let inner_worker = find_child(progman, 0, "WorkerW");
    // Windows 11 24H2 keeps the wallpaper WorkerW beside the icons, inside
    // Progman. Parent there. A layered Progman child does not show a
    // WebView2 surface.
    if inner_icons != 0 && inner_worker != 0 {
        HOST.store(inner_worker, Ordering::Release);
        ICONS.store(0, Ordering::Release);
        LAYERED.store(false, Ordering::Release);
        return Ok(());
    }

    FOUND_WORKER.store(0, Ordering::Relaxed);
    unsafe {
        EnumWindows(enum_worker, 0);
    }
    let worker = FOUND_WORKER.load(Ordering::Relaxed);
    if worker != 0 {
        HOST.store(worker, Ordering::Release);
        ICONS.store(0, Ordering::Release);
        LAYERED.store(false, Ordering::Release);
    } else {
        HOST.store(progman, Ordering::Release);
        ICONS.store(inner_icons, Ordering::Release);
        LAYERED.store(false, Ordering::Release);
    }
    Ok(())
}

fn monitor_rect(hwnd: isize) -> Option<Rect> {
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor == 0 {
            return None;
        }
        let mut info = MonitorInfo {
            cb_size: std::mem::size_of::<MonitorInfo>() as u32,
            rc_monitor: Rect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            rc_work: Rect {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            dw_flags: 0,
        };
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return None;
        }
        Some(info.rc_monitor)
    }
}

fn find_top(class: &str) -> Option<isize> {
    let wide = wide(class);
    let hwnd = unsafe { FindWindowW(wide.as_ptr(), std::ptr::null()) };
    (hwnd != 0).then_some(hwnd)
}

fn find_child(parent: isize, after: isize, class: &str) -> isize {
    let wide = wide(class);
    unsafe { FindWindowExW(parent, after, wide.as_ptr(), std::ptr::null()) }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

static FOUND_WORKER: AtomicIsize = AtomicIsize::new(0);

unsafe extern "system" fn enum_worker(top: isize, _: isize) -> i32 {
    if find_child(top, 0, "SHELLDLL_DefView") != 0 {
        let worker = find_child(0, top, "WorkerW");
        if worker != 0 {
            FOUND_WORKER.store(worker, Ordering::Relaxed);
        }
    }
    1
}

#[link(name = "user32")]
unsafe extern "system" {
    fn FindWindowW(class: *const u16, title: *const u16) -> isize;
    fn FindWindowExW(parent: isize, after: isize, class: *const u16, title: *const u16) -> isize;
    fn SendMessageTimeoutW(
        hwnd: isize,
        msg: u32,
        wparam: usize,
        lparam: isize,
        flags: u32,
        timeout: u32,
        result: *mut usize,
    ) -> isize;
    fn EnumWindows(callback: unsafe extern "system" fn(isize, isize) -> i32, lparam: isize) -> i32;
    fn SetParent(child: isize, parent: isize) -> isize;
    fn GetParent(hwnd: isize) -> isize;
    fn IsWindow(hwnd: isize) -> i32;
    fn SetWindowPos(
        hwnd: isize,
        insert_after: isize,
        x: i32,
        y: i32,
        w: i32,
        h: i32,
        flags: u32,
    ) -> i32;
    fn MapWindowPoints(from: isize, to: isize, rect: *mut Rect, points: u32) -> i32;
    fn SetLayeredWindowAttributes(hwnd: isize, key: u32, alpha: u8, flags: u32) -> i32;
    fn MonitorFromWindow(hwnd: isize, flags: u32) -> isize;
    fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;

    #[cfg(target_pointer_width = "64")]
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
    #[cfg(target_pointer_width = "64")]
    fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
    #[cfg(target_pointer_width = "32")]
    fn GetWindowLongW(hwnd: isize, index: i32) -> i32;
    #[cfg(target_pointer_width = "32")]
    fn SetWindowLongW(hwnd: isize, index: i32, value: i32) -> i32;
}

#[link(name = "dwmapi")]
unsafe extern "system" {
    fn DwmEnableBlurBehindWindow(hwnd: isize, blur: *const BlurBehind) -> i32;
}

#[link(name = "gdi32")]
unsafe extern "system" {
    fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> isize;
    fn DeleteObject(object: isize) -> i32;
}
