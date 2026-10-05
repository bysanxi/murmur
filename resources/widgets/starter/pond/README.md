# Pond widget

[中文](./README.zh.md) | English

Technical design of the `@murmur.pond` widget,「三息之间」. This directory is the widget source. Deskulpt bundles `index.jsx` and everything it imports into one ESM chunk. A file that nothing imports, including this README, stays out of that chunk.

The first launch copies this directory into the live widgets folder (`target/debug/widgets/@murmur.pond` in development, `Documents/Deskulpt/widgets/@murmur.pond` in a release build). That copy runs once. Later edits here are what you change; refresh the widget after the live copy has been updated.

## Layout

| File                   | Role                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `deskulpt.widget.json` | Manifest. Entry is `index.jsx`. Default geometry is a full-HD-sized wallpaper at z-index `-1`.                                    |
| `index.jsx`            | React host. Owns the viewport, the sentence, and the mount lifecycle.                                                             |
| `viewer.js`            | Viewing-only adapter around the engine. Creates the simulation, drives the frame loop, and keeps the last frame across a remount. |
| `lines.js`             | Time-of-day periods, atmosphere, and the sentence for the current language.                                                       |
| `vendor/core.js`       | Fish bodies, steering, and `PondSimulation`. Publishes `window.PondCore`.                                                         |
| `vendor/art.js`        | Canvas 2D sprites for koi, turtles, crabs, and butterflies. Publishes `window.PondArt`.                                           |
| `vendor/gl.js`         | WebGL2 renderer, with a 2D fallback. Publishes `window.PondGL`.                                                                   |
| `vendor/scene.js`      | Places creatures, lilies, and weather on top of the renderer. Publishes `window.PondScene`.                                       |
| `vendor/pond-data.js`  | The pond photograph as a JPEG data URL on `window.POND_IMAGE`.                                                                    |

The engine is the fishwallpaper implementation, trimmed to a viewing pond. Feeding, audio, hand-drawn patterns, city weather, and saved fish are not wired up.

## Engine assets

The engine holds exactly one bitmap: the pond bed. The upstream project generated it with imagegen (the prompt is kept in the upstream `assets/ARTWORK.md`) and `scripts/embed.mjs` base64s the whole JPEG into a single line of JS:

```js
window.POND_IMAGE = "data:image/jpeg;base64,...";
```

The image is inlined because pixel data from a `file://` URL is cross-origin to WebGL, so `texImage2D` refuses to read it. A data URL uploads safely and can be mipmapped. On a portrait screen `fitBed()` turns the whole painting a quarter, so a portrait display still fits a complete pond.

Lily pads, lotus blossoms, and rocks are not separate assets. The upstream `scene.js` hand-annotates roughly 120 ellipses in a `FLOATERS` table (`[x, y, rx, kind]`), and `floatMask()` turns them into a three-channel mask: red for what stands above the water, green for what casts a shadow on the bed, blue for what rests on the surface and leaves a wet line. The renderer cuts those regions out of the bed and draws them on top of the water.

Everything else is generated at runtime:

| Kind             | How                                                                                                                                                                                                                           | Where                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Creature sprites | Canvas 2D, painted per pixel or as vectors                                                                                                                                                                                    | `vendor/art.js`                              |
| Noise textures   | Two 256² textures built once on the CPU: a four-channel tileable value noise for cloud shadow, caustic warp, water beads, and snow; and a slope field from 26 random integer-frequency sines for breeze waves and sun glitter | `noiseData` and `waveData` in `vendor/gl.js` |
| Sound            | Pure Web Audio synthesis, no audio files (upstream only, not wired up here)                                                                                                                                                   | upstream `audio.js`                          |

## Sprites: how the creatures are painted

Two techniques, chosen by whether the result has to deform:

- **Per-pixel `ImageData`**: fish bodies and turtle shells. The texture has to follow a curved surface, and it must emit extra lighting channels.
- **Vector `Path2D` with gradients**: fins, limbs, wings, crab claws, petals. These parts move independently, and their shapes are regular.

A fish is defined in local coordinates by `BODY` in `core.js`: nose at `+34`, tail tip at `-58`, width `96`, half width `14`, seen from above. At the default `ppu` of `3.5` the sprite is 336×98 px.

`fishLayers()` does six things per pixel on that grid:

