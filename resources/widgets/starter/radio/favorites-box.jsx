// Favorites list in the top-right corner. The list icon opens the saved
// stations; the panel only shows that list — the star in the tuner row is
// the switch that saves or removes the station on air. Picking a row
// tunes it, the ✕ removes it.

import { useEffect, useRef } from "@deskulpt-test/react";
import { genreColorOf } from "./genre-color.js";
import { ClearIcon, ListIcon } from "./icons.jsx";
import { ELLIPSIS, flagOf } from "./format.js";
import { usePresence } from "./presence.js";
import { favoriteFits } from "./state.js";

const EDGE = 12;
// Matches the tuner's wide breakpoint: below it the sheet fills the
// width, above it the sheet stops at the widest narrow-screen size.
const WIDE_AT = 520;
const NARROW_MAX = WIDE_AT - EDGE * 2;
const FADE_MS = 160;
// Long enough for the curve to read, short enough that the list still
// feels attached to the icon. Exit is a little quicker than enter.
export const FAVORITES_ENTER_MS = 380;
export const FAVORITES_EXIT_MS = 260;
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 0.2, 1)";
export const FAVORITES_EASE_OUT = EASE_OUT;
export const FAVORITES_EASE_IN = EASE_IN;
const MUTED = "rgba(255,255,255,0.5)";

const ROW = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minWidth: 0,
  padding: "7px 8px",
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "#f2f3f5",
  textAlign: "left",
  cursor: "pointer",
};

const SUBTITLE = {
  display: "block",
  color: MUTED,
  fontSize: 11,
  ...ELLIPSIS,
};

const NAME = {
  display: "block",
  fontSize: 13,
  ...ELLIPSIS,
};

const PANEL = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  boxSizing: "border-box",
};

// Glass lives on an inner layer. Fading opacity on the same node as
// backdrop-filter makes the panel pop in and out instead of dissolving.
const SURFACE = {
  padding: 6,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(8,10,17,0.86)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.42)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

// Unfolds down from the icon: a short drop plus a scale from the corner,
// both on a long ease-out so the last part of the move settles instead of
// stopping. Closing uses the same properties in reverse.
function panelMotion(shown) {
  const ms = shown ? FAVORITES_ENTER_MS : FAVORITES_EXIT_MS;
  const ease = shown ? EASE_OUT : EASE_IN;
  return {
    opacity: shown ? 1 : 0,
    transform: shown
      ? "translate3d(0, 0, 0) scale(1)"
      : "translate3d(0, -14px, 0) scale(0.94)",
    pointerEvents: shown ? "auto" : "none",
    transition: `opacity ${ms}ms ${ease}, transform ${ms}ms ${ease}`,
  };
}

const HEAD = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "4px 8px 7px",
  color: "rgba(255,255,255,0.55)",
  fontSize: 11,
  letterSpacing: "0.04em",
};

const LIST = {
  maxHeight: 232,
  overflow: "auto",
  scrollbarWidth: "thin",
  scrollbarColor: "rgba(255,255,255,0.35) transparent",
};

const REMOVE = {
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
};

const channel = (value) => Math.round(value * 255);

function dotColor(station) {
  const [r, g, b] = genreColorOf(station, 1);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

function placeOf(station) {
  return [station?.region, station?.country].filter(Boolean).join(" · ");
}

export function FavoritesBox({
  strings,
  station,
  favorites,
  httpsOnly,
  hot,
  width,
  open,
  onOpenChange,
  onPick,
  onRemoveFavorite,
}) {
  const rootRef = useRef(null);
  const panel = usePresence(open, FAVORITES_EXIT_MS);

  // Any click outside the icon and its panel closes it; the mask in the
  // globe view covers everything else, so this also closes on a tap there.
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      onOpenChange?.(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const list = Array.isArray(favorites) ? favorites : [];
  const visible = hot || open;
  const viewport = Number.isFinite(width) ? width : 480;
  const panelWidth = Math.min(Math.max(viewport - EDGE * 2, 0), NARROW_MAX);
  const countText = (strings.favoritesCount || "{n}").replace(
    "{n}",
    String(list.length),
  );

  return (
    <div
      ref={rootRef}
      data-favorites="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: 10,
        right: 12,
        zIndex: 7,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <button
        type="button"
        aria-label={strings.favorites}
        title={strings.favorites}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          if (next && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          onOpenChange?.(next);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          padding: 0,
          border: "none",
          borderRadius: 8,
          background: open ? "rgba(6,8,14,0.92)" : "transparent",
          color: "rgba(255,255,255,0.82)",
          cursor: "pointer",
          transition: `background ${FADE_MS}ms ease`,
        }}
      >
        <ListIcon size={16} />
      </button>
      {panel.mounted && (
        <div
          style={{
            ...PANEL,
            width: panelWidth,
            transformOrigin: "top right",
            ...panelMotion(panel.shown),
          }}
        >
          <div style={SURFACE}>
            <div style={HEAD}>
              <span>{strings.favorites}</span>
              <span>{countText}</span>
            </div>
            {list.length === 0 ? (
              <div
                style={{
                  padding: "8px 10px",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                }}
              >
                {strings.favoritesEmpty}
              </div>
            ) : (
              <>
                <style>
                  {`[data-favorites-list]::-webkit-scrollbar{width:4px;height:4px}
  [data-favorites-list]::-webkit-scrollbar-thumb{background:rgba(255,255,255,.35);border-radius:4px}
  [data-favorites-list]::-webkit-scrollbar-track{background:transparent}`}
                </style>
                <div data-favorites-list="true" style={LIST}>
                  {list.map((item) => {
                    const playable = favoriteFits(item, { httpsOnly });
                    const onAir = item.uuid === station?.uuid;
                    const place = placeOf(item);
                    const flag = flagOf(item.countryCode);
                    return (
                      <div
                        key={item.uuid}
                        style={{ display: "flex", alignItems: "center" }}
                      >
                        <button
                          type="button"
                          disabled={!playable}
                          title={
                            playable ? item.name : strings.favoriteNeedsHttps
                          }
                          onClick={() => {
                            onPick?.(item, { force: true });
                            onOpenChange?.(false);
                          }}
                          style={{
                            ...ROW,
                            flex: "1 1 auto",
                            background: onAir
                              ? "rgba(255,255,255,0.06)"
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
                              background: dotColor(item),
                            }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={NAME}>{item.name}</span>
                            {place && (
                              <span style={SUBTITLE}>
                                {flag ? `${flag} ${place}` : place}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={strings.favoriteRemove}
                          title={strings.favoriteRemove}
                          onClick={() => onRemoveFavorite?.(item.uuid)}
                          style={REMOVE}
                        >
                          <ClearIcon size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
