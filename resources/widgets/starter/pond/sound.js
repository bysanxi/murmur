// Host for the synthesised pond soundscape in vendor/audio.js.
// The choices are this widget's own settings.

const MUSIC = new Set(["guqin", "bowl", "chimes", "off"]);
const WATERS = new Set(["stream", "spring", "cascade", "lapping", "bamboo"]);

function heardFrom(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const volume = Number(source.volume);
  return {
    on: source.soundOn === true,
    music: MUSIC.has(source.music) ? source.music : "guqin",
    water: source.water !== false,
    waterType: WATERS.has(source.waterType) ? source.waterType : "stream",
    weatherSound: source.weatherSound !== false,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.7,
  };
}

export function createPondSound(getScene) {
  const audio = new window.PondAudio.PondAudio();
  let wantedOn = false;
  let signature = "";
  let heardRaw = {};

  function apply(raw) {
    if (raw !== undefined) heardRaw = raw;
    const heard = heardFrom(heardRaw);
    const scene = getScene();
    const next = JSON.stringify({
      ...heard,
      weather: scene.weather,
      night: scene.night,
      rain: scene.rainAmount,
    });
    if (next === signature) return;
    signature = next;
    audio.configure({
      water: heard.water,
      waterType: heard.waterType,
      weatherSound: heard.weatherSound,
      music: heard.music,
      volume: heard.volume,
      sfx: true,
      weather: scene.weather,
      night: scene.night,
      rainAmount: scene.rainAmount,
    });
    if (heard.on !== wantedOn) {
      wantedOn = heard.on;
      audio.setActive(heard.on);
    }
  }

  function onVisibility() {
    if (!audio.context || !wantedOn) return;
    if (document.hidden) audio.context.suspend();
    else audio.context.resume();
  }

  document.addEventListener("visibilitychange", onVisibility);

  return {
    setHeard(raw) {
      apply(raw);
    },
    noteScene() {
      apply();
    },
    thunder(event) {
      if (event?.type === "thunder")
        audio.thunderAfter(event.delay, event.strength);
    },
    plop() {
      audio.plop();
    },
    tap() {
      audio.tap();
    },
    stop() {
      document.removeEventListener("visibilitychange", onVisibility);
      wantedOn = false;
      audio.setActive(false);
    },
  };
}
