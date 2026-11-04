// When the camera dives onto a packed city, RoamDial fans those pins out
// along a golden-angle spiral so the sight can pick one; zooming back out
// eases them home. Same thresholds, scaled to our unit sphere.

const DEG = Math.PI / 180;
// RoamDial opens below b/gI ≈ 3.9/1.6 and closes above 4.3/1.6.
export const RING_OPEN_EYE = 2.45;
export const RING_CLOSE_EYE = 2.7;
// Roamdial's cone is 0.75°; we open a touch wider so a paved city patch
// still counts as one cluster under the sight.
const RING_CONE = 2.0 * DEG;
const RING_STACK = 0.8 * DEG; // pull paved cell-mates into the fan too
const RING_MIN = 4;
export const RING_MAX = 700;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const EASE_SPEED = 4.5;
const SURFACE = 1.012; // lift the fan slightly off the globe
// First spiral slot sits clear of the city stack (roamdial uses √0.6).
const SPIRAL_START = 0.55;

/// Cubic smoothstep matching roamdial's shader ease().
export function ringEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/// Point on the unit sphere the camera is looking at (yaw/pitch of globe.js).
export function viewCenter(yaw, pitch, out = new Float32Array(3)) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  out[0] = -sy * cp;
  out[1] = sp;
  out[2] = cy * cp;
  return out;
}

/// World-unit spiral spacing — roamdial: 0.0105 * max(0.6, (b − gI) / 1.3)
/// on a 1.6-radius globe; scaled to our unit sphere.
function spacing(eye) {
  // First open happens near RING_OPEN_EYE. Later cities are often planned
  // closer in, which used to shrink the pitch. Hold the open-scale spacing
  // so a pan-replanned fan matches the first.
  const at = Math.max(eye, RING_OPEN_EYE);
  return (0.0078 / 1.6) * Math.max(0.7, (at - 1) / 1.15);
}

/// Build a ring plan for stations near the sight, or null when too sparse.
export function planRing(homes, count, center, eye) {
  if (eye > RING_OPEN_EYE) return null;
  const cosCone = Math.cos(RING_CONE);
  const cosStack = Math.cos(RING_STACK);
  const hits = [];
  const seen = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const x = homes[i * 3];
    const y = homes[i * 3 + 1];
    const z = homes[i * 3 + 2];
    const dot = x * center[0] + y * center[1] + z * center[2];
    if (dot > cosCone) {
      hits.push({ i, dot });
      seen[i] = 1;
    }
  }
  if (hits.length < RING_MIN) return null;
  // Any pin stacked on a hit's home must leave with the fan — otherwise the
  // original city blob stays lit while the spiral opens beside it.
  for (let i = 0; i < count; i += 1) {
    if (seen[i]) continue;
    const x = homes[i * 3];
    const y = homes[i * 3 + 1];
    const z = homes[i * 3 + 2];
    for (let h = 0; h < hits.length; h += 1) {
      const j = hits[h].i;
      const dot =
        x * homes[j * 3] + y * homes[j * 3 + 1] + z * homes[j * 3 + 2];
      if (dot > cosStack) {
        hits.push({
          i,
          dot: x * center[0] + y * center[1] + z * center[2],
        });
        seen[i] = 1;
        break;
      }
    }
  }
  hits.sort((a, b) => b.dot - a.dot);
  if (hits.length > RING_MAX) hits.length = RING_MAX;

  const ax = center[0];
  const ay = center[1];
  const az = center[2];
  // Tangent basis: cross with up (or X near the poles).
  let ox = 0;
  let oy = 1;
  let oz = 0;
  if (Math.abs(ay) > 0.95) {
    ox = 1;
    oy = 0;
    oz = 0;
  }
  // s = normalize(o × a)
  let sx = oy * az - oz * ay;
  let sy = oz * ax - ox * az;
  let sz = ox * ay - oy * ax;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  // c = a × s
  const cx = ay * sz - az * sy;
  const cy = az * sx - ax * sz;
  const cz = ax * sy - ay * sx;

  const step = spacing(eye);
  const originX = ax * SURFACE;
  const originY = ay * SURFACE;
  const originZ = az * SURFACE;
  const targets = new Float32Array(hits.length * 3);
  const indices = new Uint16Array(hits.length);
  for (let t = 0; t < hits.length; t += 1) {
    const idx = hits[t].i;
    indices[t] = idx;
    const rad = step * Math.sqrt(t + SPIRAL_START);
    const ang = t * GOLDEN;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    targets[t * 3] = originX + (sx * cos + cx * sin) * rad;
    targets[t * 3 + 1] = originY + (sy * cos + cy * sin) * rad;
    targets[t * 3 + 2] = originZ + (sz * cos + cz * sin) * rad;
  }
  const halfAngle = (step * Math.sqrt(hits.length)) / 1;
  return {
    indices,
    targets,
    center: new Float32Array(center),
    halfAngle,
  };
}

