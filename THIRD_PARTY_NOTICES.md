# Third-Party Notices / 第三方声明

This file lists third-party works included in or derived by this project.
Each third-party component remains under its own license; this project's own
code is under [LICENSE](./LICENSE).

本文件列出本项目所包含或据其派生的第三方作品。各第三方组件仍适用其自身
许可证；本项目自有代码适用 [LICENSE](./LICENSE)。

## Deskulpt

- Project / 项目: <https://github.com/deskulpt-apps/Deskulpt>
- License / 许可: MIT
- Copyright / 版权: Copyright (c) 2024-2025 The Deskulpt Development Team
- Derivation / 关系: murmur is derived from Deskulpt. The copyright notice
  above is retained in [LICENSE](./LICENSE) as required by the MIT License.
  murmur 的框架部分派生自 Deskulpt，上述版权行已按 MIT 要求保留于
  [LICENSE](./LICENSE)。

## fishwallpaper

- Project / 项目: <https://github.com/moli-xia/fishwallpaper>
- License / 许可: MIT — confirmed by the author (moli-xia). The upstream
  repository does not yet contain a `LICENSE` file; adding one has been
  requested. 由作者 moli-xia 确认为 MIT；上游仓库尚未放置 `LICENSE` 文件，
  已请求补充。
- Copyright / 版权: Copyright (c) moli-xia（以上游仓库发布的版权行为准）
- Derivation / 关系: The pond widget's rendering engine under
  `resources/widgets/starter/pond/` — including `vendor/` — is derived from
  fishwallpaper and modified for this project (viewing pond only; feeding,
  hand-drawn patterns, saved fish and some features are not wired up).
  `resources/widgets/starter/pond/`（含 `vendor/`）下的渲染引擎派生自
  fishwallpaper，并为本项目作了修改（仅保留观赏，投喂、手绘图案、鱼的存档
  等功能未接入）。

## Open-Meteo

- Service / 服务: <https://open-meteo.com/>
- License / 许可: CC BY 4.0
- Usage / 用途: City weather lookups in
  `resources/widgets/starter/pond/city.js`.
  `resources/widgets/starter/pond/city.js` 中的城市天气查询。
- Note / 说明: The free API is primarily intended for non-commercial use.
  Review its current terms before any commercial release.
  免费接口主要面向非商业使用，商业发布前请按其现行条款确认。

## Upstream artwork / 上游素材

The pond background image originates from upstream fishwallpaper, where it
was generated with an image-generation tool; prompts are recorded in the
upstream repository's `assets/ARTWORK.md`. Fish, turtles and other scene
elements are drawn by code rather than extracted from third-party media.

池塘底图源自上游 fishwallpaper，由图像生成工具生成，提示词留档于上游仓库的
`assets/ARTWORK.md`；锦鲤、小乌龟等场景元素由代码绘制，未提取任何第三方
图片、代码或音频。
