/* eslint-disable max-lines -- Frog pose, attachment and motion regression cases. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../resources/widgets/starter/pond/vendor/scene.js", import.meta.url),
  "utf8",
);
const frogClass = source.slice(
  source.indexOf("  class Frog {"),
  source.indexOf("  class PondScene"),
);
const TAU = Math.PI * 2;
const Frog = new Function("TAU", "clamp", "wrap", `${frogClass}; return Frog;`)(
  TAU,
  (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  (v) => Math.atan2(Math.sin(v), Math.cos(v)),
);

function sample(phase, long = true, flee = false) {
  const f = new Frog(0, () => 0.5);
  Object.assign(f, {
    state: "swim",
    x: 400,
    y: 400,
    alpha: 1,
    size: 1,
    stroke: phase * TAU,
    angle: 0,
    swimA: 0,
    travelT: long ? 6 : 2,
    swimT: long ? 15 : 2,
    breath: 100,
    diveT: 0,
    coastT: 9,
    fleeT: flee ? 1 : 0,
  });
  f.swimUpdate(
    0,
    2000,
    2000,
    1,
    { drop() {}, frogPerches: [], frogs: [] },
    false,
  );
  return f;
}

test("push starts continuously from drift in short, long and fleeing strokes", () => {
  for (const [long, flee, gather, push, drift] of [
    [false, false, 0.12, 0.35, 5],
    [true, false, 0.25, 0.4, 0],
    [false, true, 0.08, 0.28, 0],
  ]) {
    const before = sample(gather - 1e-7, long, flee);
    const after = sample(gather + 1e-7, long, flee);
    assert.equal(before.swimV, drift);
    assert.ok(Math.abs(after.swimV - drift) < 1e-7);
    const peak = sample((gather + push) / 2, long, flee);
    assert.ok(peak.swimV > drift + 20);
    assert.equal(peak.swimStage, "push");
  }
});

test("six-second travel distance selects a long stroke while short trips stay short", () => {
  const long = sample(0.05, true);
  const short = sample(0.05, false);
  assert.equal(long.swimMode, "long");
  assert.equal(short.swimMode, "short");
  assert.equal(long.swimStage, "gather");
});

test("forelimbs visibly tuck through the kick and reach during recovery", () => {
  const arms = (phase, long = false) =>
    render(sample(phase, long), 0).filter((call) => call[1] === "arm");
  const gather = arms(0.06);
  const push = arms(0.33);
  const glide = arms(0.46);
  const recover = arms(0.9);
  assert.equal(gather.length, 2);
  assert.equal(push.length, 2);
  assert.ok(Math.abs(push[0][4] - gather[0][4]) > 0.7);
  assert.ok(glide[0][4] > 2.6, "forelimbs stay pulled back during glide");
  assert.ok(Math.abs(push[0][4] - glide[0][4]) < 0.18);
  assert.ok(glide[0][4] - recover[0][4] > 0.35);
  assert.ok(push[0][5] < gather[0][5] - 0.12);
  assert.ok(glide[0][5] < gather[0][5] - 0.12);
  assert.ok(recover[0][5] > glide[0][5] + 0.08);
  assert.ok(Math.abs(gather[0][4] + gather[1][4]) < 0.2);
  assert.ok(Math.abs(push[0][4] + push[1][4]) < 0.2);
});

test("forehands articulate on their own across hind-limb stages", () => {
  for (const [long, phases] of [
    [false, [0.06, 0.33, 0.46, 0.9]],
    [true, [0.12, 0.38, 0.6, 0.9]],
  ]) {
    const [gather, push, glide, recover] = phases.map((phase) =>
      sample(phase, long),
    );
    assert.deepEqual(
      [gather, push, glide, recover].map((f) => f.swimStage),
      ["gather", "push", "glide", "recover"],
    );
    assert.ok(gather.foreHandOpen > 0.7);
    assert.ok(push.foreHandOpen < 0.35);
    assert.ok(glide.foreHandOpen < 0.35);
    assert.ok(recover.foreHandOpen > 0.65);
    assert.ok(push.footSpread > push.foreHandOpen + 0.4);
    assert.ok(recover.foreReach > push.foreReach);

    const handAngles = [gather, push, glide, recover].map(
      (f) => render(f, 0).find((call) => call[1] === "hand")[4],
    );
    assert.ok(Math.abs(handAngles[1] - handAngles[0]) > 0.25);
    assert.ok(Math.abs(handAngles[3] - handAngles[2]) > 0.1);
  }
});

function render(f, angle) {
  f.angle = angle;
  const names = [
    "body",
    "eye",
    "thigh",
    "shin",
    "tarsus",
    "foot",
    "arm",
    "hand",
    "knee",
    "throat",
  ];
  const sprites = Object.fromEntries(
    names.map((name) => [`frog0_${name}`, name]),
  );
  const calls = [];
  f.draw(
    {
      sprites,
      sprite(...args) {
        if (args[0] !== "shadow") calls.push(args);
      },
    },
    1,
    { bright: 1, tint: [1, 1, 1], water: [0, 0, 0], shadowDir: [1, 0] },
  );
  return calls;
}

const part = (calls, name) => calls.find((c) => c[1] === name);

function footToShinFlex(phase, long = true) {
  const calls = render(sample(phase, long), 0);
  const feet = calls.filter((call) => call[1] === "tarsus");
  const shins = calls.filter((call) => call[1] === "shin");
  assert.equal(feet.length, 2);
  assert.equal(shins.length, 2);
  return feet.map((foot, i) =>
    Math.abs(
      Math.atan2(
        Math.sin(foot[4] - shins[i][4]),
        Math.cos(foot[4] - shins[i][4]),
      ),
    ),
  );
}

function calfJointGap(phase, long = true) {
  const calls = render(sample(phase, long), 0);
  const thighs = calls.filter((call) => call[1] === "thigh");
  const shins = calls.filter((call) => call[1] === "shin");
  const kneeYs = thighs.map(
    (thigh) => thigh[3] + Math.sin(thigh[4]) * 10.5 * 0.8,
  );
  const ankleYs = shins.map((shin) => shin[3] + Math.sin(shin[4]) * 5.5 * 1.55);
  return {
    knee: Math.abs(kneeYs[0] - kneeYs[1]),
    ankle: Math.abs(ankleYs[0] - ankleYs[1]),
  };
}

test("knee skin follows both bones with symmetric finite transforms throughout the cycle", () => {
  for (const long of [false, true])
    for (let i = 0; i <= 240; i++) {
      const f = sample((i % 240) / 240, long);
      const skin = render(f, 0).filter((c) => c[1] === "knee");
      assert.equal(skin.length, 16);
      assert.ok(
        skin.every((c) =>
          c.slice(2, 7).every((value) => Number.isFinite(value)),
        ),
      );
      for (let j = 0; j < 8; j++)
        assert.ok(Math.abs(skin[j][5] - skin[j + 8][5]) < 1e-10);
      assert.ok(skin.every((c) => c[5] > 0 && c[5] < 0.3));
    }
});

test("front hand opens while paddling and folds without changing reach or wrist attachment", () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    const f = sample(0.325);
    f.foreHandOpen = 1;
    const open = render(f, angle).filter((c) => c[1] === "hand");
    f.foreHandOpen = 0;
    const closed = render(f, angle).filter((c) => c[1] === "hand");
    assert.equal(open.length, 2);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(open[i].slice(2, 6), closed[i].slice(2, 6));
      assert.ok(Math.abs(closed[i][6] / open[i][6] - 0.48) < 1e-12);
      const arm = render(f, angle).filter((c) => c[1] === "arm")[i];
      const reachScale = 0.68 + 0.32 * f.foreReach;
      assert.ok(
        Math.abs(
          Math.hypot(closed[i][2] - arm[2], closed[i][3] - arm[3]) -
            1.05 *
              reachScale *
              Math.hypot(Frog.anatomy.foreWristX, Frog.anatomy.foreWristY),
        ) < 1e-10,
      );
    }
  }
});

test("curved knee skin is continuous at phase boundaries and the cycle seam", () => {
  const localSkin = (u, long) => {
    const f = sample(u, long);
    const calls = render(f, 0);
    const angle = part(calls, "body")[4];
    return calls
      .filter((c) => c[1] === "knee")
      .map((c) => {
        const dx = c[2] - f.x,
          dy = c[3] - f.y;
        const copy = c;
        copy[2] = dx * Math.cos(angle) + dy * Math.sin(angle);
        copy[3] = -dx * Math.sin(angle) + dy * Math.cos(angle);
        copy[4] -= angle;
        return copy;
      });
  };
  for (const long of [false, true])
    for (const u of long ? [0, 0.25, 0.4, 0.8] : [0, 0.12, 0.35, 0.55]) {
      const h = 1e-7;
      const a = localSkin((u - h + 1) % 1, long);
      const b = localSkin((u + h) % 1, long);
      for (let i = 0; i < a.length; i++) {
        for (const k of [2, 3, 5, 6])
          assert.ok(
            Math.abs(a[i][k] - b[i][k]) < 1e-4,
            JSON.stringify({ long, u, i, k, before: a[i][k], after: b[i][k] }),
          );
        assert.ok(
          Math.abs(
            Math.atan2(
              Math.sin(a[i][4] - b[i][4]),
              Math.cos(a[i][4] - b[i][4]),
            ),
          ) < 1e-4,
        );
      }
    }
});

test("frog native size is reduced uniformly, without changing anatomy", () => {
  const small = new Frog(0, () => 0);
  const big = new Frog(0, () => 1);
  assert.equal(small.size, 0.72);
  assert.equal(big.size, 0.88);
  const f = sample(0.5);
  const full = render(f, 0);
  f.size = 0.8;
  const reduced = render(f, 0);
  for (let i = 0; i < full.length; i++) {
    assert.ok(Math.abs(reduced[i][5] / full[i][5] - 0.8) < 1e-8);
    assert.ok(Math.abs(reduced[i][6] / full[i][6] - 0.8) < 1e-8);
    assert.ok(Math.abs(reduced[i][2] - f.x - (full[i][2] - f.x) * 0.8) < 1e-8);
  }
});

test("long/short mode changes only after a complete cycle", () => {
  const f = sample(0.5);
  assert.equal(f.swimMode, "long");
  f.travelT = f.swimT = 2;
  const scene = { drop() {}, frogPerches: [], frogs: [f] };
  f.swimUpdate(0.01, 2000, 2000, 1, scene, true);
  assert.equal(f.swimMode, "long");
  f.stroke = TAU * 0.99;
  f.prevPh = 0.99;
  f.swimUpdate(0.08, 2000, 2000, 1, scene, true);
  assert.equal(f.swimMode, "short");
  assert.ok(
    Math.abs(f.prevPh - 0.034) < 1e-9,
    "leftover frame time uses new cycle rate",
  );
});

test("long glide travels 3–5 body lengths while short strokes remain frequent", () => {
  for (const fps of [30, 60, 120, 1020]) {
    const f = new Frog(0, () => 0.5);
    Object.assign(f, {
      state: "swim",
      x: 5000,
      y: 5000,
      angle: 0,
      swimA: 0,
      stroke: 0,
      prevPh: 0,
      travelT: 40,
      swimT: 40,
    });
    const scene = { drop() {}, frogPerches: [], frogs: [f] };
    let glidePath = 0;
    let expected = 0;
    const startX = f.x;
    for (let time = 0; time < 4 - 1e-9; ) {
      const dt = Math.min(1 / fps, 4 - time),
        x = f.x;
      f.update(dt, 10000, 10000, 1, scene, true, false, "sunny");
      if (f.swimStage === "glide") glidePath += Math.abs(f.x - x);
      expected += f.swimV * dt;
      time += dt;
    }
    const bodies = glidePath / (Frog.swimming.bodyLength * f.size);
    assert.ok(bodies > 3 && bodies < 5, `${fps} fps: ${bodies} bodies`);
    assert.ok(Math.abs(f.x - startX - expected) < 1e-8);
    assert.equal(f.swimMode, "long");
    assert.equal(Frog.swimming.longRate, 0.25);
    assert.ok(Frog.swimming.shortRate > 3 * Frog.swimming.longRate);
  }
});

test("short stroke stays partial, long stroke extends both legs and closes web", () => {
  const long = sample(0.5);
  const short = sample(0.45, false);
  assert.ok(long.legExtension > 0.9);
  assert.equal(long.powerAlt, long.power);
  assert.ok(sample(0.7).footSpread < 0.25);
  assert.ok(short.legExtension > 0.55 && short.legExtension < 0.68);
  assert.ok(short.footSpread < 0.4);
  assert.ok(sample(0.8, false).swimV > 0);
});

test("drive opens the web while recovery tucks it along a different knee path", () => {
  const push = sample(0.313);
  const recover = sample(0.94);
  assert.equal(push.swimStage, "push");
  assert.equal(recover.swimStage, "recover");
  assert.ok(push.footSpread > 0.7);
  assert.ok(recover.footSpread < 0.25);
  assert.ok(sample(0.04).footSpread < 0.25);
  assert.ok(recover.hindFold > 1 - recover.legExtension);
});

test("hind feet press near-perpendicular during push, then ease straight through glide", () => {
  for (const [long, phases] of [
    [true, [0.37, 0.6, 0.75, 0.9]],
    [false, [0.33, 0.45, 0.53, 0.85]],
  ]) {
    const [push, midGlide, lateGlide, recover] = phases.map((phase) =>
      footToShinFlex(phase, long),
    );
    for (const side of [0, 1]) {
      assert.ok(push[side] > 1.2, `${long ? "long" : "short"} push: ${push}`);
      assert.ok(midGlide[side] < push[side] - 0.15);
      assert.ok(lateGlide[side] < midGlide[side] - 0.08);
      assert.ok(recover[side] < 0.35);
    }
    assert.ok(
      Math.abs(push[0] - push[1]) < 1e-8,
      "left/right foot flex mirrors",
    );
  }
});

test("extended calves preserve the open diamond and draw both feet inward", () => {
  for (const [long, phase] of [
    [true, 0.6],
    [false, 0.45],
  ]) {
    const { knee, ankle } = calfJointGap(phase, long);
    assert.ok(
      ankle < knee * 0.82,
      `${long ? "long" : "short"}: ${knee} -> ${ankle}`,
    );
  }
});

test("hip leads calf, web closes through glide, and forearms paddle independently", () => {
  for (const long of [true, false]) {
    const gather = long ? 0.25 : 0.12;
    const push = long ? 0.4 : 0.35;
    const middle = sample((gather + push) / 2, long);
    assert.ok(middle.hipExtension > middle.legExtension);
    assert.ok(middle.shinExtension < middle.legExtension);
    const open = sample(gather + (push - gather) * 0.75, long);
    const closed = sample(long ? 0.6 : 0.45, long);
    assert.ok(open.footSpread > 0.6);
    assert.ok(closed.footSpread < 0.4);
    const beginArm = part(render(sample(gather, long), 0), "arm");
    const endArm = part(render(sample(push, long), 0), "arm");
    assert.ok(Math.abs(endArm[4] - beginArm[4]) > 0.12);
  }
});

test("hip, knee, ankle and web peak at different times without hard phase switches", () => {
  const earlyPush = sample(0.3);
  const kneeFollow = sample(0.5);
  const ankleFollow = sample(0.6);
  const pushEnd = sample(0.4);
  const glide = sample(0.6);
  assert.ok(earlyPush.hipExtension > earlyPush.shinExtension);
  assert.ok(kneeFollow.shinExtension > kneeFollow.hipExtension);
  assert.ok(ankleFollow.tarsusFlex > kneeFollow.tarsusFlex);
  assert.ok(Math.abs(pushEnd.footSpread - 1) < 1e-8);
  assert.ok(glide.footSpread < pushEnd.footSpread);
});

test("pose channels recover smoothly and foot opening is continuous", () => {
  for (const long of [true, false]) {
    const boundary = long ? 0.4 : 0.35;
    assert.ok(
      Math.abs(
        sample(boundary - 1e-6, long).footSpread -
          sample(boundary + 1e-6, long).footSpread,
      ) < 1e-4,
    );
    for (let i = 0; i < 100; i++) {
      const f = sample(i / 100, long);
      for (const key of ["legExtension", "kneeOut", "hindFold", "footSpread"]) {
        assert.ok(f[key] >= 0 && f[key] <= 1, key);
      }
    }
  }
});

test("long swim uses 25/15/40/20 timing with continuous cycle boundaries", () => {
  const counts = { gather: 0, push: 0, glide: 0, recover: 0 };
  for (let i = 0; i < 1000; i++) counts[sample((i + 0.5) / 1000).swimStage]++;
  assert.deepEqual(counts, {
    gather: 250,
    push: 150,
    glide: 400,
    recover: 200,
  });
  for (const long of [true, false]) {
    for (const boundary of long ? [0, 0.25, 0.4, 0.8] : [0, 0.12, 0.35, 0.55]) {
      const before = sample((boundary - 1e-6 + 1) % 1, long);
      const after = sample(boundary + 1e-6, long);
      for (const key of [
        "legExtension",
        "hipExtension",
        "shinExtension",
        "hindFold",
        "kneeOut",
        "tarsusFlex",
        "footSpread",
        "armSweep",
        "foreHandOpen",
        "foreWristFlex",
        "foreReach",
      ]) {
        assert.ok(
          Math.abs(before[key] - after[key]) < 1e-4,
          `${key} at ${boundary}`,
        );
      }
    }
  }
});

test("joint endpoints stay attached at four rotations and across the stroke", () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    for (const phase of [0, 0.08, 0.3, 0.82]) {
      const calls = render(sample(phase), angle);
      for (const name of ["foot", "tarsus"])
        assert.equal(calls.filter((c) => c[1] === name).length, 2);
      for (let side = 0; side < 2; side++) {
        const thigh = calls.filter((c) => c[1] === "thigh")[side];
        const shin = calls.filter((c) => c[1] === "shin")[side];
        const tarsus = calls.filter((c) => c[1] === "tarsus")[side];
        const foot = calls.filter((c) => c[1] === "foot")[side];
        assert.ok(
          Math.hypot(
            shin[2] - thigh[2] - Math.cos(thigh[4]) * 10.5 * thigh[5],
            shin[3] - thigh[3] - Math.sin(thigh[4]) * 10.5 * thigh[5],
          ) < 1e-8,
        );
        assert.ok(
          Math.hypot(
            tarsus[2] - shin[2] - Math.cos(shin[4]) * 5.5 * shin[5],
            tarsus[3] - shin[3] - Math.sin(shin[4]) * 5.5 * shin[5],
          ) < 1e-8,
        );
        assert.ok(
          Math.hypot(
            foot[2] - tarsus[2] - Math.cos(tarsus[4]) * 1.4 * tarsus[5],
            foot[3] - tarsus[3] - Math.sin(tarsus[4]) * 1.4 * tarsus[5],
          ) < 1e-8,
        );
        assert.ok(Math.abs(5.5 * shin[5] - 10.5 * thigh[5]) < 0.2);
        assert.ok(Math.abs(1.4 * tarsus[5] - 2.8) < 1e-8);
      }
    }
  }
});

test("tarsus adds an ankle joint while keeping calf and foot independently sized", () => {
  for (const long of [true, false])
    for (const phase of [0.08, 0.31, 0.6, 0.9])
      for (const angle of [0, Math.PI / 2, Math.PI]) {
        const calls = render(sample(phase, long), angle);
        const shin = calls.filter((c) => c[1] === "shin");
        const tarsus = calls.filter((c) => c[1] === "tarsus");
        const foot = calls.filter((c) => c[1] === "foot");
        for (let side = 0; side < 2; side++) {
          assert.ok(Math.abs(shin[side][5] * 5.5 - 10.5 * 0.8) < 0.2);
          assert.ok(
            Math.hypot(
              tarsus[side][2] -
                shin[side][2] -
                Math.cos(shin[side][4]) * 5.5 * shin[side][5],
              tarsus[side][3] -
                shin[side][3] -
                Math.sin(shin[side][4]) * 5.5 * shin[side][5],
            ) < 1e-8,
          );
          assert.ok(
            Math.hypot(
              foot[side][2] -
                tarsus[side][2] -
                Math.cos(tarsus[side][4]) * 1.4 * tarsus[side][5],
              foot[side][3] -
                tarsus[side][3] -
                Math.sin(tarsus[side][4]) * 1.4 * tarsus[side][5],
            ) < 1e-8,
          );
          assert.ok(
            foot[side][5] < 0.9,
            "foot remains independent of calf scale",
          );
          assert.ok(
            Math.abs(Math.abs(tarsus[side][6]) - 1.16) < 1e-8,
            "ankle transition gains width without changing tarsus length",
          );
        }
      }
});

test("glide keeps fixed segment lengths and tracks the calf inward", () => {
  for (const long of [true, false]) {
    const end = render(sample(long ? 0.799 : 0.549, long), 0);
    const shins = end.filter((c) => c[1] === "shin");
    const body = part(end, "body");
    for (const shin of shins)
      assert.ok(
        Math.sin(shin[4]) * (shin[3] - body[3]) < 0,
        "each calf points toward the midline",
      );
    const foot = part(end, "foot");
    const tarsus = part(end, "tarsus");
    const pushFoot = part(
      render(sample(long ? 0.325 : 0.235, long), 0),
      "foot",
    );
    const lateral =
      -(foot[2] - body[2]) * Math.sin(body[4]) +
      (foot[3] - body[3]) * Math.cos(body[4]);
    assert.ok(
      lateral > 3 && lateral < 9,
      "retain some natural splay, not forced parallel adduction",
    );
    assert.ok(Math.abs(part(end, "shin")[5] * 5.5 - 10.5 * 0.8) < 0.2);
    assert.ok(foot[5] > pushFoot[5], "closed-glide toes retain length");
    assert.ok(
      foot[6] < 0.9,
      "glide web stays partly tucked while toes remain legible",
    );
    assert.ok(
      foot[6] >= 0.6 && foot[6] < 0.75,
      "glide tucks the web while preserving the foot's palm width",
    );
    assert.ok(
      Math.abs(foot[4] - tarsus[4]) < 0.01,
      "glide webbed foot stays aligned with the tarsus",
    );
    const openFoot = part(render(sample(long ? 0.1 : 0.04, long), 0), "foot");
    assert.ok(
      openFoot[6] > foot[6] + 0.25,
      "near-body gathered foot opens the web without changing its sprite",
    );
  }
});

test("rear web holds pressure area during drive and closes into glide", () => {
  const rows = [];
  for (const long of [false, true])
    for (let i = 0; i < 240; i++) {
      const calls = render(sample(i / 240, long), 0);
      const foot = part(calls, "foot"),
        hip = part(calls, "thigh");
      rows.push([
        Math.hypot(foot[2] - hip[2], foot[3] - hip[3]),
        Math.abs(foot[6]),
      ]);
    }
  rows.sort((a, b) => a[0] - b[0]);
  assert.ok(rows[0][1] > 0.95);
  for (const [long, flee, gather, push] of [
    [true, false, 0.25, 0.4],
    [false, false, 0.12, 0.35],
    [false, true, 0.08, 0.28],
  ]) {
    for (const u of [0.25, 0.5, 0.75]) {
      const calls = render(sample(gather + (push - gather) * u, long, flee), 0);
      assert.ok(Math.abs(part(calls, "foot")[6]) > 0.95);
    }
    for (const boundary of [gather, push, push + (push - gather) * 0.2]) {
      const width = (ph) =>
        Math.abs(part(render(sample(ph, long, flee), 0), "foot")[6]);
      assert.ok(
        Math.abs(width(boundary - 1e-6) - width(boundary + 1e-6)) < 0.0001,
      );
    }
  }
  for (const long of [false, true]) {
    const calls = render(sample(long ? 0.8 : 0.55, long), 0);
    assert.ok(
      Math.abs(part(calls, "foot")[4] - part(calls, "shin")[4]) < 0.015,
    );
  }
});

test("extended hindlimb retains natural knee splay", () => {
  for (const phase of [0.5, 0.6, 0.7]) {
    const calls = render(sample(phase), 0);
    const thighs = calls.filter((c) => c[1] === "thigh");
    const calves = calls.filter((c) => c[1] === "shin");
    const body = part(calls, "body");
    for (let side = 0; side < 2; side++) {
      assert.ok(
        Math.abs(calves[side][3] - body[3]) >
          Math.abs(thighs[side][3] - body[3]),
      );
      assert.ok(
        Math.abs(Math.sin(thighs[side][4])) > 0.12,
        "extended thigh is not forced parallel to the axis",
      );
    }
  }
});

test("continuous joint curves are C1 at cycle seams and phase labels", () => {
  for (const long of [true, false]) {
    const gather = long ? 0.25 : 0.12;
    const push = long ? 0.4 : 0.35;
    const coast = long ? 0.8 : 0.55;
    const middle = sample((coast + 1) / 2, long);
    assert.ok(middle.legExtension < (long ? 0.4 : 0.28));
    const boundaries = new Set([0, gather, push, coast]);
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      boundaries.add(
        u <= 0.25
          ? (u / 0.25) * gather
          : u <= 0.4
            ? gather + ((u - 0.25) / 0.15) * (push - gather)
            : u <= 0.8
              ? push + ((u - 0.4) / 0.4) * (coast - push)
              : coast + ((u - 0.8) / 0.2) * (1 - coast),
      );
    }
    for (const boundary of boundaries) {
      const h = 1e-5;
      const channels = [-2, -1, 1, 2].map((i) =>
        sample((boundary + i * h + 1) % 1, long),
      );
      for (const key of [
        "hipExtension",
        "shinExtension",
        "tarsusFlex",
        "footSpread",
        "legStreamline",
        "armSweep",
        "foreHandOpen",
        "foreWristFlex",
        "foreReach",
      ]) {
        const left = (channels[1][key] - channels[0][key]) / h;
        const right = (channels[3][key] - channels[2][key]) / h;
        assert.ok(
          Math.abs(left - right) < 0.04,
          `${key} curve velocity at ${boundary}: ${left}/${right}`,
        );
      }
      const calls = [-2, -1, 0, 1, 2].map((i) => {
        const f = sample((boundary + i * h + 1) % 1, long);
        // Isolate local joint continuity from speed-dependent whole-body sway.
        f.swimV = 20;
        f.stroke = 0;
        return render(f, 0);
      });
      for (const name of ["shin", "foot", "thigh", "arm"]) {
        const parts = calls.map((list) => list.find((c) => c[1] === name));
        for (const key of [2, 3, 4]) {
          const v0 = (parts[1][key] - parts[0][key]) / h;
          const v1 = (parts[4][key] - parts[3][key]) / h;
          assert.ok(
            Math.abs(v1 - v0) < 0.15,
            `${name} velocity at ${boundary}: ${v0} / ${v1}`,
          );
        }
      }
    }
  }
});
