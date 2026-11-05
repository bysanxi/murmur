// The globe's pin set: every station the catalog will locate for the
// current filter, fetched only while the big face is on screen. A country
// or HTTPS change reshapes the set; a failure leaves the globe without
// pins rather than without a radio.
//
// cacheEpoch still retriggers after a catalog refresh so new city
// coords replace the previous pin set.

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