1. **Coverage and normal.** `cov` antialiases one pixel; `v = y/w` and `nz = sqrt(1-v²)` treat the body as a cylinder, which every later shade depends on.
2. **Scale placement** in `scaleAt()`. Rows use arc length `asin(y/w)*w`, so scales squeeze together along the flanks; rows are offset and jittered with `hash`; only a 3×3 neighbourhood is searched for the forward-most scale covering the point, returning `{r, id, x, y, dx}`.
3. **Pattern field** in `patternFor()`. fbm noise against a threshold produces two scalar fields, one for red patches and one for ink; the threshold is randomised by ±0.06 per fish, so no two fish carry the same amount of red.
4. **Base colour**, interpolated per variety: warm gold along the back of an ogon, deep teal to bright silver on a silver carp, deep crimson to scarlet on a benigoi.
5. **Kiwa and sashi.** The tail-side edge samples the pattern at the scale centre, so the boundary lands exactly on scale outlines and stays sharp — the kiwa. The head-side edge differences two nearby samples into a `smooth`, so white scales appear to overlap the red — the soft sashi. This is a koi-judging term turned into a sampling strategy.
6. **Scale relief.** Every scale gets a pocket shadow where it tucks under its neighbour, a thin dark line at its free edge, and a lit band just inside that edge, plus a per-scale tone jitter and a 4% chance of a single flashing scale.

The output is four channels: `albedo` carries colour and alpha, `shade` static shading, `spec` static highlights, `fin` the tail fin on its own layer. The split matters: `albedo` is the bare colour, `shade` and `spec` are view-independent baked lighting, and whatever changes with the sun or the clouds is left to the shader — so changing the weather never repaints a fish.

`fishSprite()` composites the finished sprite: hand-drawn marks go on with `source-atop`, the tail fin is alpha-blended into the body per pixel, and vector details follow — gill covers, nostrils, barbels, and eyes built from four radial gradients.

Caching happens at two levels. `layerCache` holds the expensive per-pixel work keyed by `variety:palette:seed:ppu`, with an LRU of 90; `viewer.js` caches the composited canvas by `species:palette:seed`.

The remaining creatures follow one rule: **things that move are vector parts, things that need texture are painted per pixel**. The shell is another per-pixel piece — 13 scute centres form Voronoi seams, with growth rings and a domed light falloff — but limbs, head, and tail are five vector parts rotated by swim phase. Butterflies, dragonflies, and crabs are vector parts too.

Upstream also ships a `tests/` directory. `core.js` and `art.js` have no DOM dependency and run under `node --test`, and the assertions encode aesthetic judgements, such as a blunt round snout rather than a point, and scales that vary scale by scale instead of staying flat.

## Motion: vertices, not pixels

The sprite is painted once and stays a flat "unfolded fish skin". Swimming bends that skin onto a spine every frame; not one pixel is repainted. Three steps:

1. **The CPU builds a spine** in `updateSpine()`. The first five segments are rigid and follow the head; the remaining eleven may only follow the path the segment before them travelled, a follow-the-leader chain, so turns whip the tail.
2. **A travelling wave is added** in `fishPose()`: `lat = amp * env * sin(phase - u * 5.4)`, almost no motion at the head and the largest swing at the tail. `phase` advances with swimming speed and `amp` follows thrust and turning each frame, so the beat comes from physics rather than keyframes. The result is 17 points of `(x, y, normalX, normalY)`.
3. **The GPU builds a ribbon** in `fish()` in `vendor/gl.js`. Each spine point emits one vertex on either side along its normal; `u` is the body coordinate mapped into an atlas column, `v` spans the width; adjacent columns become 16×2 triangles, and every fish goes into a single `drawElements`.

The ribbon itself is a constant-width rectangle, half width fixed at `BODY.half`. The outline, the blunt head, and the narrowing tail stalk come entirely from texture alpha. **UVs are pinned to body coordinates, so the skin behaves like a sticker that can be bent freely** and the pattern follows it around — which is exactly why the pattern had to be generated in body coordinates.

Relighting after deformation relies on the extra `vLight = (position across, local half-width ratio, metal, gloss)` carried by each vertex. The width ratio comes from `halfWidth()`, assembled by the scene's `bodyLight`; the fragment shader derives the across direction with `dFdx`, builds a body-wrapped normal, and applies the directional light, so the highlight slides around the flank as the fish turns.

Fins are split: the tail fin lives in the skin and whips with the last spine point, while each pectoral fin is a separate vector sprite rotated by swim phase. Depth scales by `k` and carries `fog = [water colour, depth]`, so deeper fish shrink and turn teal.

Without WebGL2, `drawStrip2D()` slices the skin into 16 segments and `drawImage`s each one — the same idea implemented in Canvas 2D.

The cost is small: the CPU only computes 17 points per fish per frame, and all geometry lands in one draw call.

## Sway: how the painted plants move

The cut-outs are not glued to the painting. The bed supplies pixels only; each frame the scene recomputes every plant's pose from its ellipse, the surface, and the weather — four layers stacked:

