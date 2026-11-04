// The compact radio card: name, place and time, tag and codec, the ON AIR
// dot, and a hover play button. This is what the widget falls back to
// whenever the frame is too small for the globe face.

import { useState } from "@deskulpt-test/react";
import { Flex, Text } from "@deskulpt-test/ui";
import { ELLIPSIS } from "./format.js";

export function CompactView({
  id,
  mode,
  strings,
  station,
  statusLine,
  live,
  cityLine,
  detail,
  onSurfacePointerDown,
  onToggle,
}) {
  const [hover, setHover] = useState(false);
  const card = mode !== "text";

  return (
    <Flex
      id={id}
      direction="column"
      justify="center"
      gap="1"
      width="100%"
      height="100%"
      px={card ? "4" : "0"}
      onPointerDown={card ? onSurfacePointerDown : undefined}
      onPointerEnter={card ? () => setHover(true) : undefined}
      onPointerLeave={() => setHover(false)}
      style={{
        borderRadius: card ? 12 : 0,
        background: card ? "var(--color-panel-solid)" : "transparent",
        border: card ? "1px solid var(--gray-a5)" : "none",
        pointerEvents: card ? "auto" : "none",
        overflow: "hidden",
      }}
    >
      <Flex align="center" justify="between" gap="2">
        <Text size="3" weight="medium" style={ELLIPSIS}>
          {station?.name || statusLine}
        </Text>
        {hover && card ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={live ? strings.pause : strings.play}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: "50%",
              border: "1px solid var(--gray-a6)",
              background: "var(--color-panel-solid)",
              color: "var(--gray-12)",
              fontSize: 11,
              lineHeight: "22px",
              cursor: "pointer",
            }}
          >
            {live ? "⏸" : "▶"}
          </button>
        ) : (
          <Flex
            align="center"
            gap="1"
            style={{ flexShrink: 0, opacity: live ? 1 : 0.35 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: live ? "var(--amber-9)" : "var(--gray-8)",
                transition: "background 400ms ease",
              }}
            />
            <Text size="1" style={{ letterSpacing: "0.08em" }}>
              ON AIR
            </Text>
          </Flex>
        )}
      </Flex>
      {cityLine && (
        <Text size="1" color="gray" style={ELLIPSIS}>
          {cityLine}
        </Text>
      )}
      <Text size="1" color="gray" style={ELLIPSIS}>
        {detail || statusLine}
      </Text>
    </Flex>
  );
}
