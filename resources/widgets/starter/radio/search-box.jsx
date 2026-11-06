// Search field on the globe face. Same gestures as the reference site:
// "/" focuses it, the list waits 120ms, arrows move, Enter tunes the
// highlighted row (or the first), Escape clears. Results come only from
// the local catalog. Country rows stay at the top; stations arrive 40 at
// a time as the list scrolls.

import { useEffect, useRef, useState } from "@deskulpt-test/react";
import { ClearIcon, SearchIcon } from "./icons.jsx";
import { catalogForSearch } from "./stations.js";
import { compileStations, searchCompiled } from "./search.js";
import { flagOf } from "./format.js";

const DEBOUNCE_MS = 120;
const PAGE = 40;
const LOAD_NEAR = 80;
const EMPTY = { countries: [], stations: [] };

const SLIDE_MS = 180;

export function SearchBox({
  widgetId,
  hot,
  strings,
  language,
  httpsOnly,
  cacheOn,
  cacheEpoch,
  onPick,
  right = 12,
}) {
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const poolRef = useRef(null);
  const blurTimer = useRef(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState("loading");
  const [page, setPage] = useState(EMPTY);
  const [shown, setShown] = useState(PAGE);
  const [hi, setHi] = useState(-1);

  useEffect(() => {
    let alive = true;
    poolRef.current = null;
    setReady("loading");
    void catalogForSearch(httpsOnly).then((stations) => {
      if (!alive) return;
      if (Array.isArray(stations)) {
        poolRef.current = compileStations(stations);
        setReady("cache");
      } else {
        poolRef.current = null;
        setReady("none");
      }
    });
    return () => {
      alive = false;
    };
  }, [httpsOnly, cacheEpoch]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    const q = query.trim();
    if (!q || ready !== "cache" || !poolRef.current) {
      setPage(EMPTY);
      setShown(PAGE);
      setHi(-1);
      return;
    }
    const timer = setTimeout(() => {
      setPage(searchCompiled(poolRef.current, q, language));
      setShown(PAGE);
      setHi(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, ready, language]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    const list = listRef.current;
    const row = list?.children[hi];
    if (!list || !row || hi < 0) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [hi, shown]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const root = widgetId ? document.querySelector(`#${widgetId}`) : null;
      const over =
        root?.matches(":hover") || root?.contains(document.activeElement);
      if (!over) return;
      event.preventDefault();
      setExpanded(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [widgetId]);

  const close = (blur) => {
    window.clearTimeout(blurTimer.current);
    setQuery("");
    setOpen(false);
    setExpanded(false);
    setPage(EMPTY);
    setShown(PAGE);
    setHi(-1);
    if (blur) inputRef.current?.blur();
  };

  const choose = (hit) => {
    if (!hit?.station) return;
    onPick?.(hit.station, { force: true });
    close(true);
  };

  const visible = hot || expanded;

  const stationSlice = page.stations.slice(0, shown);
  const rows = [...page.countries, ...stationSlice];
  const more = shown < page.stations.length;
  const showList = open && query.trim().length > 0;
  const waiting = ready === "loading" || (ready === "none" && cacheOn);

  const revealMore = () => {
    setShown((count) =>
      count >= page.stations.length
        ? count
        : Math.min(page.stations.length, count + PAGE),
    );
  };

  const onListScroll = (event) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_NEAR) return;
    revealMore();
  };

  return (
    <div
      ref={boxRef}
      data-search="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: 10,
        right,
        zIndex: 6,
        width: expanded ? `min(280px, calc(100% - ${right + 12}px))` : 32,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `width ${SLIDE_MS}ms ease, opacity 160ms ease`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          borderRadius: 8,
          overflow: "hidden",
          background: expanded ? "rgba(6,8,14,0.92)" : "transparent",
          transition: `background ${SLIDE_MS}ms ease`,
        }}
      >
        <button
          type="button"
          aria-label={strings.searchOpen}
          title={strings.searchOpen}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (expanded) event.preventDefault();
          }}
          onClick={() => {
            window.clearTimeout(blurTimer.current);
            setExpanded(true);
            setOpen(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 32px",
            width: 32,
            height: 32,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.82)",
            cursor: "pointer",
          }}
        >
          <SearchIcon />
        </button>
        <input
          ref={inputRef}
          value={query}
          placeholder={strings.searchPhKey || strings.searchPh}
          aria-label={strings.searchPh}
          autoComplete="off"
          enterKeyHint="search"
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            window.clearTimeout(blurTimer.current);
            setOpen(true);
            setExpanded(true);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => {
              const next = document.activeElement;
              if (next === inputRef.current) return;
              if (boxRef.current?.contains(next)) return;
              close(false);
            }, 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (rows.length === 0) return;
              const step = event.key === "ArrowDown" ? 1 : -1;
              if (step > 0 && hi >= rows.length - 1 && more) {
                revealMore();
                setHi(rows.length);
                return;
              }
              setHi((cur) => (cur + step + rows.length) % rows.length);
              return;
            }
            if (event.key === "Enter" && rows.length > 0) {
              event.preventDefault();
              choose(rows[Math.max(0, hi)]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
            }
          }}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            height: 32,
            padding: expanded ? "0 10px 0 0" : 0,
            border: "none",
            background: "transparent",
            color: "#f2f3f5",
            font: "inherit",
            fontSize: 13,
            outline: "none",
            opacity: expanded ? 1 : 0,
            transition: `opacity ${SLIDE_MS}ms ease`,
          }}
        />
        {expanded && query && (
          <button
            type="button"
            aria-label={strings.searchClear}
            title={strings.searchClear}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              window.clearTimeout(blurTimer.current);
              setQuery("");
              setPage(EMPTY);
              setShown(PAGE);
              setHi(-1);
              setOpen(true);
              inputRef.current?.focus();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 28px",
              width: 28,
              height: 32,
              marginRight: 2,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
            }}
          >
            <ClearIcon />
          </button>
        )}
      </div>
      <style>
        {`[data-search-list]::-webkit-scrollbar{width:4px;height:4px}
[data-search-list]::-webkit-scrollbar-thumb{background:rgba(255,255,255,.35);border-radius:4px}
[data-search-list]::-webkit-scrollbar-track{background:transparent}`}
      </style>
      {showList && (
        <div
          ref={listRef}
          data-search-list="true"
          onScroll={onListScroll}
          style={{
            position: "absolute",
            right: 0,
            left: 0,
            top: "calc(100% + 6px)",
            maxHeight: 280,
            overflow: "auto",
            padding: 4,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(6,8,14,0.94)",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.35) transparent",
          }}
        >
          {rows.length === 0 ? (
            <div
              style={{
                padding: "8px 10px",
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
              }}
            >
              {waiting ? strings.caching : strings.noHit}
            </div>
          ) : (
            rows.map((hit, index) => {
              const flag = flagOf(hit.cc);
              const sub =
                hit.kind === "country"
                  ? strings.searchCountry.replace(
                      "{n}",
                      hit.count.toLocaleString("en-US"),
                    )
                  : hit.sub;
              return (
                <button
                  key={`${hit.kind}-${hit.station.uuid}-${index}`}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(hit);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "7px 8px",
                    border: "none",
                    borderRadius: 8,
                    background:
                      index === hi ? "rgba(255,255,255,0.08)" : "transparent",
                    color: "#f2f3f5",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: hit.color,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 13,
                      }}
                    >
                      {hit.label}
                    </span>
                    {sub && (
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 11,
                        }}
                      >
                        {flag ? `${flag} ${sub}` : sub}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
