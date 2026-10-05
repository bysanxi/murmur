// 与 look-xieyi.js 同源。公式改 art.js，笔法留在本文件。
(function (root) {
  "use strict";
  const { PALETTES } = root.PondCore;
  const rgb = (h) => [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
  const finTable = PALETTES.map((p) => [...rgb(p.fin), 0.9]);

  function finTint(palette, pal, species) {
    if (pal.kind === "utsuri") return [1, 1, 1, 0.92];
    if (species === "silvercarp") return [...rgb(pal.fin), 0.85];
    return finTable[palette];
  }

  function bodyShade(kind) {
    return {
      metal: kind === "ogon" ? 1 : 0,
      gloss: kind === "ogon" ? 0.36 : kind === "karasu" ? 0.16 : 0.5,
    };
  }

  root.PondLookReal = { finTint, bodyShade };
})(window);
