import type { CSSProperties } from "react";
import { useGuidesStore } from "../hooks/useGuidesStore";
import { useSettingsStore } from "../hooks/useSettingsStore";

const guideStyle = (guide: {
  orientation: "v" | "h";
  position: number;
  start: number;
  end: number;
}): CSSProperties =>
  guide.orientation === "v"
    ? {
        position: "absolute",
        left: guide.position,
        top: guide.start,
        width: 1,
        height: guide.end - guide.start,
      }
    : {
        position: "absolute",
        top: guide.position,
        left: guide.start,
        width: guide.end - guide.start,
        height: 1,
      };

const GuidesOverlay = () => {
  const guides = useGuidesStore((state) => state.guides);
  const showGuides = useSettingsStore((state) => state.showGuides ?? true);

  if (!showGuides || guides.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10000,
      }}
    >
      {guides.map((guide) => (
        <div
          key={guide.id}
          style={{
            ...guideStyle(guide),
            background: "var(--accent-8)",
          }}
        />
      ))}
    </div>
  );
};

export default GuidesOverlay;
