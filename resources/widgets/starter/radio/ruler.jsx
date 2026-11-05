// The ruler under the globe: stations laid west to east on fixed slots,
// with a pushpin parked dead centre and the ticks sliding beneath it.
// The catalog is long, so only a window of stations around the middle is
// mounted at a time; dragging towards an edge pulls in the next page,
// which keeps a fast drag smooth however many stations are known.

import { useEffect, useMemo, useRef, useState } from "@deskulpt-test/react";

// Brightness falls off from the pin outward, so the eye lands on the
// middle of the ruler: full strength under the pushpin, fading to nothing
// at both ends.
const EDGE_FADE =
  "linear-gradient(90deg, transparent 0%, rgba(0,0,0,.18) 7%," +
  " rgba(0,0,0,.5) 20%, rgba(0,0,0,.8) 33%, #000 44%, #000 56%," +
  " rgba(0,0,0,.8) 67%, rgba(0,0,0,.5) 80%, rgba(0,0,0,.18) 93%," +
  " transparent 100%)";

const HOT = "#ff6a45"; // the station on air
const SLOT = 80; // one station's cell
const NAME_W = 72; // names are one fixed width, then ellipsis
const TICK = 24; // the station mark, tallest on the ruler
const KEEP = 6; // slots mounted either side of the middle
const PAGE = 12; // slots pulled in when a drag reaches the edge
const EDGE = 4; // how near the window edge asks for the next page

// Deterministic jitter, so a minor mark keeps its height across renders.
function jitter(a, b) {
  return Math.abs(Math.sin(a * 37 + b * 12.9898) * 43758.5453);
}

