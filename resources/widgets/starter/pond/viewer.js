// Viewing-only host for the pond engine in vendor/.
// Derived from fishwallpaper (https://github.com/moli-xia/fishwallpaper), MIT,
// modified for this widget.

import { createCityWeather, parseCity } from "./city.js";
import { createPondSound } from "./sound.js";
import { createStyleSwap } from "./style-swap.js";

let parkedFrame = null;

function parkFrame(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return;
  const snap = document.createElement("canvas");
  snap.width = canvas.width;
  snap.height = canvas.height;
  snap.style.width = "100%";
  snap.style.height = "100%";
  snap.style.display = "block";
  const ctx = snap.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(canvas, 0, 0);
  parkedFrame = snap;
}

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountPond(host, config) {
  const { PondCore, PondGL, PondScene, PondStyles } = window;
  const { createFish, randomSeed, createSilverCarpShoal, clamp } = PondCore;

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  host.replaceChildren(parkedFrame ?? canvas);

  const settings = {
    weather: "sunny",
    speed: 1,
    turtles: true,
    crabs: true,
    silverCarp: true,
    butterflies: true,
    names: false,
    quality: reducedMotion() ? "eco" : "high",
    night: false,
    rainAmount: 0.35,
    snowAmount: 0.35,
    followTime: true,
    cityWeather: false,
    cityLive: null,
  };
  const manual = { weather: "sunny", night: false, speed: 1 };
  let touch = "off";
  const pondSound = createPondSound(() => settings);
  const cityClient = createCityWeather({
    weatherFromCode: PondCore.weatherFromCode,
    clamp,
    onWeather(next) {
      settings.cityLive = next;
      applyCity();
      pondSound.noteScene();
    },
  });

  const fish = Array.from({ length: 24 }, (_, i) => ({
    ...createFish(i, randomSeed(i * 7 + 3)),
    id: `koi-${i + 1}`,
  }));

  let width = Math.max(host.clientWidth, 1);
  let height = Math.max(host.clientHeight, 1);
  let shown = false;
  let sized = "";
  host.style.position = "relative";
  const simulation = new PondCore.PondSimulation(
    fish,
    width,
    height,
    Math.random,
    createSilverCarpShoal(),
    true,
  );
  const styleName =
    config && typeof config.style === "string" ? config.style : "";
  let style = PondStyles[styleName] || PondStyles.real;
  const spriteCaches = new Map();
  let sprites = style.art.miscSprites();
  let view = canvas;
  let renderer = null;
  let scene = null;
  let frameId = 0;
  let last = 0;
  let time = 0;
  let stopped = false;

  function coverView(canvas) {
    if (!shown || !canvas?.width || !canvas?.height) return null;
    const snap = document.createElement("canvas");
    snap.width = canvas.width;
    snap.height = canvas.height;
    snap.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
    const ctx = snap.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    host.append(snap);
    return snap;
  }

  function size() {
    width = Math.max(host.clientWidth, 1);
    height = Math.max(host.clientHeight, 1);
    const dpr =
      settings.quality === "eco"
        ? 1
        : Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    simulation.width = width;
    simulation.height = height;
    simulation.scale = clamp(Math.min(width, height) / 720, 0.66, 1.25);
    if (!renderer || !scene) return;
    const key = `${width}x${height}@${dpr}@${settings.quality}`;
    if (key === sized) return;
    // Resizing the bitmap clears it. Keep the frame that is already on screen
    // until the new one has been drawn.
    const cover = coverView(view);
    renderer.resize(width, height, dpr, settings.quality);
    scene.layout(width, height);
    sized = key;
    if (shown) {
      scene.draw(settings);
      renderer.render(time, 0, scene.look);
    }
    cover?.remove();
  }

  function cacheFor(name) {
    let bucket = spriteCaches.get(name);
    if (!bucket) {
      bucket = new Map();
      spriteCaches.set(name, bucket);
    }
    return bucket;
  }
  function fishCanvas(fishSprite, art, bucket) {
    const key = `${fishSprite.species || "koi"}:${fishSprite.palette}:${fishSprite.seed}`;
    let cached = bucket.get(key);
    if (!cached) {
      cached = art.fishSprite(fishSprite, PondGL.FISH_PPU);
      bucket.set(key, cached);
    }
    return cached;
  }

  function uploadSprites() {
    if (!renderer) return;
    simulation.allFish.forEach((item, index) => {
      if (!item.spriteReady || item.spriteCell !== index) {
        renderer.setFish(
          index,
          fishCanvas(item, style.art, cacheFor(style.name)),
        );
        item.spriteReady = true;
        item.spriteCell = index;
      }
    });
  }

  let currentBed = null;
  const { requestStyle } = createStyleSwap({
    styles: PondStyles,
    fish: () => simulation.allFish,
    fishCanvas,
    cacheFor,
    floatMask: PondScene.floatMask,
    style: () => style,
    setStyle(next) {
      style = next;
    },
    renderer: () => renderer,
    scene: () => scene,
    setSprites(next) {
      sprites = next;
    },
    setBed(image) {
      currentBed = image;
    },
    stopped: () => stopped,
    reloadBed() {
      loadBed();
    },
  });

  let bedToken = 0;
  let scenePlaced = false;
  function loadBed() {
    const token = ++bedToken;
    const image = new Image();
    image.addEventListener("load", () => {
      if (stopped || token !== bedToken || !image.naturalWidth) return;
      createPond(image);
      if (!frameId) frameId = requestAnimationFrame(frame);
    });
    image.src = style.bed.image;
  }

  function createPond(bedImage) {
    currentBed = bedImage;
    renderer = PondGL.createRenderer(
      view,
      bedImage,
      sprites,
      () => {
        renderer = null;
        if (!stopped && currentBed) createPond(currentBed);
      },
      PondScene.floatMask(
        bedImage.naturalWidth,
        bedImage.naturalHeight,
        style.bed.floaters,
      ),
    );
    if (!renderer) return;
    if (renderer.canvas !== view) {
      view.replaceWith(renderer.canvas);
      view = renderer.canvas;
    }
    if (scene) scene.R = renderer;
    else scene = new PondScene.PondScene(renderer, simulation);
    scene.setStyle(style);
    size();
    if (!scenePlaced) {
      scene.placeBed();
      scenePlaced = true;
    }
    scene.update(0, settings);
    scene.setLook(settings.weather, settings.night, undefined, settings);
    simulation.allFish.forEach((item) => {
      item.spriteReady = false;
    });
    uploadSprites();
    renderer.render(0, 0.016, scene.look);
    shown = true;
    const cover = parkedFrame?.parentNode === host ? parkedFrame : null;
    if (view.parentNode !== host) {
      if (cover) host.insertBefore(view, cover);
      else host.append(view);
    }
    cover?.remove();
    parkedFrame = null;
  }

  function frame(now) {
    if (stopped) return;
    frameId = requestAnimationFrame(frame);
    const interval = 1000 / (settings.quality === "eco" ? 30 : 60);
    if (now - last < interval * 0.8) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    if (document.hidden || !renderer || !scene) return;
    time += dt;
    simulation.step(dt, settings.speed);
    simulation.events.splice(0);
    scene.setLook(settings.weather, settings.night, dt, settings);
    scene.update(dt, settings);
    for (const event of scene.events.splice(0)) pondSound.thunder(event);
    scene.draw(settings);
    renderer.render(time, dt, scene.look);
  }

  const observer = new ResizeObserver(() => size());
  observer.observe(host);

  let lastTap = 0;
  function touchAt(x, y) {
    if (!scene || touch === "off") return;
    const now = performance.now();
    if (now - lastTap < 40) return;
    lastTap = now;
    scene.startle(x, y);
    if (touch === "watch") {
      scene.drop(x, y, 9 * scene.scale, 0.9);
      simulation.scare(x, y, 170 * scene.scale);
      pondSound.tap();
      return;
    }
    scene.drop(x, y, 7 * scene.scale, 0.5);
    const before = simulation.food.length;
    if (!simulation.feed(x, y)) return;
    for (const pellet of simulation.food.slice(before)) {
      scene.drop(pellet.x, pellet.y, 3 * scene.scale, 0.22);
    }
    pondSound.plop();
  }

  function tapFrom(clientX, clientY) {
    if (touch === "off") return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    touchAt(
      ((clientX - rect.left) / rect.width) * width,
      ((clientY - rect.top) / rect.height) * height,
    );
  }
  function onPointerDown(event) {
    if (event.button !== 0) return;
    tapFrom(event.clientX, event.clientY);
  }
  function onWallpaperTap(x, y) {
    tapFrom(x, y);
  }
  host.addEventListener("pointerdown", onPointerDown);
  window.__murmurPondTap = onWallpaperTap;

  const pace = (speed) =>
    settings.quality === "eco" ? Math.min(speed, 0.45) : speed;

  function applyCity() {
    const live = settings.cityLive;
    if (!settings.cityWeather || !live?.weather) return false;
    settings.weather = live.weather;
    if (live.rainAmount != null) settings.rainAmount = live.rainAmount;
    if (live.snowAmount != null) settings.snowAmount = live.snowAmount;
    return true;
  }

  function applySpeed() {
    settings.speed = pace(manual.speed);
  }

  function applyManual() {
    settings.night = manual.night;
    applySpeed();
    if (!applyCity()) settings.weather = manual.weather;
  }

  function setConfig(next) {
    if (!next || typeof next !== "object") return;
    for (const key of ["turtles", "crabs", "butterflies"]) {
      if (typeof next[key] === "boolean") settings[key] = next[key];
    }
    if (
      typeof next.silverCarp === "boolean" &&
      next.silverCarp !== settings.silverCarp
    ) {
      settings.silverCarp = next.silverCarp;
      simulation.residentsOn = next.silverCarp;
      simulation.residents.forEach((fish) => {
        fish.spriteReady = false;
      });
      uploadSprites();
    }
    if (typeof next.followTime === "boolean")
      settings.followTime = next.followTime;
    if (typeof next.cityWeather === "boolean")
      settings.cityWeather = next.cityWeather;
    if (["sunny", "cloudy", "rain", "snow"].includes(next.weather))
      manual.weather = next.weather;
    if (typeof next.night === "boolean") manual.night = next.night;
    if (typeof next.speed === "number" && Number.isFinite(next.speed)) {
      manual.speed = clamp(next.speed, 0.3, 2);
      applySpeed();
    }
    if (
      next.touch === "feed" ||
      next.touch === "watch" ||
      next.touch === "off"
    ) {
      touch = next.touch;
      host.style.cursor = touch === "off" ? "" : "pointer";
    }
    if (typeof next.rainAmount === "number" && Number.isFinite(next.rainAmount))
      settings.rainAmount = clamp(next.rainAmount, 0, 1);
    if (typeof next.snowAmount === "number" && Number.isFinite(next.snowAmount))
      settings.snowAmount = clamp(next.snowAmount, 0, 1);
    if (
      (next.quality === "high" || next.quality === "eco") &&
      next.quality !== settings.quality
    ) {
      settings.quality = next.quality;
      size();
    }
    if (!settings.cityWeather) settings.cityLive = null;
    if (!settings.followTime) applyManual();
    else applyCity();
    cityClient.setLocation(settings.cityWeather ? parseCity(next.city) : null);
    if (typeof next.style === "string") requestStyle(next.style);
    pondSound.setHeard(next);
  }
  setConfig(config);
  loadBed();

  return {
    setConfig,
    setAtmosphere(next) {
      if (!settings.followTime) return;
      settings.night = next.night;
      if (!applyCity()) settings.weather = next.weather;
      pondSound.noteScene();
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      if (window.__murmurPondTap === onWallpaperTap)
        window.__murmurPondTap = null;
      cityClient.stop();
      pondSound.stop();
      parkFrame(view);
    },
  };
}
