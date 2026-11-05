// Runtime memory for the radio, separate from widget settings and from
// the catalog / geocode caches. Settings stay in the widget config.
// New records are added as fields on this one file; unknown keys are
// kept so a newer build can read what an older one already stored.

import apis from "@deskulpt-test/apis";

const PATH = "state.json";
const VERSION = 1;

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
        memory =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? { ...blank(), ...parsed, version: VERSION }
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

/// The station that actually started playing, not one the sight only passed.
export function rememberStation(station) {
  if (!station?.uuid || !station?.url) return Promise.resolve();
  return patchRadioState({
    lastStation: {
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
    },
  });
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
