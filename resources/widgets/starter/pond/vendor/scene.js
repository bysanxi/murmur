// Everything alive in the pond besides the simulation: koi drawing, turtles, butterflies, petals, weather.
(function (root) {
  "use strict";
  const { fishPalette, BODY, clamp, wrap, fishPose } = root.PondCore;
  const { halfWidth, girthOf } = root.PondArt;
  const TAU = Math.PI * 2;
  let style = root.PondStyles.real;
  const floaters = () => style.bed.floaters;
  const homes = () => style.bed.crabHomes;
  const lotusBeds = () => floaters().filter((f) => f[3] === "f" && f[2] > 25);
  function sway(list, rnd) {
    const rank = (f) => ({ r: 0, l: 1, f: f[2] > 25 ? 4 : 2, b: 3 })[f[3]];
    return list
      .map((f) => ({
        f,
        p: [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU],
        sp: 0.8 + rnd() * 0.4,
        seed: rnd(),
        ja: 0,
        jv: 0,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        dx: 0,
        dy: 0,
      }))
      .sort((a, b) => rank(a.f) - rank(b.f) || b.f[2] - a.f[2]);
  }

  // Things above the water in the painted pond, fitted to the painting's edges:
  // [x, y, rx, kind, ry, rotation]; l = lotus/pennywort leaf, f = flower or petal, b = lotus bud, r = rock breaking the surface.
  // Flowers, buds and petals have pointed tips, so their ellipses are grown a little to take the tips in.
  const grow = (f) =>
    f[3] === "f" || f[3] === "b" ? 1.1 : f[3] === "l" ? 1.02 : 1;
  // Mask in image space: red = above water (no refraction or caustics), green = casts a shadow on the bed,
  // blue = rests on the water and leaves a wet line (flowers on stalks do not).
  function floatMask(width, height, list = floaters()) {
    const k = 0.5,
      c = document.createElement("canvas");
    c.width = Math.round(width * k);
    c.height = Math.round(height * k);
    const ctx = c.getContext("2d");
    for (const f of list) {
      const [x, y, rx, kind, ry = rx, rot = 0] = f,
        g = grow(f),
        stalk = kind === "b" || (kind === "f" && rx > 25);
      ctx.fillStyle =
        kind === "r"
          ? "rgb(215,0,215)"
          : stalk
            ? "rgb(255,255,0)"
            : "rgb(255,255,255)";
      ctx.beginPath();
      ctx.ellipse(x * k, y * k, rx * g * k, ry * g * k, rot, 0, TAU);
      ctx.fill();
    }
    return c;
  }

  // Weather looks; night multiplies on top. Arrays are RGB.
  // cloudCover: share of the pond under drifting cloud shadow (1 = overcast); cloudShade: how much a cloud's shadow dims.
  // Caustics, glints, fish highlights and crisp shadows belong to sunlit water only; the renderer takes them away under cloud.
  const LOOKS = {
    sunny: {
      sunK: 1,
      bright: 1.02,
      sat: 1,
      tint: [1.02, 1, 0.96],
      caustic: 0.26,
      causticTint: [1, 0.97, 0.84],
      glint: 1,
      glintColor: [1, 0.96, 0.84],
      sky: [0.86, 0.93, 0.94],
      skyK: 0.025,
      cloudCover: 0.14,
      cloudShade: 0.3,
      wave: 0.6,
      refract: 14,
      ripple: 9,
      shade: 0.3,
      shadow: 0.8,
      vignette: 0.5,
      water: [0.34, 0.47, 0.4],
      moon: 0,
      mist: 0,
    },
    cloudy: {
      sunK: 0.95,
      bright: 0.98,
      sat: 0.9,
      tint: [1, 1, 1.01],
      caustic: 0.22,
      causticTint: [1, 0.97, 0.88],
      glint: 0.8,
      glintColor: [1, 0.96, 0.86],
      sky: [0.82, 0.87, 0.88],
      skyK: 0.05,
      cloudCover: 0.56,
      cloudShade: 0.46,
      wave: 0.7,
      refract: 14,
      ripple: 9,
      shade: 0.26,
      shadow: 0.78,
      vignette: 0.55,
      water: [0.35, 0.46, 0.42],
      moon: 0,
      mist: 0,
    },
    rain: {
      sunK: 0.4,
      bright: 0.76,
      sat: 0.66,
      tint: [0.93, 0.98, 1.04],
      caustic: 0.035,
      causticTint: [0.9, 0.95, 1],
      glint: 0.12,
      glintColor: [0.9, 0.95, 1],
      sky: [0.68, 0.74, 0.78],
      skyK: 0.13,
      cloudCover: 1,
      cloudShade: 0.08,
      wave: 1,
      refract: 15,
      ripple: 10,
      shade: 0.3,
      shadow: 0.5,
      vignette: 0.65,
      water: [0.3, 0.39, 0.38],
      moon: 0,
      mist: 0.1,
    },
    snow: {
      sunK: 0.55,
      bright: 0.94,
      sat: 0.66,
      tint: [0.99, 1.02, 1.07],
      caustic: 0.06,
      causticTint: [0.95, 0.98, 1],
      glint: 0.28,
      glintColor: [0.95, 0.98, 1],
      sky: [0.9, 0.93, 0.96],
      skyK: 0.11,
      cloudCover: 0.75,
      cloudShade: 0.2,
      wave: 0.42,
      refract: 13,
      ripple: 8,
      shade: 0.22,
      shadow: 0.5,
      vignette: 0.5,
      water: [0.4, 0.48, 0.48],
      moon: 0,
      mist: 0.04,
    },
  };
  function lookFor(weather, night, rain = 0.5, snow = 0.5) {
    const l = JSON.parse(JSON.stringify(LOOKS[weather] || LOOKS.sunny));
    if (weather === "rain")
      Object.assign(l, {
        bright: 0.86 - 0.16 * rain,
        sat: 0.74 - 0.12 * rain,
        wave: 0.72 + 0.55 * rain,
        skyK: 0.09 + 0.07 * rain,
        mist: 0.04 + 0.12 * rain,
      });
    if (weather === "snow")
      Object.assign(l, {
        bright: 0.9 + 0.08 * snow,
        sat: 0.72 - 0.18 * snow,
        cloudCover: 0.6 + 0.4 * snow,
        skyK: 0.08 + 0.09 * snow,
        caustic: 0.07 * (1 - snow * 0.6),
        wave: 0.5 - 0.12 * snow,
        mist: 0.02 + 0.06 * snow,
      });
    if (night)
      Object.assign(l, {
        sunK: l.sunK * 0.45,
        bright: l.bright * 0.46,
        sat: l.sat * 0.72,
        tint: [0.64, 0.8, 1.14],
        caustic: l.caustic * 0.25,
        glint: 0.55,
        glintColor: [0.7, 0.82, 1],
        sky: [0.22, 0.3, 0.44],
        skyK: l.skyK * 1.3 + 0.04,
        wave: l.wave * 1.1,
        shadow: l.shadow * 0.35,
        cloudShade: l.cloudShade * 0.5,
        moon: weather === "sunny" || weather === "snow" ? 1 : 0.35,
        water: [0.2, 0.3, 0.36],
        mist: l.mist * 0.6,
      });
    return l;
  }
  // Age of the moon from a known new moon, so the reflection shows tonight's real phase.
  function moonPhase(date = new Date()) {
    const month = 29.530588853,
      age =
        ((((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % month) + month) %
        month,
      angle = (age / month) * TAU;
    return {
      age,
      angle,
      illum: (1 - Math.cos(angle)) / 2,
      name: [
        "新月",
        "蛾眉月",
        "上弦月",
        "盈凸月",
        "满月",
        "亏凸月",
        "下弦月",
        "残月",
      ][Math.round((age / month) * 8) % 8],
    };
  }
  function lerpLook(a, b, t) {
    for (const k in b) {
      if (Array.isArray(b[k]))
        for (let i = 0; i < b[k].length; i++)
          a[k][i] += (b[k][i] - a[k][i]) * t;
      else a[k] += (b[k] - a[k]) * t;
    }
  }

  class Turtle {
    constructor(variant, rnd) {
      Object.assign(this, {
        variant,
        rnd,
        x: 0.25 + rnd() * 0.5,
        y: 0.3 + rnd() * 0.45,
        angle: rnd() * TAU,
        v: 0,
        turn: 0,
        stroke: rnd() * TAU,
        depth: 0.5,
        depthGoal: 0.5,
        goal: null,
        goalTime: 0,
        rest: 2 + rnd() * 4,
        breath: 20 + rnd() * 30,
        surfaced: 0,
        look: 0,
        lookGoal: 0,
        neck: 1,
        size: 1.08 + rnd() * 0.14,
        bubble: 0,
      });
    }
    update(dt, w, h, scale, scene) {
      const r = this.rnd,
        s = scale * this.size,
        L = 60 * s;
      let x = this.x * w,
        y = this.y * h;
      this.breath -= dt;
      if (this.breath <= 0 && this.surfaced <= 0) {
        this.depthGoal = 0;
        if (this.depth < 0.05) {
          this.surfaced = 4 + r() * 4;
          this.breath = 40 + r() * 40;
          scene.drop(...this.headPos(w, h, scale), 6 * scale, 0.45);
        }
      }
      if (this.surfaced > 0) {
        this.surfaced -= dt;
        this.bubble -= dt;
        if (this.bubble <= 0) {
          this.bubble = 0.8 + r() * 1.4;
          scene.drop(...this.headPos(w, h, scale), 3.5 * scale, 0.12);
        }
        if (this.surfaced <= 0) {
          this.depthGoal = 0.4 + r() * 0.35;
          scene.drop(x, y, 12 * scale, 0.35);
        }
      }
      this.rest -= dt;
      if (this.rest < -8 - r() * 10) this.rest = 3 + r() * 6;
      const resting = this.rest > 0 || this.surfaced > 0;
      this.goalTime -= dt;
      if (
        !this.goal ||
        this.goalTime <= 0 ||
        Math.hypot(this.goal[0] * w - x, this.goal[1] * h - y) < L
      ) {
        this.goal = [0.18 + r() * 0.64, 0.2 + r() * 0.6];
        this.goalTime = 15 + r() * 15;
      }
      let gx = this.goal[0] * w - x,
        gy = this.goal[1] * h - y;
      const m = Math.min(w, h) * 0.1,
        lx = x + Math.cos(this.angle) * L,
        ly = y + Math.sin(this.angle) * L;
      if (lx < m || lx > w - m) gx += (w / 2 - x) * 2;
      if (ly < m || ly > h - m) gy += (h / 2 - y) * 2;
      for (const o of scene.turtles)
        if (o !== this) {
          const dx = x - o.x * w,
            dy = y - o.y * h,
            d = Math.hypot(dx, dy);
          if (d < L * 1.3 && d > 0) {
            gx += (dx / d) * L * 3;
            gy += (dy / d) * L * 3;
          }
        }
      const want =
        Math.atan2(gy, gx) +
        Math.sin(scene.time * 0.13 + this.variant * 3) * 0.3;
      this.turn +=
        (clamp(wrap(want - this.angle) * 0.8, -0.45, 0.45) *
          (resting ? 0.15 : 1) -
          this.turn) *
        Math.min(1, dt * 2);
      this.angle = wrap(this.angle + this.turn * dt);
      // Power stroke on the down-sweep, gliding in between.
      const rate = resting ? 0.12 : 0.62;
      this.stroke += dt * TAU * rate;
      this.v +=
        Math.max(0, Math.sin(this.stroke)) * (resting ? 0 : L * 0.5) * dt;
      this.v *= Math.exp(-dt * 0.9);
      x += Math.cos(this.angle) * this.v * dt;
      y += Math.sin(this.angle) * this.v * dt;
      this.x = clamp(x / w, 0.05, 0.95);
      this.y = clamp(y / h, 0.06, 0.94);
      this.depth += (this.depthGoal - this.depth) * Math.min(1, dt * 0.45);
      if (r() < dt * 0.25) this.lookGoal = (r() - 0.5) * (resting ? 1.1 : 0.5);
      this.look += (this.lookGoal - this.look) * Math.min(1, dt * 1.5);
      this.neck +=
        ((this.surfaced > 0 ? 1.25 : resting ? 0.75 : 1) - this.neck) *
        Math.min(1, dt * 1.5);
    }
    headPos(w, h, scale) {
      const s = scale * this.size,
        d = (20 + 10 * this.neck) * s;
      return [
        this.x * w + Math.cos(this.angle) * d,
        this.y * h + Math.sin(this.angle) * d,
      ];
    }
    draw(R, w, h, scale, look) {
      const S = R.sprites,
        v = this.variant,
        s = scale * this.size * (1 + (0.5 - this.depth) * 0.08),
        x = this.x * w,
        y = this.y * h,
        a = this.angle,
        c = Math.cos(a),
        si = Math.sin(a);
      const fogA = 0.03 + this.depth * 0.3,
        fog = [look.water[0], look.water[1], look.water[2], fogA];
      const at = (lx, ly) => [
        x + (lx * c - ly * si) * s,
        y + (lx * si + ly * c) * s,
      ];
      const off = (6 + (1 - this.depth) * 26) * scale,
        dx = look.shadowDir[0] * off,
        dy = look.shadowDir[1] * off,
        sh = [0, 0, 0, 0.86 - (1 - this.depth) * 0.2],
        blur = [(1 - this.depth) * 1.1, 0, 0, 0];
      const part = (name, lx, ly, ang, flip) => {
        const [px, py] = at(lx, ly);
        R.sprite(
          "under",
          S[`turtle${v}_${name}`],
          px,
          py,
          a + ang,
          s,
          flip ? -s : s,
          undefined,
          fog,
        );
        R.sprite(
          "shadow",
          S[`turtle${v}_${name}`],
          px + dx,
          py + dy,
          a + ang,
          s,
          flip ? -s : s,
          sh,
          blur,
        );
      };
      const swim = this.rest > 0 || this.surfaced > 0 ? 0.25 : 1,
        st = this.stroke;
      for (const side of [1, -1]) {
        const ph = side > 0 ? 0 : Math.PI;
        part(
          "back",
          -13,
          side * 11,
          side * (2.3 + Math.sin(st + ph + Math.PI) * 0.38 * swim),
          side < 0,
        );
        part(
          "front",
          11,
          side * 12.8,
          side * (0.85 + (0.5 - 0.5 * Math.cos(st + ph)) * 0.95 * swim),
          side < 0,
        );
      }
      part("tail", -20.5, 0, Math.PI + Math.sin(st * 0.5) * 0.25, false);
      part("head", 16 + 3.5 * this.neck, 0, this.look, false);
      part("shell", 0, 0, 0, false);
    }
  }

  class Butterfly {
    constructor(species, rnd) {
      Object.assign(this, {
        species,
        rnd,
        x: -1,
        y: -1,
        vx: 0,
        vy: 0,
        heading: rnd() * TAU,
        alt: 0.8,
        flap: 0,
        phase: rnd() * TAU,
        state: "fly",
        target: null,
        timer: 0,
        glide: 0,
        wander: rnd() * TAU,
        open: 0.5,
      });
    }
    pickTarget(w, h, spots) {
      const r = this.rnd;
      if (spots.length && r() < 0.45) {
        const s = spots[Math.floor(r() * spots.length)];
        this.target = {
          x: s[0] + (r() - 0.5) * 8,
          y: s[1] + (r() - 0.5) * 8,
          land: true,
        };
      } else
        this.target = {
          x: w * (0.12 + r() * 0.76),
          y: h * (0.14 + r() * 0.72),
          land: false,
        };
      this.timer = 6 + r() * 8;
    }
    update(dt, w, h, scale, spots, time) {
      const r = this.rnd;
      if (!this.target) this.pickTarget(w, h, spots);
      if (this.state === "rest") {
        this.timer -= dt;
        this.alt += (0 - this.alt) * Math.min(1, dt * 3);
        // Resting wings open and close slowly, sometimes staying spread to bask.
        this.open +=
          ((Math.sin(time * 1.3 + this.phase) > -0.2 ? 0.05 : 1.2) -
            this.open) *
          Math.min(1, dt * 1.8);
        this.flap = this.open;
        this.heading += Math.sin(time * 0.7 + this.phase) * dt * 0.15;
        if (this.timer <= 0) {
          this.state = "fly";
          this.pickTarget(w, h, spots);
          this.vy -= 30;
        }
        return;
      }
      const t = this.target,
        dx = t.x - this.x,
        dy = t.y - this.y,
        d = Math.hypot(dx, dy);
      this.timer -= dt;
      if (t.land && d < 10) {
        this.state = "rest";
        this.timer = 4 + r() * 8;
        this.vx = this.vy = 0;
        return;
      }
      if ((!t.land && d < 40) || this.timer <= 0) this.pickTarget(w, h, spots);
      this.wander += (r() - 0.5) * dt * 9;
      const sp = (t.land ? clamp(d / 70, 0.35, 1) : 1) * 95 * scale;
      const ax = (dx / (d || 1)) * sp + Math.cos(this.wander) * 45 * scale,
        ay = (dy / (d || 1)) * sp + Math.sin(this.wander) * 45 * scale;
      this.vx += (ax - this.vx) * Math.min(1, dt * 2.2);
      this.vy += (ay - this.vy) * Math.min(1, dt * 2.2);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const want = Math.atan2(this.vy, this.vx);
      this.heading += clamp(wrap(want - this.heading), -dt * 6, dt * 6);
      // Quick flaps with the odd glide; a downstroke lifts the body a little.
      this.glide -= dt;
      if (this.glide <= 0 && r() < dt * 0.35) this.glide = 0.25 + r() * 0.45;
      if (this.glide > 0)
        this.flap += (0.05 - this.flap) * Math.min(1, dt * 10);
      else {
        this.phase += dt * TAU * (this.species === 2 ? 6.5 : 9);
        const s = 0.5 + 0.5 * Math.sin(this.phase);
        this.flap = -0.12 + 1.45 * Math.pow(s, 0.7);
      }
      const altGoal = t.land
        ? clamp(d / 120, 0.05, 0.8)
        : 0.75 + 0.12 * Math.sin(time * 1.1 + this.phase * 0.1);
      this.alt += (altGoal - this.alt) * Math.min(1, dt * 1.5);
      this.x = clamp(this.x, -20, w + 20);
      this.y = clamp(this.y, -20, h + 20);
    }
    draw(R, scale, look) {
      const S = R.sprites,
        s = scale * 0.55 * (0.9 + this.alt * 0.35),
        a = this.heading + Math.PI / 2,
        wing = S[`bf${this.species}_wing`],
        body = S[`bf${this.species}_body`];
      const k = Math.cos(clamp(this.flap, -0.3, 1.5)),
        shade = 0.82 + 0.18 * k,
        col = [shade, shade, shade, 1],
        bob = this.state === "rest" ? 0 : Math.sin(this.phase) * 1.2;
      const off = (3 + this.alt * 70) * scale,
        dx = look.shadowDir[0] * off,
        dy = look.shadowDir[1] * off + bob,
        sa = [0, 0, 0, (0.28 - this.alt * 0.12) * look.shadow * 2];
      for (const side of [1, -1]) {
        R.sprite(
          "airShadow",
          wing,
          this.x + dx,
          this.y + dy,
          a,
          side * s * Math.max(0.08, k),
          s,
          sa,
        );
        R.sprite(
          "air",
          wing,
          this.x,
          this.y + bob,
          a,
          side * s * Math.max(0.06, k),
          s,
          col,
        );
      }
      R.sprite(
        "airShadow",
        body,
        this.x + dx,
        this.y + dy,
        a,
        s * 0.9,
        s * 0.9,
        sa,
      );
      R.sprite("air", body, this.x, this.y + bob, a, s * 0.9, s * 0.9);
    }
  }

  // Dragonfly: quick straight darts between hovers, rests on buds, and now and then dips to the water (蜻蜓点水).
  class Dragonfly {
    constructor(species, rnd) {
      Object.assign(this, {
        species,
        rnd,
        x: -1,
        y: -1,
        vx: 0,
        vy: 0,
        heading: rnd() * TAU,
        alt: 0.7,
        state: "hover",
        timer: 1,
        target: null,
        flap: 0,
        touched: false,
      });
    }
    choose(w, h, scale, perches) {
      const r = this.rnd,
        roll = r(),
        a = r() * TAU;
      if (roll < 0.22 && perches.length) {
        const p = perches[Math.floor(r() * perches.length)];
        this.state = "perch";
        this.target = { x: p[0], y: p[1] };
        this.timer = 4 + r() * 9;
      } else if (roll < 0.45) {
        const d = (50 + r() * 130) * scale;
        this.state = "dip";
        this.touched = false;
        this.target = {
          x: clamp(this.x + Math.cos(a) * d, w * 0.15, w * 0.85),
          y: clamp(this.y + Math.sin(a) * d, h * 0.15, h * 0.85),
        };
      } else {
        const d = (120 + r() * 260) * scale;
        this.state = "dart";
        this.target = {
          x: clamp(this.x + Math.cos(a) * d, w * 0.08, w * 0.92),
          y: clamp(this.y + Math.sin(a) * d, h * 0.1, h * 0.9),
        };
      }
    }
    update(dt, w, h, scale, scene, perches, time) {
      const r = this.rnd;
      if (this.x < 0) {
        this.x = w * (0.2 + r() * 0.6);
        this.y = h * (0.2 + r() * 0.6);
      }
      this.flap += dt;
      if (this.state === "hover" || this.state === "rest") {
        this.timer -= dt;
        this.vx *= Math.exp(-dt * 6);
        this.vy *= Math.exp(-dt * 6);
        if (this.state === "hover") {
          this.x +=
            this.vx * dt + Math.sin(time * 2.3 + this.species) * 5 * scale * dt;
          this.y += this.vy * dt + Math.cos(time * 3.1) * 4 * scale * dt;
          this.alt += (0.6 - this.alt) * Math.min(1, dt * 2);
        }
        if (this.timer <= 0) this.choose(w, h, scale, perches);
        return;
      }
      const t = this.target,
        dx = t.x - this.x,
        dy = t.y - this.y,
        d = Math.hypot(dx, dy),
        want = Math.min((this.state === "dart" ? 320 : 170) * scale, d * 5);
      this.vx += ((dx / (d || 1)) * want - this.vx) * Math.min(1, dt * 8);
      this.vy += ((dy / (d || 1)) * want - this.vy) * Math.min(1, dt * 8);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (d > 4)
        this.heading += clamp(
          wrap(Math.atan2(dy, dx) - this.heading),
          -dt * 14,
          dt * 14,
        );
      if (this.state === "dip") {
        this.alt +=
          ((d < 25 * scale ? 0.02 : 0.45) - this.alt) * Math.min(1, dt * 5);
        if (d < 4 && !this.touched) {
          this.touched = true;
          scene.drop(this.x, this.y, 3.5 * scale, 0.5);
          this.state = "hover";
          this.timer = 0.4 + r() * 0.8;
        }
      } else if (this.state === "perch") {
        this.alt +=
          ((d < 30 * scale ? 0 : 0.5) - this.alt) * Math.min(1, dt * 3);
        if (d < 2) {
          this.state = "rest";
          this.vx = this.vy = 0;
          this.alt = 0;
        }
      } else {
        this.alt += (0.7 - this.alt) * Math.min(1, dt * 2);
        if (d < 6) {
          this.state = "hover";
          this.timer = 0.5 + r() * 2.2;
        }
      }
    }
    draw(R, scale, look) {
      const S = R.sprites,
        s = scale * 0.7 * (0.9 + this.alt * 0.3),
        wing = S[`df${this.species}_wing`],
        body = S[`df${this.species}_body`],
        c = Math.cos(this.heading),
        si = Math.sin(this.heading);
      const off = (3 + this.alt * 60) * scale,
        dx = look.shadowDir[0] * off,
        dy = look.shadowDir[1] * off,
        sa = [0, 0, 0, (0.3 - this.alt * 0.12) * look.shadow * 2],
        resting = this.state === "rest";
      // Four wings off the thorax; in flight they beat too fast to see, so draw two faint blurred positions.
      for (const [fwd, sweep] of [
        [1.2, -0.16],
        [-0.6, 0.2],
      ])
        for (const side of [1, -1]) {
          const x = this.x + c * fwd * s,
            y = this.y + si * fwd * s,
            ang = this.heading + side * (Math.PI / 2 + sweep);
          R.sprite("airShadow", wing, x + dx, y + dy, ang, s, side * s, sa);
          if (resting)
            R.sprite("air", wing, x, y, ang, s, side * s, [1, 1, 1, 0.95]);
          else
            for (const k of [-1, 1])
              R.sprite(
                "air",
                wing,
                x,
                y,
                ang + side * k * 0.18,
                s * (0.8 + 0.2 * Math.sin(this.flap * 60 + k)),
                side * s,
                [1, 1, 1, 0.45],
              );
        }
      R.sprite(
        "airShadow",
        body,
        this.x + dx,
        this.y + dy,
        this.heading + Math.PI / 2,
        s,
        s,
        sa,
      );
      R.sprite("air", body, this.x, this.y, this.heading + Math.PI / 2, s, s);
    }
  }

  // Where crabs live, in painting px [x, y, rx, ry]: the rocks that break the surface and the mossy banks around them.
  // A small crab: it scuttles sideways about its rock or bank, rests with claws raised, now and then waves one,
  // and bolts for the water and dives when something startles it, coming up again somewhere else a while later.
  class Crab {
    constructor(variant, rnd) {
      Object.assign(this, {
        variant,
        rnd,
        home: 0,
        u: 0,
        v: 0,
        heading: rnd() * TAU,
        state: "hidden",
        timer: 1 + rnd() * 6,
        walk: 0,
        speed: 0,
        target: null,
        side: 1,
        alpha: 0,
        wave: 0,
        waveT: 0,
        size: 0.85 + rnd() * 0.35,
        x: 0,
        y: 0,
      });
    }
    // Position on screen of a point (u, v in the unit disc) of home h.
    at(R, h, u, v) {
      const [x, y, rx, ry] = homes()[h];
      return R.imageToScreen(x + u * rx, y + v * ry);
    }
    emerge(R, open, taken = []) {
      // Surface on a rock or bank no other crab is on, if there is one.
      const free = open.filter((h) => !taken.includes(h)),
        pool = free.length ? free : open,
        r = this.rnd;
      this.home = pool[Math.floor(r() * pool.length)];
      const a = r() * TAU,
        d = Math.sqrt(r()) * 0.7;
      this.u = Math.cos(a) * d;
      this.v = Math.sin(a) * d;
      this.state = "idle";
      this.timer = 1 + r() * 3;
      this.alpha = 0;
    }
    startle(x, y, radius) {
      if (
        this.state === "hidden" ||
        this.state === "dive" ||
        Math.hypot(this.x - x, this.y - y) > radius
      )
        return;
      // Run for the edge of its patch that faces away from the disturbance, then dive.
      const a = Math.atan2(this.y - y, this.x - x);
      this.state = "flee";
      this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05];
      this.timer = 2;
    }
    update(dt, R, scale, open, allowed, scene, taken) {
      const r = this.rnd;
      if (!allowed && this.state !== "hidden" && this.state !== "dive") {
        this.state = "flee";
        this.target = [this.u * 1.6 + 0.01, this.v * 1.6];
        this.timer = 2;
      }
      if (this.state === "hidden") {
        this.timer -= dt;
        if (this.timer <= 0 && allowed && open.length)
          this.emerge(R, open, taken);
        return;
      }
      if (this.state === "dive") {
        this.alpha -= dt * 1.6;
        if (this.alpha <= 0) {
          this.state = "hidden";
          this.timer = 12 + r() * 25;
        }
        return;
      }
      this.alpha = Math.min(1, this.alpha + dt * 1.2);
      const [, , rx, ry] = homes()[this.home],
        k = Math.hypot(
          ...R.imageToScreen(1, 0).map((c, i) => c - R.imageToScreen(0, 0)[i]),
        );
      if (this.state === "idle") {
        this.timer -= dt;
        this.speed *= Math.exp(-dt * 8);
        if (this.waveT <= 0 && r() < dt * 0.12) this.waveT = 1.2;
        if (this.timer <= 0) {
          if (r() < 0.1) {
            this.state = "flee";
            const a = r() * TAU;
            this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05];
          } else {
            const a = r() * TAU,
              d = Math.sqrt(r()) * 0.8;
            this.target = [Math.cos(a) * d, Math.sin(a) * d];
            this.state = "walk";
            this.timer = 6;
          }
        }
      }
      if (this.state === "walk" || this.state === "flee") {
        const [x0, y0] = this.at(R, this.home, this.u, this.v),
          [x1, y1] = this.at(R, this.home, this.target[0], this.target[1]),
          dx = x1 - x0,
          dy = y1 - y0,
          d = Math.hypot(dx, dy);
        // Crabs walk sideways: turn so the target lies off one flank, then scuttle.
        const dir = Math.atan2(dy, dx),
          want = [dir - Math.PI / 2, dir + Math.PI / 2].sort(
            (a, b) =>
              Math.abs(wrap(a - this.heading)) -
              Math.abs(wrap(b - this.heading)),
          )[0];
        this.side = Math.sin(dir - want) > 0 ? 1 : -1;
        this.heading += clamp(wrap(want - this.heading), -dt * 2.4, dt * 2.4);
        const go = (this.state === "flee" ? 80 : 24) * scale * this.size,
          aligned = Math.abs(wrap(want - this.heading)) < 0.6 ? 1 : 0.25;
        this.speed += (go * aligned - this.speed) * Math.min(1, dt * 6);
        const step = Math.min(d, this.speed * dt);
        if (d > 0.5) {
          this.u += ((dx / d) * step) / (rx * k);
          this.v += ((dy / d) * step) / (ry * k);
        }
        this.walk += (this.speed * dt) / (3.6 * scale);
        this.timer -= dt;
        if (d < 1.5 || this.timer <= 0) {
          if (this.state === "flee") {
            this.state = "dive";
            const [x, y] = this.at(R, this.home, this.u, this.v);
            scene.drop(x, y, 4 * scale, 0.3);
          } else {
            this.state = "idle";
            this.timer = 2 + r() * 7;
          }
        }
      }
      if (this.waveT > 0) this.waveT -= dt;
      [this.x, this.y] = this.at(R, this.home, this.u, this.v);
    }
    draw(R, scale, look) {
      if (this.state === "hidden" || this.alpha <= 0) return;
      const S = R.sprites,
        v = this.variant,
        s = scale * 1.05 * this.size,
        a = this.heading,
        c = Math.cos(a),
        si = Math.sin(a),
        A = this.alpha;
      const lit = [
        look.bright * look.tint[0] * A,
        look.bright * look.tint[1] * A,
        look.bright * look.tint[2] * A,
        A,
      ];
      const at = (lx, ly) => [
        this.x + (lx * c - ly * si) * s,
        this.y + (lx * si + ly * c) * s,
      ];
      const moving = this.speed > 2 * scale,
        sh = [0, 0, 0, 0.34 * A],
        od = 3.4 * scale;
      R.sprite(
        "surface",
        S[`crab${v}_body`],
        this.x + look.shadowDir[0] * od,
        this.y + look.shadowDir[1] * od,
        a,
        s * 1.08,
        s * 1.08,
        sh,
      );
      // Four walking legs a side; while scuttling they swing in two alternating sets.
      for (const side of [1, -1])
        for (let i = 0; i < 4; i++) {
          const [px, py] = at(1.9 - i * 1.35, side * 3.6),
            swing = moving
              ? Math.sin(
                  this.walk + (i % 2) * Math.PI + (side > 0 ? 0 : Math.PI / 2),
                ) * 0.32
              : Math.sin(scale + i) * 0.03;
          const ang = a + side * (Math.PI / 2 + (i - 1.3) * 0.36 + swing);
          R.sprite(
            "surface",
            S[`crab${v}_leg`],
            px + look.shadowDir[0] * od * 0.6,
            py + look.shadowDir[1] * od * 0.6,
            ang,
            s,
            side * s,
            [0, 0, 0, 0.22 * A],
          );
          R.sprite("surface", S[`crab${v}_leg`], px, py, ang, s, side * s, lit);
        }
      // Claws held forward; one lifts and waves now and then.
      for (const side of [1, -1]) {
        const [px, py] = at(4.4, side * 2.5),
          raise =
            side > 0 && this.waveT > 0
              ? Math.sin((1.2 - this.waveT) * 9) *
                0.5 *
                Math.min(1, this.waveT * 3)
              : 0;
        R.sprite(
          "surface",
          S[`crab${v}_claw`],
          px,
          py,
          a + side * (0.55 + raise),
          s * (1 + Math.abs(raise) * 0.15),
          side * s,
          lit,
        );
      }
      R.sprite("surface", S[`crab${v}_body`], this.x, this.y, a, s, s, lit);
    }
  }

  class Frog {
    static swimming = Object.freeze({
      bodyLength: 20.5,
      longRate: 0.25,
      shortRate: 0.85,
      coastDrag: 0.8,
      longGlideBodies: 4,
      longDistanceBodies: 6,
    });
    static swimCurve(progress, values, gather, push, coast) {
      const canonical = values.map((value, i) => {
        const u = i / (values.length - 1);
        const phase =
          u <= 0.25
            ? (u / 0.25) * gather
            : u <= 0.4
              ? gather + ((u - 0.25) / 0.15) * (push - gather)
              : u <= 0.8
                ? push + ((u - 0.4) / 0.4) * (coast - push)
                : coast + ((u - 0.8) / 0.2) * (1 - coast);
        return [phase, value];
      });
      const end = canonical.length - 1;
      const slope = (i) => {
        const at = i === end ? 0 : i;
        const prev = at === 0 ? end - 1 : at - 1;
        const next = at === end - 1 ? 1 : at + 1;
        const x = canonical[at][0];
        const prevX = at === 0 ? canonical[prev][0] - 1 : canonical[prev][0];
        const nextX =
          at === end - 1 ? canonical[next][0] + 1 : canonical[next][0];
        const h0 = x - prevX;
        const h1 = nextX - x;
        const d0 = (canonical[at][1] - canonical[prev][1]) / h0;
        const d1 = (canonical[next][1] - canonical[at][1]) / h1;
        if (d0 * d1 <= 0) return 0;
        const w0 = 2 * h1 + h0;
        const w1 = h1 + 2 * h0;
        return (w0 + w1) / (w0 / d0 + w1 / d1);
      };
      const p = clamp(progress, 0, 1);
      let i = 0;
      while (i < end - 1 && p > canonical[i + 1][0]) i++;
      const [x0, y0] = canonical[i];
      const [x1, y1] = canonical[i + 1];
      const h = x1 - x0;
      const t = clamp((p - x0) / h, 0, 1);
      const t2 = t * t;
      const t3 = t2 * t;
      return clamp(
        (2 * t3 - 3 * t2 + 1) * y0 +
          (t3 - 2 * t2 + t) * h * slope(i) +
          (-2 * t3 + 3 * t2) * y1 +
          (t3 - t2) * h * slope(i + 1),
        0,
        1,
      );
    }
    // Anatomy stays fixed while the separate pose channels animate it.
    static anatomy = Object.freeze({
      hipX: -9.2,
      hipY: 3.8,
      thighLength: 10.5,
      thighScale: 0.8,
      // The calf is kept close to thigh length; the short tarsus and foot
      // remain independent so the ankle-to-toe span stays anatomically legible.
      shinLength: 5.5,
      shinScale: 1.55,
      tarsusLength: 1.4,
      tarsusScale: 2,
      foldedThigh: 0.96,
      extendedThigh: Math.PI - 0.22,
      footScale: 0.62,
      shoulderX: 2.5,
      shoulderY: 5.4,
      foreWristX: 5.8,
      foreWristY: -3,
      foreHandAngle: -0.6,
    });
    constructor(variant, rnd) {
      Object.assign(this, {
        variant,
        rnd,
        state: "sit",
        perch: null,
        u: 0,
        v: 0,
        x: -1,
        y: -1,
        w: 1,
        h: 1,
        angle: rnd() * TAU,
        timer: 3 + rnd() * 8,
        from: null,
        to: null,
        hopT: 0,
        hopDur: 1,
        hopH: 0,
        z: 0,
        depth: 0,
        depthGoal: 0.06,
        stroke: rnd() * TAU,
        prevPh: 0,
        strokeMode: null,
        strokeCycle: -1,
        strokeReach: null,
        swimMode: "short",
        power: 0,
        swimT: 0,
        diveT: 0,
        fleeT: 0,
        stride: 0,
        coastT: 9,
        coastV: 0,
        swimV: 0,
        goal: null,
        goalT: 0,
        armFold: 0,
        armAmp: 0.35,
        stretch: 1,
        turnBend: 0,
        prevSin: 0,
        wakeT: 0,
        floatT: 0,
        modeT: 0,
        floatMode: "surface",
        travelT: 1e9,
        kickCd: 0,
        kickU: 1,
        powerAlt: 0,
        altLegs: false,
        altArms: false,
        driftA: rnd() * TAU,
        rippleT: 0,
        aim: 0,
        breath: 6 + rnd() * 10,
        pulse: rnd() * TAU,
        swimA: 0,
        look: 0,
        lookGoal: 0,
        throat: 0,
        croak: 0,
        croakDur: 0,
        called: false,
        croakGap: 2 + rnd() * 6,
        alpha: 1,
        size: 0.72 + rnd() * 0.16,
      });
    }
    // Screen position of the frog on its perch, following the leaf's sway.
    atPerch(scene) {
      const p = this.perch;
      if (!p) return [this.x, this.y];
      const f = p.fl.f,
        [sx, sy] = scene.R.imageToScreen(
          f[0] + this.u * f[2],
          f[1] + this.v * (f[4] || f[2]),
        );
      return [sx + (p.fl.dx || 0), sy + (p.fl.dy || 0)];
    }
    startHop(tx, ty) {
      this.from = [this.x, this.y];
      this.to = [tx, ty];
      const d = Math.hypot(tx - this.x, ty - this.y);
      this.hopDur = Math.max(
        0.3,
        Math.min(1.3, d / (300 * Math.max(0.6, this.scale || 1))),
      );
      this.hopH = Math.min(60, 10 + d * 0.12);
      this.hopT = 0;
      this.state = "hop";
      if (d > 2) this.angle = Math.atan2(ty - this.y, tx - this.x);
      this.croak = 0;
      this.throat = 0;
    }
    startle(x, y, radius) {
      if (
        this.state === "hidden" ||
        Math.hypot(this.x - x, this.y - y) > radius
      )
        return;
      const r = this.rnd,
        a = Math.atan2(this.y - y, this.x - x);
      if (this.state === "swim" || this.state === "float") {
        if (this.state === "float") {
          // Leave the still water with a clean kick cycle already under way.
          this.stroke = r() * TAU * 0.1;
          this.strokeMode = null;
          this.strokeReach = null;
          this.prevPh = 0;
          this.stride = (40 + r() * 14) * this.scale;
          this.coastT = 9;
          this.altLegs = false;
          this.altArms = false;
          this.state = "swim";
        }
        this.diveT = 5 + r() * 7;
        this.fleeT = this.diveT; // dash fast for as long as it stays under
        this.swimA = a;
        this.depthGoal = 0.66;
        return;
      }
      const d = radius * (0.7 + r() * 0.6);
      this.startHop(
        clamp(this.x + Math.cos(a) * d, 24, this.w - 24),
        clamp(this.y + Math.sin(a) * d, 24, this.h - 24),
      );
    }
    // Put back on a free perch (used when the layout moves or a frog re-emerges).
    reseat(scene) {
      const r = this.rnd,
        list = scene.frogPerches;
      if (!list.length) {
        this.state = "hidden";
        this.timer = 4 + r() * 8;
        this.perch = null;
        return;
      }
      const free = list.filter(
        (p) =>
          !scene.frogs.some(
            (o) =>
              o !== this &&
              o.perch === p &&
              (o.state === "sit" || o.state === "hop"),
          ),
      );
      const pick = free.length ? free : list,
        p = pick[Math.floor(r() * pick.length)];
      this.perch = p;
      this.goal = null;
      const a = r() * TAU,
        d = Math.sqrt(r()) * 0.5;
      this.u = Math.cos(a) * d;
      this.v = Math.sin(a) * d;
      this.angle = r() * TAU;
      this.state = "sit";
      this.z = 0;
      [this.x, this.y] = this.atPerch(scene);
      this.timer = 3 + r() * 10;
      this.throat = 0;
      this.croak = 0;
      this.croakGap = 1 + r() * 6;
    }
    update(dt, w, h, scale, scene, allowed, night, weather) {
      const r = this.rnd;
      this.w = w;
      this.h = h;
      this.scale = scale;
      if (this.fleeT > 0) this.fleeT -= dt;
      // The water-bout clock runs through both travelling and still water.
      if (this.state === "swim" || this.state === "float") this.swimT -= dt;
      if (!allowed) this.goal = null;
      // Option off or snow: leave the perch, sink out of sight.
      if (!allowed && (this.state === "sit" || this.state === "hop")) {
        const cx = w / 2,
          cy = h / 2,
          a = Math.atan2(cy - this.y, cx - this.x) + (r() - 0.5),
          d = (120 + r() * 160) * scale;
        this.startHop(
          clamp(this.x + Math.cos(a) * d, 24, w - 24),
          clamp(this.y + Math.sin(a) * d, 24, h - 24),
        );
      }
      if (!allowed && this.state === "float") {
        this.state = "swim";
        this.altLegs = false;
        this.altArms = false;
      }
      if (!allowed && this.state === "swim")
        this.diveT = Math.max(this.diveT, 2);
      this.alpha = clamp(this.alpha + (allowed ? dt * 1.2 : -dt * 1.6), 0, 1);
      if (this.state === "hidden") {
        this.timer -= dt;
        if (allowed && this.timer <= 0 && scene.frogPerches.length) {
          this.reseat(scene);
          this.alpha = 0;
        }
        return;
      }
      if (this.alpha <= 0) {
        this.state = "hidden";
        this.timer = 3 + r() * 8;
        return;
      }
      if (this.state === "sit") {
        this.sit(dt, scale, scene, night, weather);
        return;
      }
      if (this.state === "hop") {
        this.hopT += dt / this.hopDur;
        const t = Math.min(1, this.hopT);
        this.x = this.from[0] + (this.to[0] - this.from[0]) * t;
        this.y = this.from[1] + (this.to[1] - this.from[1]) * t;
        this.z = 4 * t * (1 - t) * this.hopH;
        if (this.hopT >= 1) {
          this.z = 0;
          const p = scene.perchAt(this.x, this.y);
          if (
            allowed &&
            p &&
            p !== this.perch &&
            !scene.frogs.some(
              (o) => o !== this && o.perch === p && o.state === "sit",
            )
          ) {
            this.perch = p;
            const a = r() * TAU,
              d = Math.sqrt(r()) * 0.5;
            this.u = Math.cos(a) * d;
            this.v = Math.sin(a) * d;
            [this.x, this.y] = this.atPerch(scene);
            this.state = "sit";
            this.goal = null;
            this.timer = 4 + r() * 14;
            this.croakGap = Math.min(this.croakGap, 2 + r() * 5);
            p.fl.jv += (r() < 0.5 ? -1 : 1) * 0.05; // the leaf takes the landing
          } else {
            scene.drop(this.x, this.y, 7 * scale, 0.55);
            scene.splash(this.x, this.y, 0.8, false);
            this.perch = null;
            this.depth = 0.16;
            this.depthGoal = 0.06;
            this.armFold = 1;
            this.stretch = 0.96;
            this.turnBend = 0;
            this.prevSin = 0;
            this.wakeT = 0;
            this.swimT = 12 + r() * 16;
            this.breath = 6 + r() * 10;
            this.stroke = r() * TAU * 0.1; // land already inside the first kick
            this.strokeMode = null;
            this.strokeReach = null;
            this.prevPh = 0;
            this.stride = (40 + r() * 14) * scale;
            this.swimA = r() * TAU;
            this.driftA = r() * TAU;
            this.altLegs = false;
            this.altArms = false;
            this.powerAlt = 0;
            if (this.goal) {
              // A crossing in progress keeps swimming the moment it lands.
              this.state = "swim";
              this.travelT = 0;
            } else {
              // Land into still water: peek first, then the idle modes.
              this.state = "float";
              this.setFloatMode(0.95, scene);
              this.floatT = 7 + r() * 8;
              this.kickCd = 1.2 + r() * 1.5;
              this.kickU = 1;
              this.power = 0;
              this.powerAlt = 0;
              this.rippleT = 1.5 + r() * 2;
            }
          }
        }
        return;
      }
      if (this.state === "float") {
        this.floatUpdate(dt, w, h, scale, scene, allowed);
        return;
      }
      this.swimUpdate(dt, w, h, scale, scene, allowed);
    }
    sit(dt, scale, scene, night, weather) {
      const r = this.rnd;
      this.pulse += dt * 1.7;
      [this.x, this.y] = this.atPerch(scene);
      this.look -= (this.look - this.lookGoal) * Math.min(1, dt * 2);
      if (r() < dt * 0.3) this.lookGoal = (r() - 0.5) * 0.9;
      // Croak: the throat swells over half a second, holds, and the call
      // sounds at the top of the swell.
      if (this.croak > 0) {
        const elapsed = this.croakDur - this.croak;
        this.croak -= dt;
        this.throat =
          elapsed < 0.5
            ? elapsed / 0.5
            : this.croak > 0.55
              ? 1
              : Math.max(0, (this.croak - 0.1) / 0.45);
        // Only call out when this style actually draws frogs.
        if (!this.called && elapsed >= 0.5 && scene.R.sprites.frog0_body) {
          this.called = true;
          scene.events.push({ type: "frog" });
        }
        if (this.croak <= 0) {
          this.croak = 0;
          this.throat = 0;
        }
      } else {
        this.throat += (0 - this.throat) * Math.min(1, dt * 4);
        this.croakGap -= dt;
        if (this.croakGap <= 0) {
          const want = night
            ? r() < 0.8
            : weather === "rain"
              ? r() < 0.35
              : r() < 0.06;
          if (want) {
            this.croakDur = this.croak = 1.4 + r() * 0.8;
            this.called = false;
          }
          this.croakGap = night ? 4 + r() * 10 : 14 + r() * 24;
        }
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        const free = scene.frogPerches.filter(
          (p) =>
            p !== this.perch &&
            !scene.frogs.some(
              (o) => o !== this && o.perch === p && o.state === "sit",
            ),
        );
        if (!free.length || r() < 0.4) {
          // Relocations are short leaps only; any longer trip happens in the
          // water, one kick-glide-pause bout at a time.
          const a = r() * TAU,
            d = (70 + r() * 60) * scale;
          this.startHop(
            clamp(this.x + Math.cos(a) * d, 24, this.w - 24),
            clamp(this.y + Math.sin(a) * d, 24, this.h - 24),
          );
        } else {
          const p = free[Math.floor(r() * free.length)],
            a = r() * TAU,
            d = Math.sqrt(r()) * 0.55;
          const tx = p.x + Math.cos(a) * p.rx * d,
            ty = p.y + Math.sin(a) * p.ry * d;
          if (Math.hypot(tx - this.x, ty - this.y) > 160 * scale) {
            // A far pad is never one big leap: hop in, swim across, hop up.
            // Try a few angles so the leap clears neighbouring pads and lands
            // in water; falling back on its own pad splashes in the same.
            let ex = this.x,
              ey = this.y;
            for (let i = 0; i < 4; i++) {
              const ea =
                Math.atan2(ty - this.y, tx - this.x) + (r() - 0.5) * 1.4;
              const ed = (55 + r() * 45) * scale;
              ex = clamp(this.x + Math.cos(ea) * ed, 24, this.w - 24);
              ey = clamp(this.y + Math.sin(ea) * ed, 24, this.h - 24);
              const q = scene.perchAt(ex, ey);
              if (!q || q === this.perch) break;
            }
            this.goal = p;
            this.goalT = 240;
            this.startHop(ex, ey);
          } else {
            this.startHop(tx, ty);
          }
        }
        this.timer = 4 + r() * 14;
      }
    }
    swimUpdate(dt, w, h, scale, scene, allowed) {
      const r = this.rnd;
      const flee = this.fleeT > 0;
      const motion = Frog.swimming;
      // Rhythm follows intent: a long crossing rides a long glide with wide,
      // fully extended kicks, quick short strokes stay compact and high
      // frequency, and a scare drives everything hard and fast.
      const distance = this.goal
        ? Math.hypot(this.goal.x - this.x, this.goal.y - this.y)
        : Math.max(0, Math.min(this.travelT, this.swimT)) * 22 * scale;
      // Select long strokes from the remaining travel distance measured in
      // this frog's body lengths. The previous fixed 180px gate often left
      // ordinary 6–8 second travel bouts entirely in short-stroke mode.
      const longDistance =
        motion.bodyLength * this.size * scale * motion.longDistanceBodies;
      const strokeForDistance = () =>
        distance > longDistance ? "long" : "short";
      const cycle = Math.floor(this.stroke / TAU);
      if (this.strokeMode === null || this.strokeCycle !== cycle) {
        this.strokeMode = strokeForDistance();
        this.strokeCycle = cycle;
      }
      let far = !flee && this.strokeMode === "long";
      let rate = flee ? 0.65 : far ? motion.longRate : motion.shortRate;
      this.strokeReach ??= far || flee ? 1 : 0.68;
      this.stroke += dt * TAU * rate;
      // A new intent takes effect only at a complete stroke boundary. Convert
      // the leftover frame time to the new rate instead of jumping phase.
      if (Math.floor(this.stroke / TAU) > cycle) {
        const nextCycle = cycle + 1;
        const remainingDt = (this.stroke - nextCycle * TAU) / (TAU * rate);
        this.strokeReach = far || flee ? 1 : 0.68;
        this.strokeMode = strokeForDistance();
        this.strokeCycle = nextCycle;
        far = !flee && this.strokeMode === "long";
        rate = flee ? 0.65 : far ? motion.longRate : motion.shortRate;
        this.stroke = nextCycle * TAU + remainingDt * TAU * rate;
        this.coastT = 9;
        this.coastV = 0;
      }
      this.swimMode = flee ? "flee" : this.strokeMode;
      // Fast drive, held glide, slow recovery; short strokes retain momentum.
      const ph = (((this.stroke % TAU) + TAU) % TAU) / TAU;
      const GATHER = flee ? 0.08 : far ? 0.25 : 0.12,
        PUSH = flee ? 0.28 : far ? 0.4 : 0.35,
        COAST = flee ? 0.7 : far ? 0.8 : 0.55;
      this.swimStage =
        ph < GATHER
          ? "gather"
          : ph < PUSH
            ? "push"
            : ph < COAST
              ? "glide"
              : "recover";
      // Body length: held through the kick and glide, a small recoil as the
      // legs finish tucking before the next kick.
      const bendEnd = 1;
      // The legs drive out and then HOLD straight together through the whole
      // glide; they tuck only during the pause, in step with the body recoil.
      const smooth = (u) => u * u * (3 - 2 * u);
      const extension =
        ph < GATHER
          ? 0.55 * (1 - smooth(ph / GATHER))
          : ph < PUSH
            ? smooth((ph - GATHER) / (PUSH - GATHER))
            : ph < COAST
              ? 1
              : ph < bendEnd
                ? 1 - 0.45 * smooth((ph - COAST) / (bendEnd - COAST))
                : 0.55;
      const reachGoal = far || flee ? 1 : 0.68;
      const poseReach =
        ph < GATHER
          ? this.strokeReach +
            (reachGoal - this.strokeReach) * smooth(ph / GATHER)
          : reachGoal;
      // Stage names above remain diagnostic labels only. Each limb channel
      // follows its own periodic, shape-preserving Hermite path; the long
      // stroke's reference knots are time-warped to short/flee stage spans.
      // `extension` below remains the original locomotion/speed input.
      const hipCurve = Frog.swimCurve(
        ph,
        [0.22, 0.18, 0.36, 0.8, 0.96, 0.9, 0.82, 0.65, 0.42, 0.27, 0.22],
        GATHER,
        PUSH,
        COAST,
      );
      const kneeCurve = Frog.swimCurve(
        ph,
        [0.12, 0.08, 0.2, 0.66, 0.93, 0.98, 0.92, 0.72, 0.46, 0.24, 0.12],
        GATHER,
        PUSH,
        COAST,
      );
      const ankleCurve = Frog.swimCurve(
        ph,
        [0.16, 0.12, 0.14, 0.48, 0.82, 0.93, 0.97, 0.82, 0.58, 0.3, 0.16],
        GATHER,
        PUSH,
        COAST,
      );
      const webCurve = Frog.swimCurve(
        ph,
        [0.18, 0.18, 0.22, 0.68, 1, 0.62, 0.32, 0.18, 0.12, 0.16, 0.18],
        GATHER,
        PUSH,
        COAST,
      );
      this.legExtension = (0.55 * hipCurve + 0.45 * kneeCurve) * poseReach;
      this.hipExtension = hipCurve * poseReach;
      this.shinExtension = kneeCurve * poseReach;
      this.legStreamline = Frog.swimCurve(
        ph,
        [0, 0, 0.05, 0.42, 0.84, 0.98, 1, 1, 0.95, 0.4, 0],
        GATHER,
        PUSH,
        COAST,
      );
      this.hindFold = 1 - kneeCurve;
      this.kneeOut = Frog.swimCurve(
        ph,
        [0.62, 0.68, 0.74, 0.8, 0.72, 0.62, 0.55, 0.52, 0.56, 0.66, 0.62],
        GATHER,
        PUSH,
        COAST,
      );
      this.tarsusFlex = clamp(-0.04 + 0.24 * ankleCurve, -0.08, 0.4);
      this.footSpread = clamp(0.18 + (webCurve - 0.18) * poseReach, 0, 1);
      // Forelimbs pull backward with the hind-leg power stroke, then stay
      // tucked beside the trunk while the hind legs remain extended in glide.
      // They only start reaching again late in recovery.
      this.armSweep = Frog.swimCurve(
        ph,
        [0.24, 0.18, 0.22, 0.7, 0.98, 0.96, 0.94, 0.92, 0.82, 0.38, 0.24],
        GATHER,
        PUSH,
        COAST,
      );
      // Forefeet do not copy the hind-foot web cycle. They open while the
      // hind legs gather, cup/tuck through the power stroke, streamline during
      // glide, then open and reach again as the hind legs recover. The wrist
      // follows that sequence with a small lag so the hands do not read as a
      // rigid extension of the upper-arm sprite.
      this.foreHandOpen = Frog.swimCurve(
        ph,
        [0.72, 0.86, 0.84, 0.48, 0.2, 0.16, 0.18, 0.26, 0.46, 0.76, 0.72],
        GATHER,
        PUSH,
        COAST,
      );
      this.foreWristFlex = Frog.swimCurve(
        ph,
        [0.02, 0.12, 0.2, 0.28, 0.3, 0.2, 0.08, -0.06, -0.14, -0.08, 0.02],
        GATHER,
        PUSH,
        COAST,
      );
      this.foreReach = Frog.swimCurve(
        ph,
        [0.82, 0.9, 0.86, 0.54, 0.22, 0.18, 0.2, 0.26, 0.42, 0.78, 0.82],
        GATHER,
        PUSH,
        COAST,
      );
      this.power = this.legExtension;
      this.altLegs = false;
      this.powerAlt = this.power;
      const stretchGoal = 0.97 + 0.05 * extension;
      this.stretch += (stretchGoal - this.stretch) * Math.min(1, dt * 6);
      // Forelegs paddle through the kick and settle into the streamline of
      // the glide; a scare keeps them sweeping the whole time.
      const foldGoal = 0.2 + 0.8 * extension;
      const ampGoal = flee ? 0.4 : ph < PUSH ? 0.35 : far ? 0.05 : 0.18;
      this.armFold += (foldGoal - this.armFold) * Math.min(1, dt * 6);
      this.armAmp += (ampGoal - this.armAmp) * Math.min(1, dt * 6);
      const kick =
        ph >= GATHER && ph < PUSH
          ? Math.sin(((ph - GATHER) / (PUSH - GATHER)) * Math.PI)
          : 0;
      const wrapped = ph < this.prevPh;
      // Ripples where each act ends: at the kick, and when the glide settles.
      if (this.depth < 0.25 && wrapped)
        scene.drop(this.x, this.y, (3 + this.depth * 6) * scale, 0.16);
      if (this.prevPh < COAST && ph >= COAST && this.depth < 0.25)
        scene.drop(this.x, this.y, (4 + this.depth * 8) * scale, 0.24);
      // A small paddle ripple each time the forelegs cross the midline.
      const sn = Math.sin(this.stroke);
      if (this.depth < 0.25 && this.armAmp > 0.1 && sn * this.prevSin < 0)
        scene.drop(this.x, this.y, 2.5 * scale, 0.12);
      this.prevSin = sn;
      this.prevPh = ph;
      // Each kick carries the frog at most this far.
      if (
        wrapped ||
        (ph >= GATHER && ph < PUSH && this.coastV === 0 && this.stride <= 0)
      )
        this.stride =
          (40 + r() * 14) * scale * (flee ? 1.8 : far ? 1.15 : 0.75);
      const wasDive = this.diveT > 0;
      this.diveT -= dt;
      if (wasDive && this.diveT <= 0)
        scene.drop(this.x, this.y, 6 * scale, 0.34); // broke the surface again
      if (this.diveT > 0) this.depthGoal = 0.66;
      else {
        // On the surface between dives; every so often go under for a few beats.
        this.depthGoal = 0.06;
        this.breath -= dt;
        if (this.breath <= 0) {
          this.breath = 14 + r() * 22;
          this.diveT = 3.5 + r() * 4;
          scene.drop(this.x, this.y, 6 * scale, 0.3);
        }
      }
      if (r() < dt * 0.3 && !this.goal && !flee) this.swimA = r() * TAU;
      let ax = Math.cos(this.swimA),
        ay = Math.sin(this.swimA);
      const m = 44 * scale + 24;
      if (this.x < m) ax += (m - this.x) * 0.03;
      else if (this.x > w - m) ax -= (this.x - (w - m)) * 0.03;
      if (this.y < m) ay += (m - this.y) * 0.03;
      else if (this.y > h - m) ay -= (this.y - (h - m)) * 0.03;
      if (this.goal) {
        this.goalT -= dt;
        const gx = this.goal.x - this.x,
          gy = this.goal.y - this.y,
          gl = Math.hypot(gx, gy) || 1;
        if (this.goalT <= 0 || !scene.frogPerches.includes(this.goal)) {
          this.goal = null;
        } else {
          // A crossing in progress swims for the pad it was aimed at — though
          // a scare takes the wheel and dashes it away until that passes.
          if (!flee) {
            ax += (gx / gl) * 2.2;
            ay += (gy / gl) * 2.2;
          }
          this.swimT = Math.max(this.swimT, 3);
        }
      }
      const want = Math.atan2(ay, ax);
      this.angle += clamp(wrap(want - this.angle), -dt * 1.6, dt * 1.6);
      // Turning bends the body: the legs push asymmetrically into the bend.
      const bendGoal = clamp(wrap(want - this.angle) * 1.5, -1, 1);
      this.turnBend += (bendGoal - this.turnBend) * Math.min(1, dt * 3);
      // Long strokes shed momentum through the glide; short strokes keep
      // a small forward drift during recovery instead of freezing in place.
      const COAST_DUR = (COAST - PUSH) / rate;
      // Long strokes store momentum at the end of the push, not the old
      // low sinusoidal tail. Exponential drag carries ~4 actual body lengths
      // through the glide before the next recovery and kick.
      const launchV =
        (motion.bodyLength *
          this.size *
          scale *
          motion.longGlideBodies *
          motion.coastDrag) /
        (1 - Math.exp(-motion.coastDrag * COAST_DUR));
      let sp = far || flee ? 0 : 5 * scale;
      if (ph >= GATHER && ph < PUSH && this.stride > 0) {
        const pushLeft = (PUSH - ph) / rate;
        const pushProgress = (ph - GATHER) / (PUSH - GATHER);
        // Ease into the existing kick curve instead of jumping from drift
        // to its nonzero minimum. Keep peak drive and glide timing intact.
        const onset = smooth(Math.min(1, pushProgress / 0.2));
        const kickSpeed =
          (30 + 50 * kick) * scale * (flee ? 1.6 : far ? 1.15 : 0.9);
        sp = Math.min(
          far ? launchV * smooth(pushProgress) : sp + (kickSpeed - sp) * onset,
          this.stride / Math.max(pushLeft, dt),
        );
        this.stride -= sp * dt;
        this.coastV = sp;
        this.coastT = 0;
        this.wakeT = 0;
      } else if (far && ph >= PUSH) {
        this.coastT = (ph - PUSH) / rate;
        sp = launchV * Math.exp(-motion.coastDrag * this.coastT);
        if (ph >= COAST) {
          const recoveryProgress = (ph - COAST) / (1 - COAST);
          sp *= 1 - smooth(recoveryProgress);
        }
        this.coastV = sp;
        this.wakeT -= dt;
        if (this.wakeT <= 0) {
          this.wakeT = 0.5;
          if (this.depth < 0.25)
            scene.drop(
              this.x,
              this.y,
              2 * scale,
              0.06 + 0.08 * Math.exp(-motion.coastDrag * this.coastT),
            );
        }
      } else if (this.coastT < COAST_DUR) {
        this.coastT += dt;
        const k = 1 - Math.min(1, this.coastT / COAST_DUR);
        sp = Math.max(sp, this.coastV * k * k);
        // A fading wake trails the glide.
        this.wakeT -= dt;
        if (this.wakeT <= 0) {
          this.wakeT = 0.5;
          if (this.depth < 0.25)
            scene.drop(this.x, this.y, (1.5 + 3 * k) * scale, 0.05 + 0.1 * k);
        }
      }
      this.swimV = sp;
      this.x = clamp(this.x + Math.cos(this.angle) * sp * dt, 16, w - 16);
      this.y = clamp(this.y + Math.sin(this.angle) * sp * dt, 16, h - 16);
      this.depth += (this.depthGoal - this.depth) * Math.min(1, dt * 0.8);
      // End of the crossing: once the far pad is within one leap, hop up.
      if (this.goal && this.diveT <= 0) {
        const g = this.goal;
        const taken = scene.frogs.some(
          (o) => o !== this && o.perch === g && o.state === "sit",
        );
        if (taken) this.goal = null;
        else {
          const ga = r() * TAU,
            gr = Math.sqrt(r()) * 0.55;
          const tx = g.x + Math.cos(ga) * g.rx * gr,
            ty = g.y + Math.sin(ga) * g.ry * gr;
          if (Math.hypot(tx - this.x, ty - this.y) <= 130 * scale)
            this.startHop(tx, ty);
        }
      }
      // After a while, hop back out onto a leaf.
      this.tryExit(scale, scene, allowed);
      // A travelling bout ends in still water: settle into an idle mode.
      this.travelT -= dt;
      if (
        this.state === "swim" &&
        this.travelT <= 0 &&
        this.swimT > 0 &&
        !flee &&
        !this.goal &&
        this.diveT <= 0 &&
        allowed
      ) {
        this.state = "float";
        this.floatT = 6 + r() * 8;
        this.setFloatMode(r(), scene);
        this.kickCd = 0.8 + r() * 1.5;
        this.kickU = 1;
      }
    }
    // A frog with a bout of swimming left keeps to the water; once the
    // budget runs out and it is near a leaf, hop back out.
    tryExit(scale, scene, allowed) {
      const r = this.rnd;
      if (
        this.swimT > 0 ||
        this.diveT > 0 ||
        !allowed ||
        !scene.frogPerches.length
      )
        return;
      const taken = new Set(
        scene.frogs
          .filter((o) => o !== this && o.state === "sit")
          .map((o) => o.perch),
      );
      const free = scene.frogPerches.filter((p) => !taken.has(p));
      if (free.length) {
        free.sort(
          (a, b) =>
            Math.hypot(a.x - this.x, a.y - this.y) -
            Math.hypot(b.x - this.x, b.y - this.y),
        );
        const p = free[0];
        let tx = p.x + (r() - 0.5) * p.rx,
          ty = p.y + (r() - 0.5) * p.ry;
        // A far leaf is not one big leap: cut the jump short so it lands in
        // open water, and let rhythmic swimming carry the trip the rest of
        // the way across.
        const d = Math.hypot(tx - this.x, ty - this.y),
          cap = 130 * scale;
        if (d > cap) {
          tx = this.x + ((tx - this.x) / d) * cap;
          ty = this.y + ((ty - this.y) / d) * cap;
        }
        this.startHop(tx, ty);
      } else this.swimT = 4 + r() * 6;
    }
    // Pick the next resting posture in the water (or force one on entry).
    setFloatMode(rand, scene) {
      const r = this.rnd,
        m =
          rand < 0.35
            ? "surface"
            : rand < 0.65
              ? "tread"
              : rand < 0.85
                ? "submerged"
                : "peek";
      this.floatMode = m;
      this.modeT =
        m === "submerged"
          ? 4 + r() * 3
          : m === "tread"
            ? 3.5 + r() * 3
            : m === "peek"
              ? 2.5 + r() * 2.5
              : 3 + r() * 2;
      this.kickCd = Math.min(this.kickCd, 0.5 + r() * 1.2);
      if (m === "peek" && scene && scene.frogPerches.length) {
        // Watching the nearest free leaf — where it would move next.
        let bx = 0,
          by = 0,
          bd = Infinity;
        for (const p of scene.frogPerches) {
          const d = Math.hypot(p.x - this.x, p.y - this.y);
          if (d > 0 && d < bd) {
            bd = d;
            bx = p.x;
            by = p.y;
          }
        }
        this.aim =
          bd < Infinity ? Math.atan2(by - this.y, bx - this.x) : this.angle;
      }
    }
    // Still water: drift, kick once in a while to hold the spot, and let the
    // four resting postures take turns — floating, treading, hanging under,
    // or peeking out at the pads.
    floatUpdate(dt, w, h, scale, scene, allowed) {
      const r = this.rnd;
      // A crossing or a scare takes over immediately.
      if (this.goal || this.fleeT > 0) {
        this.state = "swim";
        this.altLegs = false;
        this.altArms = false;
        return;
      }
      this.modeT -= dt;
      if (this.modeT <= 0) this.setFloatMode(r(), scene);
      this.floatT -= dt;
      this.pulse += dt;
      // A slow paddle keeps the arms working; treading beats alternate sides.
      this.stroke += dt * TAU * 0.13;
      // Every so often go under for a few beats, like a swimming frog does.
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = 14 + r() * 22;
        if (this.floatMode !== "submerged") {
          this.floatMode = "submerged";
          this.modeT = 3.5 + r() * 3.5;
        }
      }
      const m = this.floatMode,
        sub = m === "submerged";
      // Depth per mode: eyes just above the film, or hanging fully under.
      const bob = sub ? 0 : Math.sin(this.pulse * 0.9) * 0.018;
      this.depthGoal =
        (sub ? 0.62 : m === "peek" ? 0.13 : m === "tread" ? 0.1 : 0.06) + bob;
      this.depth += (this.depthGoal - this.depth) * Math.min(1, dt * 0.9);
      // Forelegs: light balancing paddles — alternating like two little oars
      // when treading, tucked in while suspended.
      const foldGoal = sub
        ? 0.9
        : m === "tread"
          ? 0.5
          : m === "peek"
            ? 0.6
            : 0.55;
      const ampGoal = sub
        ? 0.02
        : m === "tread"
          ? 0.28
          : m === "peek"
            ? 0.14
            : 0.16;
      this.altArms = m === "tread";
      this.altLegs = m === "tread";
      this.armFold += (foldGoal - this.armFold) * Math.min(1, dt * 4);
      this.armAmp += (ampGoal - this.armAmp) * Math.min(1, dt * 4);
      // One slow micro-kick every few seconds holds the spot; while treading
      // the legs trade halves of the kick, one web opening as the other folds.
      const amp = sub ? 0.28 : m === "tread" ? 0.4 : 0.42;
      if (this.kickU < 1) {
        this.kickU = Math.min(1, this.kickU + dt / 1.1);
        const u = this.kickU,
          right = !this.altLegs || u < 0.5,
          v = this.altLegs
            ? right
              ? Math.min(1, u * 2)
              : Math.min(1, (u - 0.5) * 2)
            : u,
          p = Math.sin(Math.PI * v) * amp;
        this.power = right ? p : 0;
        this.powerAlt = right ? 0 : p;
      } else {
        this.power += (0 - this.power) * Math.min(1, dt * 5);
        this.powerAlt += (0 - this.powerAlt) * Math.min(1, dt * 5);
        this.kickCd -= dt;
        if (this.kickCd <= 0) {
          this.kickCd = sub
            ? 3 + r() * 3
            : m === "tread"
              ? 1.5 + r() * 1.2
              : m === "peek"
                ? 2 + r() * 1.6
                : 3 + r() * 2.5;
          this.kickU = 0;
        }
      }
      // A slow wander: barely moving, the way a resting frog holds its spot.
      const speed =
        (m === "surface" ? 3 : m === "tread" ? 0.5 : sub ? 0.7 : 0) * scale;
      this.driftA += (r() - 0.5) * dt * 0.9;
      const want = m === "peek" ? this.aim : this.driftA;
      this.angle += clamp(wrap(want - this.angle), -dt * 0.6, dt * 0.6);
      const bendGoal = clamp(wrap(want - this.angle) * 1.5, -1, 1);
      this.turnBend += (bendGoal - this.turnBend) * Math.min(1, dt * 1.5);
      // Each slow kick nudges the body a little forward or up.
      const kickPush =
        5 * scale * Math.max(this.power, this.powerAlt) * (sub ? 0.4 : 1);
      const sp = speed + kickPush;
      this.swimV = sp;
      this.x = clamp(this.x + Math.cos(this.angle) * sp * dt, 16, w - 16);
      this.y = clamp(this.y + Math.sin(this.angle) * sp * dt, 16, h - 16);
      // Weak rings on the film only — the submerged hover makes none.
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        if (m === "surface") {
          this.rippleT = 2 + r() * 2;
          if (this.depth < 0.25)
            scene.drop(this.x, this.y, (2.5 + r() * 1.5) * scale, 0.09);
        } else if (m === "tread") {
          this.rippleT = 1.5 + r() * 1.3;
          const side = Math.sin(this.stroke) >= 0 ? 1 : -1;
          if (this.depth < 0.25)
            scene.drop(
              this.x - Math.sin(this.angle) * 4 * scale * side,
              this.y + Math.cos(this.angle) * 4 * scale * side,
              2.5 * scale,
              0.1,
            );
        } else if (m === "peek") {
          this.rippleT = 3 + r() * 2.5;
          if (this.depth < 0.25) scene.drop(this.x, this.y, 2 * scale, 0.07);
        } else this.rippleT = 4 + r() * 3;
      }
      // Idle over: drift into open water for a travelling bout.
      if (this.floatT <= 0 && this.swimT > 0 && allowed) {
        this.state = "swim";
        this.travelT = 6 + r() * 10;
        this.swimA = this.angle;
        this.stroke = r() * TAU * 0.1;
        this.strokeMode = null;
        this.strokeReach = null;
        this.prevPh = 0;
        this.stride = (40 + r() * 14) * scale;
        this.coastT = 9;
        this.coastV = 0;
        this.wakeT = 0;
        this.prevSin = 0;
        this.altLegs = false;
        this.altArms = false;
      }
      // Once the bout's clock runs out, hop out — but only from the film.
      if (this.floatMode !== "submerged") this.tryExit(scale, scene, allowed);
    }
    draw(R, scale, look) {
      if (this.alpha <= 0) return;
      // A style without frog sprites hides them there.
      if (!R.sprites[`frog${this.variant}_body`]) return;
      const S = R.sprites,
        v = this.variant,
        A = this.alpha;
      const swim = this.state === "swim";
      const wat = swim || this.state === "float";
      const fl = this.state === "float";
      const air = this.state === "hop" && this.z > 1;
      const s =
        scale *
        this.size *
        (this.state === "sit"
          ? 1 + 0.016 * Math.sin(this.pulse)
          : air
            ? 1 + this.z * 0.0012
            : 1);
      // Body sway and arm sweep only while there is actually motion; during
      // the pause between kicks the frog holds perfectly still.
      const glide = Math.min(1, (this.swimV || 0) / (18 * scale));
      const lit = [
        look.bright * look.tint[0] * A,
        look.bright * look.tint[1] * A,
        look.bright * look.tint[2] * A,
        A,
      ];
      const x = this.x,
        y = this.y,
        a =
          this.angle +
          (wat
            ? Math.sin(this.stroke * 2) * 0.07 * (1 - this.depth) * glide
            : this.look * 0.35),
        c = Math.cos(a),
        si = Math.sin(a);
      const at = (lx, ly) => [
        x + (lx * c - ly * si) * s,
        y + (lx * si + ly * c) * s,
      ];
      const fog = [
        look.water[0],
        look.water[1],
        look.water[2],
        0.04 + this.depth * 0.3,
      ];
      const layer = wat ? "under" : "surface";
      const off =
        (4 + this.z * 0.5 + (wat ? this.depth * 16 : 0)) * scale * this.size;
      const dx = look.shadowDir[0] * off,
        dy = look.shadowDir[1] * off;
      const sh = [
        0,
        0,
        0,
        (0.34 - (wat ? this.depth * 0.18 : 0) - this.z * 0.003) * A,
      ];
      const blur = wat
        ? [(1 - this.depth) * 0.8, 0, 0, 0]
        : this.z > 1
          ? [this.z * 0.02, 0, 0, 0]
          : undefined;
      const part = (name, lx, ly, ang, flip, kx = 1, ky = 1) => {
        const [px, py] = at(lx, ly),
          mx = s * kx,
          my = s * ky * (flip ? -1 : 1);
        R.sprite(
          layer,
          S[`frog${v}_${name}`],
          px,
          py,
          a + ang,
          mx,
          my,
          lit,
          wat ? fog : undefined,
        );
        R.sprite(
          "shadow",
          S[`frog${v}_${name}`],
          px + dx,
          py + dy,
          a + ang,
          mx,
          my,
          sh,
          blur,
        );
      };
      // The throat sits under the chin; it peeks around the head as it fills.
      if (this.throat > 0.02) {
        const k = 0.5 + 0.9 * this.throat;
        part("throat", 7.4, 0, 0, false, k, k);
      }
      // Fixed thigh/calf lengths remain 8.4 / 8.525. The independent tarsus
      // and long webbed foot extend the limb without stretching either bone.
      const G = Frog.anatomy;
      const Lt = G.thighScale;
      // Turning bends both legs the same way for an asymmetric push.
      const bend = wat ? this.turnBend : 0;
      const reach =
        this.hopT > 0.55 ? Math.min(1, (this.hopT - 0.55) / 0.35) : 0;
      const thighPoses = [];
      const kneePoses = [];
      const footPhase = (((this.stroke % TAU) + TAU) % TAU) / TAU;
      const fleeStroke = this.swimMode === "flee";
      const longStroke = this.swimMode === "long";
      const footDrive = swim
        ? Frog.swimCurve(
            footPhase,
            [0, 0.03, 0.8, 1, 1, 0.7, 0.25, 0.06, 0, 0, 0],
            fleeStroke ? 0.08 : longStroke ? 0.25 : 0.12,
            fleeStroke ? 0.28 : longStroke ? 0.4 : 0.35,
            fleeStroke ? 0.7 : longStroke ? 0.8 : 0.55,
          )
        : 0;
      for (const side of [1, -1]) {
        const flip = side < 0;
        const power = side > 0 || !this.altLegs ? this.power : this.powerAlt;
        const e = air ? 0.92 * (1 - reach) : wat ? power : 0;
        const hipE = swim ? (this.hipExtension ?? e) : e;
        const shinE = swim ? (this.shinExtension ?? e) : e;
        const fold = swim ? (this.hindFold ?? 1 - e) : 1 - e;
        const kneeOut = swim ? (this.kneeOut ?? 1 - e) : 1 - e;
        let spread = air ? 0.08 : swim ? (this.footSpread ?? 1 - e) : 1 - e;
        // Both segments pivot at the same computed joint. Local +X is forward.
        // Folded knees sit beside the middle of the trunk, never at the chest.
        const turn = bend * side * 0.06;
        const stream = swim ? (this.legStreamline ?? 0) : 0;
        const freeThigh =
          side *
          (G.foldedThigh +
            (G.extendedThigh - G.foldedThigh) * hipE +
            turn +
            (swim ? 0.16 * (1 - kneeOut - e * 0.9) : 0));
        const streamThigh =
          side *
          (Math.PI - 0.58 + 0.07 * clamp((power - 0.68) / 0.32, 0, 1) + turn);
        const thighAng = freeThigh + (streamThigh - freeThigh) * stream;
        const hip = [G.hipX, side * G.hipY];
        const knee = [
          hip[0] + Math.cos(thighAng) * G.thighLength * Lt,
          hip[1] + Math.sin(thighAng) * G.thighLength * Lt,
        ];
        // Recovery folds the shin inward; extension aligns it behind the hip.
        const freeShin =
          Math.PI +
          side * (0.6 * fold + 0.26 * (1 - kneeOut) + 0.5 * (e - shinE));
        // At full extension the calf tracks slightly inward from the knee;
        // the foot then splays back outward so the two toe fans stay distinct.
        const shinScale = G.shinScale;
        const streamShin = Math.PI + side * (0.035 + 0.02 * (1 - power));
        const baselineShin = freeShin + (streamShin - freeShin) * stream;
        // Preserve the accepted open-diamond glide: knees remain outside,
        // while each extended calf angles gently inward toward its ankle.
        // Blend by the existing streamline channel so the gather pose is not
        // pulled into this extended-leg silhouette.
        const inwardDistance = (side * knee[1] - G.hipY) * 0.45;
        const inwardShin =
          Math.PI +
          side *
            Math.asin(
              clamp(inwardDistance / (G.shinLength * shinScale), -0.95, 0.95),
            );
        const shinAng =
          baselineShin + (inwardShin - baselineShin) * (swim ? stream : 0);
        const ank = [
          knee[0] + Math.cos(shinAng) * G.shinLength * shinScale,
          knee[1] + Math.sin(shinAng) * G.shinLength * shinScale,
        ];
        // A short, independent ankle-to-foot segment. Its small flex follows
        // the existing gather/drive/recovery channels; no swim timing changes.
        const tarsusFlex =
          ((this.tarsusFlex ?? 0.28 * fold) + (swim ? 0.16 * fold : 0)) *
          (swim ? 1 - stream : 1);
        // The hind foot presents a pressure surface through the power stroke,
        // then relaxes gradually into the shin-aligned glide. This is a render
        // pose only: it does not feed back into swim speed or world movement.
        const presentedFootFlex =
          tarsusFlex + (Math.PI / 2 - tarsusFlex) * footDrive;
        const tarsusAng = shinAng - side * presentedFootFlex;
        const footBase = [
          ank[0] + Math.cos(tarsusAng) * G.tarsusLength * G.tarsusScale,
          ank[1] + Math.sin(tarsusAng) * G.tarsusLength * G.tarsusScale,
        ];
        if (swim) {
          // Near the pelvis the toes fan out; increasing actual reach folds
          // the web continuously, independently of the four phase labels.
          const maxReach =
            G.thighLength * Lt +
            G.shinLength * shinScale +
            G.tarsusLength * G.tarsusScale;
          const reachRatio =
            Math.hypot(footBase[0] - hip[0], footBase[1] - hip[1]) / maxReach;
          const t = clamp((reachRatio - 0.38) / 0.6, 0, 1);
          spread = 1 - t * t * (3 - 2 * t);
          // Reach alone folds too early during the power stroke. Keep a
          // pressure-bearing web through the same drive interval used by
          // locomotion, then release it smoothly into the early glide.
          const ph = (((this.stroke % TAU) + TAU) % TAU) / TAU;
          const flee = this.swimMode === "flee";
          const far = this.swimMode === "long";
          const gather = flee ? 0.08 : far ? 0.25 : 0.12;
          const push = flee ? 0.28 : far ? 0.4 : 0.35;
          const u = (ph - gather) / (push - gather);
          const ease = (v) => {
            const q = clamp(v, 0, 1);
            return q * q * (3 - 2 * q);
          };
          const pressure = ease(u / 0.2) * (1 - ease((u - 0.8) / 0.4));
          spread += (1 - spread) * pressure;
        }
        const webTuck = spread * spread;
        // Tuck the web itself without collapsing the whole foot into a line.
        // The small retained width keeps the toe-root/palm readable in glide.
        const footWidth = 0.6 + 0.4 * spread * spread * (3 - 2 * spread);
        // Paint feet/shins before thighs: rounded knee overlap hides the seam.
        const footAng = tarsusAng - side * 0.16 * webTuck;
        part(
          "foot",
          footBase[0],
          footBase[1],
          footAng,
          flip,
          G.footScale * (1 + 0.2 * (1 - spread)),
          footWidth,
        );
        // Give the ankle-to-foot transition a little more visual body without
        // changing the tarsus length or any joint position.
        part("tarsus", ank[0], ank[1], tarsusAng, flip, G.tarsusScale, 1.16);
        part("shin", knee[0], knee[1], shinAng, flip, shinScale, 1.1);
        // A pair of narrow, textured skin ribbons bridges the calf/ankle and
        // tarsus/palm seams. They follow the animated joints but do not alter
        // any anchor, segment length, or swim parameter.
        if (R.ribbon && S[`frog${v}_shin`] && S[`frog${v}_foot`]) {
          const tarsusMid = [
              (ank[0] + footBase[0]) * 0.5,
              (ank[1] + footBase[1]) * 0.5,
            ],
            palmRoot = [
              footBase[0] + Math.cos(footAng) * 0.22,
              footBase[1] + Math.sin(footAng) * 0.22,
            ],
            calfStart = [
              ank[0] - Math.cos(shinAng) * 0.9,
              ank[1] - Math.sin(shinAng) * 0.9,
            ],
            calfEnd = [
              ank[0] + (tarsusMid[0] - ank[0]) * 1.15,
              ank[1] + (tarsusMid[1] - ank[1]) * 1.15,
            ],
            firstBridge = [
              calfStart,
              [
                ank[0] - (ank[0] - calfStart[0]) * 0.26,
                ank[1] - (ank[1] - calfStart[1]) * 0.26,
              ],
              [
                ank[0] + (calfEnd[0] - ank[0]) * 0.35,
                ank[1] + (calfEnd[1] - ank[1]) * 0.35,
              ],
              calfEnd,
            ],
            secondBridge = [
              tarsusMid,
              [
                tarsusMid[0] + (palmRoot[0] - tarsusMid[0]) * 0.35,
                tarsusMid[1] + (palmRoot[1] - tarsusMid[1]) * 0.35,
              ],
              [
                palmRoot[0] - (palmRoot[0] - tarsusMid[0]) * 0.22,
                palmRoot[1] - (palmRoot[1] - tarsusMid[1]) * 0.22,
              ],
              palmRoot,
            ];
          const bridge = (source, points, widths) => {
            const screenPoints = points.map(([lx, ly]) => at(lx, ly));
            R.ribbon(
              layer,
              source,
              screenPoints,
              widths.map((width) => width * s),
              lit,
              wat ? fog : undefined,
              8,
            );
            R.ribbon(
              "shadow",
              source,
              screenPoints.map(([px, py]) => [px + dx, py + dy]),
              widths.map((width) => width * s),
              sh,
              blur,
              8,
            );
          };
          bridge(S[`frog${v}_shin`], firstBridge, [0.42, 0.46]);
          bridge(S[`frog${v}_foot`], secondBridge, [0.42, 0.48]);
        }
        thighPoses.push(["thigh", hip[0], hip[1], thighAng, flip, Lt, Lt]);
        if (S[`frog${v}_knee`]) {
          // A quadratic skin centerline is tangent to both actual bones.
          // Eight overlapping pieces of one fixed texture follow the curve;
          // this changes the contour, not the skeleton or swim trajectory.
          const px = knee[0] - Math.cos(thighAng) * 2;
          const py = knee[1] - Math.sin(thighAng) * 2;
          const qx = knee[0] + Math.cos(shinAng) * 2;
          const qy = knee[1] + Math.sin(shinAng) * 2;
          const point = (t) => [
            (1 - t) ** 2 * px + 2 * t * (1 - t) * knee[0] + t * t * qx,
            (1 - t) ** 2 * py + 2 * t * (1 - t) * knee[1] + t * t * qy,
          ];
          for (let j = 0; j < 8; j++) {
            const t = (j + 0.5) / 8;
            const p0 = point(j / 8),
              p1 = point((j + 1) / 8);
            const mid = point(t);
            const tx = (1 - t) * (knee[0] - px) + t * (qx - knee[0]);
            const ty = (1 - t) * (knee[1] - py) + t * (qy - knee[1]);
            kneePoses.push([
              "knee",
              mid[0],
              mid[1],
              Math.atan2(ty, tx),
              flip,
              (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 1.8) / 4,
              0.78 + 0.16 * t,
            ]);
          }
        }
        // The fixed bent-arm contour follows the shoulder sweep. Its wrist
        // offset and local hand angle preserve the elbow-to-palm transition.
        const armAng =
          swim && this.armSweep !== undefined
            ? side * (1.75 + 1.1 * this.armSweep)
            : wat
              ? side *
                (1.95 +
                  0.45 * this.armFold +
                  this.armAmp *
                    Math.sin(
                      this.stroke + (this.altArms && side < 0 ? Math.PI : 0),
                    ))
              : air
                ? side * 0.32
                : side * 0.9;
        const foreReach =
          swim && this.foreReach !== undefined ? this.foreReach : 1;
        // A real tuck shortens the shoulder-to-wrist silhouette, not merely
        // the palm membrane. Hold this compact shape through the hind-leg
        // extension/glide, then restore reach during recovery.
        const foreArmScale = 1.05 * (0.68 + 0.32 * foreReach);
        part(
          "arm",
          G.shoulderX,
          side * G.shoulderY,
          armAng,
          flip,
          foreArmScale,
          1.05,
        );
        if (S[`frog${v}_hand`]) {
          // Forehand action has its own stroke curve; it is intentionally not
          // driven by the hind-foot webSpread channel.
          const handOpen = swim
            ? clamp(this.foreHandOpen ?? 0.72, 0, 1)
            : wat
              ? 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(this.stroke))
              : air
                ? 0.35
                : 0.55;
          const wristX = G.foreWristX * foreArmScale;
          const wristY = side * G.foreWristY * foreArmScale;
          const wristFlex = swim ? (this.foreWristFlex ?? 0) : 0;
          part(
            "hand",
            G.shoulderX + Math.cos(armAng) * wristX - Math.sin(armAng) * wristY,
            side * G.shoulderY +
              Math.sin(armAng) * wristX +
              Math.cos(armAng) * wristY,
            armAng + side * (G.foreHandAngle + wristFlex),
            flip,
            1.05,
            1.05 * (0.48 + 0.52 * handOpen * handOpen * (3 - 2 * handOpen)),
          );
        }
      }
      const bodyK = 1 + this.throat * 0.04;
      const st = wat ? this.stretch : air ? 1.04 : 0.97;
      const bodyX = bodyK * st;
      const bodyY = bodyK / Math.sqrt(st);
      part("body", 0, 0, 0, false, bodyX, bodyY);
      // Fade-in roots overlap the trunk rather than getting cut into triangular
      // fragments by its silhouette. Eyes remain above all anatomy.
      for (const pose of thighPoses) part(...pose);
      for (const pose of kneePoses) part(...pose);
      // Each eye has its own sprite and is placed in frog-local coordinates
      // at the head's outer edge.  A mirrored local +Y pupil makes both eyes
      // look outward while every part still follows the same body rotation.
      const eye = S[`frog${v}_eye`];
      if (eye) {
        for (const side of [-1, 1]) {
          // Sockets are painted into the body: inherit its deformation before
          // rotation. Lighting must never translate an eye off its socket.
          const [ex, ey] = at(7.4 * bodyX, side * 5.55 * bodyY);
          R.sprite(
            layer,
            eye,
            ex,
            ey,
            a,
            s * bodyX,
            side * s * bodyY,
            lit,
            wat
              ? [
                  look.water[0],
                  look.water[1],
                  look.water[2],
                  0.012 + this.depth * 0.1,
                ]
              : undefined,
          );
        }
      }
    }
  }

  class PondScene {
    constructor(R, sim, rnd = Math.random) {
      this.R = R;
      this.sim = sim;
      this.rnd = rnd;
      this.time = 0;
      this.w = 1;
      this.h = 1;
      this.scale = 1;
      this.turtles = [0, 1].map((v) => new Turtle(v, rnd));
      this.butterflies = [0, 1, 2].map((s) => new Butterfly(s, rnd));
      this.dragonflies = [new Dragonfly(rnd() < 0.7 ? 0 : 1, rnd)];
      this.crabs = [0, 1, 0].map((v) => new Crab(v, rnd));
      this.crabHomes = [];
      this.frogs = [0, 1, 0].map((v) => new Frog(v, rnd));
      this.frogPerches = [];
      this.style = style;
      // Rocks first, then leaves largest to smallest, then petals, buds and flowers on top; each sways on its own clock.
      // Each also carries a small spring (angle ja, offset ox/oy) that raindrops knock and that settles back.
      this.floaters = sway(floaters(), rnd);
      this.petals = [];
      this.flies = [];
      this.rain = [];
      this.snow = [];
      this.splashes = [];
      this.wakes = new Map();
      // Lightning in a downpour; each flash asks the app for the thunder that follows it.
      this.bolts = [];
      this.nextBolt = 15;
      this.events = [];
      this.calm = !!(
        root.matchMedia &&
        root.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
      this.wetCover = 0;
      this.look = lookFor("sunny", false);
      this.look.shadowDir = [0.7, 0.72];
      this.pose = new Float32Array((BODY.segments + 1) * 4);
      this.spots = [];
    }
    dragonflyWeather(settings) {
      return (
        settings.butterflies &&
        !settings.night &&
        (settings.weather === "sunny" || settings.weather === "cloudy")
      );
    }
    // Something disturbed the water at (x, y): crabs close by bolt for it and
    // dive, frogs leap in.
    startle(x, y) {
      for (const c of this.crabs) c.startle(x, y, 130 * this.scale);
      for (const f of this.frogs) f.startle(x, y, 160 * this.scale);
    }
    // Which perch holds this screen point, if any: a hopping frog re-derives
    // its landing target from where it falls.
    perchAt(x, y) {
      for (const p of this.frogPerches) {
        const u = (x - p.x - (p.fl.dx || 0)) / p.rx,
          v = (y - p.y - (p.fl.dy || 0)) / p.ry;
        if (u * u + v * v < 0.55) return p;
      }
      return null;
    }
    drop(x, y, r, s) {
      this.R.drop(x, y, r, s);
      for (const p of this.petals) {
        const dx = p.x - x,
          dy = p.y - y,
          d = Math.hypot(dx, dy);
        if (d < r * 8 && d > 0) {
          p.vx += (dx / d) * s * 40;
          p.vy += (dy / d) * s * 40;
        }
      }
    }
    splash(x, y, s, leaf) {
      if (this.splashes.length > 260) return;
      const rnd = this.rnd,
        k = this.scale * s;
      this.splashes.push({
        x,
        y,
        s: k,
        age: 0,
        life: leaf ? 0.3 : 0.38,
        ring: true,
        leaf,
      });
      for (let i = 2 + Math.floor(rnd() * (leaf ? 4 : 3)); i > 0; i--) {
        const a = rnd() * TAU,
          v = (28 + rnd() * 52) * k;
        this.splashes.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          s: k * (0.6 + rnd() * 0.5),
          age: 0,
          life: 0.16 + rnd() * 0.16,
          ring: false,
        });
      }
    }
    // A raindrop landing on a leaf, flower or rock: splash where it struck, and knock the thing (lighter things jump more).
    hit(fl, rainK) {
      const rnd = this.rnd,
        [x, y, rx, kind, ry = rx, rot = 0] = fl.f,
        a = rnd() * TAU,
        r = Math.sqrt(rnd()) * 0.85,
        ex = Math.cos(a) * rx * r,
        ey = Math.sin(a) * ry * r;
      const [sx, sy] = this.R.imageToScreen(
        x + ex * Math.cos(rot) - ey * Math.sin(rot),
        y + ex * Math.sin(rot) + ey * Math.cos(rot),
      );
      this.splash(
        sx + fl.dx,
        sy + fl.dy,
        kind === "r" ? 0.8 : 0.65 + 0.25 * rainK,
        true,
      );
      if (kind === "r") return;
      const light =
          kind === "b"
            ? 3
            : kind === "f"
              ? rx > 25
                ? 1.2
                : 2
              : clamp(22 / rx, 0.25, 1.6),
        side = (rnd() < 0.5 ? -1 : 1) * (0.4 + r);
      fl.jv += side * 0.045 * light * 8;
      fl.vx -= Math.cos(a) * r * light * 9;
      fl.vy -= Math.sin(a) * r * light * 9;
    }
    setStyle(next) {
      style = next;
      this.style = next;
    }
    // New bed: rebuild leaves and the places rain can land. Creatures keep their place until resettle.
    placeBed() {
      this.floaters = sway(floaters(), this.rnd);
      this.measureBed();
    }
    measureBed() {
      const w = this.w,
        h = this.h,
        R = this.R,
        inside = ([x, y]) => x > 20 && x < w - 20 && y > 20 && y < h - 20;
      this.spots = floaters()
        .filter((f) => f[3] !== "r" && f[2] > 25)
        .map(([x, y]) => R.imageToScreen(x, y))
        .filter(inside);
      this.buds = floaters()
        .filter((f) => f[3] === "b")
        .map(([x, y, rx, k, ry = rx, rot = 0]) =>
          R.imageToScreen(
            x - Math.sin(rot) * ry * 0.7,
            y - Math.cos(rot) * ry * 0.7,
          ),
        )
        .filter(inside);
      const [x0, y0] = R.imageToScreen(0, 0),
        [x1, y1] = R.imageToScreen(1, 0),
        k = Math.hypot(x1 - x0, y1 - y0);
      this.sim.obstacles = floaters()
        .filter((f) => f[2] > 25)
        .map(([x, y, rx, kind, ry = rx]) => {
          const [sx, sy] = R.imageToScreen(x, y);
          return {
            x: sx,
            y: sy,
            r: Math.min(rx, ry) * k * (kind === "r" ? 0.95 : 0.55),
          };
        });
      this.targets = [];
      this.targetArea = 0;
      for (const fl of this.floaters) {
        const [x, y, rx, , ry = rx] = fl.f,
          [sx, sy] = R.imageToScreen(x, y),
          r = Math.max(rx, ry) * k;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;
        this.targetArea += Math.PI * rx * ry * k * k;
        this.targets.push([this.targetArea, fl]);
      }
      this.crabHomes = homes()
        .map((c, i) => [i, R.imageToScreen(c[0], c[1])])
        .filter(([, [x, y]]) => x > 30 && x < w - 30 && y > 30 && y < h - 30)
        .map(([i]) => i);
      for (const c of this.crabs)
        if (!this.crabHomes.includes(c.home)) {
          c.state = "hidden";
          c.timer = 1 + this.rnd() * 5;
        }
      // Frogs claim the big lotus leaves and the rocks that are on screen,
      // keeping their perch across a resize.
      this.frogPerches = this.floaters
        .filter((fl) => {
          const [, , rx, kind] = fl.f;
          return kind === "r" ? rx > 33 : kind === "l" && rx > 26;
        })
        .map((fl) => {
          const [ix, iy, rx, , ry = rx] = fl.f;
          const [px, py] = R.imageToScreen(ix, iy);
          return { fl, x: px, y: py, rx: rx * k, ry: ry * k };
        })
        .filter(
          (p) =>
            p.x > p.rx + 24 &&
            p.x < w - p.rx - 24 &&
            p.y > p.ry + 24 &&
            p.y < h - p.ry - 24,
        );
      for (const f of this.frogs) {
        const keep =
          f.perch && this.frogPerches.find((q) => q.fl === f.perch.fl);
        if (keep) f.perch = keep;
        else if (f.state === "sit") f.reseat(this);
        if (f.goal)
          f.goal = this.frogPerches.find((q) => q.fl === f.goal.fl) || null;
        if (
          (f.state === "swim" || f.state === "float" || f.state === "hop") &&
          this.prevW
        ) {
          f.x *= w / this.prevW;
          f.y *= h / this.prevH;
          if (f.state === "hop") {
            f.from[0] *= w / this.prevW;
            f.from[1] *= h / this.prevH;
            f.to[0] *= w / this.prevW;
            f.to[1] *= h / this.prevH;
          }
        }
      }
    }
    // When the new bed's landmarks move, crabs take the nearest home and insects the nearest perch.
    // Identical coordinates leave everyone where they are.
    resettle(prevBed) {
      const same =
        JSON.stringify(prevBed.floaters) === JSON.stringify(floaters()) &&
        JSON.stringify(prevBed.crabHomes) === JSON.stringify(homes());
      if (same) return;
      const R = this.R;
      if (JSON.stringify(prevBed.crabHomes) !== JSON.stringify(homes())) {
        const old = prevBed.crabHomes;
        const pool = this.crabHomes.length
          ? this.crabHomes
          : homes().map((_, i) => i);
        for (const c of this.crabs) {
          const home = old[c.home] || old[0];
          const [x, y, rx, ry] = home;
          const [sx, sy] = R.imageToScreen(x + c.u * rx, y + c.v * ry);
          let best = pool[0],
            bestD = Infinity;
          for (const h of pool) {
            const [hx, hy] = R.imageToScreen(homes()[h][0], homes()[h][1]);
            const d = (hx - sx) ** 2 + (hy - sy) ** 2;
            if (d < bestD) {
              bestD = d;
              best = h;
            }
          }
          c.home = best;
          c.u = 0;
          c.v = 0;
        }
      }
      const nearest = (x, y, points) => {
        let best = null,
          bestD = Infinity;
        for (const p of points) {
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        return best;
      };
      for (const b of this.butterflies) {
        const p = nearest(b.x, b.y, this.spots);
        if (!p) continue;
        b.target = { x: p[0], y: p[1], land: true };
        b.state = "fly";
      }
      for (const d of this.dragonflies) {
        if (d.x < 0) continue;
        const pool = this.buds.length ? this.buds : this.spots;
        const p = nearest(d.x, d.y, pool);
        if (!p) continue;
        d.target = { x: p[0], y: p[1] };
      }
    }
    layout(w, h) {
      this.w = w;
      this.h = h;
      this.scale = clamp(Math.min(w, h) / 800, 0.62, 1.12);
      this.measureBed();
      for (const d of this.dragonflies) {
        d.x = -1;
        d.state = "hover";
        d.timer = 1;
      }
      this.causticCell = clamp(Math.min(w, h) / 7, 70, 150);
      const [mx, my] = this.R.imageToScreen(1000, 255);
      this.moonAt = [clamp(mx, w * 0.2, w * 0.8), clamp(my, h * 0.15, h * 0.5)];
      this.phaseAt = 0;
      for (const b of this.butterflies) {
        if (b.x < 0) {
          b.x = this.rnd() * w;
          b.y = this.rnd() * h;
        } else {
          b.x *= w / this.prevW;
          b.y *= h / this.prevH;
        }
        b.target = null;
        b.state = "fly";
      }
      this.prevW = w;
      this.prevH = h;
    }
    setLook(weather, night, dt, amounts = {}) {
      const target = lookFor(
        weather,
        night,
        amounts.rainAmount,
        amounts.snowAmount,
      );
      if (dt === undefined) {
        const dir = this.look.shadowDir;
        this.look = target;
        this.look.shadowDir = dir;
      } else lerpLook(this.look, target, 1 - Math.exp(-dt * 1.1));
      // Clouds sail right and a little down the screen at a pace that reads as moving without hurrying.
      const span = Math.max(this.w, this.h);
      Object.assign(this.look, {
        sun: [-0.45, 0.45, 0.77],
        moonDisc: this.moonDisc || [0, 0, 1, 0],
        causticCell: this.causticCell || 80,
        cloudWind: [0.021 * span, -0.007 * span],
      });
    }
    update(dt, settings) {
      this.time += dt;
      if (this.time - this.phaseAt > 60 || !this.moonDisc) {
        this.phaseAt = this.time;
        this.phase = moonPhase();
      }
      this.moonDisc = [
        this.moonAt[0],
        this.h - this.moonAt[1],
        26 * this.scale,
        this.phase.angle,
      ];
      const rainK = clamp(settings.rainAmount ?? 0.5, 0, 1),
        snowK = clamp(settings.snowAmount ?? 0.5, 0, 1);
      // Snow settles on leaves, flowers and rocks while it falls and melts away after.
      this.snowCover =
        settings.weather === "snow"
          ? Math.min(
              snowK * 0.9,
              (this.snowCover || 0) + dt * (0.004 + 0.02 * snowK),
            )
          : Math.max(0, (this.snowCover || 0) - dt * 0.012);
      this.look.snowCover = this.snowCover;
      // Rain soaks leaves and rocks quickly, then dries out slowly once it stops.
      this.wetCover =
        settings.weather === "rain"
          ? Math.min(1, (this.wetCover || 0) + dt * (0.04 + 0.1 * rainK))
          : Math.max(0, (this.wetCover || 0) - dt * 0.02);
      this.look.wetCover = this.wetCover;
      const { w, h, scale, rnd } = this,
        weather = settings.weather,
        night = settings.night;
      if (settings.turtles)
        for (const t of this.turtles) t.update(dt, w, h, scale, this);
      // Crabs come out in any weather but snow.
      const crabsOut = settings.crabs !== false && weather !== "snow";
      for (const c of this.crabs)
        c.update(
          dt,
          this.R,
          scale,
          this.crabHomes,
          crabsOut,
          this,
          this.crabs
            .filter((o) => o !== c && o.state !== "hidden")
            .map((o) => o.home),
        );
      // Frogs keep to their leaves and stones in any weather but snow; the
      // option or a style without frog sprites takes them under.
      const frogsOut =
        settings.frogs !== false &&
        weather !== "snow" &&
        !!this.R.sprites.frog0_body;
      for (const f of this.frogs)
        f.update(dt, w, h, scale, this, frogsOut, night, weather);
      const flying = settings.butterflies && weather === "sunny" && !night;
      if (flying)
        for (const b of this.butterflies)
          b.update(dt, w, h, scale, this.spots, this.time);
      if (this.dragonflyWeather(settings))
        for (const d of this.dragonflies)
          d.update(
            dt,
            w,
            h,
            scale,
            this,
            this.buds.length ? this.buds : this.spots,
            this.time,
          );
      // Fireflies at night.
      const wantFlies =
        settings.butterflies && night && weather !== "rain" ? 14 : 0;
      while (this.flies.length < wantFlies)
        this.flies.push({
          x: rnd() * w,
          y: rnd() * h,
          a: rnd() * TAU,
          p: rnd() * TAU,
          s: 0.7 + rnd() * 0.6,
        });
      if (this.flies.length > wantFlies) this.flies.length = wantFlies;
      for (const f of this.flies) {
        f.a += (rnd() - 0.5) * dt * 2;
        f.x += Math.cos(f.a) * 14 * dt;
        f.y += Math.sin(f.a) * 14 * dt;
        f.p += dt;
        if (f.x < 0 || f.x > w || f.y < 0 || f.y > h) f.a += Math.PI;
      }
      // Lotus petals drift on the surface and get pushed by ripples.
      if (this.petals.length < 5 && rnd() < dt * 0.05) {
        const lotus = lotusBeds()
            .map(([x, y]) => this.R.imageToScreen(x, y))
            .filter(([x, y]) => x > -40 && x < w + 40 && y > -40 && y < h + 40),
          p0 = lotus.length
            ? lotus[Math.floor(rnd() * lotus.length)]
            : [rnd() * w, rnd() * h];
        this.petals.push({
          x: p0[0] + (rnd() - 0.5) * 60,
          y: p0[1] + (rnd() - 0.5) * 60,
          a: rnd() * TAU,
          spin: (rnd() - 0.5) * 0.3,
          vx: (w / 2 - p0[0]) * 0.02,
          vy: (h / 2 - p0[1]) * 0.02,
          life: 60 + rnd() * 60,
          age: 0,
          s: 0.8 + rnd() * 0.5,
        });
      }
      for (const p of this.petals) {
        p.age += dt;
        p.vx *= Math.exp(-dt * 0.5);
        p.vy *= Math.exp(-dt * 0.5);
        p.x += (p.vx + Math.sin(this.time * 0.1 + p.a) * 2) * dt;
        p.y += (p.vy + Math.cos(this.time * 0.08 + p.a) * 2) * dt;
        p.a += (p.spin + (Math.abs(p.vx) + Math.abs(p.vy)) * 0.004) * dt;
      }
      this.petals = this.petals.filter(
        (p) =>
          p.age < p.life &&
          p.x > -60 &&
          p.x < w + 60 &&
          p.y > -60 &&
          p.y < h + 60,
      );
      // Rain streaks and drops; snowflakes melting into the pond.
      const rainN =
        weather === "rain"
          ? Math.round((30 + 190 * rainK) * Math.min(1, (w * h) / 1.2e6) + 20)
          : 0;
      // Streaks at different distances: far ones short, faint and slow, near ones long, bright and fast.
      while (this.rain.length < rainN) {
        const z = Math.pow(rnd(), 1.8);
        this.rain.push({
          x: rnd() * w,
          y: rnd() * h,
          z,
          l: 0.5 + z * 0.9 + rnd() * 0.2,
          v: 600 + z * 700 + rnd() * 200,
        });
      }
      if (this.rain.length > rainN) this.rain.length = rainN;
      for (const d of this.rain) {
        d.y += d.v * dt;
        d.x += d.v * 0.12 * dt;
        if (d.y > h + 60) {
          d.y = -60 - rnd() * 60;
          d.x = rnd() * (w + 80) - 60;
        }
      }
      if (weather === "rain") {
        let n = dt * (10 + 80 * rainK) * Math.min(1.6, (w * h) / 1e6);
        while (n > 0) {
          if (rnd() < n) {
            const x = rnd() * w,
              y = rnd() * h;
            this.drop(
              x,
              y,
              (3 + rnd() * 3) * scale,
              (0.2 + rnd() * 0.3) * (0.7 + 0.5 * rainK),
            );
            if (rnd() < 0.4) this.splash(x, y, 0.5 + rnd() * 0.4, false);
          }
          n -= 1;
        }
        // The same rain drums on the leaves, flowers and rocks: a splash crown where it lands, and a knock that sets it trembling.
        let m = (dt * (14 + 90 * rainK) * this.targetArea) / 1e6;
        while (m > 0) {
          if (rnd() < m && this.targets.length) {
            const pick = rnd() * this.targetArea;
            this.hit(this.targets.find((t) => t[0] >= pick)[1], rainK);
          }
          m -= 1;
        }
      }
      this.rainK = rainK;
      this.look.rainK = weather === "rain" ? rainK : 0;
      for (const fl of this.floaters) {
        if (!fl.jv && !fl.ja && !fl.vx && !fl.vy && !fl.ox && !fl.oy) continue;
        const e = Math.min(dt, 0.05);
        fl.jv += (-60 * fl.ja - 6 * fl.jv) * e;
        fl.ja += fl.jv * e;
        fl.vx += (-45 * fl.ox - 5 * fl.vx) * e;
        fl.vy += (-45 * fl.oy - 5 * fl.vy) * e;
        fl.ox += fl.vx * e;
        fl.oy += fl.vy * e;
        if (
          Math.abs(fl.ja) +
            Math.abs(fl.jv) +
            Math.abs(fl.ox) +
            Math.abs(fl.oy) +
            Math.abs(fl.vx) +
            Math.abs(fl.vy) <
          1e-3
        )
          fl.ja = fl.jv = fl.ox = fl.oy = fl.vx = fl.vy = 0;
      }
      for (const p of this.splashes) {
        p.age += dt;
        if (!p.ring) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= Math.exp(-dt * 7);
          p.vy *= Math.exp(-dt * 7);
        }
      }
      this.splashes = this.splashes.filter((p) => p.age < p.life);
      // Now and then in a heavy downpour the sky flickers white, and thunder rolls in a moment later.
      if (weather === "rain" && rainK > 0.6 && !this.calm) {
        this.nextBolt -= dt;
        if (this.nextBolt <= 0) {
          const k = 0.6 + rnd() * 0.4,
            t0 = this.time;
          this.bolts.push([t0, k], [t0 + 0.09 + rnd() * 0.06, k * 0.45]);
          if (rnd() < 0.6)
            this.bolts.push([t0 + 0.28 + rnd() * 0.25, k * 0.75]);
          this.events.push({
            type: "thunder",
            delay: 1 + rnd() * 2.5,
            strength: k,
          });
          this.nextBolt = 22 + rnd() * 48;
        }
      } else this.nextBolt = Math.max(this.nextBolt, 8 + rnd() * 12);
      let flash = 0;
      for (const [t0, k] of this.bolts) {
        const t = this.time - t0;
        if (t >= 0) flash += k * Math.min(1, t / 0.025) * Math.exp(-t * 14);
      }
      this.bolts = this.bolts.filter(([t0]) => this.time - t0 < 1.2);
      this.look.flash = flash * 0.3;
      // Snow in depth: many small far flakes, fewer large soft near ones, all carried by the wind;
      // each settles on the water, shrinks as it melts and leaves a faint ring.
      const snowN =
          weather === "snow"
            ? Math.round((50 + 330 * snowK) * Math.min(1.5, (w * h) / 1e6) + 20)
            : 0,
        wind = (6 + 16 * snowK) * scale;
      const flake = (f) =>
        Object.assign(f, {
          x: rnd() * (w + 80) - 80,
          y: rnd() * h * 0.95,
          z: Math.pow(rnd(), 1.6),
          life: 2 + rnd() * 10,
          age: 0,
          melt: 0,
          p: rnd() * TAU,
        });
      while (this.snow.length < snowN) this.snow.push(flake({}));
      if (this.snow.length > snowN) this.snow.length = snowN;
      for (const f of this.snow) {
        if (f.melt > 0) {
          f.melt -= dt;
          if (f.melt <= 0) flake(f);
          continue;
        }
        f.life -= dt;
        f.age += dt;
        f.y += (8 + f.z * 34) * (0.8 + snowK * 0.4) * scale * dt;
        f.x +=
          (wind * (0.4 + f.z) +
            Math.sin(this.time * 0.7 + f.p) * (6 + f.z * 10) * scale) *
          dt;
        if (f.x > w + 30) f.x -= w + 60;
        if (f.life <= 0) {
          f.melt = 0.6;
          if (rnd() < 0.5)
            this.drop(f.x, f.y, (2 + f.z * 2) * scale, 0.04 + f.z * 0.05);
        }
      }
      // Koi cruising just under the surface leave faint wakes.
      for (const f of this.sim.allFish) {
        if (f.v === undefined) continue;
        const L = BODY.length * f.size * this.sim.scale,
          bl = f.v / L;
        if (f.depth < 0.22 && bl > 0.45) {
          const t = (this.wakes.get(f) || 0) - dt;
          if (t <= 0) {
            const s = f.size * this.sim.scale;
            this.drop(
              f.x * w + Math.cos(f.angle) * BODY.nose * s,
              f.y * h + Math.sin(f.angle) * BODY.nose * s,
              3.2 * scale,
              0.04 * (1 - f.depth / 0.22) * Math.min(2, bl),
            );
            this.wakes.set(f, 0.14);
          } else this.wakes.set(f, t);
        }
      }
    }
    bodyLight(f) {
      if (
        !f.light ||
        f.light.seed !== f.seed ||
        f.light.palette !== f.palette ||
        f.light.species !== f.species ||
        f.light.style !== style.name
      ) {
        const girth = girthOf(f.seed),
          widths = new Float32Array(BODY.segments + 1),
          kind = fishPalette(f).kind;
        for (let i = 0; i <= BODY.segments; i++)
          widths[i] =
            halfWidth(
              BODY.nose - (i * BODY.length) / BODY.segments,
              girth,
              kind,
            ) / BODY.half;
        const shade = style.look.bodyShade(kind);
        f.light = {
          style: style.name,
          species: f.species,
          seed: f.seed,
          palette: f.palette,
          widths,
          metal: shade.metal,
          gloss: shade.gloss,
        };
      }
      return f.light;
    }
    koi(f, cell) {
      const R = this.R,
        look = this.look,
        s = f.size * this.sim.scale,
        pose = fishPose(f, s, this.pose),
        cx = f.x * this.w,
        cy = f.y * this.h;
      const k = 1 - f.depth * 0.09,
        fogA = 0.03 + f.depth * 0.28,
        fog = [look.water[0], look.water[1], look.water[2], fogA];
      // The shadow lies on the bed: a fish near the bottom casts a dark, sharp one right beside it;
      // one cruising at the surface casts it further off, larger in blur and a little paler.
      const off = (6 + (1 - f.depth) * 30) * this.scale,
        dx = look.shadowDir[0] * off,
        dy = look.shadowDir[1] * off,
        sh = [0, 0, 0, 0.92 - (1 - f.depth) * 0.22],
        blur = [(1 - f.depth) * 1.1, 0, 0, 0];
      // Pectoral fins spread when gliding or braking, fold back at speed, the inner one flares in a turn.
      const L = BODY.length * s,
        bl = f.v / L,
        pal = fishPalette(f),
        slender = pal.kind === "silvercarp",
        finDef = R.sprites[pal.kind === "utsuri" ? "finMoto" : "fin"];
      const tint = style.look.finTint(f.palette, pal, f.species);
      const base =
        1.05 -
        0.6 * clamp(bl / 1.4, 0, 1) +
        (f.thrust < 0.3 ? Math.sin(this.time * 4.2 + f.seed) * 0.16 : 0);
      const fins = [
        [4, 0.95, 1],
        [8, 0.55, 0.58],
      ];
      for (const [i, spreadK, size] of fins) {
        const px = pose[i * 4],
          py = pose[i * 4 + 1],
          nx = pose[i * 4 + 2],
          ny = pose[i * 4 + 3],
          heading = Math.atan2(-nx, ny),
          hw =
            halfWidth(
              BODY.nose - (i * BODY.length) / BODY.segments,
              girthOf(f.seed),
              pal.kind,
            ) *
            s *
            0.8;
        for (const side of [1, -1]) {
          const spread =
              (base + clamp(side * f.turn * 0.35, -0.3, 0.5)) * spreadK,
            ang = heading + side * (Math.PI - spread);
          const X = cx + (px + nx * hw * side - cx) * k,
            Y = cy + (py + ny * hw * side - cy) * k,
            fs = s * k * 0.85 * size;
          R.sprite(
            "under",
            finDef,
            X,
            Y,
            ang,
            fs * (slender ? 0.88 : 1),
            side * fs * (slender ? 0.5 : 1),
            tint,
            fog,
          );
          if (size === 1)
            R.sprite(
              "shadow",
              finDef,
              X + dx,
              Y + dy,
              ang,
              fs * (slender ? 0.88 : 1),
              side * fs * (slender ? 0.5 : 1),
              [0, 0, 0, sh[3] * 0.6],
              blur,
            );
        }
      }
      R.fish("shadow", cell, pose, s, cx, cy, k, sh, blur, dx, dy);
      R.fish(
        "under",
        cell,
        pose,
        s,
        cx,
        cy,
        k,
        undefined,
        fog,
        0,
        0,
        this.bodyLight(f),
      );
    }
    draw(settings) {
      const R = this.R,
        look = this.look,
        { w, h, scale } = this,
        sim = this.sim;
      // Underwater, deepest first.
      const items = sim.allFish.map((f, i) => ({ d: f.depth ?? 0.5, f, i }));
      if (settings.turtles)
        for (const t of this.turtles) items.push({ d: t.depth + 0.02, t });
      for (const f of this.frogs)
        if (
          f.state === "swim" ||
          (f.state === "float" && f.floatMode === "submerged")
        )
          items.push({ d: f.depth + 0.04, fr: f });
      items.sort((a, b) => b.d - a.d);
      for (const it of items) {
        if (it.t) it.t.draw(R, w, h, scale, look);
        else if (it.fr) it.fr.draw(R, scale, look);
        else if (it.f.spriteReady && it.f.spine) this.koi(it.f, it.i);
      }
      // Leaves bob, pennywort and buds sway on their stalks, flowers nod; wind and rain stir them a little more.
      const t = this.time,
        gust = 0.8 + look.wave * 0.45;
      for (const fl of this.floaters) {
        const { f, p, sp } = fl;
        const [x, y, rx, kind, ry = rx, rot = 0] = f;
        const gr = grow(f);
        if (kind === "r") {
          R.floater(x, y, rx, ry, rot, 0, 0, 0, 0, 1, 0, 0, fl.seed);
          continue;
        }
        const big = kind === "l" && rx > 30,
          petal = kind === "f" && rx <= 25,
          turn = big
            ? 0.032
            : kind === "b"
              ? 0.13
              : kind === "f" && !petal
                ? 0.085
                : 0.075,
          move = (big ? 1.6 : kind === "b" ? 3.2 : 2.4) * scale * gust;
        const angle =
          (turn * Math.sin(t * 0.33 * sp + p[0]) +
            turn * 0.4 * Math.sin(t * 0.91 * sp + p[1])) *
          gust;
        fl.dx = move * Math.sin(t * 0.29 * sp + p[2]) + fl.ox * scale;
        fl.dy = move * Math.cos(t * 0.23 * sp + p[3]) + fl.oy * scale;
        R.floater(
          x,
          y,
          rx * gr,
          ry * gr,
          rot,
          angle + fl.ja,
          fl.dx,
          fl.dy,
          (big ? 1.8 : petal ? 3.5 : 2.6) * scale,
          big ? 1 : kind === "l" ? 0.6 : 0.32,
          kind === "l" ? 1 : 0.45,
          big ? 1 : 0,
          fl.seed,
        );
      }
      // Floating: petals and food.
      for (const p of this.petals) {
        const fade = Math.min(1, p.age / 3, (p.life - p.age) / 4),
          s = scale * p.s;
        R.sprite(
          "shadow",
          R.sprites.petal,
          p.x + look.shadowDir[0] * 14 * scale,
          p.y + look.shadowDir[1] * 14 * scale,
          p.a,
          s,
          s,
          [0, 0, 0, 0.35 * fade],
        );
        R.sprite("surface", R.sprites.petal, p.x, p.y, p.a, s, s, [
          look.bright * look.tint[0],
          look.bright * look.tint[1],
          look.bright * look.tint[2],
          fade,
        ]);
      }
      const lit = [
        look.bright * look.tint[0],
        look.bright * look.tint[1],
        look.bright * look.tint[2],
      ];
      for (const p of sim.food) {
        const fade = Math.min(1, p.life / 2),
          pop = 1 + Math.max(0, 0.25 - p.age) * 1.6,
          s =
            scale * 0.72 * pop * (1 + Math.sin(this.time * 2 + p.drift) * 0.04);
        R.sprite(
          "shadow",
          R.sprites.dot,
          p.x + look.shadowDir[0] * 9 * scale,
          p.y + look.shadowDir[1] * 9 * scale,
          0,
          s * 0.45,
          s * 0.45,
          [0, 0, 0, 0.5 * fade],
        );
        R.sprite("surface", R.sprites.pellet, p.x, p.y, p.drift, s, s, [
          ...lit,
          fade,
        ]);
      }
      for (const c of this.crabs) c.draw(R, scale, look);
      for (const f of this.frogs)
        if (
          f.state !== "swim" &&
          !(f.state === "float" && f.floatMode === "submerged")
        )
          f.draw(R, scale, look);
      // Air: butterflies or fireflies, rain, snow.
      if (
        settings.butterflies &&
        settings.weather === "sunny" &&
        !settings.night
      )
        for (const b of this.butterflies) b.draw(R, scale, look);
      if (this.dragonflyWeather(settings))
        for (const d of this.dragonflies) d.draw(R, scale, look);
      for (const f of this.flies) {
        const glow = Math.pow(Math.max(0, Math.sin(f.p * 1.3 * f.s)), 3);
        R.sprite("glow", R.sprites.dot, f.x, f.y, 0, 0.9 * f.s, 0.9 * f.s, [
          0.75 * glow,
          1 * glow,
          0.45 * glow,
          1,
        ]);
        R.sprite("glow", R.sprites.dot, f.x, f.y, 0, 0.25, 0.25, [
          0.9 * glow,
          1 * glow,
          0.7 * glow,
          1,
        ]);
      }
      const rk = this.rainK || 0;
      for (const d of this.rain) {
        const a = (0.07 + 0.2 * d.z) * (0.75 + 0.5 * rk);
        R.sprite(
          "air",
          R.sprites.streak,
          d.x,
          d.y,
          -0.12 - rk * 0.06,
          0.7 + 0.7 * d.z,
          d.l * (0.4 + 0.25 * rk) * scale,
          [0.9 * a, 0.95 * a, a, a],
        );
      }
      // Splash crowns: a quick ring where each drop lands, and a few droplets flung out from it.
      for (const p of this.splashes) {
        const t = p.age / p.life;
        if (p.ring) {
          const r = p.s * (0.25 + 0.75 * Math.sqrt(t)),
            a = Math.pow(1 - t, 1.6) * (p.leaf ? 0.75 : 0.45);
          R.sprite("surface", R.sprites.ring, p.x, p.y, 0, r, r * 0.9, [
            lit[0] * a,
            lit[1] * a,
            lit[2] * a,
            a,
          ]);
        } else {
          const a = (1 - t) * 0.8,
            r = p.s * 0.16 * (1 - t * 0.4);
          R.sprite("air", R.sprites.dot, p.x, p.y, 0, r, r, [a, a, a, a]);
        }
      }
      for (const f of this.snow) {
        const m = f.melt > 0 ? f.melt / 0.6 : 1,
          s = (0.28 + f.z * 1.25) * scale * (f.melt > 0 ? 0.4 + 0.6 * m : 1),
          a = Math.min(1, f.age * 2) * m * (0.55 + 0.4 * f.z),
          near = f.z > 0.82;
        if (f.z > 0.4)
          R.sprite(
            "airShadow",
            R.sprites.flake,
            f.x + (4 + 18 * f.z) * scale,
            f.y + (4 + 18 * f.z) * scale,
            0,
            s,
            s,
            [0, 0, 0, 0.16 * a],
          );
        R.sprite(
          "air",
          near ? R.sprites.dot : R.sprites.flake,
          f.x,
          f.y,
          0,
          near ? s * 1.5 : s,
          near ? s * 1.5 : s,
          [1, 1, 1, near ? a * 0.7 : a],
        );
      }
    }
  }

  // 2D koi for the dialog preview and thumbnails: posed strip plus tinted fins.
  const tintedFins = new Map();
  function tintedFin(def, color, solid = false) {
    const key = def.canvas.width + color + solid;
    if (!tintedFins.has(key)) {
      const c = document.createElement("canvas");
      c.width = def.canvas.width;
      c.height = def.canvas.height;
      const x = c.getContext("2d");
      x.drawImage(def.canvas, 0, 0);
      x.globalCompositeOperation = "source-atop";
      x.globalAlpha = solid ? 1 : 0.75;
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      tintedFins.set(key, c);
    }
    return tintedFins.get(key);
  }
  function drawKoi2D(ctx, f, sprite, sprites, x, y, angle, s, amp = 0.4) {
    const n = BODY.segments,
      seg = BODY.length / n,
      spine = new Float32Array((n + 1) * 2),
      c = Math.cos(angle),
      si = Math.sin(angle);
    for (let i = 0; i <= n; i++) {
      spine[i * 2] = x + c * (BODY.nose - i * seg) * s;
      spine[i * 2 + 1] = y + si * (BODY.nose - i * seg) * s;
    }
    const pose = fishPose(
        { spine, amp, phase: f.phase || 0, species: f.species },
        s,
      ),
      pal = fishPalette(f);
    const finDef = sprites[pal.kind === "utsuri" ? "finMoto" : "fin"],
      fin =
        pal.kind === "utsuri"
          ? finDef.canvas
          : tintedFin(
              finDef,
              pal.fin,
              pal.kind === "benigoi" || pal.kind === "silvercarp",
            );
    for (const [i, spread, size] of [
      [8, 0.6, 0.58],
      [4, 1, 1],
    ]) {
      const px = pose[i * 4],
        py = pose[i * 4 + 1],
        nx = pose[i * 4 + 2],
        ny = pose[i * 4 + 3],
        heading = Math.atan2(-nx, ny),
        hw =
          halfWidth(BODY.nose - i * seg, girthOf(f.seed), pal.kind) * s * 0.8;
      for (const side of [1, -1]) {
        ctx.save();
        ctx.translate(px + nx * hw * side, py + ny * hw * side);
        ctx.rotate(heading + side * (Math.PI - spread));
        ctx.scale(
          ((s * 0.85 * size) / finDef.ppu) *
            (pal.kind === "silvercarp" ? 0.88 : 1),
          ((side * s * 0.85 * size) / finDef.ppu) *
            (pal.kind === "silvercarp" ? 0.5 : 1),
        );
        ctx.globalAlpha = 0.9;
        ctx.drawImage(fin, -finDef.px * fin.width, -finDef.py * fin.height);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    root.PondGL.drawStrip2D(ctx, sprite, pose, s, x, y, 1);
  }
  root.PondScene = { PondScene, drawKoi2D, lookFor, floatMask, moonPhase };
})(window);
