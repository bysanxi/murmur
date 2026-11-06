// Runtime memory for the radio, separate from widget settings and from
// the catalog / geocode caches. Settings stay in the widget config.
// New records are added as fields on this one file; unknown keys are
// kept so a newer build can read what an older one already stored.

import apis from "@deskulpt-test/apis";

const PATH = "state.json";
const VERSION = 1;
const FAVORITE_LIMIT = 100;

let memory = null;
let loadPromise = null;
let saveChain = Promise.resolve();

function blank() {
  return { version: VERSION };
}

/// Read the state file once. A missing or broken file is an empty state.
export function loadRadioState() {
  if (memory) return Promise.resolve(memory);
  if (!loadPromise) {
    loadPromise = apis.fs
      .readFile({ path: PATH })
      .then((text) => {
        const parsed = JSON.parse(text);
        const favorites =
          parsed && Array.isArray(parsed.favorites)
            ? parsed.favorites.filter(
                (item) =>
                  item &&
                  typeof item === "object" &&
                  typeof item.uuid === "string" &&
                  item.uuid &&
                  typeof item.url === "string" &&
                  item.url,
              )
            : [];
        memory =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { ...blank(), ...parsed, favorites, version: VERSION }
            : blank();
        return memory;
      })
      .catch(() => {
        memory = blank();
        return memory;
      });
  }
  return loadPromise;
}

/// Merge `partial` into the current state and write the whole file.
/// Writes are queued so two updates cannot overwrite each other.
export function patchRadioState(partial) {
  return loadRadioState().then((state) => {
    memory = { ...state, ...partial, version: VERSION };
    const snapshot = JSON.stringify(memory);
    saveChain = saveChain.then(() =>
      apis.fs.writeFile({ path: PATH, content: snapshot }).catch(() => {}),
    );
    return saveChain.then(() => memory);
  });
}

/// The station fields worth keeping on disk. Both the last station and the
/// favorites use this one shape so a newer build keeps reading older saves.
function stationRecord(station) {
  if (!station?.uuid || !station?.url) return null;
  return {
    uuid: station.uuid,
    name: station.name || "",
    url: station.url,
    country: station.country || "",
    countryCode: station.countryCode || "",
    region: station.region || "",
    lat: Number.isFinite(station.lat) ? station.lat : null,
    lon: Number.isFinite(station.lon) ? station.lon : null,
    geoApprox: Boolean(station.geoApprox),
    prec: Number.isFinite(station.prec) ? station.prec : undefined,
    pop: station.pop || 0,
    tags: Array.isArray(station.tags) ? station.tags.slice(0, 2) : [],
    codec: station.codec || "",
    bitrate: station.bitrate || 0,
    mirror: station.mirror || "",
  };
}

/// The station that actually started playing, not one the sight only passed.
export function rememberStation(station) {
  const record = stationRecord(station);
  if (!record) return Promise.resolve();
  return patchRadioState({ lastStation: record });
}

export function isFavorite(favorites, uuid) {
  if (!uuid || !Array.isArray(favorites)) return false;
  return favorites.some((item) => item?.uuid === uuid);
}

/// Add or remove one station. A new favorite goes to the front, and the
/// list is capped so the whole-file rewrite stays small.
export function toggleFavorite(station, favorite) {
  return loadRadioState().then((state) => {
    const list = Array.isArray(state.favorites) ? state.favorites : [];
    const uuid = station?.uuid;
    if (!uuid) return list;
    let next;
    if (favorite) {
      const record = stationRecord(station);
      if (!record) return list;
      next = [
        { ...record, savedAt: Date.now() },
        ...list.filter((item) => item?.uuid !== uuid),
      ].slice(0, FAVORITE_LIMIT);
    } else {
      next = list.filter((item) => item?.uuid !== uuid);
    }
    return patchRadioState({ favorites: next }).then(() => next);
  });
}

export function removeFavorite(uuid) {
  return toggleFavorite({ uuid }, false);
}

/// A saved stream may still be played explicitly when the HTTPS filter is
/// off; with it on, only HTTPS streams are allowed.
export function favoriteFits(station, filter) {
  if (!station?.uuid || !station?.url) return false;
  return (
    filter?.httpsOnly === false || String(station.url).startsWith("https://")
  );
}

/// Whether a saved station may open under the current country / HTTPS filter.
export function lastStationFits(station, filter) {
  if (!station?.uuid || !station?.url) return false;
  if (
    filter?.httpsOnly !== false &&
    !String(station.url).startsWith("https://")
  ) {
    return false;
  }
  if (
    filter?.country &&
    filter.country !== "random" &&
    station.countryCode !== filter.country
  ) {
    return false;
  }
  return true;
}
