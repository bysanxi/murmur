import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "@deskulpt-test/react";
import "./vendor/core.js";
import "./vendor/art.js";
import "./vendor/gl.js";
import "./vendor/scene.js";
import "./vendor/pond-data.js";
import { mountPond } from "./viewer.js";
import { atmosphereOf, lineOf, subscribeLanguage } from "./lines.js";

export default function Pond() {
  const host = useRef(null);
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
    const pond = mountPond(host.current);
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
      pond.destroy();
    };
  }, []);

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
      <p
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: "9%",
          margin: 0,
          textAlign: "center",
          color: "rgba(251, 249, 236, 0.9)",
          fontSize: 18,
          lineHeight: 1.6,
          letterSpacing: "0.08em",
          textShadow: "0 1px 10px rgba(16, 28, 24, 0.55)",
          pointerEvents: "none",
          opacity: line === shown ? 1 : 0,
          transition: "opacity 700ms ease",
        }}
      >
        {shown}
      </p>
    </div>
  );
}
