import apis from "@deskulpt-test/apis";
import { useEffect, useRef, useState } from "@deskulpt-test/react";
import { Flex } from "@deskulpt-test/ui";

const FALLBACK = "灯花爆了一下。";
const LEAVE_MS = 700;
const WIND_MS = 1100;

const FONTS = {
  sans: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
  kai: '"KaiTi","STKaiti","Kaiti SC","楷体",serif',
  song: '"SimSun","Songti SC","STSong","PMingLiU",serif',
};

const COLORS = {
  cream: "251, 249, 236",
  moon: "232, 240, 236",
  ink: "36, 42, 38",
  gold: "232, 214, 170",
};

function readGroups(text) {
  const groups = [];
  let sentences = null;
  let parts = [];
  const flush = () => {
    const sentence = parts.join("\n");
    parts = [];
    if (sentence && sentences) sentences.push(sentence);
  };
  const startGroup = () => {
    flush();
    sentences = [];
    groups.push(sentences);
  };
  for (const raw of String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (parts.length > 0) flush();
      continue;
    }
    if (line.startsWith("#")) {
      startGroup();
      continue;
    }
    if (!sentences) startGroup();
    parts.push(line);
  }
  flush();
  const ready = groups.filter((group) => group.length > 0);
  return ready.length > 0 ? ready : [[FALLBACK]];
}

function textAt(groups, cursor) {
  const group = groups[cursor.group] ?? groups[0];
  return group?.[cursor.line] ?? group?.[0] ?? FALLBACK;
}

function holdSeconds(groups, cursor, lineSec, groupSec) {
  const group = groups[cursor.group] ?? [];
  return cursor.line >= group.length - 1 ? groupSec : lineSec;
}

function pickGroup(groups, current) {
  if (groups.length <= 1) return 0;
  let next = current;
  let guard = 0;
  while (next === current && guard < 8) {
    next = Math.floor(Math.random() * groups.length);
    guard += 1;
  }
  return next;
}

function nextCursor(groups, cursor) {
  const group = groups[cursor.group] ?? [];
  if (cursor.line + 1 < group.length) {
    return { group: cursor.group, line: cursor.line + 1 };
  }
  return { group: pickGroup(groups, cursor.group), line: 0 };
}

function everySeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60;
  return Math.min(600, Math.max(10, number));
}

function lineSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 8;
  return Math.min(120, Math.max(2, number));
}

function motionOf(value) {
  if (
    value === "still" ||
    value === "rise" ||
    value === "bloom" ||
    value === "wind"
  ) {
    return value;
  }
  return "fade";
}

function leaveMs(motion) {
  return motion === "wind" ? WIND_MS + 520 : LEAVE_MS;
}

function pickWind(width, height) {
  const angle = Math.random() * Math.PI * 2;
  const w = Math.max(Number(width) || 240, 120);
  const h = Math.max(Number(height) || 180, 120);
  const reach = Math.max(w, h) * 0.95;
  return {
    x: Math.cos(angle) * reach,
    y: Math.sin(angle) * reach,
    px: -Math.sin(angle),
    py: Math.cos(angle),
    turn: Math.cos(angle) >= 0 ? 1 : -1,
  };
}

function gust(index, count, wind) {
  const t = count <= 1 ? 0.5 : index / (count - 1);
  const side = (t - 0.5) * 2;
  const wobble = ((index * 17) % 11) / 10 - 0.5;
  const reach = Math.hypot(wind.x, wind.y) || 180;
  const travel = 0.4 + Math.abs(side) * 1.35;
  const fan = (side * 2.8 + wobble * 1.4) * reach;
  return {
    x: Math.round(wind.x * travel + wind.px * fan),
    y: Math.round(wind.y * travel + wind.py * fan),
    turn: wind.turn * (index % 2 === 0 ? 1 : -1) * (180 + Math.abs(side) * 220),
  };
}

