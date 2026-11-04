// The dot globe: a WebGL2 point cloud of baked land dots with every known
// station pinned beside them, shaded the way roamdial's opening globe is —
// facing dots brighten, edge dots fade, size falls off with depth so dense
// coasts glow. The view holds still by default; a new station eases the
// camera onto its region under a scope reticle, and dragging takes over.

import { landPositions } from "./land-data.js";
import { FOV, FRAG, VERT, link, makeProjection, rotation } from "./globe-gl.js";
import { createBloom } from "./bloom.js";
import { createPins } from "./pins.js";
import { createReticle } from "./reticle.js";
import { coordOf } from "./format.js";

const DEG = Math.PI / 180;
// RoamDial scales drag with camera gap to the surface
// (0.0021 * (b - radius*0.98) / 4.6), so a close zoom parks on a pin
// while a far view still turns the world. Same constants, unit sphere.
const DRAG_BASE = 0.0021;
const DRAG_REF = 4.6;
const DRAG_SURFACE = 0.98;
const AUTO_SPIN = 0.05; // rad/s, roamdial's drift
const FOCUS_EASE = 3.0; // 1/s, how quickly the view finds a station
const MAX_PITCH = 1.3;
const EYE = 3.2; // camera distance at rest
const ZOOM_SENS = 0.0012; // wheel notches → exponential dolly
// Closest gap mirrors roamdial (~0.35 past a unit sphere): their camera
// sits at ~1.95 with a 1.6-radius globe. Far end stays a wide overview.
const ZOOM_MIN = 1.35;
const ZOOM_MAX = 6.5;
const AIM_CLOSE = 18; // px: station under the sight counts as locked
const AIM_SOFT = 120; // px: arc still reaches toward farther pins
const AIM_EASE = 0.15; // how quickly the arc catches the hand
const AIM_SETTLE = 0.45; // s without a drag before auto-tune
// After an explicit pick (dial / pin tap) the sight must not steal a
// neighbour while the camera is still catching up — roamdial's Xn.
const HOLD_EXPLICIT_MS = 2600;
const HOLD_AIM_MS = 1500;

