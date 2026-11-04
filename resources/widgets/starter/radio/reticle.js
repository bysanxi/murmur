// The scope for finding and picking stations: a fixed dial at the centre
// of the globe — tick marks, an open ring with a signal pip in the gap,
// and a two-line lock label — under which the earth slides as you tune.
// While the globe turns, the label tracks whatever station sits under the
// sight and the arc fills toward a lock, the way roamdial's crosshair does.

const SIZE = 80;
const HALF = SIZE / 2;
const TICK_R = 27;
const TICK_SHORT = 3;
const TICK_LONG = 6;
const TICKS = 48;
const RING_R = 21;
// Gap sits at the NE; the open arc runs the long way around it.
const GAP_A0 = (-45 + 30) * (Math.PI / 180);
const GAP_A1 = (-45 - 30) * (Math.PI / 180);
const PIP_R = RING_R + 1.5;
const PIP_A = -Math.PI / 4;
const LABEL_LEFT = 46;

const INK = "rgba(245,241,232,.88)";
const SIGNAL = "#f36b45";
const SANS =
  'Inter,"PingFang SC","Noto Sans SC","Noto Sans CJK SC",system-ui,sans-serif';

function node(tag, css) {
  const el = document.createElement(tag);
  if (css) el.style.cssText = css;
  return el;
}

function polar(r, a) {
  return [r * Math.cos(a), r * Math.sin(a)];
}

function arcPath(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function buildDial() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(SIZE));
  svg.setAttribute("height", String(SIZE));
  svg.setAttribute("viewBox", `${-HALF} ${-HALF} ${SIZE} ${SIZE}`);
  svg.style.cssText =
    "position:absolute;top:-40px;left:-40px;overflow:visible;";

  const ticks = document.createElementNS(ns, "g");
  for (let i = 0; i < TICKS; i++) {
    const long = i % 6 === 0;
    const a = (i / TICKS) * Math.PI * 2;
    const [x0, y0] = polar(TICK_R, a);
    const [x1, y1] = polar(TICK_R + (long ? TICK_LONG : TICK_SHORT), a);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", x0.toFixed(3));
    line.setAttribute("y1", y0.toFixed(3));
    line.setAttribute("x2", x1.toFixed(3));
    line.setAttribute("y2", y1.toFixed(3));
    line.setAttribute(
      "stroke",
      long ? "rgba(245,241,232,.55)" : "rgba(245,241,232,.32)",
    );
    line.setAttribute("stroke-width", long ? "1.2" : "0.8");
    line.setAttribute("stroke-linecap", "round");
    ticks.append(line);
  }
  svg.append(ticks);

  const d = arcPath(RING_R, GAP_A0, GAP_A1);

  const ring = document.createElementNS(ns, "path");
  ring.setAttribute("d", d);
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", INK);
  ring.setAttribute("stroke-width", "1.3");
  ring.setAttribute("stroke-linecap", "round");
  ring.style.opacity = "0.4";
  svg.append(ring);

  const arc = document.createElementNS(ns, "path");
  arc.setAttribute("d", d);
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", INK);
  arc.setAttribute("stroke-width", "1.6");
  arc.setAttribute("stroke-linecap", "round");
  arc.setAttribute("pathLength", "100");
  arc.style.strokeDasharray = "100";
  arc.style.strokeDashoffset = "100";
  arc.style.transition = "stroke-dashoffset .2s linear";
  svg.append(arc);

  const [px, py] = polar(PIP_R, PIP_A);
  const pip = document.createElementNS(ns, "circle");
  pip.setAttribute("cx", px.toFixed(2));
  pip.setAttribute("cy", py.toFixed(2));
  pip.setAttribute("r", "3.4");
  pip.setAttribute("fill", "none");
  pip.setAttribute("stroke", INK);
  pip.setAttribute("stroke-width", "1.2");
  pip.style.opacity = "0.6";
  pip.style.transition = "fill .25s, stroke .25s, opacity .25s";
  svg.append(pip);

  return { svg, arc, pip };
}

