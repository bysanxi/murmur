// Same-geocode stacks would otherwise sit on one pixel. RoamDial's carpet
// stays even via dens + many unique coords; we pave every near-identical
// stack onto a tight golden spiral so cities read as stipple, then the
// zoom ring (ring-spread.js) fans that patch wider for aiming.

const DEG = Math.PI / 180;
// Tight bucket: only true co-located / city-centre stacks, not whole metros.
const CELL = 0.12;
const CELL_RAD = ((CELL * DEG) / 2) * 0.95;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Tight neighbour gap — the zoom fan, not base packing, does the wide spread.
const MIN_SEP = 0.0014;
const MAX_SEP = 0.0055;

function latLonXyz(lat, lon, out, o) {
  const phi = lat * DEG;
  const theta = lon * DEG;
  const r = Math.cos(phi);
  out[o] = r * Math.sin(theta);
  out[o + 1] = Math.sin(phi);
  out[o + 2] = r * Math.cos(theta);
}

function cellKey(lat, lon) {
  return `${Math.round(lat / CELL)}:${Math.round(lon / CELL)}`;
}

function tangentBasis(ax, ay, az) {
  let ox = 0;
  let oy = 1;
  let oz = 0;
  if (Math.abs(ay) > 0.95) {
    ox = 1;
    oy = 0;
    oz = 0;
  }
  let sx = oy * az - oz * ay;
  let sy = oz * ax - ox * az;
  let sz = ox * ay - oy * ax;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  return {
    sx,
    sy,
    sz,
    cx: ay * sz - az * sy,
    cy: az * sx - ax * sz,
    cz: ax * sy - ay * sx,
  };
}

function hash01(uuid, salt) {
  const s = `${uuid ?? ""}:${salt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.codePointAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/// Write packed unit-sphere homes for `list` into `out` (xyz per station).
/// Also returns per-station density (RoamDial aDen) for dimming crowds.
export function packHomes(list, out) {
  const n = list.length;
  const dens = new Float32Array(n);
  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const item = list[i];
    latLonXyz(item.lat, item.lon, out, i * 3);
    const key = cellKey(item.lat, item.lon);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(i);
  }

  for (const members of groups.values()) {
    const count = members.length;
    // Stronger crowd dim than roamdial's 0.6 so dense cities stay soft.
    const den = 1 / (1 + Math.sqrt(Math.max(0, count - 1)) * 0.6);
    for (const i of members) dens[i] = den;
    if (count < 2) {
      // Lone pins: a hair of jitter so the grid never looks perfectly locked.
      const i = members[0];
      const item = list[i];
      let ax = out[i * 3];
      let ay = out[i * 3 + 1];
      let az = out[i * 3 + 2];
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const { sx, sy, sz, cx, cy, cz } = tangentBasis(ax, ay, az);
      const j = MIN_SEP * 0.35;
      const jx = (hash01(item.uuid, 1) - 0.5) * j;
      const jy = (hash01(item.uuid, 2) - 0.5) * j;
      let x = ax + sx * jx + cx * jy;
      let y = ay + sy * jx + cy * jy;
      let z = az + sz * jx + cz * jy;
      const len = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / len;
      out[i * 3 + 1] = y / len;
      out[i * 3 + 2] = z / len;
      continue;
    }

    const i0 = members[0];
    let ax = out[i0 * 3];
    let ay = out[i0 * 3 + 1];
    let az = out[i0 * 3 + 2];
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al;
    ay /= al;
    az /= al;
    const { sx, sy, sz, cx, cy, cz } = tangentBasis(ax, ay, az);

    // Fill the cell evenly — outer pin near CELL_RAD, even gap between dots.
    const step = Math.max(
      MIN_SEP,
      Math.min(MAX_SEP, CELL_RAD / Math.sqrt(count)),
    );

    for (let t = 0; t < count; t += 1) {
      const i = members[t];
      const item = list[i];
      const jx = (hash01(item.uuid, 1) - 0.5) * step * 0.4;
      const jy = (hash01(item.uuid, 2) - 0.5) * step * 0.4;
      const rad = step * Math.sqrt(t + 0.65);
      const ang = t * GOLDEN + hash01(item.uuid, 3) * 0.55;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      let x = ax + (sx * cos + cx * sin) * rad + sx * jx + cx * jy;
      let y = ay + (sy * cos + cy * sin) * rad + sy * jx + cy * jy;
      let z = az + (sz * cos + cz * sin) * rad + sz * jx + cz * jy;
      const len = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / len;
      out[i * 3 + 1] = y / len;
      out[i * 3 + 2] = z / len;
    }
  }
  return dens;
}
