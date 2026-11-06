import { useEffect, useRef, useState } from "@deskulpt-test/react";
import { countListen, createQueue, syncStationCache } from "./stations.js";
import {
  isFavorite,
  lastStationFits,
  loadRadioState,
  rememberStation,
  removeFavorite,
  toggleFavorite,
} from "./state.js";
import { localTimeOf, lookupGeo } from "./geo.js";
import { createPlayer } from "./player.js";
import { GlobeView } from "./globe-view.jsx";
import { CompactView } from "./compact-view.jsx";
import { useStationMarkers } from "./markers.js";
import {
  STRINGS,
  cacheCatalogOf,
  cacheNoteOf,
  cacheRefreshOf,
  coordOf,
  describe,
  filterOf,
  limbGlowOf,
  modeOf,
  placeOf,
  readLanguage,
  rimBoostOf,
  rotateMinutes,
  spinOf,
  statusTextOf,
  subscribeLanguage,
  touchOf,
  tuningNoiseLevelOf,
  tuningNoiseOf,
  volumeOf,
} from "./format.js";

// One live station on the desktop. The catalog and the streams come from
// Radio Browser (https://www.radio-browser.info/), the community directory;
// the place name and local time come from GeoNames (https://www.geonames.org/).
// A dead stream just moves the radio along to the next station.
//
// Two faces: a large frame renders the dot globe with the tuner strip,
// anything smaller falls back to the compact card.

const MAX_SKIP = 6;
const FEED_SIZE = 6;
// Below this the widget is too cramped for the globe face.
const GLOBE_MIN_WIDTH = 460;
const GLOBE_MIN_HEIGHT = 340;
// Below this the now-playing copy goes; only the ruler and buttons remain.
const META_MIN_HEIGHT = 200;
// The wallpaper hook and the native pointer event both see one physical
// click when the canvas is interactive; a tap inside this window counts
// once.
const TAP_DEDUP_MS = 80;

