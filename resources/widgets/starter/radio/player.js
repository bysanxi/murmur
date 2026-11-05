// Audio playback for one station stream. Streams are long-lived HTTP
// responses, so the player is a single <audio> element: switching is a
// pause, a src swap, and a fresh play(). A stream that errors or stays
// silent past CONNECT_MS is reported dead so the caller can move on —
// plenty of directory entries point at servers that went away.
//
// VU follow: route through the local CORS proxy (127.0.0.1:17865), then
// createMediaElementSource → streamGain → AnalyserNode → destination.
// captureStream cannot drive the meter; AnalyserNode + getByteFrequencyData
// is required. crossOrigin must be set before src. AudioContext must be
// running before MediaElementSource is created, or the webview goes silent.
//
// The tuning bed rides the same context but its own gain bus, so dragging a
// dial can duck the stream without the noise ever reaching the analyser.

import { createTuning } from "./tuning.js";

const CONNECT_MS = 12_000;
// The stream is pulled down to this while the hand is on the dial.
const DUCK_LEVEL = 0.2;
const PROXY_BASE = "http://127.0.0.1:17865/";

function viaProxy(url) {
  return `${PROXY_BASE}?u=${encodeURIComponent(url)}`;
}

/// host: { onState(state, station), onDead(station, reason) }
///
/// states: "idle" | "connecting" | "playing" | "paused" | "blocked"
///   blocked = the webview refused to start without a user gesture.
export function createPlayer(host) {
  const audio = new Audio();
  audio.preload = "none";
  audio.crossOrigin = "anonymous";

  let station = null;
  let connectTimer = 0;
  let generation = 0;
  let volume = 0.6;
  let state = "idle";
  let useProxy = true;

  let ctx = null;
  let mediaSource = null;
  let streamGain = null;
  let analyser = null;
  let freq = null;
  let tapReady = false;
  let tapPromise = null;
  let lastTapTry = 0;
  let ducked = 1;
  let globeSilent = false; // globe sight is not on the station on air
  let inputActive = false;

  let tuning = null;
  let tuningEnabled = true;
  let tuningLevel = 0.5;
  let pendingMode = "idle";

  let smoothLevel = 0;
  let smoothBass = 0;
  let peakLevel = 0;
  let peakBass = 0;
  let bassAvg = 0.08;

  function clearConnect() {
    clearTimeout(connectTimer);
    connectTimer = 0;
  }

  function emit(next) {
    state = next;
    host.onState?.(next, station);
  }

  function die(reason) {
    clearConnect();
    const dead = station;
    station = null;
    generation += 1;
    state = "idle";
    audio.pause();
    audio.removeAttribute("src");
    // A dead stream is the start of a skip, not a fresh tune: the bed keeps
    // whatever decay it already has instead of snapping back to full.
    setTuneMode("connecting");
    duckStream(1);
    if (dead) host.onDead?.(dead, reason);
  }

  function setTuneMode(next) {
    pendingMode = next;
    tuning?.setMode(next);
  }

  function duckStream(target, tc = 0.22) {
    if (!streamGain || !ctx) return;
    if (Math.abs(target - ducked) < 0.01) return;
    ducked = target;
    streamGain.gain.setTargetAtTime(target, ctx.currentTime, tc);
  }

  function restoreDuck() {
    duckStream(inputActive && canTune() ? DUCK_LEVEL : 1);
  }

  // Paused and blocked stay silent even if the globe or ruler is moving.
  function canTune() {
    return tuningEnabled && state !== "paused" && state !== "blocked";
  }

  // A drag is itself a gesture, so it can wake a context that autoplay left
  // suspended. The throttle keeps a blocked webview from being probed every
  // frame.
  function wakeTap() {
    const now = performance.now();
    if (tapPromise || now - lastTapTry < 400) return;
    lastTapTry = now;
    void ensureTap();
  }

  /// Ensure AudioContext is running, then wire the graph once.
  function ensureTap() {
    if (tapPromise) return tapPromise;
    tapPromise = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = ctx || new AC();
        if (ctx.state === "suspended") await ctx.resume();
        if (ctx.state !== "running") return false;
        if (!mediaSource) {
          mediaSource = ctx.createMediaElementSource(audio);
          streamGain = ctx.createGain();
          streamGain.gain.value = 1;
          analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.65;
          mediaSource.connect(streamGain);
          streamGain.connect(analyser);
          analyser.connect(ctx.destination);
          freq = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!tuning) {
          tuning = createTuning(ctx, { volume });
          tuning?.setLevel(tuningLevel);
          tuning?.setEnabled(tuningEnabled);
          tuning?.setMode(pendingMode);
        }
        tapReady = true;
        return true;
      } catch {
        tapReady = false;
        return false;
      }
    })().finally(() => {
      tapPromise = null;
    });
    return tapPromise;
  }

  function playUrl(url) {
    if (useProxy) {
      audio.crossOrigin = "anonymous";
      audio.src = viaProxy(url);
    } else {
      // Raw streams usually lack ACAO; drop CORS mode so <audio> can still play.
      audio.removeAttribute("crossorigin");
      audio.src = url;
    }
    audio.volume = volume;
  }

  audio.addEventListener("playing", () => {
    clearConnect();
    emit("playing");
    setTuneMode("idle");
    restoreDuck();
  });
  audio.addEventListener("pause", () => {
    if (station && connectTimer === 0 && !audio.ended) {
      inputActive = false;
      emit("paused");
      setTuneMode("paused");
      duckStream(1);
    }
  });
  audio.addEventListener("error", () => {
    if (!station) return;
    // Proxy may be down (dev without rebuild); fall back to raw URL once.
    if (useProxy && station.url) {
      useProxy = false;
      const mine = generation;
      playUrl(station.url);
      const started = audio.play();
      if (started) {
        started.catch(() => {
          if (mine === generation && station) die("error");
        });
      }
      return;
    }
    die("error");
  });

  return {
    get station() {
      return station;
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number(next) || 0));
      audio.volume = volume;
      tuning?.setVolume(volume);
    },
    /// A pointer-down is the cleanest place to resume a suspended context;
    /// the frame loop that follows may not carry user activation.
    wake() {
      if (tuningEnabled) wakeTap();
    },
    /// Tuning-noise switches from the widget config.
    setTuning(next = {}) {
      tuningEnabled = next.enabled !== false;
      const raw = Number(next.level);
      if (Number.isFinite(raw)) tuningLevel = Math.min(1, Math.max(0, raw));
      tuning?.setEnabled(tuningEnabled);
      tuning?.setLevel(tuningLevel);
      if (!tuningEnabled) {
        inputActive = false;
        duckStream(1);
      }
    },
    /// Per-frame sight data from the globe. A globe drag takes the
    /// reticle as authority: the ruler's station stays audible only
    /// while that reticle is on it. Empty ocean keeps the stream down
    /// after the hand lifts, until a lock or the ruler picks again.
    sight(info = {}) {
      inputActive = Boolean(info.dragging);
      if (info.globe && (info.dragging || info.settling || info.detached)) {
        globeSilent = !info.onPlaying;
      }
      if (!canTune()) {
        restoreDuck();
        return;
      }
      if (info.dragging) wakeTap();
      tuning?.sight(info);
      if (globeSilent) duckStream(0);
      else restoreDuck();
    },
    /// Ruler scrub; `detent` fires once per station slot crossing.
    /// The ruler always has a station, so it is not the globe's rule.
    scrub(info = {}) {
      inputActive = Boolean(info.dragging);
      globeSilent = false;
      if (!canTune()) {
        restoreDuck();
        return;
      }
      if (info.dragging) wakeTap();
      tuning?.scrub(info);
      restoreDuck();
    },
    play(next) {
      if (!next?.url) return;
      clearConnect();
      generation += 1;
      const mine = generation;
      station = next;
      useProxy = true;
      // One chirp for a real switch; `lock()` itself ignores the connecting
      // bed, so a rapid dead-stream chain does not chirp on every skip.
      tuning?.lock();
      emit("connecting");
      setTuneMode("connecting");
      globeSilent = false;
      duckStream(1);
      connectTimer = setTimeout(() => {
        if (mine === generation && station) die("timeout");
      }, CONNECT_MS);

      void (async () => {
        // Resume + wire before play so MediaElementSource owns the graph
        // while the context is already running (avoids silent hijack).
        await ensureTap();
        if (mine !== generation || !station) return;
        playUrl(next.url);
        try {
          await audio.play();
          if (mine === generation) await ensureTap();
        } catch (error) {
          if (mine !== generation || !station) return;
          if (error?.name === "NotAllowedError") {
            clearConnect();
            inputActive = false;
            emit("blocked");
            setTuneMode("paused");
            duckStream(1);
            return;
          }
          // Proxy path failed — try raw URL (sound only, no VU).
          if (useProxy) {
            useProxy = false;
            playUrl(next.url);
            try {
              await audio.play();
            } catch (again) {
              if (mine !== generation || !station) return;
              if (again?.name === "NotAllowedError") {
                clearConnect();
                inputActive = false;
                emit("blocked");
                setTuneMode("paused");
                duckStream(1);
                return;
              }
              die("error");
            }
            return;
          }
          die("error");
        }
      })();
    },
    resume() {
      if (!station) return;
      const mine = generation;
      clearConnect();
      setTuneMode("connecting");
      globeSilent = false;
      duckStream(1);
      connectTimer = setTimeout(() => {
        if (mine === generation && station) die("timeout");
      }, CONNECT_MS);
      void (async () => {
        await ensureTap();
        if (mine !== generation || !station) return;
        try {
          await audio.play();
          if (mine === generation) await ensureTap();
        } catch {
          if (mine === generation && station) die("error");
        }
      })();
    },
    pause() {
      clearConnect();
      inputActive = false;
      audio.pause();
      setTuneMode("paused");
      duckStream(1);
    },
    stop() {
      clearConnect();
      inputActive = false;
      station = null;
      generation += 1;
      audio.pause();
      audio.removeAttribute("src");
      emit("idle");
      setTuneMode("idle");
      duckStream(1);
    },
    /// VU-style level/bass from AnalyserNode (0..1).
    levels() {
      if (state !== "playing") {
        smoothLevel *= 0.85;
        smoothBass *= 0.85;
        peakLevel *= 0.9;
        peakBass *= 0.9;
        return { level: smoothLevel, bass: smoothBass };
      }
      if (ctx?.state === "suspended") {
        void ctx.resume();
      }
      if (!tapReady || !analyser || !freq) {
        return { level: smoothLevel, bass: smoothBass };
      }

      analyser.getByteFrequencyData(freq);
      const n = freq.length;
      const use = Math.max(8, Math.floor(n / 3));
      const lowN = Math.min(12, use);
      let low = 0;
      let body = 0;
      let energy = 0;
      for (let i = 0; i < use; i += 1) {
        const v = freq[i] / 255;
        energy += v;
        if (i < lowN) low += v;
        else body += v;
      }
      // All zeros → graph not fed yet; don't invent a beat.
      if (energy < 0.001) {
        smoothLevel *= 0.92;
        smoothBass *= 0.92;
        return { level: smoothLevel, bass: smoothBass };
      }

      const bassRaw = low / lowN;
      const bodyRaw = body / Math.max(1, use - lowN);
      const bass = Math.log1p(bassRaw * 4) / Math.log1p(4);
      const bodyN = Math.log1p(bodyRaw * 4) / Math.log1p(4);

      bassAvg = bassAvg * 0.88 + bass * 0.12;
      const onset = Math.max(0, bass - bassAvg * 1.1);
      const level = Math.min(1, bodyN * 0.85 + bass * 0.35 + onset * 2.4);
      const bassOut = Math.min(1, bass * 0.9 + onset * 2.0);

      smoothLevel = smoothLevel * 0.7 + level * 0.3;
      smoothBass = smoothBass * 0.7 + bassOut * 0.3;
      if (smoothLevel > peakLevel) peakLevel = smoothLevel;
      else peakLevel = Math.max(smoothLevel, peakLevel - 0.045);
      if (smoothBass > peakBass) peakBass = smoothBass;
      else peakBass = Math.max(smoothBass, peakBass - 0.04);

      return { level: peakLevel, bass: peakBass };
    },
    destroy() {
      clearConnect();
      station = null;
      generation += 1;
      audio.pause();
      audio.removeAttribute("src");
      tuning?.destroy();
      tuning = null;
      try {
        mediaSource?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        streamGain?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      mediaSource = null;
      streamGain = null;
      analyser = null;
      freq = null;
      tapReady = false;
      ducked = 1;
      inputActive = false;
      pendingMode = "idle";
      void ctx?.close();
      ctx = null;
    },
  };
}
