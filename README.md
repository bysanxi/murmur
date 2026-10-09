<p align="center">
  <img src="./public/murmur.png" width="128" alt="murmur" />
</p>

# murmur / 三息之间

[中文](./README.zh.md) | English

> Breathe in the quiet, flow in the stillness. · **A quiet breath on the
> desktop.**

**murmur** is a desktop widget and wallpaper platform built on
[Deskulpt](https://github.com/deskulpt-apps/Deskulpt). Widgets are React
components that render directly on the desktop — behind the icons, below every
window — and change quietly with the time of day.

- Project code: `murmur`
- Chinese name: 三息之间
- Domain: [murmur.yoga](https://murmur.yoga)
- Repository: [github.com/bysanxi/murmur](https://github.com/bysanxi/murmur)
- Foundation: [Deskulpt](https://github.com/deskulpt-apps/Deskulpt)
- Positioning: a subtle emotional companion / micro-break trigger on the desktop
- Version: `0.3.0` — active development
- License: MIT

---

## Download

Installers are attached to the GitHub Release for each tag — none of them are
committed to this repository.

**[Get the latest release](https://github.com/bysanxi/murmur/releases/latest)**

- **Windows x64** — [NSIS installer][dl-win-nsis] · [MSI][dl-win-msi]
- **macOS (Apple Silicon)** — [DMG][dl-mac-arm]
- **macOS (Intel)** — [DMG][dl-mac-x64]
- **Linux x86_64** — [AppImage][dl-appimage] · [Debian][dl-deb] · [RPM][dl-rpm]

The per-platform links are version-independent aliases re-uploaded by the
release workflow, so they keep pointing at the newest build.

---

## What It Is

It is not a traditional wallpaper app, nor a therapy tool or productivity tool.

It is a **small window, a small note, a small breathing space on your desktop**.
You never open an interface for it: the desktop itself is the medium. In a
fleeting glance you get three seconds of pause, breath, and feeling understood.

Core content forms:

- **Dynamic illustration** — subtle motion, low distraction, naturally looping
- **Healing short lines** — one to three lines, read at a glance, never preachy
- **Passive glance** — automatic switching first, manual second
- **Time-based switching** — content follows morning, late morning, lunch,
  afternoon, evening, late night, weekend

It should not be a therapy tool, a productivity tool, a check-in tool, or a
preachy tool.

## Core Philosophy

### Three tiny breaths a day

`三息之间` names the gaps: between work and work, message and message, task and
task, emotion and emotion. Somewhere to pause for a moment and be gently held.

### A sense of non-intrusion

Automatic first, manual second. No check-ins, points, or leaderboards. No "you
haven't looked today" push. No new anxiety. Like a quiet roommate, not a boss
hurrying you.

### No chicken soup, just human words

Prefer "you can", "it's also okay", "it's fine" over "you should". No forced
positivity — it has to hold fatigue, anxiety, loneliness, and self-doubt.
Illustration and text are one thing, not an arbitrary pairing.

---

## Features

### Desktop canvas

- A transparent, always-on-bottom window that sits **behind the desktop icons**
  (Windows embeds it into the shell via `Progman`/`WorkerW`; macOS runs the app
  as an `Accessory` with private APIs enabled).
- Three interaction modes, switchable at runtime and bindable to a shortcut:
  - **Sink** (default) — canvas is click-through, the desktop stays usable
  - **Float** — widgets are interactable, misses fall through to the desktop
  - **Auto** — follows the pointer, so widgets and desktop both feel live
- On Windows, a left click on the wallpaper is forwarded to
  `window.__murmurPondTap(x, y)` when the topmost widget under the cursor
  declares `touch: feed | watch`.

### Widget system

- **Directory-based widgets** — every widget is a folder with a
  `deskulpt.widget.json` manifest and an entry module.
- **Bundled in Rust** — Rolldown compiles the entry and its imports into one
  minified ESM chunk, which the canvas imports from a blob URL. Dynamic imports
  are not allowed.
- **Shared layout settings** — position, size, opacity, background opacity,
  z-index (`-999`..`999`), fullscreen, load/unload, per-widget reset.
- **Manifest-declared options** — `bool`, `number`, `text`, `select`, `city`,
  `font`, with localized labels, groups, min/max/step, and
  `when` / `unless` / `disable` conditions. Values arrive as the `config` prop.
- **Snapping and guides** — configurable snap threshold and alignment guides
  while dragging or resizing.

### Manager portal

Opened from the system tray or a global shortcut. Five tabs:

| Tab      | What it does                                                             |
| -------- | ------------------------------------------------------------------------ |
| Widgets  | Widget list, manifest view, shared and own settings, fonts, city, reset  |
| Settings | Canvas mode, snap threshold, guides, autostart, shortcuts, settings.json |
| Gallery  | Browse, preview, install, upgrade, uninstall widgets from the registry   |
| Logs     | Read and clear `deskulpt.*.log` files                                    |
| About    | Name, tagline, version, authors, repository, homepage                    |

Theme and language are toggled from the header above the tabs.

- **i18n**: `zh-CN` (default) and `en`; the tray and portal follow the setting.
- **Theme**: light / dark.
- **Keyboard shortcuts**: `toggleCanvasImode`, `openPortal` — unbound by
  default, must contain at least one modifier and one alphanumeric key.
- **Launch at login** via the OS (Run key on Windows, LaunchAgent on macOS).
- **Settings file**: `settings.json` in the app-local data dir, with a JSON
  Schema at `resources/schema/settings.json`.

### Gallery

Widgets are fetched from a registry:

- Index: `https://cdn.jsdelivr.net/gh/deskulpt-apps/widgets@registry/index.json`
  (ETag-cached)
- Packages: OCI artifacts at `ghcr.io/deskulpt-apps/widgets`, verified by
  SHA-256 digest
- Sources: [github.com/deskulpt-apps/widgets](https://github.com/deskulpt-apps/widgets)

Installed widgets land in the widgets base directory as `@<handle>.<id>`.

### Starter widget

`@murmur.pond` — **半亩方塘**, a quiet pond whose light, weather, and sentence
follow the time of day. WebGL2 with a Canvas2D fallback, realistic and ink-wash
styles, synthesised sound, and optional wallpaper taps.

Technical notes: [English](./resources/widgets/starter/pond/README.md) ·
[中文](./resources/widgets/starter/pond/README.zh.md)

---

## Time Periods and Content Tone

The direction the content follows; implemented by the starter widget's
`lines.js`.

| Time Period       | Time Range (Example) | Content Tone                       |
| ----------------- | -------------------- | ---------------------------------- |
| Morning           | 6:00 - 9:00          | Light, soft, starting              |
| Late Morning      | 9:00 - 12:00         | Steady, quiet, breathing           |
| Lunch Break       | 12:00 - 14:00        | Relaxed, everyday, human           |
| Afternoon         | 14:00 - 18:00        | Warm, companionable, not hyped     |
| Evening           | 18:00 - 21:00        | Wrapping up, ending, transitioning |
| Late Night        | 21:00 - 6:00         | Calm, quiet, companionable         |
| Weekend / Holiday | —                    | Slow, loose, purposeless           |

Themes: nature, animals, people, everyday objects, abstract, window views,
clouds, plants — holding fatigue, anxiety, loneliness, self-doubt, numbness,
calm, and hope.

---

## Architecture

### Two windows

| Window | Label    | Role                                                    |
| ------ | -------- | ------------------------------------------------------- |
| Portal | `portal` | Management UI — widgets, settings, gallery, logs, about |
| Canvas | `canvas` | The transparent desktop layer that renders widgets      |

Both are created by `tauri-plugin-deskulpt-core`. The portal is opened on
demand; the canvas is created at startup and stays behind the icons.

### Tech stack

Tauri 2 · React 19 · Rust (edition 2024, toolchain `1.95.0`) · Vite 8 / Rolldown
· TypeScript · Radix Themes · Emotion · zustand · i18next · tsdown

### Rust workspace (`crates/`)

| Crate                            | Role                                                           |
| -------------------------------- | -------------------------------------------------------------- |
| `deskulpt`                       | App entry: builds both windows, tray, plugin wiring            |
| `deskulpt-common`                | Shared types — window labels, events, bindings macro           |
| `deskulpt-macros`                | Proc macros                                                    |
| `deskulpt-plugin`                | Widget plugin trait and dispatch                               |
| `deskulpt-plugin-fs`             | `fs` plugin, sandboxed to the widget's own directory           |
| `deskulpt-plugin-sys`            | `sys` plugin — `get_system_info`                               |
| `deskulpt-plugin-macros`         | Proc macros for plugins                                        |
| `deskulpt-workspace`             | Workspace path helpers                                         |
| `tauri-deskulpt-build`           | Build-time codegen for bindings and plugin initialization      |
| `tauri-plugin-deskulpt-core`     | Windows, tray, shortcuts, canvas mode, wallpaper tap hook, IPC |
| `tauri-plugin-deskulpt-logs`     | Daily-rotating file logs, read/clear commands                  |
| `tauri-plugin-deskulpt-settings` | Settings model, persistence, JSON schema generation            |
| `tauri-plugin-deskulpt-widgets`  | Catalog, manifest, Rolldown bundler, render worker, registry   |

### Frontend packages (`packages/`)

| Directory           | Package                | Role                                              |
| ------------------- | ---------------------- | ------------------------------------------------- |
| `deskulpt-portal`   | `@deskulpt/manager`    | Management window (the five tabs)                 |
| `deskulpt-canvas`   | `@deskulpt/canvas`     | Desktop widget layer, drag/resize, error boundary |
| `deskulpt-bindings` | `@deskulpt/bindings`   | Generated TypeScript bindings — **do not edit**   |
| `deskulpt-utils`    | `@deskulpt/utils`      | i18n, logging, formatting helpers                 |
| `apis`              | `@deskulpt-test/apis`  | Widget-facing `fs` / `sys` APIs                   |
| `react`             | `@deskulpt-test/react` | Partial React re-export for widgets               |
| `ui`                | `@deskulpt-test/ui`    | Radix Themes re-export + `css` / `keyframes`      |

### Widget pipeline

1. The manifest and shared settings live in Rust; the catalog is persisted to
   `widgets.json` in the app-local data dir.
2. On load, `Bundler` (Rolldown, in `tauri-plugin-deskulpt-widgets`) compiles the
   entry into a single minified ESM chunk. The five `@deskulpt-test/*` modules
   are externalized and aliased to real URLs: `jsx-runtime`, `raw-apis`,
   `react` and `ui` point at
   `__DESKULPT_BASE_URL__/gen/<name>.js`, and `apis` at
   `__DESKULPT_APIS_BLOB_URL__`. Dynamic imports are rejected.
3. A `RenderEvent` carries the chunk to the canvas, which substitutes
   `__DESKULPT_BASE_URL__` and `__DESKULPT_APIS_BLOB_URL__`, wraps it in a blob
   URL, and `import()`s it.
4. The default export is rendered inside an error boundary with
   `{ id, x, y, width, height, config }` props.

---

## Project Structure

```text
murmur/
├── crates/                        # Rust workspace
│   ├── deskulpt/                  #   app entry (Tauri)
│   ├── deskulpt-common/           #   shared types and macros
│   ├── deskulpt-macros/
│   ├── deskulpt-workspace/
│   ├── deskulpt-plugin/           #   widget plugin interface
│   ├── deskulpt-plugin-fs/
│   ├── deskulpt-plugin-sys/
│   ├── deskulpt-plugin-macros/
│   ├── tauri-deskulpt-build/      #   build-time codegen
│   ├── tauri-plugin-deskulpt-core/
│   ├── tauri-plugin-deskulpt-logs/
│   ├── tauri-plugin-deskulpt-settings/
│   └── tauri-plugin-deskulpt-widgets/
├── packages/                      # pnpm workspace
│   ├── deskulpt-portal/           #   @deskulpt/manager
│   ├── deskulpt-canvas/           #   @deskulpt/canvas
│   ├── deskulpt-bindings/         #   @deskulpt/bindings (generated)
│   ├── deskulpt-utils/            #   @deskulpt/utils
│   ├── apis/                      #   @deskulpt-test/apis
│   ├── react/                     #   @deskulpt-test/react
│   └── ui/                        #   @deskulpt-test/ui
├── gen/                           # generated widget runtime bundles
├── resources/
│   ├── schema/settings.json       # generated settings JSON schema
│   └── widgets/starter/           # starter widget sources
├── xtask/                         # cargo xtask (bindings, schema)
├── public/                        # logo and icons
└── .github/workflows/             # CI, release, rustdoc, cache warmup
```

`gen/`, `crates/tauri-plugin-deskulpt-core/gen/`,
`packages/deskulpt-bindings/src/`, and `resources/schema/` are generated.
Prettier and oxlint skip them; knip treats `gen/*` as entry points. CI
regenerates all of them and fails if the result differs from the committed
files.

---

## Getting Started

### Prerequisites

- **Rust** — `1.95.0`, pinned by `rust-toolchain.toml`. Nightly is needed for
  `cargo +nightly fmt` and `cargo +nightly doc-workspace`.
- **Node** — `lts/*` (see `.node-version`)
- **pnpm** — `10.33.2` (see `packageManager`)
- Platform dependencies for Tauri 2 on your OS

### Develop

```bash
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` starts Vite on `http://localhost:1420` (strict port) and
launches the app. Open the portal from the tray, then load widgets from the
**Gallery** tab.

### Build

```bash
pnpm tauri build
```

Runs `pnpm build:js` (`tsc -b && vite build`) first, then bundles the
application.

### Quality checks

```bash
pnpm lint            # oxlint --fix + cargo clippy --fix
pnpm lint:check      # both, no fixes
pnpm format          # prettier --write + cargo +nightly fmt
pnpm format:check    # both, check only
pnpm test            # cargo test-workspace (JS suite is a placeholder)
pnpm check:js        # tsc -b
pnpm knip            # unused dependencies, exports, and files
pnpm docs:rs         # cargo +nightly doc-workspace
cargo shear          # unused Rust dependencies
```

### Regenerating generated files

```bash
pnpm build:packages   # gen/ + crates/tauri-plugin-deskulpt-core/gen/
cargo xtask bindings  # packages/deskulpt-bindings/src/
cargo xtask schema    # resources/schema/settings.json
cargo xtask --help    # list subcommands
```

### CI

Pushes to `main` and pull requests targeting `main` run `format:check`, `knip`,
`cargo shear`, a generated-file freshness check, `lint:check`, a build, and
tests — `ci-verify` repeats build and tests on macOS, Ubuntu, and Windows. The
`ci-build` job that uploads binaries always runs on push, and on a pull request
only when the commit message contains `[ci-build]`. Releases are cut from `v*`
tags for macOS (aarch64 / x86_64), Linux x86_64, and Windows x86_64.

### Releases

Pushing a `v*` tag runs `.github/workflows/release.yaml`, which builds macOS
(aarch64 / x86_64), Linux x86_64, and Windows x86_64, creates the GitHub
Release with git-cliff notes, then re-uploads every installer under a
version-independent alias so the [Download](#download) links keep working
across releases. When the `APPLE_CERTIFICATE*` secrets are not configured the
macOS signing steps are skipped and an unsigned build is published instead.

---

## Writing a Widget

### Layout

```text
<widgets base dir>/
└── my-widget/
    ├── deskulpt.widget.json   # manifest (required)
    ├── index.jsx              # entry, exports the component by default
    └── ...                    # anything the entry imports
```

The base directory is `target/debug/widgets` in a development build and
`Documents/Deskulpt/widgets` in a release build. The folder icon at the bottom
left of the manager opens it.

### Manifest

```json
{
  "name": "My widget",
  "version": "0.1.0",
  "authors": ["you"],
  "license": "MIT",
  "description": "What it does",
  "homepage": "https://example.com",
  "entry": "index.jsx",
  "x": 0,
  "y": 0,
  "width": 300,
  "height": 200,
  "zIndex": 0,
  "options": []
}
```

Only `name` and `entry` are required. `ignore: true` hides the widget from the
app. `x`, `y`, `width`, `height`, `zIndex` seed the shared settings.

### Options

Each entry in `options` renders a row in the **This widget** panel:

| Field                       | Meaning                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `key`                       | Storage key; read it from the `config` prop                  |
| `label`                     | `{ "zh-CN": "...", "en": "..." }` or a plain string          |
| `type`                      | `bool` \| `number` \| `text` \| `select` \| `city` \| `font` |
| `default`                   | Value used until the user sets one                           |
| `min`/`max`/`step`          | Number bounds and increment (step defaults to 1)             |
| `options`                   | Choices for `select` (and pinned choices for `font`)         |
| `group`                     | Box title; options sharing a group are shown together        |
| `whenKey`/`whenValue`       | Editable only when the other key matches                     |
| `unlessKey`/`unlessValue`   | Hidden while the other key matches                           |
| `disableKey`/`disableValue` | Disabled (but visible) while the other key matches           |

### Imports

```jsx
import { useEffect, useState } from "@deskulpt-test/react";
import { Box, Button, Flex, Text, css, keyframes } from "@deskulpt-test/ui";
import apis from "@deskulpt-test/apis";
```

- **`@deskulpt-test/react`** — React hooks and helpers
- **`@deskulpt-test/ui`** — Radix Themes components plus `css` / `keyframes`
- **`@deskulpt-test/apis`** — default export with `apis.fs.*` and `apis.sys.*`
  already bound to your widget id

JSX is transformed with the Emotion automatic runtime, so no import is needed
for JSX itself. Everything else must be a relative import inside the widget
folder — it gets bundled. Dynamic imports are rejected by the bundler.

The `fs` commands (`readFile`, `writeFile`, `appendFile`, `createDir`,
`removeDir`, `removeFile`, `exists`, `isDir`, `isFile`) are sandboxed to the
widget's own directory.

### Component contract

```jsx
export default function MyWidget({ id, x, y, width, height, config }) {
  return <Box css={{ width, height }}>{config?.greeting ?? "hello"}</Box>;
}
```

The module **must** have a default export. The canvas wraps it in an error
boundary, so a crash shows a diagnostic instead of breaking the layer.

### Interaction with the wallpaper

Declare a `touch` option with values `off` / `feed` / `watch`. On Windows, when
a widget whose `touch` is `feed` or `watch` is the topmost one under the cursor,
left clicks on the wallpaper are forwarded to `window.__murmurPondTap(x, y)` in
canvas logical coordinates.

### Reference implementation

`resources/widgets/starter/pond/` is a complete, real widget — manifest,
options, bundling, i18n, time-based content, WebGL rendering, and sound. Its
[README](./resources/widgets/starter/pond/README.md) walks through the design.

---

## Non-Goals & Roadmap

- Not a therapy tool, a productivity tool, a check-in tool, or a preachy tool
- No commercialization
- No long-term records / healing album for now (revisit in a later version)
- Performance discipline: keep motion subtle, avoid sustained high CPU/GPU load,
  degrade gracefully on battery

---

## License & Acknowledgments

MIT — see [LICENSE](./LICENSE). Third-party components remain under their own
licenses — see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Copyright (c) 2024-2025 The Deskulpt Development Team
Copyright (c) 2026 hiudong

- [Deskulpt](https://github.com/deskulpt-apps/Deskulpt) — the foundation this
  project is built on (MIT)
- [fishwallpaper](https://github.com/moli-xia/fishwallpaper) (MIT) — the pond
  widget's rendering engine derives from it and is modified here

[dl-win-nsis]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-windows-x64-setup.exe
[dl-win-msi]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-windows-x64.msi
[dl-mac-arm]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-macos-aarch64.dmg
[dl-mac-x64]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-macos-x64.dmg
[dl-appimage]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-x86_64.AppImage
[dl-deb]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-amd64.deb
[dl-rpm]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-x86_64.rpm
