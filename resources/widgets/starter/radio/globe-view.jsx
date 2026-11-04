// The full-size radio face: the dot globe fills the top, and the station
// rides underneath — coordinates pinned to the globe, a status line, the
// name in big type, a longitude ruler of stations, and the playback
// controls. Renders when the widget frame is large enough; the compact
// card takes over below that.

import { useEffect, useMemo, useRef } from "@deskulpt-test/react";
import { Flex, Text } from "@deskulpt-test/ui";
import { createGlobe } from "./globe.js";
import { Tuner } from "./tuner.jsx";
import { ELLIPSIS, coordOf } from "./format.js";

// Deep space: near-black void seeded with stars of mixed sizes — no nebula
// wash. Deterministic jitter so the field stays put across renders.
function starField(count) {
  const layers = [];
  for (let i = 0; i < count; i += 1) {
    const n = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
    const n2 = Math.abs(Math.sin(i * 39.346 + 11.135) * 23421.6312);
    const n3 = Math.abs(Math.sin(i * 7.521 + 4.177) * 9123.4567);
    const x = (n % 1) * 100;
    const y = (n2 % 1) * 100;
    // Mostly dust, a few medium, rare bright sparks.
    const roll = n3 % 1;
    const size = roll > 0.94 ? 2.2 : roll > 0.78 ? 1.5 : 1;
    const alpha =
      roll > 0.94
        ? 0.85
        : roll > 0.78
          ? 0.55 + (n % 1) * 0.25
          : 0.22 + (n2 % 1) * 0.35;
    layers.push(
      `radial-gradient(${size}px ${size}px at ${x.toFixed(2)}% ${y.toFixed(2)}%,` +
        ` rgba(255,255,255,${alpha.toFixed(2)}), transparent 55%)`,
    );
  }
  return layers;
}

const SKY = [
  ...starField(72),
  "linear-gradient(180deg, #020308 0%, #04060c 50%, #010204 100%)",
].join(",");

// Soft bloom where the limb would catch light — kept faint so stars stay.
const LIMB =
  "radial-gradient(46% 42% at 34% 30%, rgba(158,196,255,.07), transparent 72%)";

// The face paints its own night sky, so its type stays light no matter
// which theme the rest of the canvas is on.
const TYPE = {
  name: "#f2f3f5",
  status: "rgba(255,255,255,.62)",
  detail: "rgba(255,255,255,.46)",
  coords: "rgba(255,255,255,.55)",
};

