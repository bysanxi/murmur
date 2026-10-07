use deskulpt_common::{SerResult, ser_bail};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde_json::Value;
use tauri::{AppHandle, Runtime, command};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_deskulpt_widgets::WidgetsExt;

// TODO: Remove this temporary implementation
static FS_PLUGIN: Lazy<Mutex<deskulpt_plugin_fs::FsPlugin>> =
    Lazy::new(|| Mutex::new(deskulpt_plugin_fs::FsPlugin));

// TODO: Remove this temporary implementation
static SYS_PLUGIN: Lazy<Mutex<deskulpt_plugin_sys::SysPlugin>> =
    Lazy::new(|| Mutex::new(Default::default()));

/// Call a plugin command (🚧 TODO 🚧).
///
/// ### 🚧 TODO 🚧
///
/// The Deskulpt core should keep a state of the registered plugins and call the
/// plugins dynamically. Also, instead of invoking the plugins directly, the
/// Deskulpt core should not depend on any of the plugins and should use IPC to
/// communicate with the plugins.
///
/// Also, in order to simplify the engine API for the plugin (because it is
/// a temporary implementation), `app_handle` is using the default runtime but
/// it should be a generic `R: Runtime` parameter in the final implementation.
#[command]
#[specta::specta]
pub async fn call_plugin<R: Runtime>(
    app_handle: AppHandle<R>,
    plugin: String,
    command: String,
    id: String,
    payload: Option<serde_json::Value>,
) -> SerResult<serde_json::Value> {
    // Launch-at-login lives in the OS (a Run key on Windows, a LaunchAgent on
    // macOS), so it is queried here instead of being stored in settings.
    if plugin == "autostart" {
        let autolaunch = app_handle.autolaunch();
        let result = match command.as_str() {
            "is_enabled" => Value::from(autolaunch.is_enabled()?),
            "enable" => {
                autolaunch.enable()?;
                Value::Null
            },
            "disable" => {
                autolaunch.disable()?;
                Value::Null
            },
            other => ser_bail!("Unknown autostart command: {}", other),
        };
        return Ok(result);
    }

    let widget_dir_fn = move |id: &str| app_handle.widgets().dir().join(id);

    match plugin.as_str() {
        "fs" => {
            let plugin = FS_PLUGIN.lock();
            let result = deskulpt_plugin::call_plugin(
                widget_dir_fn,
                &*plugin,
                command.as_str(),
                id,
                payload,
            )?;
            Ok(result)
        },
        "sys" => {
            let plugin = SYS_PLUGIN.lock();
            let result = deskulpt_plugin::call_plugin(
                widget_dir_fn,
                &*plugin,
                command.as_str(),
                id,
                payload,
            )?;
            Ok(result)
        },
        _ => ser_bail!("Unknown plugin: {}", plugin),
    }
}
