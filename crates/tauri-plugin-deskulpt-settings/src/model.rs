//! Definitions, patching, and persistence of Deskulpt settings.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;

use anyhow::Result;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_with::{DefaultOnError, MapSkipError, serde_as};

/// The light/dark theme of the application interface.
#[derive(
    Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize, JsonSchema, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    #[default]
    Light,
    Dark,
}

/// The canvas interaction mode.
#[derive(
    Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize, JsonSchema, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum CanvasImode {
    /// Auto mode.
    ///
    /// Automatically switch between sink and float modes based on mouse
    /// position, so that users will feel like the widgets and the desktop are
    /// simultaneously interactable.
    Auto,
    /// Sink mode.
    ///
    /// The canvas is click-through. Widgets are not interactable. The desktop
    /// is interactable.
    #[default]
    Sink,
    /// Float mode.
    ///
    /// Widgets are interactable. Clicks that miss every widget pass through
    /// to the desktop, the same way auto mode does.
    Float,
}

/// Actions that can be bound to keyboard shortcuts.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize, JsonSchema, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutAction {
    /// Toggle the canvas interaction mode (imode).
    ToggleCanvasImode,
    /// Open Deskulpt portal.
    OpenPortal,
}

const fn default_snap_threshold() -> u32 {
    8
}

const fn default_show_guides() -> bool {
    true
}

fn default_language() -> String {
    "zh-CN".to_owned()
}

/// Full settings of the Deskulpt application.
#[serde_as]
#[derive(Debug, Deserialize, Serialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// The application theme.
    #[serde_as(deserialize_as = "DefaultOnError")]
    pub theme: Theme,
    /// The canvas interaction mode.
    #[serde_as(deserialize_as = "DefaultOnError")]
    pub canvas_imode: CanvasImode,
    /// The keyboard shortcuts.
    ///
    /// This maps the actions to the shortcut strings that will trigger them.
    #[serde_as(deserialize_as = "MapSkipError<_, _>")]
    pub shortcuts: BTreeMap<ShortcutAction, String>,
    /// Snap threshold in pixels when dragging or resizing widgets.
    ///
    /// Edges or centers within this distance of another widget snap into
    /// alignment. `0` disables snapping.
    #[serde_as(deserialize_as = "DefaultOnError")]
    #[serde(default = "default_snap_threshold")]
    pub snap_threshold: u32,
    /// Whether to show alignment guides while dragging or resizing widgets.
    #[serde_as(deserialize_as = "DefaultOnError")]
    #[serde(default = "default_show_guides")]
    pub show_guides: bool,
    /// Whether the starter widgets have been added.
    #[serde_as(deserialize_as = "DefaultOnError")]
    #[specta(skip)]
    pub starter_widgets_added: bool,
    /// The application language.
    #[serde_as(deserialize_as = "DefaultOnError")]
    #[serde(default = "default_language")]
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            canvas_imode: CanvasImode::default(),
            shortcuts: BTreeMap::new(),
            snap_threshold: default_snap_threshold(),
            show_guides: default_show_guides(),
            starter_widgets_added: false,
            language: default_language(),
        }
    }
}

/// A patch for partial updates to [`Settings`].
#[derive(Debug, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    /// If not `None`, update [`Settings::theme`].
    #[specta(optional, type = Theme)]
    pub theme: Option<Theme>,
    /// If not `None`, update [`Settings::canvas_imode`].
    #[specta(optional, type = CanvasImode)]
    pub canvas_imode: Option<CanvasImode>,
    /// If not `None`, update [`Settings::shortcuts`].
    ///
    /// Non-specified shortcuts will remain unchanged. If a shortcut value is
    /// `None`, it means removing that shortcut. Otherwise, it means updating
    /// or adding that shortcut.
    #[specta(optional, type = BTreeMap<ShortcutAction, Option<String>>)]
    pub shortcuts: Option<BTreeMap<ShortcutAction, Option<String>>>,
    /// If not `None`, update [`Settings::snap_threshold`].
    #[specta(optional, type = u32)]
    pub snap_threshold: Option<u32>,
    /// If not `None`, update [`Settings::show_guides`].
    #[specta(optional, type = bool)]
    pub show_guides: Option<bool>,
    /// If not `None`, update [`Settings::starter_widgets_added`].
    #[serde(skip)]
    pub starter_widgets_added: Option<bool>,
    /// If not `None`, update [`Settings::language`].
    #[specta(optional, type = String)]
    pub language: Option<String>,
}

impl Settings {
    /// Load the settings from disk.
    ///
    /// Default settings will be returned if the settings file does not exist.
    /// Corrupted settings file will attempt to recover as much data as
    /// possible, applying default values for the corrupted parts. However,
    /// if the file is completely corrupted, an error might still be returned.
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Default::default());
        }
        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let settings: Settings = serde_json::from_reader(reader)?;
        Ok(settings)
    }

    /// Dump the settings to disk.
    ///
    /// The provided path will be created if it does not exist. The settings
    /// will be serialized in pretty JSON format with `$schema` metadata for
    /// human readability and editor support.
    pub fn dump(&self, path: &Path, schema_url: &str) -> Result<()> {
        #[derive(Serialize)]
        struct SettingsWithMeta<'a> {
            #[serde(rename = "$schema")]
            schema: &'a str,
            #[serde(flatten)]
            settings: &'a Settings,
        }

        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }

        let file = File::create(path)?;
        let writer = BufWriter::new(file);
        let settings = SettingsWithMeta {
            schema: schema_url,
            settings: self,
        };
        serde_json::to_writer_pretty(writer, &settings)?;
        Ok(())
    }
}
