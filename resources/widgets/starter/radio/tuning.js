// Tuning noise for the radio. The bed is one band-limited static loop,
// synthesised into a buffer once so the loop has no seam and no asset is
// fetched. A drag raises it to a floor so a still finger keeps the set
// alive; releasing fades it out. Detent ticks are a second, tiny buffer.
//
// On top of the bed sit two proximity layers: a very quiet heterodyne
// whistle (one oscillator with a slow drift, not a pair of detuned sirens)
// and short, gated fragments of band-limited noise. Both are silent until a
// station is close, and both stop the moment the hand lets go.

const STATIC_SECONDS = 2.8;
const LOOP_FADE = 0.08;
const STATIC_PEAK = 0.75;
const TICK_SECONDS = 0.07;
const TICK_PEAK = 0.7;
const BED_START = 0.22;
const BED_MID = 0.12;
const BED_LOW = 0.05;
// The bed under the camera's lock ease, right after the hand lifts. It sits
// at the same level as the drag floor so release has no audible step.
const SETTLE_BED = 0.13;
const SETTLE_HOLD_MS = 240;
// Deliberately below the old 0.12p²: the whistle should be a hint, not an
// alarm. p³ keeps it almost inaudible until the sight is really close.
const WHISTLE_GAIN = 0.06;
const FRAGMENT_GAIN = 0.24;
// Perceived level at the default setting. The buffer is normalised, so this
// is the only place that has to stay conservative.
const MASTER_GAIN = 1.15;

const clamp = (value, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, Number(value) || 0));

// Fragments arrive slowly at the edge of a station and tighten as the sight
// closes in; the randomised tail keeps the rhythm from sounding metronomic.
function nextFragmentDelay(p) {
  const far = 0.75 + Math.random() * 0.55;
  const near = 0.18 + Math.random() * 0.22;
  return (far + (near - far) * p) * 1000;
}

// One-pole pass run twice, same shape as the pond ambience buffers: the
// second pass writes the filtered result back so the loop point inherits
// the filter state.
function onePole(data, cutoff, sr, high = false) {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < data.length; i += 1) {
      const x = data[i];
      y = (1 - a) * x + a * y;
      if (pass) data[i] = high ? x - y : y;
    }
  }
  return data;
}

function band(data, lo, hi, sr) {
  onePole(onePole(data, hi, sr), lo, sr, true);
  return data;
}

function normalize(data, peak) {
  let max = 1e-6;
  for (let i = 0; i < data.length; i += 1) {
    max = Math.max(max, Math.abs(data[i]));
  }
  const gain = peak / max;
  for (let i = 0; i < data.length; i += 1) data[i] *= gain;
  return data;
}

// Two decorrelated channels keep the static from collapsing into a mono
// line. The tail is folded into the head with a short crossfade so a looped
// buffer has no click at the seam.
function buildStatic(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(STATIC_SECONDS * sr);
  const fade = Math.max(1, Math.floor(LOOP_FADE * sr));
  const buffer = ctx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch += 1) {
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i += 1) raw[i] = Math.random() * 2 - 1;
    band(raw, 220, 4200, sr);

    // Sparse crackle, folded under the noise floor so it reads as an old
    // receiver rather than a popcorn machine.
    const pops = 3 + Math.floor(Math.random() * 3);
    for (let p = 0; p < pops; p += 1) {
      const at = Math.floor(Math.random() * Math.max(1, len - sr * 0.05));
      const amp = 0.14 + Math.random() * 0.18;
      const dur = Math.floor(sr * (0.004 + Math.random() * 0.006));
      for (let j = 0; j < dur && at + j < raw.length; j += 1) {
        raw[at + j] +=
          (Math.random() * 2 - 1) * amp * (1 - j / Math.max(1, dur));
      }
    }

    const out = buffer.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      out[i] =
        i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
    }
    normalize(out, STATIC_PEAK);
  }
  return buffer;
}

