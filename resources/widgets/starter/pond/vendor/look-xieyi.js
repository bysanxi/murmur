// 与 look-real.js 同源。公式改 art.js，笔法留在本文件。
// 移植自 fishwallpaper 工作区（并行会话未提交改动，2026-10-05）。
(function (root) {
  "use strict";

  function finTint(_palette, pal, species) {
    const kind = species === "silvercarp" ? "silvercarp" : pal.kind;
    if (kind === "benigoi") return [0.44, 0.18, 0.14, 0.9];
    if (kind === "karasu") return [0.18, 0.17, 0.16, 0.92];
    if (kind === "ogon") return [0.64, 0.49, 0.2, 0.9];
    if (kind === "silvercarp") return [0.18, 0.32, 0.4, 0.88];
    return [0.8, 0.77, 0.69, 0.9];
  }

  function bodyShade(kind) {
    return {
      metal: 0,
      gloss: kind === "karasu" ? 0.03 : 0.05,
    };
  }

  root.PondLookXieyi = { finTint, bodyShade };
})(window);
