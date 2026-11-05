// Globe carpet: every pin stays on its coordinate. Crowded 0.5° cells
// dim through aDen (same curve RoamDial uses) instead of being pulled
// into a disk. The zoom ring is what fans low-precision piles, and only
// while the camera is close.

const DEG = Math.PI / 180;
const CELL = 0.5;

function latLonXyz(lat, lon, out, o) {
  const phi = lat * DEG;
  const theta = lon * DEG;
  const r = Math.cos(phi);
  out[o] = r * Math.sin(theta);
  out[o + 1] = Math.sin(phi);
  out[o + 2] = r * Math.cos(theta);
}

function cellKey(lat, lon) {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}

/// Write unit-sphere homes for `list` into `out`. Returns RoamDial aDen.
export function packHomes(list, out) {
  const n = list.length;
  const dens = new Float32Array(n);
  const crowds = new Map();
  for (let i = 0; i < n; i += 1) {
    const item = list[i];
    latLonXyz(item.lat, item.lon, out, i * 3);
    const key = cellKey(item.lat, item.lon);
    crowds.set(key, (crowds.get(key) || 0) + 1);
  }
  for (let i = 0; i < n; i += 1) {
    const count = crowds.get(cellKey(list[i].lat, list[i].lon)) || 1;
    dens[i] = 1 / (1 + Math.sqrt(Math.max(0, count - 1)) * 0.6);
  }
  return dens;
}