// A short band-limited burst with a slow amplitude flutter. Three variants
// give the scheduler enough variety without touching the network; starting
// at zero keeps the built-in fade-in, so every burst enters cleanly.
function buildFragment(ctx, seconds, center) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * sr));
  const data = new Float32Array(len);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  band(data, Math.max(180, center * 0.58), Math.min(5200, center * 1.9), sr);

  const flutter = 4.5 + Math.random() * 4;
  const phase = Math.random() * Math.PI * 2;
  for (let i = 0; i < len; i += 1) {
    const t = i / sr;
    const env = Math.min(1, t / 0.015) * Math.min(1, (seconds - t) / 0.06);
    const am = 0.7 + 0.3 * Math.sin(2 * Math.PI * flutter * t + phase);
    data[i] *= env * am;
  }
  normalize(data, 0.7);

  const buffer = ctx.createBuffer(1, len, sr);
  buffer.copyToChannel(data, 0);
  return buffer;
}

// A short mechanical detent: a high tick with a little grit behind it.
function buildTick(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(TICK_SECONDS * sr));
  const data = new Float32Array(len);
  for (let i = 0; i < len; i += 1) {
    const t = i / sr;
    const env = Math.exp(-t / 0.012);
    const tone = Math.sin(2 * Math.PI * 1850 * t) * 0.55;
    const grit = (Math.random() * 2 - 1) * 0.45;
    data[i] = (tone + grit) * env;
  }
  onePole(data, 900, sr, true);
  normalize(data, TICK_PEAK);
  const buffer = ctx.createBuffer(1, len, sr);
  buffer.copyToChannel(data, 0);
  return buffer;
}

