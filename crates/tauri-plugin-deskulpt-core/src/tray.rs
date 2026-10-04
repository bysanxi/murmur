//! Deskulpt system tray.

use anyhow::Result;
use tauri::menu::{MenuBuilder, MenuEvent, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Runtime};
use tauri_plugin_deskulpt_settings::SettingsExt;
use tauri_plugin_deskulpt_widgets::WidgetsExt;

use crate::window::WindowExt;

/// Language-dependent tray menu strings: open, exit, tooltip.
fn tray_strings(language: &str) -> (&'static str, &'static str, &'static str) {
    if language == "zh-CN" {
        ("打开", "退出", "三息之间")
    } else {
        ("Open", "Exit", "murmur")
    }
}

/// Extention trait for system tray-related operations.
pub trait TrayExt<R: Runtime>: Manager<R> + SettingsExt<R> {
    /// Create the system tray.
    fn create_tray(&self) -> Result<()>
    where
        Self: Sized,
    {
        let settings = self.settings().read();
        let language = settings.language.clone();
        drop(settings);
        let (open_label, exit_label, tooltip) = tray_strings(&language);
        let app_handle = self.app_handle().clone();
        let tray_menu = MenuBuilder::new(&app_handle)
            .items(&[
                &MenuItemBuilder::with_id("tray-open-portal", open_label).build(&app_handle)?,
                &MenuItemBuilder::with_id("tray-exit", exit_label).build(&app_handle)?,
            ])
            .build()?;

        let icon = self
            .app_handle()
            .default_window_icon()
            .expect("No default window icon");
        TrayIconBuilder::with_id("tray")
            .icon(icon.clone())
            .icon_as_template(true)
            .show_menu_on_left_click(false)
            .tooltip(tooltip)
            .menu(&tray_menu)
            .on_menu_event(on_menu_event)
            .on_tray_icon_event(on_tray_icon_event)
            .build(self)?;

        Ok(())
    }

    /// Update the existing tray menu with the given language strings.
    fn update_tray_menu(&self, language: &str) -> Result<()>
    where
        Self: Sized,
    {
        let Some(tray) = self.app_handle().tray_by_id("tray") else {
            return self.create_tray();
        };
        let (open_label, exit_label, tooltip) = tray_strings(language);
        let app_handle = self.app_handle().clone();
        let tray_menu = MenuBuilder::new(&app_handle)
            .items(&[
                &MenuItemBuilder::with_id("tray-open-portal", open_label).build(&app_handle)?,
                &MenuItemBuilder::with_id("tray-exit", exit_label).build(&app_handle)?,
            ])
            .build()?;
        tray.set_menu(Some(tray_menu))?;
        tray.set_tooltip(Some(tooltip))?;
        Ok(())
    }
}

impl<R: Runtime> TrayExt<R> for App<R> {}
impl<R: Runtime> TrayExt<R> for AppHandle<R> {}

/// Handler for system tray menu events.
///
/// This handler will receive any menu event but only act on events related to
/// the system tray.
fn on_menu_event<R: Runtime>(app_handle: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        "tray-open-portal" => {
            if let Err(e) = app_handle.open_portal() {
                tracing::error!("Failed to open Deskulpt portal: {e}");
            }
        },
        "tray-exit" => {
            if let Err(e) = app_handle.settings().persist() {
                tracing::error!("Failed to persist settings before exit: {e}");
                app_handle.exit(1);
                return;
            }
            if let Err(e) = app_handle.widgets().persist() {
                tracing::error!("Failed to persist widgets before exit: {e}");
                app_handle.exit(1);
                return;
            }
            app_handle.exit(0);
        },
        _ => {},
    }
}

/// Handler for system tray icon events.
fn on_tray_icon_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button,
        button_state,
        ..
    } = event
        && button == MouseButton::Left
        && button_state == MouseButtonState::Down
        && let Err(e) = tray.app_handle().open_portal()
    {
        tracing::error!("Failed to open Deskulpt portal: {e}");
    }
}
