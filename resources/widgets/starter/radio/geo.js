// Geographic context for a station: GeoNames (https://www.geonames.org/)
// supplies the nearest place name and the timezone behind "local 14:25",
// which Radio Browser does not carry. The free web services need an
// account — 1000 credits a day, one credit per call, two calls per new
// station — so results are cached in the widget's own sandbox and a
// station is looked up once, ever. Every failure degrades silently: the
// card falls back to the country and region Radio Browser already has.
//
// GeoNames serves the free tier over HTTPS only on `secure.geonames.org`:
// `api.geonames.org` presents that same certificate but its hostname is
// not in the SAN list, so it fails TLS validation.

import apis from "@deskulpt-test/apis";

const USERNAME = "niufuren";
const API = "https://secure.geonames.org";
const CACHE_PATH = "geo-cache.json";
// A long trip stays under a few hundred stations; cap the cache so it
// cannot grow without bound if someone leaves the radio on for months.
const CACHE_MAX = 600;

let cachePromise = null;
let saveChain = Promise.resolve();

function loadCache() {
  if (!cachePromise) {
    cachePromise = apis.fs
      .readFile({ path: CACHE_PATH })
      .then((text) => {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
      })
      .catch(() => ({}));
  }
  return cachePromise;
}

function saveCache(cache) {
  // One writer at a time, newest state wins; a failed write only costs a
  // re-lookup later.
  const entries = Object.entries(cache).slice(-CACHE_MAX);
  const trimmed = Object.fromEntries(entries);
  saveChain = saveChain.then(() =>
    apis.fs
      .writeFile({ path: CACHE_PATH, content: JSON.stringify(trimmed) })
      .catch(() => {}),
  );
}

async function geonames(path, params) {
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("username", USERNAME);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  // GeoNames reports errors as 200 responses shaped { status: {...} }.
  if (data?.status) return null;
  return data;
}

function hasCoords(station) {
  return Number.isFinite(station?.lat) && Number.isFinite(station?.lon);
}

function entryOf(place, zone) {
  // findNearbyJSON answers with a list; the nearest place is its first.
  const nearby = place?.geonames?.[0];
  return {
    city: nearby?.toponymName || "",
    // IANA id so the card can render local time across DST without more
    // API calls.
    tz: zone?.timezoneId || "",
  };
}

/// Resolve the nearest place and timezone for a station, or null when
/// GeoNames cannot help (no coordinates, account not active, offline).
export async function lookupGeo(station) {
  // Approximate province/country pins are only for the globe; do not burn
  // GeoNames credits resolving a jittered centroid into a fake city name.
  if (!station?.uuid || !hasCoords(station) || station.geoApprox) return null;
  const cache = await loadCache();
  if (Object.hasOwn(cache, station.uuid)) {
    const hit = cache[station.uuid];
    return hit && (hit.city || hit.tz) ? hit : null;
  }
  const coords = { lat: station.lat, lng: station.lon };
  let place = null;
  let zone = null;
  try {
    [place, zone] = await Promise.all([
      // Only populated places read as a city on the card — the bare
      // nearest feature can be a hill or a bay.
      geonames("findNearbyJSON", { ...coords, maxRows: 1, featureClass: "P" }),
      geonames("timezoneJSON", coords),
    ]);
  } catch {
    return null;
  }
  const entry = entryOf(place, zone);
  // Only cache successes; a failed lookup (account pending, offline) is
  // worth retrying on the next visit.
  if (!entry.city && !entry.tz) return null;
  cache[station.uuid] = entry;
  await saveCache(cache);
  return entry;
}

/// The station's local clock, rendered from its IANA timezone. Keeps DST
/// correct without touching the network again.
export function localTimeOf(tz, now = new Date()) {
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return "";
  }
}