export function createTuning(ctx, { volume = 0.6 } = {}) {
  if (!ctx) return null;

  let vol = clamp(volume);
  let level = 0.5;
  let enabled = true;
  let mode = "idle";
  let dragTarget = 0;
  let bedTarget = 0;
  let settleTarget = 0;
  let lastMix = -1;
  let lastTick = -1;
  let lastLock = -1;
  let dragTimer = 0;
  let settleTimer = 0;
  let fragmentTimer = 0;
  let timers = [];
  let active = false;
  let nearSight = false;
  let proximity = 0;

  const staticBuffer = buildStatic(ctx);
  const tickBuffer = buildTick(ctx);
  const fragmentBuffers = [
    buildFragment(ctx, 0.26, 820),
    buildFragment(ctx, 0.34, 1240),
    buildFragment(ctx, 0.44, 1560),
  ];

  const source = ctx.createBufferSource();
  source.buffer = staticBuffer;
  source.loop = true;

  const bed = ctx.createGain();
  bed.gain.value = 0;
  const master = ctx.createGain();
  master.gain.value = 0;

  source.connect(bed);
  bed.connect(master);
  master.connect(ctx.destination);
  source.start();

  // The heterodyne: one sine, a slow frequency drift, and a gain low enough
  // to sit under the bed until the sight is close.
  const whistle = ctx.createOscillator();
  whistle.type = "sine";
  whistle.frequency.value = 560;
  const whistleGain = ctx.createGain();
  whistleGain.gain.value = 0;
  const drift = ctx.createOscillator();
  drift.type = "sine";
  drift.frequency.value = 0.19;
  const driftGain = ctx.createGain();
  driftGain.gain.value = 5;
  drift.connect(driftGain);
  driftGain.connect(whistle.frequency);
  whistle.connect(whistleGain);
  whistleGain.connect(master);
  whistle.start();
  drift.start();

  function masterValue() {
    return enabled ? vol * level * MASTER_GAIN : 0;
  }

  function applyMaster(tc = 0.08) {
    master.gain.setTargetAtTime(masterValue(), ctx.currentTime, tc);
  }

  function mixValue() {
    return enabled ? Math.max(dragTarget, bedTarget, settleTarget) : 0;
  }

  function applyMix(tc = 0.08) {
    const target = mixValue();
    if (Math.abs(target - lastMix) < 0.004) return;
    lastMix = target;
    bed.gain.setTargetAtTime(target, ctx.currentTime, tc);
  }

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  }

  function dragLevel(speed) {
    return Math.max(0.12, 0.1 + 0.55 * clamp(speed));
  }

  // The ruler only sends pointermove events, so a finger held still would
  // otherwise leave the last (possibly fast) speed in place. Settle to the
  // floor when no new movement arrives.
  function noteDrag(active) {
    clearTimeout(dragTimer);
    dragTimer = 0;
    if (!active) return;
    dragTimer = setTimeout(() => {
      dragTimer = 0;
      if (!enabled) return;
      dragTarget = 0.12;
      applyMix(0.12);
    }, 120);
  }

  // The globe keeps reporting while the camera eases onto the sight; every
  // report pushes this watchdog out, so the bed only drops when the reports
  // stop or an explicit mode change arrives. The ruler is one-shot, so it
  // asks for a longer hold to cover the station switch.
  function noteSettle(hold = SETTLE_HOLD_MS) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (!enabled) return;
      settleTarget = 0;
      applyMix(0.24);
    }, hold);
  }

  function clearSettle(tc = 0.2) {
    clearTimeout(settleTimer);
    settleTimer = 0;
    if (!settleTarget) return;
    settleTarget = 0;
    applyMix(tc);
  }

  // A run of dead streams should reuse the bed already on its way down: the
  // next `connecting` must not yank it back to full.
  function enterConnecting() {
    if (mode === "connecting") return;
    mode = "connecting";
    clearTimers();
    // A real switch begins; no stale drag floor may outlive the hand.
    dragTarget = 0;
    clearSettle(0.08);
    bedTarget = BED_START;
    applyMix(0.08);

    timers.push(
      setTimeout(() => {
        if (mode !== "connecting") return;
        bedTarget = BED_MID;
        applyMix(0.25);
      }, 1200),
    );
    timers.push(
      setTimeout(() => {
        if (mode !== "connecting") return;
        bedTarget = BED_LOW;
        applyMix(0.3);
      }, 2600),
    );
    timers.push(
      setTimeout(() => {
        if (mode !== "connecting") return;
        bedTarget = 0;
        applyMix(0.4);
      }, 5200),
    );
  }

  function stopFragments() {
    clearTimeout(fragmentTimer);
    fragmentTimer = 0;
  }

  function playFragment(p) {
    if (!enabled || level <= 0 || p < 0.08) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer =
      fragmentBuffers[Math.floor(Math.random() * fragmentBuffers.length)];
    src.playbackRate.value = 0.92 + Math.random() * 0.16;

    const gain = ctx.createGain();
    gain.gain.value = FRAGMENT_GAIN * p * p * (0.75 + Math.random() * 0.5);

    let tail = gain;
    let pan = null;
    if (typeof ctx.createStereoPanner === "function") {
      pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.55;
      gain.connect(pan);
      tail = pan;
    }
    src.connect(gain);
    tail.connect(master);
    src.start(now);
    src.stop(now + 0.6);
    src.addEventListener("ended", () => {
      try {
        src.disconnect();
        gain.disconnect();
        pan?.disconnect();
      } catch {
        /* already torn down */
      }
    });
  }

  // Fragments are scheduled from the latest proximity; intervals shorten as
  // the sight closes in. The loop only runs while a drag is live.
  function scheduleFragment() {
    stopFragments();
    if (!enabled || !active) return;
    fragmentTimer = setTimeout(() => {
      fragmentTimer = 0;
      if (!enabled || !active) return;
      playFragment(proximity);
      scheduleFragment();
    }, nextFragmentDelay(proximity));
  }

  function applyProximity(info = {}) {
    const nextActive = Boolean(info.dragging);
    // The settle pass keeps the heterodyne alive: it is the moment the sight
    // is closing on a station, so the whistle should rise rather than cut.
    const near = nextActive || Boolean(info.settling);
    const nextProximity = near
      ? clamp(info.progress ?? info.proximity ?? 0)
      : 0;
    const changed =
      near !== nearSight || Math.abs(nextProximity - proximity) > 0.008;
    const started = nextActive && !active;
    const stopped = !nextActive && active;
    active = nextActive;
    nearSight = near;
    proximity = nextProximity;

    if (changed) {
      const now = ctx.currentTime;
      whistleGain.gain.setTargetAtTime(
        near ? WHISTLE_GAIN * nextProximity ** 3 : 0,
        now,
        0.16,
      );
      whistle.frequency.setTargetAtTime(560 + 620 * nextProximity, now, 0.2);
    }
    if (started) scheduleFragment();
    else if (stopped) stopFragments();
  }

  // One chirp per real switch. The caller runs this before entering the
  // connecting bed, so a chain of dead-stream skips (already connecting)
  // stays quiet.
  function playLock() {
    if (!enabled || level <= 0 || mode === "connecting") return;
    const now = ctx.currentTime;
    if (now - lastLock < 0.3) return;
    lastLock = now;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(940, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.17);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.21);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.23);
    osc.addEventListener("ended", () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already torn down */
      }
    });
  }

  function playTick() {
    if (!enabled || level <= 0) return;
    const now = ctx.currentTime;
    // A fast ruler sweep crosses several slots in a few frames; one click
    // every 40ms is enough to read as a detent.
    if (now - lastTick < 0.04) return;
    lastTick = now;

    const src = ctx.createBufferSource();
    src.buffer = tickBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.42;
    src.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + TICK_SECONDS + 0.02);
    src.addEventListener("ended", () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* already torn down */
      }
    });
  }

  applyMaster(0.01);

  return {
    setVolume(next) {
      vol = clamp(next);
      applyMaster();
    },
    setLevel(next) {
      level = clamp(next);
      applyMaster();
    },
    setEnabled(next) {
      enabled = Boolean(next);
      clearTimers();
      clearTimeout(dragTimer);
      dragTimer = 0;
      if (!enabled) {
        stopFragments();
        applyProximity({ dragging: false });
        clearTimeout(settleTimer);
        settleTimer = 0;
        settleTarget = 0;
        dragTarget = 0;
        bedTarget = 0;
        lastMix = -1;
        bed.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
      applyMaster(0.05);
      if (enabled) {
        if (mode === "connecting") {
          mode = "idle";
          enterConnecting();
        } else {
          bedTarget = 0;
          applyMix(0.1);
        }
      }
    },
    setMode(next) {
      if (next === "connecting") {
        enterConnecting();
        return;
      }
      mode = next;
      clearTimers();
      dragTarget = 0;
      clearSettle(0.12);
      bedTarget = 0;
      applyMix(next === "paused" || next === "idle" ? 0.06 : 0.3);
    },
    sight(info = {}) {
      if (!enabled) return;
      if (info.settling) {
        // Already on the connecting bed: its level is above the settle bed,
        // so a late settle frame must not drag it back down.
        if (mode === "connecting") return;
        applyProximity(info);
        settleTarget = SETTLE_BED;
        noteSettle();
        dragTarget = 0;
        applyMix(0.16);
        return;
      }
      clearSettle();
      applyProximity(info);
      noteDrag(info.dragging);
      dragTarget = info.dragging ? dragLevel(info.speed) : 0;
      applyMix(info.dragging ? 0.06 : 0.28);
    },
    scrub(info = {}) {
      if (!enabled) return;
      if (info.detent) playTick();
      applyProximity(info);
      noteDrag(info.dragging);
      dragTarget = info.dragging ? dragLevel(info.speed) : 0;
      if (info.dragging) {
        clearSettle();
      } else {
        // One release event, then the switch: hold a low bed long enough
        // for the catalog step before `play()` raises the connecting bed.
        settleTarget = Math.max(settleTarget, 0.1);
        noteSettle(450);
      }
      applyMix(info.dragging ? 0.06 : 0.24);
    },
    tick: playTick,
    lock: playLock,
    destroy() {
      clearTimers();
      clearTimeout(dragTimer);
      dragTimer = 0;
      clearTimeout(settleTimer);
      settleTimer = 0;
      stopFragments();
      try {
        source.stop();
        whistle.stop();
        drift.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
        bed.disconnect();
        whistle.disconnect();
        whistleGain.disconnect();
        drift.disconnect();
        driftGain.disconnect();
        master.disconnect();
      } catch {
        /* already torn down */
      }
      enabled = false;
    },
  };
}