/// The short way around the circle, in (-π, π].
function shortest(delta) {
  const turn = 2 * Math.PI;
  return ((((delta + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/// Yaw/pitch that puts a world point under the sight — same as roamdial's St().
function lookAt(x, y, z) {
  const yaw = Math.atan2(-x, z);
  const horiz = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(y, horiz)));
  return [yaw, pitch];
}

/// Attach a globe to a host element. Returns the control surface or null
/// when WebGL2 is unavailable.
export function createGlobe(host) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;" +
    "touch-action:none;cursor:grab;opacity:0;transition:opacity 700ms ease;";
  host.append(canvas);
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (!gl) {
    canvas.remove();
    return null;
  }
  const program = link(gl, VERT, FRAG);
  if (!program) {
    canvas.remove();
    return null;
  }
  const aPos = gl.getAttribLocation(program, "aPos");
  const aKind = gl.getAttribLocation(program, "aKind");
  const aColor = gl.getAttribLocation(program, "aColor");
  const aDen = gl.getAttribLocation(program, "aDen");

  // The scope ring and label ride in the DOM above the canvas.
  const reticle = createReticle(host);

  // The land cloud never changes, so it keeps its own buffers.
  const land = landPositions();
  const landCount = land.length / 3;
  const landVao = gl.createVertexArray();
  gl.bindVertexArray(landVao);
  const landPosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, landPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, land, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  const landKindBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, landKindBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(landCount), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aKind);
  gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, 0, 0);
  // Land has no per-dot colour; feed a static grey so aColor is valid.
  if (aColor >= 0) {
    const landColorBuffer = gl.createBuffer();
    const landColors = new Float32Array(landCount * 3);
    for (let i = 0; i < landCount; i += 1) {
      landColors[i * 3] = 0.07;
      landColors[i * 3 + 1] = 0.1;
      landColors[i * 3 + 2] = 0.09;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, landColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, landColors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  }
  if (aDen >= 0) {
    const landDenBuffer = gl.createBuffer();
    const landDens = new Float32Array(landCount);
    landDens.fill(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, landDenBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, landDens, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aDen);
    gl.vertexAttribPointer(aDen, 1, gl.FLOAT, false, 0, 0);
  }

  // Pins ride their own dynamic buffer, one slot per known station and
  // the one on air always last, so a single draw call covers them all.
  const pins = createPins(gl, aPos, aKind, aColor, aDen);
  const bloom = createBloom(gl);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const uProj = uniform("uProj");
  const uRot = uniform("uRot");
  const uPixelRatio = uniform("uPixelRatio");
  const uPinScale = uniform("uPinScale");
  const uTime = uniform("uTime");
  const uEye = uniform("uEye");
  const uColor = uniform("uColor");
  const uStationColor = uniform("uStationColor");
  const uHasStation = uniform("uHasStation");
  const uRimBoost = uniform("uRimBoost");
  const uLevel = uniform("uLevel");
  const uBass = uniform("uBass");
  const uFanMix = uniform("uFanMix");

  const proj = new Float32Array(16);
  const rot = new Float32Array(9);
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let rimBoost = false;
  let levelProvider = null; // () => { level, bass }

  function resize() {
    const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(host.clientWidth, 1);
    const nextHeight = Math.max(host.clientHeight, 1);
    if (
      nextWidth === width &&
      nextHeight === height &&
      nextRatio === pixelRatio
    ) {
      return;
    }
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextRatio;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    makeProjection(width / height, proj);
    bloom?.resize(canvas.width, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // The view eases toward these targets every frame, so focus, spin, and
  // drag all speak the same language.
  let yaw = -112 * DEG;
  let pitch = 0.4;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let eye = EYE,
    targetEye = EYE;
  let spin = false;
  let stationPos = null;
  let playing = null; // the station currently on air, if any
  let dragging = false;
  let pending = null; // a focus that arrived mid-drag, applied on release
  let pointerId = null;
  let lastX = 0,
    lastY = 0;
  let alive = true,
    last = performance.now();
  let aimProgress = 0;
  let aimIdle = 0; // seconds since the last drag
  let aimArmed = null; // uuid already fired for this settle
  let browseArmed = false; // only auto-tune after the user dragged the globe
  let holdUntil = 0; // ms timestamp: explicit pick owns the camera until then
  let dragMoved = false;
  let describeAim = null; // (hit) => { title, meta, hot }
  let onAim = null; // (station) => void

  function cameraHeld() {
    return performance.now() < holdUntil;
  }

  function holdCamera(ms) {
    holdUntil = performance.now() + ms;
    aimIdle = 0;
  }

  // Dial / pin tap / skip: play that station and keep the sight off
  // neighbours until the hold expires. Auto-aim is browse-only.
  function armExplicit(station) {
    browseArmed = false;
    pending = null;
    aimArmed = station?.uuid ?? null;
    holdCamera(HOLD_EXPLICIT_MS);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragging = true;
    dragMoved = false;
    aimIdle = 0;
    // Hand takes the camera; drop any queued look-at on the playing
    // station so a release cannot yank back to the ruler.
    pending = null;
    holdUntil = 0;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  }
  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!dragMoved && Math.hypot(dx, dy) > 4) {
      dragMoved = true;
      browseArmed = true;
      aimArmed = null;
    }
    // Closer camera → smaller rad/px, matching screen motion to the pins.
    const spin = (DRAG_BASE * Math.max(eye - DRAG_SURFACE, 0.05)) / DRAG_REF;
    yaw += dx * spin;
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + dy * spin));
    // Dragging sets the target too, so the view stays where it is left.
    targetYaw = yaw;
    targetPitch = pitch;
    lastX = event.clientX;
    lastY = event.clientY;
    aimIdle = 0;
  }
  function snapSightTo(station) {
    if (!station) return false;
    const disp = pins.displayOf(station);
    if (disp) {
      [targetYaw, targetPitch] = lookAt(disp[0], disp[1], disp[2]);
      return true;
    }
    if (Number.isFinite(station.lat) && Number.isFinite(station.lon)) {
      targetYaw = -station.lon * DEG;
      targetPitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, station.lat * DEG),
      );
      return true;
    }
    return false;
  }

  function onPointerUp(event) {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    canvas.style.cursor = "grab";
    // A real browse drag owns the camera: never apply a queued look-at
    // of the ruler's station. Park on the pin already under the sight
    // (screen space, including fan slots) — geo-nearest homes yank the
    // camera onto a spiral neighbour the moment the hand lifts.
    if (dragMoved && browseArmed) {
      pending = null;
      const hit = sightHit();
      if (hit?.station && hit.dist < AIM_CLOSE) snapSightTo(hit.station);
      aimIdle = 0;
      return;
    }
    if (pending) {
      [targetYaw, targetPitch] = pending;
      pending = null;
    }
  }

  /// Station under the fixed sight, preferring pins then the one on air.
  function sightHit() {
    const view = { rot, proj, width, height, eye };
    const cx = width / 2;
    const cy = height / 2;
    let best = pins.nearest(view, cx, cy, AIM_SOFT);
    if (stationPos) {
      const screen = pins.project(
        view,
        stationPos[0],
        stationPos[1],
        stationPos[2],
      );
      if (screen) {
        const d = Math.hypot(screen.x - cx, screen.y - cy);
        if (d < AIM_SOFT && (!best || d < best.dist)) {
          best = { station: playing, dist: d };
        }
      }
    }
    return best;
  }

  function updateAim(dt) {
    if (!dragging) aimIdle += dt;
    const hit = sightHit();
    const close = Boolean(hit && hit.dist < AIM_CLOSE);
    const target = close
      ? 1
      : hit
        ? Math.max(0, 1 - hit.dist / AIM_SOFT) * 0.6
        : 0;
    aimProgress += (target - aimProgress) * AIM_EASE;
    let lon = ((-yaw / DEG + 540) % 360) - 180;
    const lat = pitch / DEG;
    const aimAt = {
      lat,
      lon,
      nearby: pins.fanCount,
    };
    const label = describeAim
      ? describeAim(hit, close, aimAt)
      : {
          title: coordOf({ lat, lon }),
          meta: "",
          hot: close,
        };
    reticle.aim({
      title: label.title,
      meta: label.meta,
      progress: aimProgress,
      hot: label.hot ?? close,
      named: Boolean(label.named),
    });
    reticle.floats(
      pins.floatLabels(
        { rot, proj, width, height, eye },
        playing?.uuid ?? null,
      ),
    );
    // Camera still easing toward a focused station — do not steal the
    // dial from the ruler while the globe is turning to catch up.
    const settling =
      Math.abs(shortest(targetYaw - yaw)) > 0.02 ||
      Math.abs(targetPitch - pitch) > 0.02 ||
      Math.abs(targetEye - eye) > 0.02;
    // Auto-tune is browse-only: the user dragged the globe, the sight
    // has settled on a pin, and no explicit pick still owns the camera.
    // Commit then leaves browse, so a neighbour cannot chain-lock.
    const ready =
      browseArmed &&
      !cameraHeld() &&
      !dragging &&
      !settling &&
      close &&
      hit?.station &&
      aimIdle >= AIM_SETTLE &&
      aimProgress > 0.92;
    if (
      ready &&
      hit.station.uuid &&
      hit.station.uuid !== playing?.uuid &&
      hit.station.uuid !== aimArmed
    ) {
      aimArmed = hit.station.uuid;
      browseArmed = false;
      holdCamera(HOLD_AIM_MS);
      onAim?.(hit.station);
    }
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // Each wheel notch dollies the camera the same ratio in or out.
  function onWheel(event) {
    event.preventDefault();
    const next = targetEye * Math.exp(event.deltaY * ZOOM_SENS);
    targetEye = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    // Zoom must not auto-lock a neighbour sliding under the sight.
    aimIdle = 0;
  }
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function frame(now) {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const ease = 1 - Math.exp(-FOCUS_EASE * dt);
    if (!dragging) {
      if (spin) targetYaw += AUTO_SPIN * dt;
      yaw += shortest(targetYaw - yaw) * ease;
      pitch += (targetPitch - pitch) * ease;
    }
    eye += (targetEye - eye) * ease;
    // Fan a dense city into a spiral once the camera has settled close in;
    // zooming out eases the pins back onto the globe.
    pins.tickSpread(dt, {
      eye,
      yaw,
      pitch,
    });
    // Keep the aim sun on the fan slot when the city is spread.
    const sun = pins.sunPos();
    if (sun) stationPos = sun;
    const offscreen = bloom?.begin();
    if (!offscreen) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniformMatrix3fv(uRot, false, rotation(yaw, pitch, rot));
    gl.uniform1f(uPixelRatio, pixelRatio);
    // RoamDial is fullscreen (~500px globe). Widget globes are much
    // smaller, so a 2px spark becomes a blob. Scale pins to globe pixels.
    const globePx =
      (0.5 * Math.min(canvas.width, canvas.height)) / (Math.tan(FOV / 2) * eye);
    gl.uniform1f(uPinScale, Math.max(0.55, Math.min(1.25, globePx / 360)));
    gl.uniform1f(uTime, now / 1000);
    gl.uniform1f(uEye, eye);
    // roamdial land ink — dark teal-grey; bloom lifts the coasts.
    gl.uniform3f(uColor, 0.07, 0.1, 0.09);
    gl.uniform3f(uStationColor, 1.0, 0.74, 0.45);
    gl.uniform1f(uHasStation, stationPos ? 1 : 0);
    gl.uniform1f(uRimBoost, rimBoost ? 1 : 0);
    gl.uniform1f(uFanMix, pins.spreadMix);
    const audio = levelProvider?.() ?? { level: 0, bass: 0 };
    gl.uniform1f(uLevel, audio.level || 0);
    gl.uniform1f(uBass, audio.bass || 0);
    gl.bindVertexArray(landVao);
    gl.drawArrays(gl.POINTS, 0, landCount);
    gl.bindVertexArray(pins.vao);
    gl.drawArrays(gl.POINTS, 0, pins.drawCount);
    gl.bindVertexArray(null);
    if (offscreen) bloom.composite(now / 1000);
    updateAim(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  requestAnimationFrame(() => (canvas.style.opacity = "1"));

  return {
    /// Pin every station the list carries; the on-air one rides along.
    setMarkers(list) {
      pins.setMarkers(list);
    },
    /// Point the on-air sun at a station's coordinates, or hide it.
    /// The sight label is driven every frame by aim(); this only parks
    /// the sun and flashes the dial when a new station comes on air.
    setStation(station, lat, lon) {
      playing = station ?? null;
      aimArmed = station?.uuid ?? null;
      // Playing station is the single source of truth: leave browse so
      // the sight cannot chain-lock a neighbour and yank the dial.
      browseArmed = false;
      if (!cameraHeld()) holdCamera(HOLD_AIM_MS);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        stationPos = null;
        pins.setStation(null);
        return;
      }
      const phi = lat * DEG;
      const theta = lon * DEG;
      const rowRadius = Math.cos(phi);
      stationPos = [
        rowRadius * Math.sin(theta),
        Math.sin(phi),
        rowRadius * Math.cos(theta),
      ];
      reticle.lock();
      pins.setStation(stationPos, station?.uuid ?? null);
    },
    /// How the sight labels whatever sits under it.
    setAimFormatter(fn) {
      describeAim = fn;
    },
    /// Fired once the sight settles on a station that is not on air.
    setOnAim(fn) {
      onAim = fn;
    },
    /// Dial, pin tap, skip, random: this is not a globe browse.
    noteExplicitTune(station) {
      armExplicit(station);
    },
    /// The station whose pin sits under a screen point, or null.
    pick(clientX, clientY) {
      return pins.pick(
        canvas,
        { rot, proj, width, height, eye },
        clientX,
        clientY,
      );
    },
    /// True when the current (or just-ended) press moved the globe.
    didDrag() {
      return dragMoved;
    },
    /// Ease the view onto a station's region; no-op without coordinates.
    focus(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      // Browse owns the camera until the user picks or auto-tune commits.
      if (dragging || browseArmed) {
        pending = [
          -lon * DEG,
          Math.max(-MAX_PITCH, Math.min(MAX_PITCH, lat * DEG)),
        ];
        return;
      }
      targetYaw = -lon * DEG;
      targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, lat * DEG));
    },
    /// Aim at a station's draw position (spiral slot when fanned).
    focusStation(station) {
      if (!station) return;
      // Do not pull the view back to the ruler's station while browsing.
      if (dragging || browseArmed) return;
      const disp = pins.displayOf(station);
      if (disp) {
        [targetYaw, targetPitch] = lookAt(disp[0], disp[1], disp[2]);
      } else if (Number.isFinite(station.lat) && Number.isFinite(station.lon)) {
        this.focus(station.lat, station.lon);
      }
    },
    setSpin(value) {
      spin = Boolean(value);
    },
    setRimBoost(value) {
      rimBoost = Boolean(value);
    },
    /// Audio carpet: called each frame for level/bass (0..1).
    setLevelProvider(fn) {
      levelProvider = typeof fn === "function" ? fn : null;
    },
    destroy() {
      alive = false;
      observer.disconnect();
      reticle.destroy();
      bloom?.destroy();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