export function createReticle(host) {
  let hostW = host.clientWidth;
  let hostH = host.clientHeight;

  const scope = node(
    "div",
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2;",
  );
  const { svg, arc, pip } = buildDial();

  const lockbox = node(
    "div",
    `position:absolute;top:-10px;left:${LABEL_LEFT}px;white-space:nowrap;` +
      "text-shadow:0 0 6px rgba(8,14,28,.95),0 0 12px rgba(8,14,28,.85);",
  );
  const name = node(
    "div",
    `font:400 10.5px/16px ${SANS};letter-spacing:.12em;` +
      "font-variant-numeric:tabular-nums;color:rgba(245,241,232,.85);",
  );
  const meta = node(
    "div",
    `font:400 10.5px/16px ${SANS};letter-spacing:.04em;` +
      "font-variant-numeric:tabular-nums;color:rgba(245,241,232,.42);margin-top:2px;",
  );
  lockbox.append(name, meta);
  scope.append(svg, lockbox);
  const floats = node(
    "div",
    "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;",
  );
  host.append(scope, floats);

  let labelW = 0;
  let flip = false;
  let lastKey = "";
  let progress = 0;
  let floatIds = "";
  let floatNodes = [];

  function place() {
    scope.style.transform = `translate(${hostW / 2}px,${hostH / 2}px)`;
    flip = hostW / 2 + LABEL_LEFT + labelW + 8 > hostW;
    if (flip) {
      lockbox.style.left = "";
      lockbox.style.right = `${LABEL_LEFT}px`;
      lockbox.style.textAlign = "right";
    } else {
      lockbox.style.left = `${LABEL_LEFT}px`;
      lockbox.style.right = "";
      lockbox.style.textAlign = "left";
    }
  }

  const observer = new ResizeObserver(() => {
    hostW = host.clientWidth;
    hostH = host.clientHeight;
    place();
  });
  observer.observe(host);
  place();

  function setMeta(raw) {
    const text = raw ?? "";
    meta.textContent = text;
    meta.style.display = text ? "" : "none";
  }

  function setPip(on) {
    if (on) {
      pip.setAttribute("fill", SIGNAL);
      pip.setAttribute("stroke", SIGNAL);
      pip.style.opacity = "1";
    } else {
      pip.setAttribute("fill", "none");
      pip.setAttribute("stroke", INK);
      pip.style.opacity = "0.6";
    }
  }

  function setProgress(value) {
    progress = Math.max(0, Math.min(1, value));
    arc.style.strokeDashoffset = String(100 * (1 - progress));
  }

  function makeFloat() {
    const root = node(
      "div",
      "position:absolute;max-width:160px;white-space:nowrap;" +
        "overflow:hidden;text-overflow:ellipsis;" +
        `font:400 11px/1.3 ${SANS};` +
        "color:rgba(214,220,214,.72);" +
        "text-shadow:0 0 6px rgba(8,14,28,.95),0 0 10px rgba(8,14,28,.8);",
    );
    const hair = node(
      "span",
      "position:absolute;top:50%;height:1px;width:10px;" +
        "background:rgba(214,220,214,.28);pointer-events:none;",
    );
    const text = node("span", "position:relative;");
    root.append(hair, text);
    return {
      root,
      text,
      hair,
      place(mark, width) {
        const right = mark.x >= width / 2;
        root.style.left = `${mark.x}px`;
        root.style.top = `${mark.y}px`;
        root.style.transform = right
          ? "translate(12px, -50%)"
          : "translate(calc(-100% - 12px), -50%)";
        hair.style.left = right ? "-10px" : "";
        hair.style.right = right ? "" : "-10px";
        text.textContent = mark.name;
      },
    };
  }

  function setFloats(marks) {
    const ids = marks.map((m) => m.uuid).join("|");
    if (ids !== floatIds) {
      floatIds = ids;
      floats.replaceChildren();
      floatNodes = marks.map(() => makeFloat());
      for (const item of floatNodes) floats.append(item.root);
    }
    for (let i = 0; i < marks.length; i += 1) {
      floatNodes[i]?.place(marks[i], hostW);
    }
    if (marks.length === 0 && floatNodes.length > 0) {
      floats.replaceChildren();
      floatNodes = [];
      floatIds = "";
    }
  }

  function pulse() {
    arc.style.transition = "none";
    setProgress(0);
    void arc.getBoundingClientRect();
    arc.style.transition = "stroke-dashoffset .48s cubic-bezier(.16,1,.3,1)";
    setProgress(1);
    lockbox.animate(
      [
        {
          opacity: 0,
          transform: flip ? "translateX(10px)" : "translateX(-10px)",
        },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 400, delay: 80, easing: "ease-out", fill: "backwards" },
    );
  }

  return {
    /// Snap the arc shut and flash the label (new station on air).
    lock() {
      setPip(true);
      pulse();
    },
    /// Drive the dial from the globe each frame: title/meta change with
    /// whatever sits under the sight, progress fills the arc, and `hot`
    /// lights the pip the way roamdial does when a station is close.
    aim({
      title = "",
      meta: metaText = "",
      progress: next = 0,
      hot = false,
    } = {}) {
      const key = `${title}|${metaText}|${hot ? 1 : 0}`;
      if (key !== lastKey) {
        lastKey = key;
        name.textContent = title;
        name.style.opacity = title ? "1" : "0";
        setMeta(metaText);
        labelW = lockbox.offsetWidth;
        place();
      }
      setPip(hot);
      // Drop the CSS transition while tracking so the arc follows the hand.
      arc.style.transition = "stroke-dashoffset .05s linear";
      setProgress(next);
    },
    /// Caption a few fanned stations around the sight.
    floats(marks = []) {
      setFloats(Array.isArray(marks) ? marks : []);
    },
    destroy() {
      observer.disconnect();
      floats.remove();
      scope.remove();
    },
  };
}
