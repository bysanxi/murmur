// Config normalization and display formatting for the radio card: the
// strings the card shows, the language of those strings, and the small
// converters that turn raw widget settings into safe values.

export const STRINGS = {
  "zh-CN": {
    tuning: "正在接通…",
    silent: "这会儿没有声音",
    blocked: "点一下开始",
    paused: "已暂停",
    play: "播放",
    pause: "暂停",
    next: "下一台",
    left: "向左换台",
    random: "随机选台",
    locked: "已锁定",
    nearest: "附近 · {d} px",
    nearby: "{n} stations nearby",
    caching: "正在缓存目录…",
    cached: "目录已缓存",
  },
  en: {
    tuning: "Tuning in…",
    silent: "Nothing playing right now",
    blocked: "Click to start",
    paused: "Paused",
    play: "Play",
    pause: "Pause",
    next: "Next station",
    left: "Slide left",
    random: "Random station",
    locked: "Locked",
    nearest: "Nearest · {d} px",
    nearby: "{n} stations nearby",
    caching: "Caching catalog…",
    cached: "Catalog cached",
  },
};

export const ELLIPSIS = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function readLanguage() {
  try {
    const saved = localStorage.getItem("deskulpt.language");
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch {
    // ignore
  }
  return "zh-CN";
}

export function subscribeLanguage(listener) {
  const onChange = () => listener();
  window.addEventListener("deskulpt:language-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("deskulpt:language-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function filterOf(config) {
  return {
    country: typeof config?.country === "string" ? config.country : "random",
    httpsOnly: config?.httpsOnly !== false,
  };
}

/// Local Radio Browser catalog cache: directory only, not the streams.
export function cacheCatalogOf(config) {
  return config?.cacheCatalog === true || config?.cacheCatalog === "true";
}

export function touchOf(config) {
  return config?.touch === "feed" ? "feed" : "off";
}

export function volumeOf(config) {
  const value = Number(config?.volume);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.6;
}

export function rotateMinutes(config) {
  const value = Number(config?.rotate);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(240, value);
}

export function modeOf(config) {
  return config?.showInfo === "text" || config?.showInfo === "hidden"
    ? config.showInfo
    : "card";
}

/// The globe face holds still unless drift is asked for; stations are
/// found by focusing the view, not by rotating past them.
export function spinOf(config) {
  return config?.spin === true || config?.spin === "true";
}

/// Limb crescent on land dots; off by default so station stars stay clear.
export function rimBoostOf(config) {
  return config?.rimBoost === true || config?.rimBoost === "true";
}

/// Soft blue wash over the globe face; off by default.
export function limbGlowOf(config) {
  return config?.limbGlow === true || config?.limbGlow === "true";
}

/// The line under the ON AIR dot when nothing is streaming yet.
export function statusTextOf(status, strings) {
  if (status === "connecting" || status === "tuning") return strings.tuning;
  if (status === "blocked") return strings.blocked;
  if (status === "paused") return strings.paused;
  if (status === "silent") return strings.silent;
  return "";
}

export function placeOf(station, geo) {
  if (!station) return "";
  const city = geo?.city;
  if (city && station.country) return `${city} · ${station.country}`;
  if (city) return city;
  const region =
    station.region && station.region !== city ? station.region : "";
  if (region && station.country) return `${region} · ${station.country}`;
  return station.country || "";
}

export function describe(station) {
  if (!station) return "";
  const parts = [];
  if (station.tags?.length > 0) parts.push(station.tags.join(" · "));
  if (station.codec) {
    parts.push(
      station.bitrate > 0
        ? `${station.codec} ${station.bitrate}`
        : station.codec,
    );
  }
  return parts.join(" · ");
}

/// Uppercase status bits after "Locked" on the globe reticle —
/// genre first, then bitrate when the station reports one.
export function lockMetaOf(station, strings) {
  const parts = [];
  const tag = station?.tags?.[0];
  if (tag) parts.push(tag);
  if (station?.bitrate > 0) parts.push(`${station.bitrate} KBPS`);
  const rest = parts.join(" · ");
  return rest ? `${strings.locked} · ${rest}` : strings.locked;
}

/// Soft aim line while a station is near the sight but not yet locked.
export function nearestMetaOf(dist, strings) {
  const template = strings.nearest || "Nearest · {d} px";
  return template.replace("{d}", String(Math.round(dist)));
}

/// "39.9° N · 116.4° E" for the globe's coordinate readout, or ""
/// when the station carries no coordinates.
export function coordOf(station) {
  if (!Number.isFinite(station?.lat) || !Number.isFinite(station?.lon)) {
    return "";
  }
  const lat = `${Math.abs(station.lat).toFixed(1)}° ${station.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(station.lon).toFixed(1)}° ${station.lon >= 0 ? "E" : "W"}`;
  return `${lat} · ${lon}`;
}
