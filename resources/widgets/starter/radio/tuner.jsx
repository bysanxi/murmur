// The tuner under the globe: the longitude ruler of stations, and the
// controls beneath it — west, play or pause, a random pick, and the star
// that saves the station on air. The wide face drops the ruler and
// left-aligns that same row; the star joins it on the left when the ruler
// shows, on the right when it does not.

import { useEffect, useMemo, useRef, useState } from "@deskulpt-test/react";
import { Flex } from "@deskulpt-test/ui";
import {
  PauseIcon,
  PlayIcon,
  ShuffleIcon,
  SkipBackIcon,
  StarIcon,
} from "./icons.jsx";
import { Ruler } from "./ruler.jsx";

const WIDE_AT = 520;

const ICON_BTN = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "1 1 0",
  height: 34,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
};

const WIDE_BTN = {
  ...ICON_BTN,
  flex: "0 0 auto",
  width: 44,
};

export function Tuner({
  station,
  upcoming,
  pool,
  live,
  strings,
  favoriteActive,
  onToggle,
  onPick,
  onScrub,
  onWake,
  onToggleFavorite,
  keepRuler = false,
}) {
  const hostRef = useRef(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const sync = () => setWide(el.clientWidth >= WIDE_AT);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stations = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const st of [station, ...(upcoming ?? []), ...(pool ?? [])]) {
      if (!st?.uuid || seen.has(st.uuid)) continue;
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
      seen.add(st.uuid);
      list.push(st);
    }
    // West to east. Stations that share a coordinate keep a fixed order
    // (latitude, then id). Sorting the station on air to the front would
    // reshuffle that tie on every pick, so the ruler jumped.
    return list.toSorted((a, b) => {
      const dlon = a.lon - b.lon || a.lat - b.lat;
      if (dlon) return dlon;
      return a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0;
    });
  }, [station, upcoming, pool]);

  const cur = Math.max(
    stations.findIndex((st) => st.uuid === station?.uuid),
    0,
  );
  const west = cur > 0 ? stations[cur - 1] : null;
  const pickRandom = () => {
    const others = stations.filter((st) => st.uuid !== station?.uuid);
    if (others.length > 0) {
      onPick(others[Math.floor(Math.random() * others.length)]);
    }
  };

  const stripWide = wide && !keepRuler;
  const btn = stripWide ? WIDE_BTN : ICON_BTN;
  const favoriteLabel = favoriteActive
    ? strings.favoriteRemove
    : strings.favoriteCurrent;
  const favoriteButton = (
    <button
      type="button"
      onClick={() => station && onToggleFavorite?.(!favoriteActive)}
      disabled={!station}
      aria-label={favoriteLabel}
      title={favoriteLabel}
      style={{ ...btn, opacity: station ? 1 : 0.35 }}
    >
      <StarIcon size={18} filled={favoriteActive} />
    </button>
  );
  const controls = (
    <Flex
      align="center"
      width={stripWide ? undefined : "100%"}
      pt={stripWide ? "3" : "1"}
      style={stripWide ? { gap: 16 } : undefined}
    >
      {!stripWide && favoriteButton}
      <button
        type="button"
        onClick={() => west && onPick(west)}
        disabled={!west}
        aria-label={strings.left}
        style={{ ...btn, opacity: west ? 1 : 0.35 }}
      >
        <SkipBackIcon size={16} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={live ? strings.pause : strings.play}
        style={btn}
      >
        {live ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>
      <button
        type="button"
        onClick={pickRandom}
        aria-label={strings.random}
        style={btn}
      >
        <ShuffleIcon />
      </button>
      {stripWide && favoriteButton}
    </Flex>
  );

  return (
    <div ref={hostRef} style={{ width: "100%" }}>
      {(!stripWide || keepRuler) && (
        <Ruler
          stations={stations}
          cur={cur}
          onPick={onPick}
          onScrub={onScrub}
          onWake={onWake}
        />
      )}
      {controls}
    </div>
  );
}