export function GlobeView({
  id,
  strings,
  station,
  statusLine,
  live,
  place,
  time,
  detail,
  coords,
  markers,
  spin,
  rimBoost,
  limbGlow,
  upcoming,
  getAudioLevels,
  onSurfacePointerDown,
  onToggle,
  onPick,
}) {
  const hostRef = useRef(null);
  const globeRef = useRef(null);
  const tapRef = useRef(null);
  const levelsRef = useRef(getAudioLevels);
  levelsRef.current = getAudioLevels;

  useEffect(() => {
    globeRef.current = createGlobe(hostRef.current);
    globeRef.current?.setLevelProvider(
      () => levelsRef.current?.() ?? { level: 0, bass: 0 },
    );
    return () => {
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, []);

  // The sight labels whatever pin sits under it — locked when close,
  // "nearest" while still approaching, tuning when the sky is empty.
  useEffect(() => {
    globeRef.current?.setAimFormatter((hit, close, aimAt) => {
      const title = coordOf(aimAt) || coordOf(hit?.station);
      const n = aimAt?.nearby || 0;
      const meta =
        n >= 2
          ? (strings.nearby || "{n} stations nearby").replace("{n}", String(n))
          : "";
      return { title, meta, hot: close };
    });
    globeRef.current?.setOnAim(onPick);
  }, [strings, onPick]);

  // Dial / skip / random / pin tap: explicit tune. The globe follows
  // and auto-aim stays off until the user drags the globe again.
  const pickExplicit = (next) => {
    globeRef.current?.noteExplicitTune(next);
    onPick(next);
  };

  // A tap on a pin tunes that station; a drag still spins the globe. The
  // canvas handles the drag, so this only looks at how far the hand went.
  const onGlobePointerDown = (event) => {
    if (event.button !== 0) return;
    tapRef.current = { x: event.clientX, y: event.clientY };
  };
  const onGlobePointerUp = (event) => {
    const start = tapRef.current;
    tapRef.current = null;
    if (!start || event.button !== 0) return;
    if (globeRef.current?.didDrag()) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6)
      return;
    const hit = globeRef.current?.pick(event.clientX, event.clientY);
    if (hit) pickExplicit(hit);
  };

  const lat = station?.lat;
  const lon = station?.lon;
  useEffect(() => {
    globeRef.current?.setStation(station, lat, lon);
    // Prefer the fan slot when the city is spread — same as roamdial's
    // Ct(N[i]) — so locking a spiral pin does not yank back to the stack.
    if (station) globeRef.current?.focusStation(station);
  }, [station, lat, lon]);

  // Every located station gets a pin, including the one on air — the sun
  // rides on top, and keeping the pin lets a city fan survive a lock
  // the way roamdial keeps N[i] after Ct().
  const pins = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const item of [station, ...(markers ?? []), ...(upcoming ?? [])]) {
      if (!item?.uuid || seen.has(item.uuid)) continue;
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      seen.add(item.uuid);
      list.push(item);
    }
    return list;
  }, [markers, upcoming, station]);
  useEffect(() => {
    globeRef.current?.setMarkers(pins);
  }, [pins]);

  useEffect(() => {
    globeRef.current?.setSpin(spin);
  }, [spin]);

  useEffect(() => {
    globeRef.current?.setRimBoost(rimBoost);
  }, [rimBoost]);

  const statusText = [live ? "ON AIR" : statusLine, place, time]
    .filter(Boolean)
    .join(" · ");

  return (
    <Flex
      id={id}
      direction="column"
      width="100%"
      height="100%"
      onPointerDown={(event) => {
        if (
          event.button === 0 &&
          !event.target.closest("button") &&
          !event.target.closest("[data-globe]")
        ) {
          globeRef.current?.noteExplicitTune(station);
        }
        onSurfacePointerDown?.(event);
      }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        border: "1px solid var(--gray-a5)",
        background: SKY,
        pointerEvents: "auto",
      }}
    >
      <div
        ref={hostRef}
        data-globe="true"
        onPointerDown={onGlobePointerDown}
        onPointerUp={onGlobePointerUp}
        onPointerCancel={() => (tapRef.current = null)}
        style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}
      >
        {limbGlow && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: LIMB,
              pointerEvents: "none",
            }}
          />
        )}
        {coords && (
          <Text
            size="1"
            style={{
              position: "absolute",
              left: 14,
              bottom: 10,
              letterSpacing: "0.14em",
              color: TYPE.coords,
              pointerEvents: "none",
              ...ELLIPSIS,
            }}
          >
            {coords}
          </Text>
        )}
      </div>
      <Flex
        direction="column"
        gap="2"
        px="4"
        pt="2"
        pb="3"
        style={{ flexShrink: 0 }}
      >
        <Flex align="center" gap="2" style={{ minHeight: 16 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: live ? "var(--amber-9)" : "var(--gray-8)",
              transition: "background 400ms ease",
            }}
          />
          <Text size="1" style={{ color: TYPE.status, ...ELLIPSIS }}>
            {statusText}
          </Text>
        </Flex>
        <Text
          size="7"
          weight="bold"
          style={{ color: TYPE.name, ...ELLIPSIS, lineHeight: 1.15 }}
        >
          {station?.name || statusLine || strings.tuning}
        </Text>
        {detail && (
          <Text size="1" style={{ color: TYPE.detail, ...ELLIPSIS }}>
            {detail}
          </Text>
        )}
        <Tuner
          station={station}
          upcoming={upcoming}
          pool={markers}
          live={live}
          strings={strings}
          onToggle={onToggle}
          onPick={pickExplicit}
        />
      </Flex>
    </Flex>
  );
}