function fontFamily(name) {
  if (FONTS[name]) return FONTS[name];
  if (typeof name === "string" && name) {
    const safe = name.replaceAll(/["\\]/g, "");
    return `"${safe}", ${FONTS.sans}`;
  }
  return FONTS.kai;
}

function colorOf(name) {
  return COLORS[name] ? name : "ink";
}

function verticalOf(value) {
  return value === "vertical";
}

function alignOf(value) {
  if (value === "left" || value === "right") return value;
  return "center";
}

function shift(motion, phase) {
  if (motion === "wind" || phase === "on" || motion === "still") {
    return { opacity: 1, transform: "none" };
  }
  if (motion === "rise") {
    return {
      opacity: 0,
      transform: phase === "out" ? "translateY(-12px)" : "translateY(12px)",
    };
  }
  if (motion === "bloom") {
    return {
      opacity: 0,
      transform: phase === "out" ? "scale(1.08)" : "scale(0.92)",
    };
  }
  return { opacity: 0, transform: "none" };
}

function look(config, phase) {
  const motion = motionOf(config?.motion);
  const size = Number(config?.size);
  const color = colorOf(config?.color);
  const placed = shift(motion, phase);
  const vertical = verticalOf(config?.flow);
  const align = alignOf(config?.align);
  return {
    margin: 0,
    width: vertical ? "auto" : "100%",
    maxWidth: "100%",
    maxHeight: vertical ? "100%" : "none",
    height: vertical ? "100%" : "auto",
    padding: vertical ? "28px 0" : "0 28px",
    writingMode: vertical ? "vertical-rl" : "horizontal-tb",
    whiteSpace: "pre-line",
    textAlign: vertical ? "center" : align,
    color: `rgb(${COLORS[color]})`,
    fontFamily: fontFamily(config?.font),
    fontSize: Number.isFinite(size) ? Math.min(72, Math.max(18, size)) : 32,
    lineHeight: 1.6,
    letterSpacing: config?.font === "song" ? "0.06em" : "0.12em",
    textShadow:
      color === "ink"
        ? "0 1px 8px rgba(251, 249, 236, 0.45)"
        : "0 1px 10px rgba(16, 28, 24, 0.45)",
    pointerEvents: "none",
    opacity: placed.opacity,
    transform: placed.transform,
    transition:
      motion === "still" || motion === "wind"
        ? "none"
        : `opacity ${LEAVE_MS}ms ease, transform ${LEAVE_MS}ms ease`,
  };
}

function WindLine({ text, vertical, progress, wind }) {
  const lines = String(text).split("\n");
  const count = Array.from(text.replaceAll("\n", "")).length;
  const gone = progress;
  const fade = progress < 0.72 ? 1 : Math.max(0, 1 - (progress - 0.72) / 0.28);
  let index = 0;
  return lines.map((line, lineIndex) => (
    <span
      key={lineIndex}
      style={{
        display: vertical ? "inline-flex" : "block",
        flexDirection: vertical ? "column" : undefined,
        alignItems: "center",
      }}
    >
      {Array.from(line).map((glyph) => {
        const fly = gust(index, count, wind);
        const glyphIndex = index;
        index += 1;
        return (
          <span
            key={`${glyph}-${glyphIndex}`}
            style={{
              display: "inline-block",
              position: "relative",
              left: Math.round(fly.x * gone),
              top: Math.round(fly.y * gone),
              opacity: fade,
              lineHeight: 1.15,
              transformOrigin: "center",
              transform: `rotate(${fly.turn * gone}deg) scale(${1 - gone * 0.45})`,
            }}
          >
            {glyph}
          </span>
        );
      })}
    </span>
  ));
}

export default function Denghua({ config, width, height }) {
  const groupsRef = useRef([[FALLBACK]]);
  const cursorRef = useRef({ group: 0, line: 0 });
  const [groups, setGroups] = useState([]);
  const [current, setCurrent] = useState("");
  const [shown, setShown] = useState("");
  const [phase, setPhase] = useState("in");
  const [scatter, setScatter] = useState(0);
  const [wind, setWind] = useState({ x: 0, y: 0, turn: 0 });
  const motion = motionOf(config?.motion);
  const vertical = verticalOf(config?.flow);
  const align = alignOf(config?.align);
  const motionRef = useRef(motion);
  const frameRef = useRef(0);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };
  const armRef = useRef(() => {});
  motionRef.current = motion;

  const showNext = (text, arm) => {
    if (motionRef.current !== "wind") {
      setCurrent(text);
      arm();
      return;
    }
    if (frameRef.current) return;
    setWind(pickWind(sizeRef.current.width, sizeRef.current.height));
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / (WIND_MS + 400));
      setScatter(progress);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      frameRef.current = 0;
      setShown(text);
      setCurrent(text);
      setScatter(0);
      arm();
    };
    frameRef.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancel = false;
    apis.fs
      .readFile({ path: "lines.txt" })
      .then((text) => {
        if (cancel) return;
        const ready = readGroups(text);
        groupsRef.current = ready;
        cursorRef.current = { group: pickGroup(ready, -1), line: 0 };
        setGroups(ready);
        setCurrent(textAt(ready, cursorRef.current));
      })
      .catch(() => {
        if (cancel) return;
        const ready = [[FALLBACK]];
        groupsRef.current = ready;
        cursorRef.current = { group: pickGroup(ready, -1), line: 0 };
        setGroups(ready);
        setCurrent(FALLBACK);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (groups.length === 0) return;
    let timer = 0;
    let dead = false;
    const delayMs = () =>
      holdSeconds(
        groupsRef.current,
        cursorRef.current,
        lineSeconds(config?.lineEvery),
        everySeconds(config?.every),
      ) * 1000;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (dead) return;
        cursorRef.current = nextCursor(groupsRef.current, cursorRef.current);
        showNext(textAt(groupsRef.current, cursorRef.current), arm);
      }, delayMs());
    };
    armRef.current = arm;
    arm();
    return () => {
      dead = true;
      clearTimeout(timer);
      armRef.current = () => {};
    };
  }, [groups, config?.every, config?.lineEvery]);

  useEffect(() => {
    if (!current || current === shown) return;
    if (motion === "wind" || motion === "still" || shown === "") {
      setShown(current);
      setPhase("on");
      return;
    }
    setPhase("out");
    const timer = setTimeout(() => {
      setShown(current);
      setPhase("in");
    }, leaveMs(motion));
    return () => clearTimeout(timer);
  }, [current, shown, motion]);

  useEffect(() => {
    if (phase !== "in") return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase("on"));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase, shown]);

  return (
    <Flex
      align="center"
      justify={
        align === "left" ? "start" : align === "right" ? "end" : "center"
      }
      width="100%"
      height="100%"
      style={{ overflow: "visible" }}
    >
      {motion === "wind" ? (
        <div
          style={{
            ...look(config, phase),
            writingMode: "horizontal-tb",
            height: "auto",
            display: vertical ? "flex" : "block",
            flexDirection: vertical ? "row-reverse" : undefined,
            justifyContent: "center",
            alignItems: "center",
            gap: vertical ? "0.35em" : undefined,
            opacity: 1,
            transform: "none",
            transition: "none",
          }}
        >
          <WindLine
            text={shown}
            vertical={vertical}
            progress={scatter}
            wind={wind}
          />
        </div>
      ) : (
        <p style={look(config, phase)}>{shown}</p>
      )}
    </Flex>
  );
}
