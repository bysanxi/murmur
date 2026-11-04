// Globe carpet: real coords stay put. Approximate (province/country)
// pins would otherwise stack into white blobs; those only are fanned on
// a tangent disk so the far view reads as many small sparks. aDen dims
// crowds. Zoom ring still opens precise city stacks for aiming.

const DEG = Math.PI / 180;
const CELL = 0.5;
const APPROX_CELL = 1;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function latLonXyz(lat, lon, out, o) {
  const phi = lat * DEG;
  const theta = lon * DEG;
  const r = Math.cos(phi);
  out[o] = r * Math.sin(theta);
  out[o + 1] = Math.sin(phi);
  out[o + 2] = r * Math.cos(theta);
}

function cellKey(lat, lon, size) {
  return `${Math.floor(lat / size)}:${Math.floor(lon / size)}`;
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

function spreadGroup(members, out, step) {
  const i0 = members[0];
  let ax = out[i0 * 3];
  let ay = out[i0 * 3 + 1];
  let az = out[i0 * 3 + 2];
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  const { sx, sy, sz, cx, cy, cz } = tangentBasis(ax, ay, az);
  for (let t = 0; t < members.length; t += 1) {
    const i = members[t];
    const rad = step * Math.sqrt(t + 0.65);
    const ang = t * GOLDEN;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    let x = ax + (sx * cos + cx * sin) * rad;
    let y = ay + (sy * cos + cy * sin) * rad;
    let z = az + (sz * cos + cz * sin) * rad;
    const len = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / len;
    out[i * 3 + 1] = y / len;
    out[i * 3 + 2] = z / len;
  }
}

/// Write unit-sphere homes for `list` into `out`. Returns RoamDial aDen.
export function packHomes(list, out) {
  const n = list.length;
  const dens = new Float32Array(n);
  const crowds = new Map();
  const approx = new Map();
  for (let i = 0; i < n; i += 1) {
    const item = list[i];
    latLonXyz(item.lat, item.lon, out, i * 3);
    const key = cellKey(item.lat, item.lon, CELL);
    crowds.set(key, (crowds.get(key) || 0) + 1);
    if (!item.geoApprox) continue;
    const akey = cellKey(item.lat, item.lon, APPROX_CELL);
    let g = approx.get(akey);
    if (!g) {
      g = [];
      approx.set(akey, g);
    }
    g.push(i);
  }
  for (let i = 0; i < n; i += 1) {
    const count = crowds.get(cellKey(list[i].lat, list[i].lon, CELL)) || 1;
    dens[i] = 1 / (1 + Math.sqrt(Math.max(0, count - 1)) * 0.6);
  }
  for (const members of approx.values()) {
    if (members.length < 2) continue;
    const step = Math.max(
      0.003,
      Math.min(0.012, 0.038 / Math.sqrt(members.length)),
    );
    spreadGroup(members, out, step);
  }
  return dens;
}