function Radio({ config, id, width, height }) {
  const [language, setLanguage] = useState(readLanguage);
  const [station, setStation] = useState(null);
  const [geo, setGeo] = useState(null);
  const [status, setStatus] = useState("tuning");
  const [now, setNow] = useState(() => new Date());
  const [upcoming, setUpcoming] = useState([]);
  const [cacheNote, setCacheNote] = useState("");
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const [favorites, setFavorites] = useState([]);
  const playerRef = useRef(null);
  const queueRef = useRef(null);
  const feedRef = useRef([]);
  const stationRef = useRef(null);
  const skipRef = useRef(0);
  const lastTapRef = useRef(0);
  const refreshHandledRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;
  // Switching is a promise, so a fresh definition each render still has to
  // be reachable from handlers created once; they hold the latest copy.
  const playNextRef = useRef(async () => {});
  const playPickRef = useRef(async () => {});
  const handleTapRef = useRef(() => {});
  // Globe and ruler talk to the player through stable refs, never state.
  const sightRef = useRef(null);
  const scrubRef = useRef(null);
  const wakeRef = useRef(null);
  if (!sightRef.current) {
    sightRef.current = (info) => playerRef.current?.sight(info);
    scrubRef.current = (info) => playerRef.current?.scrub(info);
    wakeRef.current = () => playerRef.current?.wake();
  }

  const mode = modeOf(config);
  const card = mode === "card";
  const showGlobe =
    card && width >= GLOBE_MIN_WIDTH && height >= GLOBE_MIN_HEIGHT;
  const showMeta = showGlobe || height >= META_MIN_HEIGHT;
  const markers = useStationMarkers(card, config, cacheEpoch);

  useEffect(() => subscribeLanguage(() => setLanguage(readLanguage())), []);

  // Stations waiting in the tuner strip. Refilled a batch at a time so the
  // strip has names to show before anyone asks for the next one.
  async function fillFeed() {
    const queue = queueRef.current;
    if (!queue) return;
    while (feedRef.current.length < FEED_SIZE) {
      // The queue shifts its pending list as it goes, so the calls have to
      // take turns. A country change swaps the queue under us; stop then.
      // eslint-disable-next-line no-await-in-loop
      const next = await queue.next(filterOf(configRef.current));
      if (!next || queueRef.current !== queue) break;
      feedRef.current.push(next);
    }
  }

  playNextRef.current = async () => {
    const player = playerRef.current;
    const queue = queueRef.current;
    if (!queue || !player) return;
    setStatus("tuning");
    await fillFeed();
    const next = feedRef.current.shift();
    setUpcoming(feedRef.current.slice(0, FEED_SIZE));
    if (!next) {
      player.stop();
      setStatus("silent");
      return;
    }
    // The component may have unmounted while the catalog request was in
    // flight; a destroyed player must not be handed a new station.
    if (playerRef.current !== player) return;
    stationRef.current = next;
    setStation(next);
    setGeo(null);
    player.play(next);
    countListen(next);
    void lookupGeo(next).then(setGeo);
  };

  // A tap on the tuner ruler slides that station under the needle: it
  // jumps the feed queue and the regular switch takes it from there.
  playPickRef.current = async (next, opts) => {
    if (!next || next.uuid === station?.uuid) return;
    if (status === "blocked" && !opts?.force) {
      return playerRef.current?.resume();
    }
    skipRef.current = 0;
    feedRef.current = feedRef.current.filter((s) => s.uuid !== next.uuid);
    feedRef.current.unshift(next);
    await playNextRef.current();
  };

  const handleToggleFavorite = async (favorite) => {
    const current = stationRef.current;
    if (!current?.uuid) return;
    const list = await toggleFavorite(current, favorite);
    setFavorites(list);
  };

  const handleRemoveFavorite = async (uuid) => {
    const list = await removeFavorite(uuid);
    setFavorites(list);
  };

  // One physical click reaches the component twice on an interactive
  // canvas: as a native pointer event and as the wallpaper tap the hook
  // forwards. Both paths land here, and the window keeps them to one.
  handleTapRef.current = () => {
    const tappedAt = performance.now();
    if (tappedAt - lastTapRef.current < TAP_DEDUP_MS) return;
    lastTapRef.current = tappedAt;
    const player = playerRef.current;
    if (!player) return;
    if (status === "blocked") {
      player.resume();
      return;
    }
    if (touchOf(configRef.current) === "feed") {
      skipRef.current = 0;
      void playNextRef.current();
    }
  };

  // The player outlives renders; dead streams are skipped here so the
  // component never has to hold retry logic.
  useEffect(() => {
    const player = createPlayer({
      onState: (state) => {
        if (state === "playing") {
          skipRef.current = 0;
          const current = stationRef.current;
          if (current) void rememberStation(current);
        }
        setStatus(state);
      },
      onDead: () => {
        skipRef.current += 1;
        if (skipRef.current > MAX_SKIP) {
          player.stop();
          setStatus("silent");
          return;
        }
        void playNextRef.current();
      },
    });
    playerRef.current = player;
    return () => {
      playerRef.current = null;
      player.destroy();
    };
  }, []);

  // Open on the last station that actually played, when it still matches
  // the country and HTTPS filter. Otherwise take the next one in the queue.
  // Play it directly: the catalog sync below replaces the queue and clears
  // the feed as soon as the cache is ready, which would drop a station
  // that was only waiting at the front of that feed.
  useEffect(() => {
    let alive = true;
    queueRef.current = createQueue(filterOf(configRef.current));
    void (async () => {
      const saved = await loadRadioState();
      if (alive) {
        setFavorites(Array.isArray(saved.favorites) ? saved.favorites : []);
      }
      const player = playerRef.current;
      if (!alive || !player || !queueRef.current) return;
      const last = saved.lastStation;
      if (!lastStationFits(last, filterOf(configRef.current))) {
        await playNextRef.current();
        return;
      }
      stationRef.current = last;
      setStation(last);
      setGeo(null);
      setStatus("tuning");
      player.play(last);
      countListen(last);
      void lookupGeo(last).then((place) => {
        if (alive) setGeo(place);
      });
      feedRef.current = feedRef.current.filter(
        (item) => item.uuid !== last.uuid,
      );
      await fillFeed();
      if (alive) setUpcoming(feedRef.current.slice(0, FEED_SIZE));
    })();
    return () => {
      alive = false;
      queueRef.current = null;
    };
  }, []);

  // A country or HTTPS change reshapes the queue without interrupting the
  // station already playing; the tuner strip refills so its names match
  // the new filter too. The first run is the mount one, already filled by
  // playNext.
  const filterKeyRef = useRef(
    `${config?.country ?? ""}|${config?.httpsOnly !== false}`,
  );
  useEffect(() => {
    const key = `${config?.country ?? ""}|${config?.httpsOnly !== false}`;
    if (filterKeyRef.current === key) return;
    filterKeyRef.current = key;
    queueRef.current = createQueue(filterOf(configRef.current));
    feedRef.current = [];
    setUpcoming([]);
    void fillFeed().then(() =>
      setUpcoming(feedRef.current.slice(0, FEED_SIZE)),
    );
  }, [config?.country, config?.httpsOnly]);

  useEffect(() => {
    playerRef.current?.setVolume(volumeOf(configRef.current));
  }, [config?.volume]);

  useEffect(() => {
    playerRef.current?.setTuning({
      enabled: tuningNoiseOf(configRef.current),
      level: tuningNoiseLevelOf(configRef.current),
    });
  }, [config?.tuningNoise, config?.tuningNoiseLevel]);

  // Local catalog: on downloads the directory; off deletes it. A bump of
  // cacheRefresh (the settings "Redownload" button) pulls a fresh copy
  // without turning the switch off. Stream audio still needs the network.
  useEffect(() => {
    const enabled = cacheCatalogOf(configRef.current);
    const refreshAt = cacheRefreshOf(configRef.current);
    let force = false;
    if (refreshHandledRef.current === null) {
      refreshHandledRef.current = refreshAt;
    } else if (refreshAt !== refreshHandledRef.current) {
      refreshHandledRef.current = refreshAt;
      force = refreshAt > 0;
    }

    let alive = true;
    const strings = STRINGS[readLanguage()] ?? STRINGS["zh-CN"];

    void syncStationCache({
      enabled,
      force: enabled && force,
      onProgress: (progress) => {
        if (!alive) return;
        if (!enabled) {
          setCacheNote("");
          return;
        }
        const note = cacheNoteOf(progress, strings);
        setCacheNote(note);
        if (progress.ready && note) {
          window.setTimeout(() => {
            if (alive) setCacheNote("");
          }, 8000);
        }
      },
    }).then((result) => {
      if (!alive) return;
      if (!enabled || result.status === "cleared") {
        setCacheNote("");
        setCacheEpoch((n) => n + 1);
        return;
      }
      if (result.status === "error") {
        setCacheNote(cacheNoteOf({ error: true }, strings));
        return;
      }
      // A freshly ready cache should reshape the queue so the next
      // switch already draws from the local list.
      if (result.status === "ready" || result.status === "stale") {
        setCacheEpoch((n) => n + 1);
        queueRef.current = createQueue(filterOf(configRef.current));
        feedRef.current = [];
        void fillFeed().then(() => {
          if (alive) setUpcoming(feedRef.current.slice(0, FEED_SIZE));
        });
      }
    });

    return () => {
      alive = false;
    };
  }, [config?.cacheCatalog, config?.cacheRefresh]);

  // Auto-rotate: wander on a timer while the sound is actually flowing.
  const playing = status === "playing";
  useEffect(() => {
    if (!playing) return;
    const minutes = rotateMinutes(configRef.current);
    if (minutes === 0) return;
    const timer = setInterval(
      () => void playNextRef.current(),
      minutes * 60_000,
    );
    return () => clearInterval(timer);
  }, [config?.rotate, playing]);

  // Local clock for "当地 14:25"; only ticks when there is a timezone.
  useEffect(() => {
    if (!geo?.tz) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [geo?.tz]);

  // Wallpaper taps arrive per widget id. A click that landed on a control
  // or the globe belongs to that element, not to the wallpaper gesture.
  useEffect(() => {
    if (touchOf(configRef.current) !== "feed") return;
    const onTap = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (
        hit?.closest("button") ||
        hit?.closest("[data-globe]") ||
        hit?.closest("[data-search]") ||
        hit?.closest("[data-favorites]") ||
        hit?.closest("input")
      )
        return;
      handleTapRef.current();
    };
    const taps = (window.__murmurDeskulptTaps ??= {});
    taps[id] = onTap;
    return () => {
      if (window.__murmurDeskulptTaps?.[id] === onTap)
        delete window.__murmurDeskulptTaps[id];
    };
  }, [id, config?.touch]);

  if (mode === "hidden") return null;

  const strings = STRINGS[language] ?? STRINGS["zh-CN"];
  const live = status === "playing";
  const favoriteActive = isFavorite(favorites, station?.uuid);
  const statusLine = statusTextOf(status, strings);
  const place = placeOf(station, geo);
  const time = localTimeOf(geo?.tz, now);
  const cityLine = place && time ? `${place} · ${time}` : place || time;
  const detail = describe(station);

  // A click on the panel behaves like a wallpaper tap; the buttons are the
  // controls that always work, even where taps are off. The globe takes
  // drags of its own.
  const onSurfacePointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button")) return;
    if (event.target.closest("[data-globe]")) return;
    if (event.target.closest("[data-search]")) return;
    if (event.target.closest("[data-favorites]")) return;
    handleTapRef.current();
  };

  const onToggle = () => {
    const player = playerRef.current;
    if (!player) return;
    if (status === "playing") player.pause();
    else if (status === "paused" || status === "blocked") player.resume();
    else {
      skipRef.current = 0;
      void playNextRef.current();
    }
  };

  if (card) {
    return (
      <GlobeView
        id={`radio-widget-${id}`}
        strings={strings}
        station={station}
        statusLine={statusLine}
        cacheNote={cacheNote}
        live={live}
        place={place}
        time={time}
        detail={detail}
        coords={coordOf(station)}
        markers={markers}
        spin={spinOf(config)}
        rimBoost={rimBoostOf(config)}
        limbGlow={limbGlowOf(config)}
        upcoming={upcoming}
        showGlobe={showGlobe}
        showMeta={showMeta}
        language={language}
        httpsOnly={config?.httpsOnly !== false}
        cacheOn={cacheCatalogOf(config)}
        cacheEpoch={cacheEpoch}
        favorites={favorites}
        favoriteActive={favoriteActive}
        onToggleFavorite={handleToggleFavorite}
        onRemoveFavorite={handleRemoveFavorite}
        width={width}
        getAudioLevels={() =>
          playerRef.current?.levels?.() ?? { level: 0, bass: 0 }
        }
        onSurfacePointerDown={onSurfacePointerDown}
        onToggle={onToggle}
        onPick={playPickRef.current}
        onSight={sightRef.current}
        onScrub={scrubRef.current}
        onWake={wakeRef.current}
      />
    );
  }

  return (
    <CompactView
      id={`radio-widget-${id}`}
      mode={mode}
      strings={strings}
      station={station}
      statusLine={statusLine}
      cacheNote={cacheNote}
      live={live}
      cityLine={cityLine}
      detail={detail}
      onSurfacePointerDown={onSurfacePointerDown}
      onToggle={onToggle}
    />
  );
}

export default Radio;
