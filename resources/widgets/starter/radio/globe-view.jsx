// The radio face: the dot globe fills the top when the frame is large
// enough, and the station rides underneath — a status line, the name in
// big type, a longitude ruler, and the playback controls. A short or
// narrow card keeps that same strip and drops only the globe.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "@deskulpt-test/react";
import { Flex, Text } from "@deskulpt-test/ui";
import { createGlobe } from "./globe.js";
import { LibrarySheet } from "./library-sheet.jsx";
import { Tuner } from "./tuner.jsx";
import { ELLIPSIS, coordOf, lockMetaOf } from "./format.js";

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
  cacheNote,
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
  showGlobe = true,
  showMeta = true,
  language,
  httpsOnly,
  cacheOn,
  cacheEpoch,
  favorites,
  favoriteActive,
  onToggleFavorite,
  onRemoveFavorite,
  width,
  getAudioLevels,
  onSurfacePointerDown,
  onToggle,
  onPick,
  onSight,
  onScrub,
  onWake,
}) {
  const hostRef = useRef(null);
  const faceRef = useRef(null);
  const nameRef = useRef(null);
  const globeRef = useRef(null);
  const tapRef = useRef(null);
  const levelsRef = useRef(getAudioLevels);
  const sightRef = useRef(onSight);
  const [compact, setCompact] = useState(false);
  const [hot, setHot] = useState(false);

  // Wide controls sit in the next grid cell. Size the name to its condensed
  // glyphs so that cell starts just after the text, then ellipsize if the
  // row runs out of room.
  useLayoutEffect(() => {
    const face = faceRef.current;
    const nameEl = nameRef.current;
    const text = nameEl?.querySelector("[data-station-name]");
    if (!face || !nameEl || !text) return;
    const fit = () => {
      const controls = face.querySelector("[data-station-controls]");
      if (!controls) {
        nameEl.style.gridColumn = "1 / -1";
        nameEl.style.width = "100%";
        text.style.width = "calc(100% / 0.74)";
        return;
      }
      nameEl.style.gridColumn = "1";
      nameEl.style.alignSelf = "center";
      text.style.width = "max-content";
      nameEl.style.width = "max-content";
      const natural = text.offsetWidth;
      const boxStyle = getComputedStyle(face);
      const pad =
        Number.parseFloat(boxStyle.paddingLeft) +
        Number.parseFloat(boxStyle.paddingRight);
      const grid = face.clientWidth - (Number.isFinite(pad) ? pad : 0);
      const available = Math.max(0, grid - controls.offsetWidth - 16);
      const box = Math.min(natural * 0.74, available);
      nameEl.style.width = `${box}px`;
      text.style.width = `${box / 0.74}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(face);
    return () => ro.disconnect();
  });

  // Status, station name, and the detail line. The ruler keeps its own face.
  // Subsets load as the glyphs show up; until then those lines use the
  // theme face.
  useEffect(() => {
    const id = "murmur-ibm-plex-sans-sc";
    const href =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+SC:wght@400;500&display=swap";
    const existing = document.querySelector(`#${id}`);
    if (existing) {
      if (existing.getAttribute("href") !== href) {
        existing.setAttribute("href", href);
      }
      return;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }, []);
  levelsRef.current = getAudioLevels;
  sightRef.current = onSight;

  useEffect(() => {
    if (!showGlobe) {
      globeRef.current?.destroy();
      globeRef.current = null;
      setCompact(false);
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    globeRef.current = createGlobe(el);
    globeRef.current?.setLevelProvider(
      () => levelsRef.current?.() ?? { level: 0, bass: 0 },
    );
    // Direct frame-to-player wire for the tuning bed; no state update.
    globeRef.current?.setSightListener((info) => sightRef.current?.(info));
    const sync = () => setCompact((el.clientWidth ?? 0) < 560);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, [showGlobe]);

  // The sight labels whatever pin sits under it — locked when close,
  // "nearest" while still approaching, tuning when the sky is empty.
  useEffect(() => {
    globeRef.current?.setAimFormatter((hit, close, aimAt) => {
      const wide = (hostRef.current?.clientWidth ?? 0) >= 560;
      const n = aimAt?.nearby || 0;
      const nearby =
        n >= 2
          ? (strings.nearby || "{n} stations nearby").replace("{n}", String(n))
          : "";
      if (wide) {
        const st = hit?.station || station;
        return {
          title: st?.name || "",
          meta: close && st ? lockMetaOf(st, strings) : nearby,
          hot: close,
          named: true,
        };
      }
      const title = coordOf(aimAt) || coordOf(hit?.station);
      return { title, meta: nearby, hot: close };
    });
    globeRef.current?.setOnAim(onPick);
  }, [strings, onPick, station, showGlobe]);

  // Dial / skip / random / pin tap: explicit tune. The globe follows
  // and auto-aim stays off until the user drags the globe again.
  const pickExplicit = (next, opts) => {
    globeRef.current?.noteExplicitTune(next);
    onPick(next, opts);
  };

  // A tap on a pin tunes that station; a drag still spins the globe. The
  // canvas handles the drag, so this only looks at how far the hand went.
  const onGlobePointerDown = (event) => {
    if (event.button !== 0) return;
    onWake?.();
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
  const aimedUuid = useRef(null);
  useEffect(() => {
    if (!showGlobe) {
      aimedUuid.current = null;
      return;
    }
    const globe = globeRef.current;
    if (!globe) return;
    globe.setStation(station, lat, lon);
    // Aim only when the station on air changes. A later render of the
    // same station (markers, clock, cache) must not reel a browse back
    // onto the ruler.
    if (!station?.uuid || aimedUuid.current === station.uuid) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    aimedUuid.current = station.uuid;
    // Prefer the fan slot when the city is spread — same as roamdial's
    // Ct(N[i]) — so locking a spiral pin does not yank back to the stack.
    globe.focusStation(station);
  }, [station, lat, lon, showGlobe]);

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
  // Re-apply when the globe is created again. Crossing the size threshold
  // destroys the canvas, and a fresh one has land but no station pins
  // until this runs — which is why a ruler drag appeared to bring them back.
  useEffect(() => {
    globeRef.current?.setMarkers(pins);
  }, [pins, showGlobe]);

  useEffect(() => {
    globeRef.current?.setSpin(spin);
  }, [spin, showGlobe]);

  useEffect(() => {
    globeRef.current?.setRimBoost(rimBoost);
  }, [rimBoost, showGlobe]);

  const statusText = [live ? "ON AIR" : statusLine, cacheNote, place, time]
    .filter(Boolean)
    .join(" · ");

  return (
    <Flex
      id={id}
      direction="column"
      justify={showGlobe ? "start" : "center"}
      width="100%"
      height="100%"
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onPointerDown={(event) => {
        if (
          event.button === 0 &&
          !event.target.closest("button") &&
          !event.target.closest("[data-globe]") &&
          !event.target.closest("[data-search]") &&
          !event.target.closest("[data-favorites]")
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
        background: "transparent",
        pointerEvents: "auto",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          borderRadius: 12,
          background: SKY,
          opacity: "var(--nfr-widget-bg-alpha, 1)",
          pointerEvents: "none",
        }}
      />
      {showGlobe && (
        <div
          ref={hostRef}
          data-globe="true"
          onPointerDown={onGlobePointerDown}
          onPointerUp={onGlobePointerUp}
          onPointerCancel={() => (tapRef.current = null)}
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: 0,
          }}
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
          {coords && !compact && (
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
      )}
      <Flex
        direction="column"
        gap="2"
        px="4"
        pt={showMeta ? "2" : "1"}
        pb="3"
        ref={faceRef}
        data-station-face="true"
        style={{
          position: "relative",
          flexShrink: 0,
          display: "grid",
          // The last track fills the row, so a narrow ruler still spans the
          // face. Without it the tracks stop at the station name.
          gridTemplateColumns: "minmax(0, max-content) auto minmax(0, 1fr)",
          justifyContent: "start",
          alignItems: "center",
          columnGap: 16,
        }}
      >
        {showMeta && (
          <>
            <Flex
              align="center"
              gap="2"
              data-station-status="true"
              style={{ minHeight: 16, gridColumn: "1 / -1" }}
            >
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
              <Text
                size="1"
                style={{
                  color: TYPE.status,
                  ...ELLIPSIS,
                  fontFamily: '"IBM Plex Sans SC", sans-serif',
                  fontWeight: 400,
                }}
              >
                {statusText}
              </Text>
            </Flex>
            <div
              ref={nameRef}
              style={{ gridColumn: "1", minWidth: 0, overflow: "hidden" }}
            >
              <Text
                size="7"
                style={{
                  display: "block",
                  width: "100%",
                  overflow: "hidden",
                  color: TYPE.name,
                  lineHeight: 1.15,
                  fontFamily: '"IBM Plex Sans SC", sans-serif',
                  fontWeight: 500,
                }}
              >
                <span
                  data-station-name=""
                  style={{
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    transform: "scaleX(0.74)",
                    transformOrigin: "left center",
                  }}
                >
                  {station?.name || statusLine || strings.tuning}
                </span>
              </Text>
            </div>
            {detail && (
              <Text
                size="1"
                style={{
                  gridColumn: "1 / -1",
                  color: TYPE.detail,
                  ...ELLIPSIS,
                  fontFamily: '"IBM Plex Sans SC", sans-serif',
                  fontWeight: 400,
                }}
              >
                {detail}
              </Text>
            )}
          </>
        )}
        <Tuner
          station={station}
          upcoming={upcoming}
          pool={markers}
          live={live}
          strings={strings}
          favoriteActive={favoriteActive}
          onToggle={onToggle}
          onPick={pickExplicit}
          onScrub={onScrub}
          onWake={onWake}
          onToggleFavorite={onToggleFavorite}
          keepRuler={!showMeta}
        />
      </Flex>
      <LibrarySheet
        widgetId={id}
        hot={hot}
        width={width}
        showGlobe={showGlobe}
        strings={strings}
        language={language}
        httpsOnly={httpsOnly}
        cacheOn={cacheOn}
        cacheEpoch={cacheEpoch}
        station={station}
        favorites={favorites}
        onPick={pickExplicit}
        onRemoveFavorite={onRemoveFavorite}
      />
    </Flex>
  );
}
