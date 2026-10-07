import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "@deskulpt-test/react";
import "./vendor/core.js";
import "./vendor/art.js";
import "./vendor/art-real.js";
import "./vendor/bed-real.js";
import "./vendor/look-real.js";
import "./vendor/art-xieyi.js";
import "./vendor/bed-xieyi.js";
import "./vendor/look-xieyi.js";
import "./vendor/pond-data.js";
import "./vendor/pond-data-xieyi.js";
import "./vendor/styles.js";
import "./vendor/gl.js";
import "./vendor/scene.js";
import "./vendor/audio.js";
import { mountPond } from "./viewer.js";
import { atmosphereOf, lineOf, subscribeLanguage } from "./lines.js";

const LINE_FONTS = {
  sans: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
  kai: '"KaiTi","STKaiti","Kaiti SC","楷体",serif',
  song: '"SimSun","Songti SC","STSong","PMingLiU",serif',
};

const LINE_COLORS = {
  cream: "251, 249, 236",
  moon: "232, 240, 236",
  ink: "36, 42, 38",
  gold: "232, 214, 170",
};

function lineFamily(name) {
  if (LINE_FONTS[name]) return LINE_FONTS[name];
  if (typeof name === "string" && name) {
    const safe = name.replaceAll(/["\\]/g, "");
    return `"${safe}", ${LINE_FONTS.sans}`;
  }
  return LINE_FONTS.sans;
}

function lineLook(config, visible) {
  const font = LINE_FONTS[config?.lineFont] ? config.lineFont : "custom";
  const size = Number(config?.lineSize);
  const alpha = Number(config?.lineAlpha);
  const color = LINE_COLORS[config?.lineColor] ? config.lineColor : "cream";
  const place =
    config?.linePlace === "mid" || config?.linePlace === "high"
      ? config.linePlace
      : "low";
  return {
    position: "absolute",
    left: 48,
    right: 48,
    margin: 0,
    textAlign: "center",
    top: place === "high" ? "12%" : place === "mid" ? "46%" : "auto",
    bottom: place === "low" ? "9%" : "auto",
    color: `rgba(${LINE_COLORS[color]}, ${Number.isFinite(alpha) ? Math.min(1, Math.max(0.35, alpha)) : 0.9})`,
    fontFamily: lineFamily(config?.lineFont),
    fontSize: Number.isFinite(size) ? Math.min(36, Math.max(14, size)) : 18,
    lineHeight: 1.6,
    letterSpacing:
      font === "kai" ? "0.12em" : font === "song" ? "0.06em" : "0.08em",
    textShadow:
      color === "ink"
        ? "0 1px 8px rgba(251, 249, 236, 0.45)"
        : "0 1px 10px rgba(16, 28, 24, 0.55)",
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transition: "opacity 700ms ease",
  };
}

export default function Pond({ config }) {
  const host = useRef(null);
  const pondRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [line, setLine] = useState(() => lineOf(new Date()));
  const [shown, setShown] = useState(line);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const fit = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useLayoutEffect(() => {
    const pond = mountPond(host.current, configRef.current);
    pondRef.current = pond;
    const tick = () => {
      const now = new Date();
      pond.setAtmosphere(atmosphereOf(now));
      setLine(lineOf(now));
    };
    tick();
    const timer = setInterval(tick, 60_000);
    const unsubscribe = subscribeLanguage(() => setLine(lineOf(new Date())));
    return () => {
      clearInterval(timer);
      unsubscribe();
      pondRef.current = null;
      pond.destroy();
    };
  }, []);

  useEffect(() => {
    const pond = pondRef.current;
    if (!pond) return;
    pond.setConfig(config);
    if (config?.followTime !== false)
      pond.setAtmosphere(atmosphereOf(new Date()));
  }, [config]);

  useEffect(() => {
    if (line === shown) return;
    const timer = setTimeout(() => setShown(line), 420);
    return () => clearTimeout(timer);
  }, [line, shown]);

  return (
    <div
      style={{
        width: viewport.width,
        height: viewport.height,
        position: "relative",
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <div
        ref={host}
        style={{
          width: "100%",
          height: "100%",
          opacity: "var(--nfr-widget-bg-alpha, 1)",
        }}
      />
      <p style={lineLook(config, line === shown)}>{shown}</p>
    </div>
  );
}
