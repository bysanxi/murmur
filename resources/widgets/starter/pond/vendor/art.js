// Shared formulas and weather sprites. Brushwork lives in art-real.js and art-xieyi.js.
(function (root) {
  "use strict";
  const { BODY, randomSeed } = root.PondCore;
  const TAU = Math.PI * 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function valueNoise(seed) {
    const r = randomSeed(seed * 7919 + 17),
      perm = new Uint8Array(512),
      vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
      vals[i] = r();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1)),
        t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    return (x, y) => {
      const xi = Math.floor(x),
        yi = Math.floor(y),
        xf = x - xi,
        yf = y - yi,
        u = xf * xf * (3 - 2 * xf),
        v = yf * yf * (3 - 2 * yf);
      const X = xi & 255,
        Y = yi & 255,
        a = vals[perm[perm[X] + Y]],
        b = vals[perm[perm[X + 1] + Y]],
        c = vals[perm[perm[X] + Y + 1]],
        d = vals[perm[perm[X + 1] + Y + 1]];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct = 4) {
    let s = 0,
      a = 0.5,
      f = 1,
      t = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x * f + i * 17.3, y * f - i * 9.1);
      t += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / t;
  }

  // ---------- Koi ----------
  const girthOf = (seed) => 0.93 + randomSeed(seed + 3)() * 0.14;
  // Half the body's width seen from above, at body x (nose +34 → tail root). A koi's head is a rounded wedge,
  // clearly narrower than the body; the body swells to its widest over the pectoral fins and front of the
  // dorsal fin (about two fifths back), then tapers to a thick tail stalk.
  function halfWidth(x, girth, kind) {
    const silver = kind === "silvercarp",
      len = silver ? 70 : 64,
      t = (BODY.nose - x) / len;
    if (t < 0 || t > 1) return 0;
    const peak = silver ? 0.32 : 0.42,
      W = (silver ? 7.2 : 9.4) * girth;
    const end =
      t > 0.92 ? Math.sqrt(Math.max(0, 1 - ((t - 0.92) / 0.08) ** 2)) : 1;
    // In front of the widest point the outline is a long half-ellipse: a blunt, round snout, never a point.
    if (t < peak) {
      const s = t / peak;
      return W * Math.pow(1 - (1 - s) * (1 - s), 0.55) * end;
    }
    return (
      W *
      (1 -
        (silver ? 0.74 : 0.62) *
          Math.pow((t - peak) / (1 - peak), silver ? 1.25 : 1.5)) *
      end
    );
  }
  const hash = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  // Overlapping scales laid on the round back: rows follow arc length across the body, so they squeeze toward
  // the flanks. The visible scale is the most forward one covering the point (free edges point to the tail).
  // Writes into SC: r = distance from its centre (1 = free edge), id, its centre in body coordinates, and
  // dx = how far forward of its centre the point lies (−1 tail side … +1 head side, where it tucks under its neighbour).
  const SC = { r: 2, id: 0, x: 0, y: 0, dx: 0 };
  function scaleAt(x, y, w, size = 1) {
    const ys = Math.asin(Math.max(-0.999, Math.min(0.999, y / w))) * w,
      sx = 1.85 * size,
      sy = 1.55 * size,
      R = sx * 0.74,
      row = Math.round(ys / sy);
    let best = -1e9;
    SC.r = 2;
    for (let rr = row - 1; rr <= row + 1; rr++) {
      const cy = rr * sy,
        off = rr & 1 ? sx * 0.5 : 0,
        col = Math.round((x - off) / sx);
      for (let cc = col - 1; cc <= col + 1; cc++) {
        // Real scales are not a perfect lattice: each sits a little off its neighbours.
        const cx =
            cc * sx + off + (hash(rr * 13.1 + cc * 7.7) - 0.5) * sx * 0.22,
          d = Math.hypot(
            x - cx,
            ys - cy - (hash(rr * 5.3 - cc * 11.9) - 0.5) * sy * 0.18,
          );
        if (d < R && cx > best) {
          best = cx;
          SC.r = d / R;
          SC.id = rr * 997 + cc;
          SC.x = cx;
          SC.dx = (x - cx) / R;
          SC.y = Math.sin(Math.max(-1.5, Math.min(1.5, cy / w))) * w;
        }
      }
    }
    return SC.r <= 1;
  }
  // Raw pattern fields, positive inside a patch: out[0] red (hi), out[1] black (sumi).
  function patternFor(kind, seed) {
    const r = randomSeed(seed + 11),
      n = valueNoise(seed),
      n2 = valueNoise(seed + 101);
    const ox = r() * 50,
      oy = r() * 50,
      th = 0.5 + (r() - 0.5) * 0.12 + (kind === "sanke" ? 0.03 : 0),
      headRed = r() < 0.75,
      band = r() * TAU,
      split = r() < 0.5 ? -1 : 1;
    const tx = 23.5 + r() * 1.5,
      tr = 5.6 + r() * 1.1;
    return (x, y, w, out) => {
      const v = Math.max(-1, Math.min(1, y / Math.max(w, 0.5)));
      out[0] = -1;
      out[1] = -1;
      if (kind === "kohaku" || kind === "sanke") {
        let val =
          fbm(n, x * 0.075 + ox, v * 1.05 + oy) +
          0.14 * Math.sin(x * 0.16 + band);
        if (headRed) val += 0.2 * smooth(17, 25, x);
        out[0] =
          val -
          th -
          0.6 * smooth(30.5, 33.5, x) -
          0.08 * smooth(0.7, 1, Math.abs(v));
        if (kind === "sanke")
          out[1] =
            fbm(n2, x * 0.2 + ox, v * 1.8 + oy, 3) -
            0.72 -
            0.3 * smooth(13, 19, x);
      } else if (kind === "utsuri") {
        const val =
          fbm(n, x * 0.06 + ox, v * 0.9 + oy) +
          0.12 * Math.sin(x * 0.13 + band) +
          0.35 *
            smooth(17, 21, x) *
            smooth(-0.15, 0.15, split * v + (x - 26) * 0.12);
        out[1] = val - th - 0.04;
      } else if (kind === "tancho")
        out[0] =
          (tr -
            Math.hypot(x - tx, y) -
            (n(x * 0.5 + ox, y * 0.5 + oy) - 0.5) * 1.4) *
          0.06;
    };
  }
  function pelletSprite() {
    const c = canvas(28, 28),
      ctx = c.getContext("2d"),
      g = ctx.createRadialGradient(11, 10, 1, 14, 14, 11);
    g.addColorStop(0, "#e2c27c");
    g.addColorStop(0.35, "#b88645");
    g.addColorStop(0.85, "#7c5226");
    g.addColorStop(1, "rgba(90,60,30,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(14, 14, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,248,220,.75)";
    ctx.beginPath();
    ctx.ellipse(10.5, 9.5, 2.6, 1.8, -0.6, 0, TAU);
    ctx.fill();
    return { canvas: c, ppu: 4, px: 0.5, py: 0.5 };
  }
  function dotSprite() {
    const c = canvas(48, 48),
      ctx = c.getContext("2d"),
      g = ctx.createRadialGradient(24, 24, 0, 24, 24, 23);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,.75)");
    g.addColorStop(0.6, "rgba(255,255,255,.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    return { canvas: c, ppu: 4, px: 0.5, py: 0.5 };
  }
  function flakeSprite() {
    const c = canvas(32, 32),
      ctx = c.getContext("2d"),
      g = ctx.createRadialGradient(15, 15, 0, 16, 16, 15);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(250,252,255,.92)");
    g.addColorStop(0.8, "rgba(240,246,255,.35)");
    g.addColorStop(1, "rgba(240,246,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return { canvas: c, ppu: 4, px: 0.5, py: 0.5 };
  }
  // A splash ring: a bright rim with a soft halo, for raindrops landing on leaves and water.
  function ringSprite() {
    const c = canvas(64, 64),
      ctx = c.getContext("2d");
    ctx.strokeStyle = "rgba(255,255,255,.3)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.stroke();
    return { canvas: c, ppu: 4, px: 0.5, py: 0.5 };
  }
  function streakSprite() {
    const c = canvas(10, 90),
      ctx = c.getContext("2d"),
      g = ctx.createLinearGradient(0, 0, 0, 90);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.75, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,.9)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(4.4, 0);
    ctx.lineTo(5.6, 0);
    ctx.lineTo(6.4, 89);
    ctx.lineTo(3.6, 89);
    ctx.closePath();
    ctx.fill();
    return { canvas: c, ppu: 1, px: 0.5, py: 1 };
  }
  root.PondArt = {
    canvas,
    clamp01,
    smooth,
    mix,
    hex,
    TAU,
    valueNoise,
    fbm,
    hash,
    girthOf,
    halfWidth,
    scaleAt,
    SC,
    patternFor,
    pelletSprite,
    dotSprite,
    flakeSprite,
    ringSprite,
    streakSprite,
  };
})(window);
