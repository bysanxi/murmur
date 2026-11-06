// One sheet for finding a station. Search and favorites are the same
// field and the same list; the tab only changes which set the query runs on.
// The sheet is a single translucent surface — no second dimmer behind it.

import { useEffect, useRef, useState } from "@deskulpt-test/react";
import { ClearIcon, SearchIcon } from "./icons.jsx";
import { flagOf } from "./format.js";
import { genreColorOf } from "./genre-color.js";
import { favoriteFits } from "./state.js";
import { catalogForSearch } from "./stations.js";
import { compileStations, searchCompiled } from "./search.js";

const EDGE = 12;
const WIDE_AT = 520;
const SHEET_MAX = WIDE_AT - EDGE * 2;
const STATUS_GAP = 12;
const DEBOUNCE_MS = 120;
const PAGE = 40;
const LOAD_NEAR = 80;
const EMPTY = { countries: [], stations: [] };

function sheetWidth(viewport) {
  const width = Number.isFinite(viewport) ? viewport : 480;
  return Math.min(Math.max(width - EDGE * 2, 0), SHEET_MAX);
}

function widgetOf(node) {
  let el = node?.parentElement;
  while (el) {
    if (el.querySelector?.("[data-station-face], [data-station-status]")) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function dotOf(station) {
  const [r, g, b] = genreColorOf(station, 1);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

function placeOf(station) {
  return [station?.region, station?.country].filter(Boolean).join(" · ");
}

function favoriteRows(favorites, query) {
  const q = query.trim().toLowerCase();
  const list = Array.isArray(favorites) ? favorites : [];
  const matched = !q
    ? list
    : list.filter((item) => {
        const hay = [item?.name, item?.region, item?.country, item?.countryCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  return matched.map((station) => ({
    kind: "station",
    station,
    label: station?.name || "",
    sub: placeOf(station),
    color: dotOf(station),
    cc: station?.countryCode || "",
  }));
}

const FIELD = {
  display: "flex",
  alignItems: "center",
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
};

const ROW = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minWidth: 0,
  padding: "7px 8px",
  border: "none",
  borderRadius: 8,
  color: "#f2f3f5",
  textAlign: "left",
  cursor: "pointer",
};

export function LibrarySheet({
  widgetId,
  hot,
  width,
  showGlobe = true,
  strings,
  language,
  httpsOnly,
  cacheOn,
  cacheEpoch,
  station,
  favorites,
  onPick,
  onRemoveFavorite,
}) {
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const poolRef = useRef(null);
  const [mode, setMode] = useState(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState("loading");
  const [page, setPage] = useState(EMPTY);
  const [shown, setShown] = useState(PAGE);
  const [hi, setHi] = useState(-1);
  const [hover, setHover] = useState(-1);
  const [maxHeight, setMaxHeight] = useState(null);

  const open = mode != null;
  const span = sheetWidth(width);

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
    if (mode !== "search") return;
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
  }, [mode, query, ready, language]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setMode(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMode(null);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      setMode("search");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [widgetId]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const panel = panelRef.current;
      const host = widgetOf(panel);
      if (!panel || !host) return;
      const status = host.querySelector("[data-station-status]");
      const face = host.querySelector("[data-station-face]");
      const top = panel.getBoundingClientRect().top;
      let limit = null;
      if (!showGlobe && face) limit = face.getBoundingClientRect().bottom;
      else if (status) limit = status.getBoundingClientRect().top - STATUS_GAP;
      setMaxHeight(
        limit == null ? 420 : Math.max(180, Math.round(limit - top)),
      );
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const host = widgetOf(panelRef.current);
    const ro = new ResizeObserver(measure);
    if (host) ro.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [open, showGlobe, width]);

  const favoriteList = favoriteRows(favorites, query);
  const catalogRows =
    mode === "search" && query.trim()
      ? [...page.countries, ...page.stations.slice(0, shown)]
      : [];
  const rows = mode === "favorites" ? favoriteList : catalogRows;
  const more =
    mode === "search" &&
    shown < page.stations.length &&
    query.trim().length > 0;
  const waiting =
    mode === "search" &&
    query.trim() &&
    (ready === "loading" || (ready === "none" && cacheOn));

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector("[data-active='true']");
    row?.scrollIntoView({ block: "nearest" });
  }, [station?.uuid, mode, rows.length]);

  const revealMore = () => {
    setShown((count) =>
      count >= page.stations.length
        ? count
        : Math.min(page.stations.length, count + PAGE),
    );
  };

  const pick = (hit) => {
    if (!hit?.station) return;
    if (mode === "favorites" && !favoriteFits(hit.station, { httpsOnly })) {
      return;
    }
    onPick?.(hit.station, { force: true });
  };

  const onListKey = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      if (step > 0 && hi >= rows.length - 1 && more) {
        revealMore();
        setHi(rows.length);
        return;
      }
      setHi((cur) => {
        const next = cur < 0 ? (step > 0 ? 0 : rows.length - 1) : cur + step;
        return (next + rows.length) % rows.length;
      });
      return;
    }
    if (event.key === "Enter" && rows.length > 0) {
      event.preventDefault();
      pick(rows[Math.max(0, hi)]);
    }
  };

  const openMode = (next) => {
    setHi(-1);
    setMode((cur) => (cur ? null : next));
  };

  const visible = hot || open;
  const placeholder =
    mode === "favorites" ? strings.favoriteSearch : strings.searchPh;

  let empty = null;
  if (mode === "search" && !query.trim()) empty = strings.searchPh;
  else if (waiting) empty = strings.caching;
  else if (mode === "search" && query.trim() && rows.length === 0) {
    empty = strings.noHit;
  } else if (mode === "favorites" && !favorites?.length) {
    empty = strings.favoritesEmpty;
  } else if (mode === "favorites" && rows.length === 0) empty = strings.noHit;

  return (
    <div
      ref={rootRef}
      data-search="true"
      data-favorites="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        // Clear the window's 20px corner handle so that corner can still resize.
        top: 20,
        right: 20,
        zIndex: 7,
        width: open ? span : "auto",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <IconButton
          label={strings.searchOpen}
          pressed={open}
          onClick={() => openMode("search")}
        >
          <SearchIcon size={16} />
        </IconButton>
      </div>
      {open && (
        <div
          ref={panelRef}
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxHeight: maxHeight ?? undefined,
            minHeight: 0,
            marginTop: 6,
            boxSizing: "border-box",
            padding: 6,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(8,10,17,0.72)",
          }}
        >
          <div
            role="tablist"
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 6,
              padding: 2,
              borderRadius: 10,
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <Tab
              label={strings.searchOpen}
              selected={mode === "search"}
              onClick={() => setMode("search")}
            />
            <Tab
              label={strings.favorites}
              selected={mode === "favorites"}
              onClick={() => setMode("favorites")}
            />
          </div>
          <div style={FIELD}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              <SearchIcon size={15} />
            </span>
            <input
              ref={inputRef}
              value={query}
              placeholder={placeholder}
              aria-label={placeholder}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => {
                setQuery(event.target.value);
                setHi(-1);
              }}
              onKeyDown={onListKey}
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                height: 32,
                padding: "0 8px 0 0",
                border: "none",
                background: "transparent",
                color: "#f2f3f5",
                font: "inherit",
                fontSize: 13,
                outline: "none",
              }}
            />
            {query && (
              <button
                type="button"
                aria-label={strings.searchClear}
                title={strings.searchClear}
                onClick={() => {
                  setQuery("");
                  setHi(-1);
                  inputRef.current?.focus();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
          <div
            ref={listRef}
            onScroll={(event) => {
              if (!more) return;
              const el = event.currentTarget;
              if (
                el.scrollHeight - el.scrollTop - el.clientHeight >
                LOAD_NEAR
              ) {
                return;
              }
              revealMore();
            }}
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              marginTop: 6,
              overflow: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.35) transparent",
            }}
          >
            {empty ? (
              <div
                style={{
                  padding: "8px 10px",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                }}
              >
                {empty}
              </div>
            ) : (
              rows.map((hit, index) => {
                const onAir = hit.station?.uuid === station?.uuid;
                const playable =
                  mode !== "favorites" ||
                  favoriteFits(hit.station, { httpsOnly });
                const sub =
                  hit.kind === "country"
                    ? strings.searchCountry.replace(
                        "{n}",
                        hit.count.toLocaleString("en-US"),
                      )
                    : hit.sub;
                const flag = flagOf(hit.cc);
                return (
                  <div
                    key={`${hit.kind}-${hit.station?.uuid}-${index}`}
                    data-active={onAir ? "true" : undefined}
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover(-1)}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <button
                      type="button"
                      disabled={!playable}
                      onClick={() => pick(hit)}
                      style={{
                        ...ROW,
                        flex: "1 1 auto",
                        background:
                          index === hi || index === hover || onAir
                            ? "rgba(255,255,255,0.1)"
                            : "transparent",
                        opacity: playable ? 1 : 0.4,
                        cursor: playable ? "pointer" : "default",
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
                    {mode === "favorites" && (
                      <button
                        type="button"
                        aria-label={strings.favoriteRemove}
                        title={strings.favoriteRemove}
                        onClick={() => onRemoveFavorite?.(hit.station?.uuid)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 26px",
                          width: 26,
                          height: 30,
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          color: "rgba(255,255,255,0.42)",
                          cursor: "pointer",
                        }}
                      >
                        <ClearIcon size={12} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, pressed, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        padding: 0,
        borderRadius: 8,
        border: pressed ? "1px solid rgba(255,255,255,0.18)" : "none",
        background: "transparent",
        color: "rgba(255,255,255,0.82)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Tab({ label, selected, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      style={{
        flex: "1 1 0",
        height: 28,
        border: "none",
        borderRadius: 8,
        background: selected ? "rgba(255,255,255,0.12)" : "transparent",
        color: selected ? "#f2f3f5" : "rgba(255,255,255,0.55)",
        font: "inherit",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