1. **The CPU rocks each plant on its own clock.** Every `FLOATERS` entry becomes a floater with four random phases and its own speed of 0.8–1.2, so nothing moves in sync. The sway mixes two sines of different frequency into a rotation — `turn * sin(t * 0.33 * sp + p0)` plus a second harmonic — and two more into a translation of 1.6 to 3.2 pixels times viewport scale. Amplitude comes from the kind: a big floating leaf barely turns (0.032, the water holds it flat), a bud on its stalk swings hardest (0.13), a flower nods (0.085), the rest drift at 0.075, and `gust = 0.8 + look.wave * 0.45` scales everything, so weather decides how hard the pond breathes. The same list fixes the paint order: rocks first, then leaves largest first, petals, buds, flowers on top.
2. **Rain knocks, springs settle.** Each drop is handed to a plant picked by area. `hit()` bursts a splash crown there and kicks the plant's spring — a bud takes the hardest jolt (3), a petal 2, a big flower 1.2, while a leaf scales inversely with size (`clamp(22 / rx)`), so small leaves shiver and big ones barely stir; a rock only splashes. The scene then integrates the damped spring, `jv += (-60 * ja - 6 * jv) * dt`, until every term falls below `1e-3` and zeroes it, so a leaf trembles and comes back to rest instead of staying displaced.
3. **The GPU rides the wave.** `VS_FLOAT` taps the surface map that pass 6 just wrote, four taps around the quad's centre, and slides the corners by the resulting gradient times `push`: 1.8 for a big leaf, 3.5 for a small painted petal, 2.6 for the rest, all times viewport scale, and 0 for a rock. The same gradient rides along as `vTilt` and shifts the pool of water gathered in a lotus cup while the swell passes underneath. The mask that cuts the plants out also multiplies the ripple field to zero beneath them, so waves break around a leaf instead of running through it.
4. **The plants are in the simulation.** Every ellipse wider than 25 px becomes a screen-space circle in `sim.obstacles` (0.55 of the minor axis, 0.95 for rocks): fish reject goal points inside them and the steering loop pushes bodies back out, so koi route around the leaves. Fallen petals are a lighter case — spawned beside a lotus, drifting toward mid-pond, spinning, alive for 60 to 120 seconds, drawn once as a shadow sprite and once as a surface sprite.

Everything above reads only the ellipse coordinates and the pixels behind them: repaint the bed and every animation keeps working.

## Light and the render pipeline

Lighting is a bundle of `look` parameters. `vendor/scene.js` defines sunny, cloudy, rain, and snow presets; `lookFor()` layers rain amount, snow amount, and night on top; `lerpLook()` eases between them, so weather changes are gradual. The directional light is fixed at `sun = [-.45, .45, .77]`, and `shadowDir = [.7, .72]` sets the offset of every shadow.

Seven passes per frame, in the order documented by the `render()` comments:

| #   | Pass             | Resolution      | What it does                                                                                                                                                                                              |
| --- | ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ripples          | grid up to 900² | `FS_DROP` injects at most 24 raindrops or pellets, then a wave equation runs on ping-pong RGBA16F targets at a fixed 90Hz with edge absorption and viscosity, while leaves and rocks hold the water still |
| 2   | Caustics         | 1/2             | animated Worley edges warped by noise                                                                                                                                                                     |
| 3   | Cloud shadow     | 1/8             | three octaves of noise drifting with the wind and slowly deforming                                                                                                                                        |
| 4   | Shadows          | 1/2 plus mipmap | the sprites drawn again, writing alpha only                                                                                                                                                               |
| 5   | Underwater scene | full            | the bed in `FS_BED` compositing shadow and caustics, then underwater sprites                                                                                                                              |
| 6   | Surface to final | 1/2 then full   | slopes and glitter, then refraction, grading, moon, vignette                                                                                                                                              |
| 7   | Floaters and air | full            | lily pads rising above the water, then surface and air sprites, then glow with additive blending                                                                                                          |

A few designs worth remembering:

- **Shadows do not use a shadow map.** The sprite is drawn a second time writing only alpha; the nearer the surface the larger and softer the shadow, with `vFog.x` picking the mipmap level, and the bed pass takes four taps for a soft edge. The colour is multiplied by `vec3(1, .86, .72)` because water swallows red light first. Under cloud, shadows pale and blur on their own.
- **Cloud shadow is the master switch.** Caustics, sun glitter, fish highlights, and shadow depth all read the same cloud target and fade together into a cool grey.
- **The surface.** Slope comes from ripple height differences plus three breeze layers, the scene is sampled with a refraction offset along the normal, facets toward the light read brighter and those away from it darker, then sky reflection is mixed in; sun glitter is `pow(N·H, 1100)` gated by a noise mask and appears only in sunshine.
- **The moon uses the real phase.** `moonPhase()` derives tonight's age from a known new moon, and the final pass draws a half-ellipse terminator with maria, broken up by the waves, with moonlit glitter and stars between the swells.
- **Leaves share the air with the water.** In the floater shader each rain bead is drawn as a small lens with a dark rim, a highlight toward the light, and focused light on the far side; the pool in the heart of a lotus leaf tilts with the waves because the vertex shader reads the surface slope; snow, mist, lightning, and cloud shadow are applied again.
- **Live lighting on fish** happens in the sprite shader: a cylinder normal, a highlight exponent that varies with metalness, dimmed with the cloud shadow, added to the baked `shade` and `spec` from the texture.

