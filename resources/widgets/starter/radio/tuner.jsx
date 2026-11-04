// The tuner under the globe: the longitude ruler of stations, and the
// three controls beneath it — slide one station west, play or pause, and
// a random pick from the whole catalog.

import { useMemo } from "@deskulpt-test/react";
import { Flex } from "@deskulpt-test/ui";
import { PauseIcon, PlayIcon, ShuffleIcon, SkipBackIcon } from "./icons.jsx";
import { Ruler } from "./ruler.jsx";

// The three controls are bare icons, one per equal third of the row, so
// the gap between them follows the panel width and always reads even.
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

export function Tuner({
  station,
  upcoming,
  pool,
  live,
  strings,
  onToggle,
  onPick,
}) {
  // Every located station the catalog knows, plus the ones already in
  // flight, ordered west to east like a map.
  const stations = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const st of [station, ...(upcoming ?? []), ...(pool ?? [])]) {
      if (!st?.uuid || seen.has(st.uuid)) continue;
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
      seen.add(st.uuid);
      list.push(st);
    }
    return list.toSorted((a, b) => a.lon - b.lon);
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

  return (
    <>
      <Ruler stations={stations} cur={cur} onPick={onPick} />
      <Flex align="center" width="100%" pt="1">
        <button
          type="button"
          onClick={() => west && onPick(west)}
          disabled={!west}
          aria-label={strings.left}
          style={{ ...ICON_BTN, opacity: west ? 1 : 0.35 }}
        >
          <SkipBackIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={live ? strings.pause : strings.play}
          style={ICON_BTN}
        >
          {live ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button
          type="button"
          onClick={pickRandom}
          aria-label={strings.random}
          style={ICON_BTN}
        >
          <ShuffleIcon />
        </button>
      </Flex>
    </>
  );
}
