<p align="center">
  <img src="./public/murmur.png" width="128" alt="murmur" />
</p>

# murmur / 三息之间

中文 | [English](./README.md)

> 在低语中呼吸，在安静中流动。· **桌面上的一小口呼吸。**

**murmur（三息之间）** 是一个基于
[Deskulpt](https://github.com/deskulpt-apps/Deskulpt) 的桌面组件与壁纸平台。
组件就是直接渲染在桌面上的 React 组件 —— 藏在图标之下、所有窗口之下，
按时段安静地变化。

- 项目代码：`murmur`
- 中文名：三息之间
- 域名：[murmur.yoga](https://murmur.yoga)
- 仓库：[github.com/bysanxi/murmur](https://github.com/bysanxi/murmur)
- 基座：[Deskulpt](https://github.com/deskulpt-apps/Deskulpt)
- 定位：桌面上的情绪微陪伴 / 微休息触发器
- 版本：`0.3.0` —— 持续开发中
- 许可：MIT

---

## 下载

安装包以 Release 资产的形式附在每个标签的 GitHub Release 上，**不入库**。

**[获取最新版本](https://github.com/bysanxi/murmur/releases/latest)**

- **Windows x64** —— [NSIS 安装版][dl-win-nsis] · [MSI][dl-win-msi]
- **macOS（Apple Silicon）** —— [DMG][dl-mac-arm]
- **macOS（Intel）** —— [DMG][dl-mac-x64]
- **Linux x86_64** —— [AppImage][dl-appimage] · [Debian 包][dl-deb] · [RPM][dl-rpm]

各平台链接指向发布流程重新上传的稳定别名，不随版本号变化，发新版本后依然有效。

---

## 它是什么

它不是传统壁纸应用，也不是心理治疗工具或效率工具。

它更像一个**桌面上的小窗、小纸条、小呼吸口**。你不需要为它打开任何界面，
桌面本身就是载体；无意间瞥一眼，就获得三秒钟的停顿、呼吸、被理解。

核心内容形态：

- **动态插画**：轻动态、低打扰、循环自然
- **治愈短句**：一到三行，一眼读完，不说教
- **被动瞥见**：自动切换为主，手动切换为辅
- **按时切换**：跟随早晨、上午、午休、下午、傍晚、深夜、周末变化

它不该是心理治疗工具、效率工具、打卡工具、说教工具。

## 核心理念

### 一天三次微小呼吸

`三息之间`说的是这些间隙：工作与工作之间、消息与消息之间、任务与任务之间、
情绪与情绪之间。在这些间隙里停一下，被接住一下。

### 不打扰的分寸感

自动切换为主，手动切换为辅。不做打卡、积分、排行榜；不推送"你今天还没看"；
不制造新的焦虑。像安静的室友，而不是催促的老板。

### 不要鸡汤，要人话

不说"你应该"，多用"你可以""也可以""没关系"。不强行积极，要能承接疲惫、
焦虑、孤独、自我怀疑。插画和文字是一体的，不是随便配图。

---

## 功能特性

### 桌面画布

- 一个透明、永远置底的窗口，**藏在桌面图标之下**
  （Windows 通过 `Progman`/`WorkerW` 嵌入外壳；macOS 以 `Accessory`
  策略运行并启用私有 API）
- 三种交互模式，可运行时切换、可绑定快捷键：
  - **Sink**（默认）——画布穿透点击，桌面照常使用
  - **Float**——组件可交互，未命中处穿透到桌面
  - **Auto**——跟随指针，组件与桌面同时可用
- Windows 上，当光标下最顶层组件声明了 `touch: feed | watch` 时，
  壁纸上的左键点击会被转发给 `window.__murmurPondTap(x, y)`

### 组件系统

- **基于目录的组件**——每个组件是一个带 `deskulpt.widget.json` 清单和入口
  模块的文件夹
- **Rust 端打包**——Rolldown 把入口及其依赖编译成单个压缩 ESM chunk，
  画布通过 blob URL 加载；不允许动态 import
- **通用布局设置**——位置、尺寸、不透明度、背景不透明度、层级
  （`-999`..`999`）、全屏、加载/卸载、逐项重置
- **清单声明的选项**——`bool`、`number`、`text`、`select`、`city`、`font`，
  支持多语言标签、分组、min/max/step，以及
  `when` / `unless` / `disable` 条件；值通过 `config` 属性传入
- **吸附与参考线**——吸附阈值可配置，拖拽与缩放时显示对齐参考线

### 管理器

从系统托盘或全局快捷键打开，共五个标签页：

| 标签   | 作用                                                            |
| ------ | --------------------------------------------------------------- |
| 组件   | 组件列表、清单视图、通用与本组件设置、字体、城市、重置          |
| 设置   | 画布交互模式、吸附阈值、参考线、开机启动、快捷键、settings.json |
| 组件库 | 浏览、预览、安装、升级、卸载 registry 中的组件                  |
| 日志   | 读取并清空 `deskulpt.*.log`                                     |
| 关于   | 名称、标语、版本、作者、仓库、主页                              |

主题与语言由标签页上方的头部区域切换。

- **多语言**：`zh-CN`（默认）与 `en`；托盘与管理器跟随设置
- **主题**：浅色 / 深色
- **键盘快捷键**：`toggleCanvasImode`、`openPortal`——默认未绑定，
  必须至少包含一个修饰键和一个字母数字键
- **开机启动**：由操作系统托管（Windows 注册表 Run，macOS LaunchAgent）
- **设置文件**：应用本地数据目录下的 `settings.json`，
  JSON Schema 位于 `resources/schema/settings.json`

### 组件库

组件来自 registry：

- 索引：`https://cdn.jsdelivr.net/gh/deskulpt-apps/widgets@registry/index.json`
  （ETag 缓存）
- 包：`ghcr.io/deskulpt-apps/widgets` 上的 OCI 制品，按 SHA-256 摘要校验
- 源码：[github.com/deskulpt-apps/widgets](https://github.com/deskulpt-apps/widgets)

安装后落在组件根目录，命名为 `@<handle>.<id>`。

### 起步组件

`@murmur.pond` —— **半亩方塘**：一方安静的池塘，光、天气与那句话都跟着
时间走。WebGL2 渲染（Canvas2D 兜底）、写实与写意两种画风、合成音效，
可选壁纸点击互动。

技术说明：[中文](./resources/widgets/starter/pond/README.zh.md) ·
[English](./resources/widgets/starter/pond/README.md)

---

## 时段与内容气质

内容遵循的方向，已由起步组件的 `lines.js` 实现。

| 时段        | 时间范围（示例） | 内容气质         |
| ----------- | ---------------- | ---------------- |
| 早晨        | 6:00 - 9:00      | 轻、柔、启动     |
| 上午        | 9:00 - 12:00     | 稳、静、呼吸     |
| 午休        | 12:00 - 14:00    | 松、日常、人味   |
| 下午        | 14:00 - 18:00    | 暖、陪伴、不鸡血 |
| 傍晚        | 18:00 - 21:00    | 收、结束、切换   |
| 深夜        | 21:00 - 6:00     | 安、静、陪伴     |
| 周末 / 假日 | —                | 慢、散、无目的   |

主题：自然、动物、人物、日常物件、抽象、窗景、云、植物 —— 承接疲惫、
焦虑、孤独、自我怀疑、麻木、平静与希望。

---

## 架构

### 两个窗口

| 窗口   | 标签     | 职责                                       |
| ------ | -------- | ------------------------------------------ |
| Portal | `portal` | 管理界面 —— 组件、设置、组件库、日志、关于 |
| Canvas | `canvas` | 渲染组件的透明桌面层                       |

两个窗口都由 `tauri-plugin-deskulpt-core` 创建。Portal 按需打开；
Canvas 在启动时创建并常驻图标之下。

### 技术栈

Tauri 2 · React 19 · Rust（edition 2024，工具链 `1.95.0`）· Vite 8 / Rolldown
· TypeScript · Radix Themes · Emotion · zustand · i18next · tsdown

### Rust 工作区（`crates/`）

| Crate                            | 职责                                               |
| -------------------------------- | -------------------------------------------------- |
| `deskulpt`                       | 应用入口：创建两个窗口、托盘、插件装配             |
| `deskulpt-common`                | 共享类型 —— 窗口标签、事件、bindings 宏            |
| `deskulpt-macros`                | 过程宏                                             |
| `deskulpt-plugin`                | 组件插件 trait 与分发                              |
| `deskulpt-plugin-fs`             | `fs` 插件，沙箱限定在组件自身目录                  |
| `deskulpt-plugin-sys`            | `sys` 插件 —— `get_system_info`                    |
| `deskulpt-plugin-macros`         | 插件过程宏                                         |
| `deskulpt-workspace`             | 工作区路径工具                                     |
| `tauri-deskulpt-build`           | 构建期代码生成（bindings、插件初始化）             |
| `tauri-plugin-deskulpt-core`     | 窗口、托盘、快捷键、画布模式、壁纸点击钩子、IPC    |
| `tauri-plugin-deskulpt-logs`     | 按日轮转的文件日志、读取/清空命令                  |
| `tauri-plugin-deskulpt-settings` | 设置模型、持久化、JSON schema 生成                 |
| `tauri-plugin-deskulpt-widgets`  | 目录、清单、Rolldown 打包器、渲染 worker、registry |

### 前端包（`packages/`）

| 目录                | 包名                   | 职责                                       |
| ------------------- | ---------------------- | ------------------------------------------ |
| `deskulpt-portal`   | `@deskulpt/manager`    | 管理窗口（五个标签页）                     |
| `deskulpt-canvas`   | `@deskulpt/canvas`     | 桌面组件层，拖拽缩放、错误边界             |
| `deskulpt-bindings` | `@deskulpt/bindings`   | 生成的 TypeScript bindings —— **请勿手改** |
| `deskulpt-utils`    | `@deskulpt/utils`      | i18n、日志、格式化工具                     |
| `apis`              | `@deskulpt-test/apis`  | 面向组件的 `fs` / `sys` API                |
| `react`             | `@deskulpt-test/react` | React 部分再导出                           |
| `ui`                | `@deskulpt-test/ui`    | Radix Themes 再导出 + `css` / `keyframes`  |

### 组件打包流水线

1. 清单与通用设置由 Rust 持有，目录持久化到本地数据目录的 `widgets.json`。
2. 加载时，`tauri-plugin-deskulpt-widgets` 中的 `Bundler`（Rolldown）把入口
   编译成单个压缩 ESM chunk；五个 `@deskulpt-test/*` 模块被 external 化并
   别名到真实地址——`jsx-runtime`、`raw-apis`、`react`、`ui` 指向
   `__DESKULPT_BASE_URL__/gen/<name>.js`，`apis` 指向
   `__DESKULPT_APIS_BLOB_URL__`。动态 import 会被拒绝。
3. `RenderEvent` 把 chunk 送到画布，画布替换 `__DESKULPT_BASE_URL__` 与
   `__DESKULPT_APIS_BLOB_URL__`，包成 blob URL 后 `import()`。
4. 默认导出被放进错误边界渲染，props 为
   `{ id, x, y, width, height, config }`。

---

## 项目结构

```text
murmur/
├── crates/                        # Rust 工作区
│   ├── deskulpt/                  #   应用入口（Tauri）
│   ├── deskulpt-common/           #   共享类型与宏
│   ├── deskulpt-macros/
│   ├── deskulpt-workspace/
│   ├── deskulpt-plugin/           #   组件插件接口
│   ├── deskulpt-plugin-fs/
│   ├── deskulpt-plugin-sys/
│   ├── deskulpt-plugin-macros/
│   ├── tauri-deskulpt-build/      #   构建期代码生成
│   ├── tauri-plugin-deskulpt-core/
│   ├── tauri-plugin-deskulpt-logs/
│   ├── tauri-plugin-deskulpt-settings/
│   └── tauri-plugin-deskulpt-widgets/
├── packages/                      # pnpm 工作区
│   ├── deskulpt-portal/           #   @deskulpt/manager
│   ├── deskulpt-canvas/           #   @deskulpt/canvas
│   ├── deskulpt-bindings/         #   @deskulpt/bindings（生成）
│   ├── deskulpt-utils/            #   @deskulpt/utils
│   ├── apis/                      #   @deskulpt-test/apis
│   ├── react/                     #   @deskulpt-test/react
│   └── ui/                        #   @deskulpt-test/ui
├── gen/                           # 生成的组件运行时 bundle
├── resources/
│   ├── schema/settings.json       # 生成的设置 JSON schema
│   └── widgets/starter/           # 起步组件源码
├── xtask/                         # cargo xtask（bindings、schema）
├── public/                        # logo 与图标
└── .github/workflows/             # CI、发布、rustdoc、缓存预热
```

`gen/`、`crates/tauri-plugin-deskulpt-core/gen/`、
`packages/deskulpt-bindings/src/`、`resources/schema/` 为生成物：
Prettier 与 oxlint 会跳过它们，knip 把 `gen/*` 当作入口。CI 会重新生成这些
文件，并在结果与提交内容不一致时失败。

---

## 快速开始

### 环境要求

- **Rust** —— `1.95.0`，由 `rust-toolchain.toml` 固定。
  `cargo +nightly fmt` 与 `cargo +nightly doc-workspace` 需要 nightly。
- **Node** —— `lts/*`（见 `.node-version`）
- **pnpm** —— `10.33.2`（见 `packageManager`）
- 你所用系统上 Tauri 2 的平台依赖

### 开发

```bash
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` 会在 `http://localhost:1420`（固定端口）启动 Vite 并拉起
应用。从托盘打开管理器，然后在**组件库**标签页加载组件。

### 构建

```bash
pnpm tauri build
```

先执行 `pnpm build:js`（`tsc -b && vite build`），再打包应用。

### 质量检查

```bash
pnpm lint            # oxlint --fix + cargo clippy --fix
pnpm lint:check      # 同上，但不修改文件
pnpm format          # prettier --write + cargo +nightly fmt
pnpm format:check    # 同上，仅检查
pnpm test            # cargo test-workspace（前端测试暂为占位）
pnpm check:js        # tsc -b
pnpm knip            # 未使用的依赖、导出与文件
pnpm docs:rs         # cargo +nightly doc-workspace
cargo shear          # 未使用的 Rust 依赖
```

### 重新生成生成物

```bash
pnpm build:packages   # gen/ 与 crates/tauri-plugin-deskulpt-core/gen/
cargo xtask bindings  # packages/deskulpt-bindings/src/
cargo xtask schema    # resources/schema/settings.json
cargo xtask --help    # 查看全部子命令
```

### CI

推送到 `main` 以及针对 `main` 的 PR 会执行 `format:check`、`knip`、
`cargo shear`、生成物新鲜度检查、`lint:check`、构建与测试；其中
`ci-verify` 会在 macOS / Ubuntu / Windows 三平台各跑一遍构建与测试。
负责上传二进制产物的 `ci-build` 在 push 时总是运行，PR 中则需要
commit message 含 `[ci-build]` 标记。发布由 `v*` 标签触发，产物覆盖
macOS（aarch64 / x86_64）、Linux x86_64 与 Windows x86_64。

### 发布

推送 `v*` 标签会触发 `.github/workflows/release.yaml`：在 macOS
（aarch64 / x86_64）、Linux x86_64 与 Windows x86_64 上构建，用 git-cliff
生成 Release 说明并创建 GitHub Release，随后把每个安装包按与版本无关的别名
重新上传，使[下载](#下载)链接跨版本持续有效。若未配置 `APPLE_CERTIFICATE*`
secrets，则跳过 Apple 签名步骤，改为发布未签名的 macOS 安装包。

---

## 编写组件

### 目录

```text
<组件根目录>/
└── my-widget/
    ├── deskulpt.widget.json   # 清单（必需）
    ├── index.jsx              # 入口，默认导出组件
    └── ...                    # 入口 import 到的一切
```

开发构建下根目录是 `target/debug/widgets`，发布构建下是
`Documents/Deskulpt/widgets`。管理器左下角的文件夹图标可直接打开。

### 清单

```json
{
  "name": "我的组件",
  "version": "0.1.0",
  "authors": ["you"],
  "license": "MIT",
  "description": "它做什么",
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

只有 `name` 与 `entry` 必填。`ignore: true` 会让应用忽略该组件。
`x`、`y`、`width`、`height`、`zIndex` 用于初始化通用设置。

### 选项

`options` 中的每一项都会渲染成**本组件**面板里的一行：

| 字段                          | 含义                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `key`                         | 存储键，从 `config` 属性里读取                               |
| `label`                       | `{ "zh-CN": "...", "en": "..." }` 或纯字符串                 |
| `type`                        | `bool` \| `number` \| `text` \| `select` \| `city` \| `font` |
| `default`                     | 用户设置前使用的值                                           |
| `min` / `max` / `step`        | 数值范围与步长（step 默认为 1）                              |
| `options`                     | `select` 的候选项（`font` 的固定候选项）                     |
| `group`                       | 分组标题，同组选项一起显示                                   |
| `whenKey` / `whenValue`       | 另一键匹配时才可编辑                                         |
| `unlessKey` / `unlessValue`   | 另一键匹配时隐藏                                             |
| `disableKey` / `disableValue` | 另一键匹配时禁用（但仍可见）                                 |

### 导入

```jsx
import { useEffect, useState } from "@deskulpt-test/react";
import { Box, Button, Flex, Text, css, keyframes } from "@deskulpt-test/ui";
import apis from "@deskulpt-test/apis";
```

- **`@deskulpt-test/react`** —— React hooks 与工具
- **`@deskulpt-test/ui`** —— Radix Themes 组件，外加 `css` / `keyframes`
- **`@deskulpt-test/apis`** —— 默认导出，`apis.fs.*` 与 `apis.sys.*`
  已自动绑定当前组件 id

JSX 使用 Emotion 自动运行时转换，JSX 本身无需 import。其他一切都必须是
组件文件夹内的相对导入 —— 它们会被打包。动态 import 会被打包器拒绝。

`fs` 命令（`readFile`、`writeFile`、`appendFile`、`createDir`、
`removeDir`、`removeFile`、`exists`、`isDir`、`isFile`）被沙箱限制在组件
自身目录内。

### 组件约定

```jsx
export default function MyWidget({ id, x, y, width, height, config }) {
  return <Box css={{ width, height }}>{config?.greeting ?? "你好"}</Box>;
}
```

模块**必须**有默认导出。画布会把它包进错误边界，所以组件崩溃时只显示
诊断信息，不会弄坏整个图层。

### 与壁纸互动

声明一个取值为 `off` / `feed` / `watch` 的 `touch` 选项。Windows 上，当
`touch` 为 `feed` 或 `watch` 的组件是光标下最顶层组件时，壁纸上的左键
点击会以画布逻辑坐标转发给 `window.__murmurPondTap(x, y)`。

### 参考实现

`resources/widgets/starter/pond/` 是一个完整可用的真实组件 —— 清单、选项、
打包、多语言、时段内容、WebGL 渲染与音效一应俱全。它的
[README](./resources/widgets/starter/pond/README.zh.md) 详细说明了设计。

---

## 非目标与路线

- 不做心理治疗工具、效率工具、打卡工具、说教工具
- 不做商业化
- 暂不做长期记录 / 治愈相册（后续版本再考虑）
- 性能纪律：动态幅度小，避免 CPU / GPU 持续高负载，电池模式下优雅降级

---

## 许可与致谢

MIT，详见 [LICENSE](./LICENSE)。第三方组件仍适用其各自许可证，详见
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

Copyright (c) 2024-2025 The Deskulpt Development Team
Copyright (c) 2026 hiudong

- [Deskulpt](https://github.com/deskulpt-apps/Deskulpt) —— 本项目基于其构建
  （MIT）
- [fishwallpaper](https://github.com/moli-xia/fishwallpaper)（MIT）—— 半亩方塘
  的渲染引擎取材自它，并为本项目作了修改

[dl-win-nsis]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-windows-x64-setup.exe
[dl-win-msi]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-windows-x64.msi
[dl-mac-arm]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-macos-aarch64.dmg
[dl-mac-x64]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-macos-x64.dmg
[dl-appimage]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-x86_64.AppImage
[dl-deb]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-amd64.deb
[dl-rpm]: https://github.com/bysanxi/murmur/releases/latest/download/murmur-linux-x86_64.rpm