/// Animate open/close amount; returns the eased mix for the current frame.
export function createRingAnimator() {
  let open = false;
  let amount = 0;
  let target = 0;
  let plan = null;

  return {
    get open() {
      return open;
    },
    get amount() {
      return amount;
    },
    get target() {
      return target;
    },
    get plan() {
      return plan;
    },
    /// Drive toward open/closed; rebuilds the spiral when first opening.
    /// Returns the display mix: 1 = fully on the spiral (home hidden),
    /// 0 = fully home. Opening snaps onto the spiral so the city stack
    /// vanishes; closing eases back so the originals reform.
    tick(dt, { eye, center, homes, count }) {
      // Dolly out past the close threshold → fold. Pan at the same zoom
      // keeps the spiral even off the cluster; a new dense city replaces it.
      if (eye > RING_CLOSE_EYE) {
        target = 0;
      } else if (eye < RING_OPEN_EYE) {
        const next = planRing(homes, count, center, eye);
        if (next) {
          let moved = true;
          if (plan) {
            const d =
              center[0] * plan.center[0] +
              center[1] * plan.center[1] +
              center[2] * plan.center[2];
            const ang = Math.acos(Math.min(1, Math.max(-1, d)));
            moved = ang > plan.halfAngle * 0.85 + 0.003;
          }
          if (!open || amount < 0.01) {
            plan = next;
            open = true;
            target = 1;
          } else if (moved) {
            plan = next;
            target = 1;
          }
        }
      }

      amount += (target - amount) * Math.min(1, dt * EASE_SPEED);
      if (target === 0 && amount < 0.01) {
        amount = 0;
        open = false;
        plan = null;
        return 0;
      }
      const eased = ringEase(amount);
      // Homes stay as the carpet; mix only drives the overlay copies.
      return eased;
    },
    /// Drop the fan immediately (markers rebuilt, view mode change, …).
    reset() {
      open = false;
      amount = 0;
      target = 0;
      plan = null;
    },
    /// Freeze the open fan by station uuid so a marker rebuild (e.g. lock)
    /// can put every pin back on the same spiral slot.
    snapshot(items) {
      if (!plan || amount < 0.01) return null;
      const slots = [];
      for (let t = 0; t < plan.indices.length; t += 1) {
        const i = plan.indices[t];
        const uuid = items[i]?.uuid;
        if (!uuid) continue;
        slots.push({
          uuid,
          target: [
            plan.targets[t * 3],
            plan.targets[t * 3 + 1],
            plan.targets[t * 3 + 2],
          ],
        });
      }
      if (slots.length < RING_MIN) return null;
      return {
        slots,
        amount,
        target,
        center: [plan.center[0], plan.center[1], plan.center[2]],
        halfAngle: plan.halfAngle,
      };
    },
    /// Rebind a snapshot onto a freshly rebuilt pin list.
    restore(snap, items) {
      if (!snap) {
        this.reset();
        return false;
      }
      const byUuid = new Map();
      for (let i = 0; i < items.length; i += 1) {
        if (items[i]?.uuid) byUuid.set(items[i].uuid, i);
      }
      const indices = [];
      const targets = [];
      for (const slot of snap.slots) {
        const i = byUuid.get(slot.uuid);
        if (i === undefined) continue;
        indices.push(i);
        targets.push(slot.target[0], slot.target[1], slot.target[2]);
      }
      if (indices.length < RING_MIN) {
        this.reset();
        return false;
      }
      plan = {
        indices: Uint16Array.from(indices),
        targets: Float32Array.from(targets),
        center: new Float32Array(snap.center),
        halfAngle: snap.halfAngle,
      };
      open = true;
      amount = snap.amount;
      target = snap.target;
      return true;
    },
  };
}