export function Ruler({ stations, cur, onPick, onScrub, onWake }) {
  const n = stations.length;
  const [win, setWin] = useState([0, 0]);
  const [dx, setDxState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const winRef = useRef([0, 0]);
  const dxRef = useRef(0);
  const settleRef = useRef(0);
  const suppressRef = useRef(false);

  const setDx = (v) => {
    dxRef.current = v;
    setDxState(v);
  };

  // A new station recentres the ruler: a page of its neighbours mounts,
  // the drag offset goes, and the strip eases back under the pin.
  useEffect(() => {
    clearTimeout(settleRef.current);
    dxRef.current = 0;
    setDxState(0);
    const size = Math.min(n, 2 * KEEP + 1);
    const from = Math.max(0, Math.min(cur - KEEP, n - size));
    const next = [from, from + size];
    winRef.current = next;
    setWin(next);
  }, [cur, n]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onWake?.();
    suppressRef.current = false;
    const startX = e.clientX;
    const base = dxRef.current;
    let moved = false;
    let lastEmit = 0;
    let lastMoveX = startX;
    let lastMoveAt = performance.now();
    // The slot under the pin at press time. A detent fires only when the
    // nearest slot changes, never once per pixel.
    let lastDetent = Math.round(cur - base / SLOT);
    setDragging(true);
    const emitScrub = (speed, detent = false, proximity = 0) => {
      const now = performance.now();
      if (!detent && now - lastEmit < 33) return;
      lastEmit = now;
      onScrub?.({ dragging: true, speed, detent, proximity });
    };
    const move = (ev) => {
      const d = ev.clientX - startX;
      if (Math.abs(d) > 4) moved = true;
      const raw = base + d;
      const lo = -Math.max(n - 1 - cur, 0) * SLOT;
      const hi = cur * SLOT;
      const next = Math.min(Math.max(raw, lo), hi);
      setDx(next);
      if (moved) {
        const now = performance.now();
        const dt = Math.max(8, now - lastMoveAt);
        const speed = Math.min(1, Math.abs(ev.clientX - lastMoveX) / dt / 1.6);
        lastMoveX = ev.clientX;
        lastMoveAt = now;
        const pos = cur - next / SLOT;
        const nearest = Math.round(pos);
        const detent = nearest !== lastDetent;
        lastDetent = nearest;
        // 1 when a station sits under the pin, 0 at the boundary between
        // two stations. The bed is loudest at the boundary; the signal
        // emerges as the pin settles onto a station.
        const proximity = Math.max(0, 1 - Math.abs(pos - nearest) * 2);
        emitScrub(speed, detent, proximity);
      }
      // Near the edge of the mounted page: slide the window over and
      // mount the next one. Absolute slot positions mean nothing jumps.
      const middle = cur - next / SLOT;
      const [from, to] = winRef.current;
      const size = to - from;
      if (middle < from + EDGE && from > 0) {
        const at = Math.max(0, from - PAGE);
        winRef.current = [at, at + size];
        setWin(winRef.current);
      } else if (middle > to - 1 - EDGE && to < n) {
        const at = Math.min(n - size, from + PAGE);
        winRef.current = [at, at + size];
        setWin(winRef.current);
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragging(false);
      suppressRef.current = moved;
      if (moved) onScrub?.({ dragging: false, speed: 0, proximity: 0 });
      if (!moved) {
        setDx(0);
        return;
      }
      const target = Math.min(
        Math.max(Math.round(cur - dxRef.current / SLOT), 0),
        n - 1,
      );
      if (target !== cur && stations[target]) {
        // Keep the offset until the switch lands, so the strip does not
        // wobble back to the old station first; the cur effect zeroes it.
        onPick(stations[target]);
        clearTimeout(settleRef.current);
        settleRef.current = setTimeout(() => setDx(0), 600);
      } else {
        setDx(0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // Minor marks: a dozen in every gap between stations (half that out at
  // the ends of the list), bottom-aligned on the tick baseline and all
  // shorter than a station's own mark.
  const marks = useMemo(() => {
    const [from, to] = win;
    if (to - from < 2) return [];
    const out = [];
    const gap = (a, key, count) => {
      for (let k = 1; k <= count; k++) {
        out.push({
          key: `${key}-${k}`,
          x: a + (SLOT * k) / (count + 1),
          h: 6 + Math.floor(jitter(a + k, k) % 11),
        });
      }
    };
    if (from === 0) gap(0, "west", 6);
    for (let j = from; j < to - 1; j++) gap(j * SLOT + SLOT / 2, `g${j}`, 12);
    if (to === n) gap((to - 1) * SLOT + SLOT / 2, "east", 6);
    return out;
  }, [win, n]);

  const cells = useMemo(() => {
    const [from, to] = win;
    const out = [];
    for (let j = from; j < to; j++) {
      const st = stations[j];
      if (!st) continue;
      const on = j === cur;
      out.push(
        <button
          key={st.uuid}
          type="button"
          onClick={() => {
            if (suppressRef.current) {
              suppressRef.current = false;
              return;
            }
            onPick(st);
          }}
          style={{
            position: "absolute",
            top: 0,
            left: j * SLOT,
            width: SLOT,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: NAME_W,
              font: "italic 600 11px/1.25 system-ui,-apple-system,'Segoe UI',sans-serif",
              color: on ? "rgba(255,255,255,.72)" : "rgba(255,255,255,.5)",
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {st.name}
          </span>
          <span
            style={{
              width: 1.5,
              height: TICK,
              background: on ? HOT : "rgba(255,255,255,.55)",
            }}
          />
        </button>,
      );
    }
    return out;
  }, [win, stations, cur, onPick]);

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "relative",
        height: 58,
        marginTop: 4,
        overflow: "hidden",
        maskImage: EDGE_FADE,
        WebkitMaskImage: EDGE_FADE,
        userSelect: "none",
        touchAction: "pan-y",
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          height: "100%",
          transform: `translateX(${-cur * SLOT - SLOT / 2 + dx}px)`,
          transition: dragging
            ? "none"
            : "transform .32s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        {marks.map((m) => (
          <span
            key={m.key}
            style={{
              position: "absolute",
              bottom: 0,
              left: m.x,
              width: 1.5,
              height: m.h,
              background: "rgba(255,255,255,.3)",
            }}
          />
        ))}
        {cells}
      </div>
      {/* The pushpin stays put; the ruler travels under it.
          Both parts share an 8px box centred on x=4, so the head and
          shaft stay on one axis (flex + a 1.5px shaft drifts on subpixels). */}
      <span
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: 8,
          height: 36,
          marginLeft: -4,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 1,
            top: 0,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 40% 35%, #ffd8cc, #ff6a45 62%, #cf4326)",
            boxShadow: "0 0 4px rgba(255,106,69,.55)",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 3,
            top: 6,
            width: 2,
            height: 30,
            background: "#ff8a63",
          }}
        />
      </span>
    </div>
  );
}
