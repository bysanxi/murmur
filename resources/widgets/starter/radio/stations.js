// The station catalog: Radio Browser (https://www.radio-browser.info/), a
// community-maintained directory of live streams. Mirrors are tried in a
// shuffled order, and the "playable" filter applies the same bar roamdial
// uses for its curated list — only streams that answered their last check,
// over HTTPS, in a codec browsers can decode. Nothing here talks to
// roamdial itself.
//
// Optional local catalog cache (widget sandbox via apis.fs): when enabled,
// a paginated pull stores the playable, located subset so the queue and
// globe pins can work without hitting the directory. Stream audio still
// needs the network — only the station list is offline.

import apis from "@deskulpt-test/apis";
import { repairCoords, resolveCoords } from "./geo-fallback.js";

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

// Safari/WKWebView cannot play Ogg, and AAC+ is unreliable there; MP3 and
// AAC are the codecs every Tauri webview decodes.
const PLAYABLE_CODECS = new Set(["MP3", "AAC"]);

const BATCH = 100;
// Online geo sample stays modest; the local catalog can feed the globe
// far more densely once it has been pulled down.
const GEO_LIMIT = 500;
// One country search when the local catalog is off. The cached globe
// itself is not capped.
const GEO_COUNTRY_LIMIT = 100000;
const PAGE = 1000;
const CACHE_PATH = "stations-cache.json";
const STATUS_PATH = "cache-status.json";
// Bump when the cached shape or inclusion rules change so an old file
// (e.g. geo-only, which skipped most Chinese stations) is pulled again.
const CACHE_VERSION = 5;
// Directory entries go stale as streams die; a week is long enough to be
// useful offline without clinging to dead URLs for months.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let preferCache = false;
let memoryCache = null;
let cachePromise = null;
let syncChain = Promise.resolve();
let statusChain = Promise.resolve();
let downloadToken = 0;

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function request(mirror, path) {
  const response = await fetch(mirror + path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function searchPath(filter, extra = {}) {
  const params = new URLSearchParams({
    limit: String(BATCH),
    order: "random",
    hidebroken: "true",
    lastcheckok: "1",
    // Coordinates are filled in normalize (real or province/country
    // fallback). Requiring has_geo_info here drops most Chinese stations
    // — the directory simply has no lat/lon for them.
    ...extra,
  });
  if (filter.country && filter.country !== "random") {
    params.set("countrycode", filter.country);
  }
  if (filter.httpsOnly !== false) params.set("https", "true");
  return `/json/stations/search?${params}`;
}

function normalize(raw, mirror) {
  const uuid = raw.stationuuid || "";
  const countryCode = String(raw.countrycode || "").toUpperCase();
  const region = raw.state || "";
  const coords = resolveCoords({
    uuid,
    countryCode,
    region,
    name: String(raw.name || "").trim(),
    lat: Number.isFinite(raw.geo_lat) ? raw.geo_lat : null,
    lon: Number.isFinite(raw.geo_long) ? raw.geo_long : null,
  });
  return {
    uuid,
    name: String(raw.name || "").trim(),
    url: raw.url_resolved || raw.url || "",
    country: raw.country || "",
    countryCode,
    region,
    lat: coords.lat,
    lon: coords.lon,
    geoApprox: coords.approx,
    // RoamDial prec: >= 3 stays put, below 3 may fan when the camera is close.
    prec: coords.prec,
    pop: Number(raw.clickcount) || 0,
    tags: String(raw.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 2),
    codec: String(raw.codec || "").toUpperCase(),
    bitrate: Number(raw.bitrate) || 0,
    mirror,
  };
}

function playable(station, httpsOnly) {
  if (!station.url || !station.uuid) return false;
  if (!PLAYABLE_CODECS.has(station.codec)) return false;
  if (httpsOnly !== false && !station.url.startsWith("https://")) return false;
  return true;
}

function located(station) {
  return station.lat !== null && station.lon !== null;
}

function matchesFilter(station, filter) {
  if (!playable(station, filter.httpsOnly)) return false;
  if (
    filter.country &&
    filter.country !== "random" &&
    station.countryCode !== filter.country
  ) {
    return false;
  }
  return true;
}

async function raceSearch(path, httpsOnly, locatedOnly) {
  // The mirrors race each other: the first one to answer wins, a down or
  // rate-limited mirror only costs its own attempt instead of delaying the
  // rest of the round.
  const attempts = shuffled(MIRRORS).map(async (mirror) => {
    const data = await request(mirror, path);
    if (!Array.isArray(data)) throw new Error("unexpected payload");
    const stations = data
      .map((raw) => normalize(raw, mirror))
      .filter(
        (station) =>
          playable(station, httpsOnly) && (!locatedOnly || located(station)),
      );
    if (stations.length === 0) throw new Error("no matching stations");
    return stations;
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

function isFresh(cache) {
  return (
    cache &&
    cache.version === CACHE_VERSION &&
    Array.isArray(cache.stations) &&
    cache.stations.length > 0 &&
    Number.isFinite(cache.fetchedAt) &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  );
}

function loadStationCache() {
  if (memoryCache) return Promise.resolve(memoryCache);
  if (!cachePromise) {
    cachePromise = apis.fs
      .readFile({ path: CACHE_PATH })
      .then((text) => {
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.stations)) return null;
        memoryCache = parsed;
        return parsed;
      })
      .catch(() => null);
  }
  return cachePromise;
}

function saveStationCache(cache) {
  memoryCache = cache;
  cachePromise = Promise.resolve(cache);
  syncChain = syncChain.then(() =>
    apis.fs
      .writeFile({ path: CACHE_PATH, content: JSON.stringify(cache) })
      .catch(() => {}),
  );
  return syncChain;
}

function writeCacheStatus(status) {
  const body = JSON.stringify({
    state: status.state,
    count: status.count || 0,
    fetchedAt: status.fetchedAt || null,
  });
  statusChain = statusChain.then(() =>
    apis.fs.writeFile({ path: STATUS_PATH, content: body }).catch(() => {}),
  );
}

/// Drop the on-disk catalog and the in-memory copy.
export async function clearStationCache() {
  downloadToken += 1;
  preferCache = false;
  memoryCache = null;
  cachePromise = Promise.resolve(null);
  writeCacheStatus({ state: "off", count: 0, fetchedAt: null });
  syncChain = syncChain.then(() =>
    apis.fs.removeFile({ path: CACHE_PATH }).catch(() => {}),
  );
  await syncChain;
}

async function filteredFromCache(
  filter,
  { locatedOnly = false, limit = 0, shuffle = true } = {},
) {
  if (!preferCache) return null;
  const cache = await loadStationCache();
  // A version bump still has the previous catalog; keep painting those
  // pins while the refresh runs instead of dropping to a handful.
  if (!cache?.stations?.length) return null;
  let list = cache.stations
    .map(repairCoords)
    .filter((station) => matchesFilter(station, filter));
  if (locatedOnly) list = list.filter(located);
  if (list.length === 0) return null;
  if (shuffle) list = shuffled(list);
  if (limit > 0 && list.length > limit) list = list.slice(0, limit);
  return list;
}

async function downloadPage(mirror, offset) {
  // Stable order so offset pages do not reshuffle under us the way
  // order=random would between requests.
  const params = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    order: "name",
    hidebroken: "true",
    lastcheckok: "1",
  });
  const data = await request(mirror, `/json/stations/search?${params}`);
  if (!Array.isArray(data)) throw new Error("unexpected payload");
  return data;
}

async function downloadCatalog(onProgress, token) {
  const mirrors = shuffled(MIRRORS);
  let mirror = mirrors[0];
  const byUuid = new Map();
  let offset = 0;

  for (;;) {
    if (token !== downloadToken) break;
    let page = null;
    let lastError = null;
    for (const candidate of mirrors) {
      try {
        // eslint-disable-next-line no-await-in-loop
        page = await downloadPage(candidate, offset);
        mirror = candidate;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!page) throw lastError || new Error("catalog download failed");
    if (page.length === 0) break;

    for (const raw of page) {
      const station = normalize(raw, mirror);
      // Cache keeps HTTP streams too; httpsOnly is applied when reading.
      // located() passes after province/country fallback fills coords.
      if (!playable(station, false) || !located(station)) continue;
      byUuid.set(station.uuid, station);
    }

    onProgress?.({ count: byUuid.size, offset: offset + page.length });
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  if (token !== downloadToken) return null;
  return {
    version: CACHE_VERSION,
    fetchedAt: Date.now(),
    stations: [...byUuid.values()],
  };
}

/// Turn the local catalog on or off. When enabled, a missing or stale
/// file is refreshed in the background (paginated). Turning it off
/// clears the file — that is also how the settings UI "clears cache".
export async function syncStationCache({
  enabled,
  force = false,
  onProgress,
} = {}) {
  if (!enabled) {
    await clearStationCache();
    return { status: "cleared", count: 0 };
  }

  preferCache = true;
  const existing = await loadStationCache();
  if (!force && isFresh(existing)) {
    writeCacheStatus({
      state: "ready",
      count: existing.stations.length,
      fetchedAt: existing.fetchedAt,
    });
    onProgress?.({ count: existing.stations.length, ready: true });
    return { status: "ready", count: existing.stations.length };
  }

  const token = ++downloadToken;
  const known = existing?.stations?.length || 0;
  writeCacheStatus({
    state: "downloading",
    count: known,
    fetchedAt: existing?.fetchedAt || null,
  });
  onProgress?.({ count: known, ready: false });
  try {
    const next = await downloadCatalog((progress) => {
      writeCacheStatus({
        state: "downloading",
        count: progress.count || 0,
        fetchedAt: existing?.fetchedAt || null,
      });
      onProgress?.(progress);
    }, token);
    if (!next || token !== downloadToken) {
      return { status: "aborted", count: 0 };
    }
    await saveStationCache(next);
    writeCacheStatus({
      state: "ready",
      count: next.stations.length,
      fetchedAt: next.fetchedAt,
    });
    onProgress?.({ count: next.stations.length, ready: true });
    return { status: "ready", count: next.stations.length };
  } catch {
    // Keep a still-usable stale file rather than going empty after a
    // failed refresh.
    if (existing?.stations?.length) {
      preferCache = true;
      writeCacheStatus({
        state: "stale",
        count: existing.stations.length,
        fetchedAt: existing.fetchedAt,
      });
      onProgress?.({
        count: existing.stations.length,
        ready: true,
        stale: true,
      });
      return { status: "stale", count: existing.stations.length };
    }
    preferCache = false;
    writeCacheStatus({ state: "error", count: 0, fetchedAt: null });
    onProgress?.({ count: 0, ready: false, error: true });
    return { status: "error", count: 0 };
  }
}

/// One random batch of playable stations, or null when no mirror answers.
export async function fetchStations(filter) {
  const cached = await filteredFromCache(filter, { limit: BATCH });
  if (cached) return cached;
  return raceSearch(searchPath(filter), filter.httpsOnly, false);
}

/// Located stations for the globe's pins. The local catalog is drawn in
/// full. With the cache off, the world falls back to a thin online sample;
/// a country filter asks for that country's list instead.
export async function fetchGeoStations(filter) {
  const cached = await filteredFromCache(filter, {
    locatedOnly: true,
    shuffle: false,
  });
  if (cached) return cached;
  const countryScoped = filter.country && filter.country !== "random";
  const path = searchPath(filter, {
    limit: String(countryScoped ? GEO_COUNTRY_LIMIT : GEO_LIMIT),
    // Prefer popular stations so the thinner world sample still lands
    // somewhere meaningful instead of pure alphabet noise.
    order: countryScoped ? "clickcount" : "random",
    reverse: countryScoped ? "true" : "false",
  });
  return raceSearch(path, filter.httpsOnly, true);
}

/// A station sampler that refills itself. A session never repeats a station
/// until every station it has heard has been played once, so a small
/// country filter still wanders before looping.
export function createQueue(filter) {
  let pending = [];
  let mirror = "";
  let signature = JSON.stringify(filter);
  const heard = new Set();

  function rekey(next) {
    const nextSignature = JSON.stringify(next);
    if (nextSignature === signature) return;
    signature = nextSignature;
    pending = [];
    mirror = "";
    heard.clear();
  }

  async function refill() {
    const batch = await fetchStations(filter);
    if (!batch || batch.length === 0) {
      pending = [];
      return false;
    }
    // Unheard stations first, so a refill after a long listen mostly brings
    // new ones even when the API returns some repeats.
    pending = batch.toSorted(
      (a, b) => Number(heard.has(a.uuid)) - Number(heard.has(b.uuid)),
    );
    mirror = batch[0].mirror;
    return true;
  }

  return {
    /// The next station, or null when nothing playable came back.
    async next(filterOverride) {
      if (filterOverride) {
        rekey(filterOverride);
        filter = filterOverride;
      }
      if (pending.length === 0 && !(await refill())) return null;
      // Unheard stations first; when a small country pool has nothing new
      // left, allow a repeat rather than stalling.
      let station = pending.shift();
      for (
        let tries = pending.length;
        station && heard.has(station.uuid) && tries > 0;
        tries--
      ) {
        pending.push(station);
        station = pending.shift();
      }
      if (!station) return null;
      heard.add(station.uuid);
      return { ...station, mirror: station.mirror || mirror };
    },
  };
}

/// Tell the community catalog this stream was actually played, so working
/// stations stay visible in its rankings. Fire and forget: the endpoint
/// answers with a redirect to the stream, which we never follow.
export function countListen(station) {
  if (!station?.uuid) return;
  const mirror = station.mirror || MIRRORS[0];
  fetch(`${mirror}/json/url/${encodeURIComponent(station.uuid)}`, {
    redirect: "manual",
  }).catch(() => {});
}
