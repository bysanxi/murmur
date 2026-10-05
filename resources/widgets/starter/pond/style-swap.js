// Prepare a style off the frame, then commit it in one turn.
// The overflow check runs before any texture write.

export function decodeBed(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener(
      "load",
      () => {
        if (image.naturalWidth) resolve(image);
        else reject(new Error("bed"));
      },
      { once: true },
    );
    image.addEventListener("error", () => reject(new Error("bed")), {
      once: true,
    });
    image.src = url;
  });
}

export function createStyleSwap(ctx) {
  const miscCache = new Map();
  let switchToken = 0;

  function miscFor(next) {
    let cached = miscCache.get(next.name);
    if (!cached) {
      cached = next.art.miscSprites();
      miscCache.set(next.name, cached);
    }
    return cached;
  }

  function prepareStyle(next) {
    return decodeBed(next.bed.image).then((image) => ({
      style: next,
      image,
      sprites: miscFor(next),
      fish: ctx
        .fish()
        .map((item) => ctx.fishCanvas(item, next.art, ctx.cacheFor(next.name))),
      mask: ctx.floatMask(
        image.naturalWidth,
        image.naturalHeight,
        next.bed.floaters,
      ),
    }));
  }

  function commitStyle(prepared) {
    const prev = ctx.style();
    const renderer = ctx.renderer();
    const scene = ctx.scene();
    renderer.measureSprites(prepared.sprites);
    renderer.reloadSprites(prepared.sprites);
    renderer.setBedImage(prepared.image);
    renderer.setFloatMask(prepared.mask);
    ctx.setSprites(prepared.sprites);
    ctx.setBed(prepared.image);
    prepared.fish.forEach((sprite, index) => {
      renderer.setFish(index, sprite);
      const item = ctx.fish()[index];
      item.spriteReady = true;
      item.spriteCell = index;
      item.light = null;
    });
    scene.setStyle(prepared.style);
    ctx.setStyle(prepared.style);
    scene.placeBed();
    scene.resettle(prev.bed);
  }

  function requestStyle(name) {
    const next = ctx.styles[name];
    if (!next || next.name === ctx.style().name) return;
    const renderer = ctx.renderer();
    const scene = ctx.scene();
    if (!renderer || !scene) {
      ctx.setStyle(next);
      ctx.setSprites(next.art.miscSprites());
      ctx.reloadBed?.();
      return;
    }
    const token = ++switchToken;
    prepareStyle(next).then(
      (prepared) => {
        if (ctx.stopped() || token !== switchToken || !ctx.renderer()) return;
        try {
          commitStyle(prepared);
        } catch (error) {
          console.warn("pond style switch aborted", error);
        }
      },
      (error) => console.warn("pond style prepare failed", error),
    );
  }

  return { requestStyle };
}