Grading closes the frame: saturation, brightness, tint, rain mist, lightning flash, and vignette.

## How it is bundled

Each vendor file is an IIFE. It assigns its API to `window` and does not use `module.exports`. Rolldown would treat a CommonJS export as the module's own export and the globals would never appear. `index.jsx` imports the five vendor files for their side effects, then calls `mountPond`.

Deskulpt serves React, Emotion, and the widget APIs as runtime externals. This widget only imports `@deskulpt-test/react`.

## Host

`Pond` sizes itself to `window.innerWidth` and `window.innerHeight`, and listens for `resize`. The manifest width and height are the widget's stored geometry. The painted surface follows the canvas viewport so a 4K monitor at 150% scaling is not a zoomed crop of a hardcoded 3840×2160 box.

The tree is two siblings:

- The host `div` receives the WebGL (or 2D) canvas. Its opacity is `var(--nfr-widget-bg-alpha, 1)`, which the canvas shell sets from the widget's background-opacity setting. WebGL is created with `alpha: false`, so fading this element fades the water.
- The sentence is a separate `<p>`. It does not inherit that opacity, and it ignores pointer events.

Mounting uses `useLayoutEffect`, not `useEffect`, so a retained frame can be attached before the browser paints. Every minute the effect reads the clock, calls `setAtmosphere`, and swaps the sentence. A language change does the same through `subscribeLanguage`. The sentence fades: the new line is held for 420ms, then the visible line crossfades over 700ms.

## Viewer

`mountPond` builds a fixed cast and never persists it:

- 24 koi from `PondCore.createFish`
- one silver-carp shoal from `createSilverCarpShoal`
- turtles, crabs, and butterflies turned on
- names turned off

`prefers-reduced-motion: reduce` selects the `eco` quality. Otherwise the quality is `high`. Eco locks the device pixel ratio to 1 and aims at 30 fps. High caps the pixel ratio at 2 and aims at 60 fps. The renderer also caps the framebuffer: 1.6 million pixels in eco, 8.3 million in high. Above the cap it scales the buffer down instead of allocating a full 4K×DPR surface.

The pond image loads from `window.POND_IMAGE`. `PondGL.createRenderer` tries WebGL2 first. If that fails it clones the canvas and uses the 2D path. Context loss drops the renderer and calls `createPond` again unless `destroy` has already run.

Each animation frame steps the simulation, updates the scene look, draws, and renders. The loop pauses while `document.hidden` is true. The speed passed into `simulation.step` comes from the current period. In eco that speed is also capped at `0.45`.

`destroy` stops the loop and copies the WebGL canvas onto a 2D canvas kept in `parkedFrame`. `preserveDrawingBuffer` is `true` so that copy is not blank. The next `mountPond` inserts the snapshot synchronously, draws the first new frame (sprites included), then replaces the snapshot. Refreshing the widget therefore keeps the previous water on screen instead of flashing an empty host.

## Time and language

`periodOf` maps the local hour, and the weekend, onto one period:

| Period        | When                             |
| ------------- | -------------------------------- |
| `lateNight`   | 21:00–06:00, including weekends  |
| `weekend`     | Saturday and Sunday, 06:00–21:00 |
| `morning`     | 06:00–09:00                      |
| `lateMorning` | 09:00–12:00                      |
| `lunch`       | 12:00–14:00                      |
| `afternoon`   | 14:00–18:00                      |
| `evening`     | 18:00–21:00                      |

`atmosphereOf` turns that period into `weather` (`sunny` or `cloudy`), `night`, and a simulation `speed`. `lineOf` picks a sentence from the period's list. The index is the day of the year, so the line changes by day rather than by the minute.

The language is `localStorage["deskulpt.language"]`, either `zh-CN` or `en`, and defaults to `zh-CN`. `subscribeLanguage` listens for `deskulpt:language-changed` and for `storage`.

## Outside this directory

Drag handles, the fullscreen flag, background opacity, and whether the canvas sits behind the desktop icons are implemented by the Deskulpt canvas and the widgets plugin. This widget only reads the CSS variable and fills the viewport it is given.
