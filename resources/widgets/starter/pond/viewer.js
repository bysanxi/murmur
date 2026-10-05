// Viewing-only host for the pond engine in vendor/.
// The engine comes from the independent fishwallpaper implementation.

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
    speed: 0.7,
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
  };
  const manual = { weather: "sunny", night: false, speed: 0.7 };

  const fish = Array.from({ length: 24 }, (_, i) => ({
    ...createFish(i, randomSeed(i * 7 + 3)),
    id: `koi-${i + 1}`,
  }));

  let width = Math.max(host.clientWidth, 1);
  let height = Math.max(host.clientHeight, 1);
  const simulation = new PondCore.PondSimulation(
    fish,
    width,
    height,
    Math.random,
    createSilverCarpShoal(),
    true,
  );
  let style = PondStyles.real;
  const spriteCaches = new Map();
  let sprites = style.art.miscSprites();
  let view = canvas;
  let renderer = null;
  let scene = null;
  let frameId = 0;
  let last = 0;
  let time = 0;
  let stopped = false;

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
    if (renderer && scene) {
      renderer.resize(width, height, dpr, settings.quality);
      scene.layout(width, height);
    }
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
  });

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
    size();
    scene.update(0, settings);
    scene.setLook(settings.weather, settings.night, undefined, settings);
    simulation.allFish.forEach((item) => {
      item.spriteReady = false;
    });
    uploadSprites();
    renderer.render(0, 0.016, scene.look);
    parkedFrame = null;
    host.replaceChildren(view);
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
    scene.events.splice(0);
    scene.draw(settings);
    renderer.render(time, dt, scene.look);
  }

  const observer = new ResizeObserver(() => size());
  observer.observe(host);

  const bed = new Image();
  bed.addEventListener("load", () => {
    if (stopped || !bed.naturalWidth) return;
    createPond(bed);
    frameId = requestAnimationFrame(frame);
  });

  const pace = (speed) =>
    settings.quality === "eco" ? Math.min(speed, 0.45) : speed;

  function applyManual() {
    settings.weather = manual.weather;
    settings.night = manual.night;
    settings.speed = pace(manual.speed);
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
    if (["sunny", "cloudy", "rain", "snow"].includes(next.weather))
      manual.weather = next.weather;
    if (typeof next.night === "boolean") manual.night = next.night;
    if (typeof next.speed === "number" && Number.isFinite(next.speed))
      manual.speed = clamp(next.speed, 0.3, 2);
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
    if (!settings.followTime) applyManual();
    if (typeof next.style === "string") requestStyle(next.style);
  }
  setConfig(config);
  bed.src = style.bed.image;

  return {
    setConfig,
    setAtmosphere(next) {
      if (!settings.followTime) return;
      settings.weather = next.weather;
      settings.night = next.night;
      settings.speed = pace(next.speed);
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      parkFrame(view);
    },
  };
}
