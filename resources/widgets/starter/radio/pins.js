// The station pins on the globe: a second point buffer drawn right after
// the land, one slot per known station and the one on air in the last
// slot, so a single draw call covers them all — plus the hit test that
// turns a tap on the globe into a station. Dense cities fan out along a
// golden spiral when the camera dives in (see ring-spread.js).

import { genreColorOf } from "./genre-color.js";
import { packHomes } from "./pack-homes.js";
import {
  RING_MAX,
  createRingAnimator,
  precOf,
  ringEase,
  viewCenter,
} from "./ring-spread.js";

// Matches stations.GEO_CACHE_LIMIT so a full local catalog can land on
// the globe instead of being clipped to the old online sample size.
const CAPACITY = 8000;
const SLOTS = CAPACITY + RING_MAX + 1;

function shortestAng(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const HIT = 16; // px around a pin that still counts as a tap
const NEAR = 0.05; // camera-space depth below which a point is behind us
// RoamDial's precise grade still shares a point a handful of times
// (Vatican is 7). A larger identical pile is a city snap, so it can fan.
const PILE_EXACT = 8;

function gradePiles(list) {
  const groups = new Map();
  for (const item of list) {
    item.prec = precOf(item);
    if (item.prec < 3) continue;
    const key = `${Math.round(item.lat * 100)}:${Math.round(item.lon * 100)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  for (const members of groups.values()) {
    if (members.length < PILE_EXACT) continue;
    for (const item of members) item.prec = 2;
  }
}

export function createPins(gl, aPos, aKind, aColor, aDen) {
  const home = new Float32Array(SLOTS * 3);
  const pos = new Float32Array(SLOTS * 3);
  const kinds = new Float32Array(SLOTS);
  const colors = new Float32Array(SLOTS * 3);
  const dens = new Float32Array(SLOTS);
  const homeDens = new Float32Array(CAPACITY);
  kinds[0] = 1; // the station slot before the first upload
  colors.set([1, 0.74, 0.45], 0); // on-air sun tint until a station lands
  dens[0] = 1;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  const kindBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, kindBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, kinds, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aKind);
  gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, 0, 0);
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  if (aColor >= 0) {
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  }
  const denBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, denBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, dens, gl.DYNAMIC_DRAW);
  if (aDen >= 0) {
    gl.enableVertexAttribArray(aDen);
    gl.vertexAttribPointer(aDen, 1, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);

  let items = [];
  let count = 0;
  let fanCount = 0;
  let spreadMix = 0;
  let station = null;
  let stationHome = null;
  let stationUuid = null;
  const ring = createRingAnimator();
  const center = new Float32Array(3);

  function upload() {
    const sun = count + fanCount;
    kinds[sun] = 1;
    dens[sun] = 1;
    if (station) pos.set(station, sun * 3);
    colors.set([1, 0.74, 0.45], sun * 3);
    const n = sun + 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pos.subarray(0, n * 3), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, kindBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, kinds.subarray(0, n), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, n * 3), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, denBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, dens.subarray(0, n), gl.DYNAMIC_DRAW);
  }

  /// Park the sun on the same spiral slot as its catalog pin.
  function syncSun(mix) {
    if (!stationHome || !station) return;
    const plan = ring.plan;
    if (plan && mix > 0.001 && stationUuid) {
      for (let t = 0; t < plan.indices.length; t += 1) {
        const i = plan.indices[t];
        if (items[i]?.uuid !== stationUuid) continue;
        const dst = (count + t) * 3;
        station[0] = pos[dst];
        station[1] = pos[dst + 1];
        station[2] = pos[dst + 2];
        return;
      }
    }
    station[0] = stationHome[0];
    station[1] = stationHome[1];
    station[2] = stationHome[2];
  }

  /// Carpet stays at true homes. Fanned stations fade off the stack and
  /// a second copy rides the spiral, the way roamdial mixes position→aRing.
  function applySpread(mix) {
    spreadMix = mix;
    pos.set(home.subarray(0, count * 3));
    for (let i = 0; i < count; i += 1) dens[i] = homeDens[i];
    const plan = ring.plan;
    fanCount = 0;
    if (plan && mix > 0.001) {
      fanCount = plan.indices.length;
      for (let t = 0; t < fanCount; t += 1) {
        const i = plan.indices[t];
        dens[i] = homeDens[i] * (1 - mix);
        const dst = count + t;
        const o = i * 3;
        const r = t * 3;
        pos[dst * 3] = home[o] + (plan.targets[r] - home[o]) * mix;
        pos[dst * 3 + 1] =
          home[o + 1] + (plan.targets[r + 1] - home[o + 1]) * mix;
        pos[dst * 3 + 2] =
          home[o + 2] + (plan.targets[r + 2] - home[o + 2]) * mix;
        const tint = genreColorOf(items[i], mix);
        colors[dst * 3] = tint[0];
        colors[dst * 3 + 1] = tint[1];
        colors[dst * 3 + 2] = tint[2];
        const rad = Math.sqrt((t + 0.55) / (fanCount + 0.55));
        dens[dst] = Math.max(0.4, 1 - rad * 0.55);
        kinds[dst] = 3;
      }
    }
    syncSun(mix);
    upload();
  }

  return {
    vao,
    get count() {
      return count;
    },
    get drawCount() {
      return count + fanCount + 1;
    },
    get fanCount() {
      return fanCount;
    },
    get spreadMix() {
      return spreadMix;
    },
    /// Pin every station the list carries; the on-air one rides along.
    /// Preserves an open fan across rebuilds (locking a pin used to reset it).
    setMarkers(list) {
      const snap = ring.snapshot(items);
      items = [];
      count = 0;
      const accepted = [];
      for (const item of list) {
        if (accepted.length >= CAPACITY) break;
        if (!Number.isFinite(item?.lat) || !Number.isFinite(item?.lon)) {
          continue;
        }
        accepted.push(item);
      }
      gradePiles(accepted);
      // True lat/lon carpet; dens dims crowded cells into a heatmap.
      const packed = packHomes(accepted, home);
      count = accepted.length;
      for (let i = 0; i < count; i += 1) {
        pos.set(home.subarray(i * 3, i * 3 + 3), i * 3);
        colors.set(genreColorOf(accepted[i]), i * 3);
        homeDens[i] = packed[i];
        dens[i] = packed[i];
        kinds[i] = 2;
        items.push(accepted[i]);
      }
      if (snap && ring.restore(snap, items)) {
        applySpread(
          ring.target === 1
            ? ring.amount > 0.1
              ? 1
              : ringEase(ring.amount) / 0.1
            : ringEase(ring.amount),
        );
      } else {
        ring.reset();
        fanCount = 0;
        spreadMix = 0;
        upload();
      }
    },
    setStation(coords, uuid = null) {
      stationHome = coords ? coords.slice() : null;
      station = coords ? coords.slice() : null;
      stationUuid = uuid ?? null;
      if (ring.plan && ring.amount > 0.01) {
        applySpread(
          ring.target === 1
            ? ring.amount > 0.1
              ? 1
              : ringEase(ring.amount) / 0.1
            : ringEase(ring.amount),
        );
      } else {
        upload();
      }
    },
    /// Where the on-air sun currently sits (fan slot when spread).
    sunPos() {
      return station ? station.slice() : null;
    },
    /// Current draw position of a catalog pin — spiral slot when fanned,
    /// home otherwise. RoamDial aims Ct(N[i]) the same way.
    displayOf(item) {
      if (!item?.uuid) return null;
      const plan = ring.plan;
      if (plan && fanCount > 0) {
        for (let t = 0; t < fanCount; t += 1) {
          const i = plan.indices[t];
          if (items[i]?.uuid !== item.uuid) continue;
          const o = (count + t) * 3;
          return [pos[o], pos[o + 1], pos[o + 2]];
        }
      }
      for (let i = 0; i < count; i += 1) {
        if (items[i]?.uuid !== item.uuid) continue;
        return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      }
      if (stationUuid && item.uuid === stationUuid && station) {
        return station.slice();
      }
      return null;
    },
    /// A few fanned stations to caption around the sight (roamdial).
    floatLabels(view, skipUuid = null) {
      const plan = ring.plan;
      if (!plan || fanCount < 5) return [];
      const cx = view.width / 2;
      const cy = view.height / 2;
      const pool = [];
      for (let t = 4; t < fanCount; t += 1) {
        const item = items[plan.indices[t]];
        if (!item?.name || item.uuid === skipUuid) continue;
        const o = (count + t) * 3;
        const screen = this.project(view, pos[o], pos[o + 1], pos[o + 2]);
        if (!screen) continue;
        const dx = screen.x - cx;
        const dy = screen.y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 56 || dist > Math.min(view.width, view.height) * 0.46) {
          continue;
        }
        pool.push({
          uuid: item.uuid,
          name: item.name,
          x: screen.x,
          y: screen.y,
          ang: Math.atan2(dy, dx),
          t,
        });
      }
      if (pool.length === 0) return [];
      const want = Math.min(3, pool.length);
      const seed =
        (Math.abs(plan.center[0] * 1e5) | 0) ^ fanCount ^ (pool[0].t << 3);
      const step = Math.max(1, Math.floor(pool.length / want));
      const start = seed % step;
      const picked = [];
      const usedAng = [];
      for (let k = 0; k < pool.length && picked.length < want; k += 1) {
        const item = pool[(start + k * step) % pool.length];
        if (picked.some((p) => p.uuid === item.uuid)) continue;
        if (usedAng.some((a) => Math.abs(shortestAng(a, item.ang)) < 0.7)) {
          continue;
        }
        usedAng.push(item.ang);
        picked.push(item);
      }
      for (let k = 0; k < pool.length && picked.length < want; k += 1) {
        const item = pool[k];
        if (picked.some((p) => p.uuid === item.uuid)) continue;
        picked.push(item);
      }
      return picked;
    },
    /// True when this station is part of the open city fan.
    inRing(item) {
      const plan = ring.plan;
      if (!plan || !item?.uuid || ring.amount < 0.05) return false;
      for (let i = 0; i < count; i += 1) {
        if (items[i]?.uuid !== item.uuid) continue;
        for (let t = 0; t < plan.indices.length; t += 1) {
          if (plan.indices[t] === i) return true;
        }
        return false;
      }
      return Boolean(stationUuid && item.uuid === stationUuid && plan);
    },
    /// Open / ease / close the city fan from the current camera.
    tickSpread(dt, { eye, yaw, pitch, focusPrec = null }) {
      const was = ring.amount;
      viewCenter(yaw, pitch, center);
      const mix = ring.tick(dt, {
        eye,
        center,
        homes: home,
        items,
        count,
        focusPrec,
      });
      // Skip the upload while the fan is fully closed and idle.
      if (mix > 0.001 || was > 0.001) applySpread(mix);
    },
    /// Project a unit-sphere point into canvas pixels, or null if behind.
    project(view, x, y, z) {
      const { rot, proj, width, height, eye } = view;
      const rx = rot[0] * x + rot[3] * y + rot[6] * z;
      const ry = rot[1] * x + rot[4] * y + rot[7] * z;
      const rz = rot[2] * x + rot[5] * y + rot[8] * z;
      const w = eye - rz;
      if (w <= NEAR) return null;
      return {
        x: ((proj[0] * rx) / w) * 0.5 * width + width / 2,
        y: height / 2 - ((proj[5] * ry) / w) * 0.5 * height,
      };
    },
    /// Station closest on the globe to a lat/lon, using great-circle km.
    nearestGeo(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const p1 = (lat * Math.PI) / 180;
      const cosP1 = Math.cos(p1);
      let best = null;
      let near = Infinity;
      for (let i = 0; i < count; i += 1) {
        const st = items[i];
        if (!Number.isFinite(st?.lat) || !Number.isFinite(st?.lon)) continue;
        const p2 = (st.lat * Math.PI) / 180;
        const dl = ((st.lon - lon) * Math.PI) / 180;
        const a =
          Math.sin((p2 - p1) / 2) ** 2 +
          cosP1 * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        const km = 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
        if (km < near) {
          near = km;
          best = st;
        }
      }
      return best ? { station: best, km: near } : null;
    },
    /// The nearest pin to a canvas point, with its pixel distance.
    nearest(view, px, py, maxDist = Infinity) {
      let best = null;
      let near = maxDist;
      const plan = ring.plan;
      const preferFan = Boolean(plan && fanCount > 0);
      const i0 = preferFan ? count : 0;
      const i1 = preferFan ? count + fanCount : count;
      for (let i = i0; i < i1; i++) {
        const screen = this.project(
          view,
          pos[i * 3],
          pos[i * 3 + 1],
          pos[i * 3 + 2],
        );
        if (!screen) continue;
        const d = Math.hypot(screen.x - px, screen.y - py);
        if (d < near) {
          near = d;
          best = preferFan
            ? (items[plan.indices[i - count]] ?? null)
            : (items[i] ?? null);
        }
      }
      return best ? { station: best, dist: near } : null;
    },
    /// The pin under a screen point, or null when the tap hit the sky.
    pick(canvas, view, clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const hit = this.nearest(
        view,
        clientX - rect.left,
        clientY - rect.top,
        HIT,
      );
      return hit?.station ?? null;
    },
  };
}
