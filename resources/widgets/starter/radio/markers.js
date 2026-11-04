// The globe's pin set: every station the catalog will locate for the
// current filter, fetched only while the big face is on screen. A country
// or HTTPS change reshapes the set; a failure leaves the globe without
// pins rather than without a radio.
//
// When the local catalog is enabled, wait for cacheEpoch to advance so
// the first pin load already reads the sandbox file — otherwise a racing
// online sample of a few hundred sticks on the globe until remount.

import { useEffect, useRef, useState } from "@deskulpt-test/react";
import { cacheCatalogOf, filterOf } from "./format.js";
import { fetchGeoStations } from "./stations.js";

export function useStationMarkers(big, config, cacheEpoch = 0) {
  const [markers, setMarkers] = useState([]);
  const configRef = useRef(config);
  configRef.current = config;
  const filterKey = `${config?.country ?? ""}|${config?.httpsOnly !== false}`;
  const caching = cacheCatalogOf(config);
  useEffect(() => {
    if (!big) return;
    // Epoch 0 means syncStationCache has not reported yet; keep the
    // previous pins (or none) rather than painting a thin API sample.
    if (caching && cacheEpoch === 0) return;
    let alive = true;
    void fetchGeoStations(filterOf(configRef.current)).then((list) => {
      if (alive && list) setMarkers(list);
    });
    return () => {
      alive = false;
    };
  }, [big, filterKey, cacheEpoch, caching]);
  return markers;
}
