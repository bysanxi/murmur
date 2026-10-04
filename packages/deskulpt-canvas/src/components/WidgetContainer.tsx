import { type CSSProperties, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Draggable, { DraggableData, DraggableEvent } from "react-draggable";
import {
  NumberSize,
  Resizable,
  ResizeCallback,
  ResizeDirection,
  ResizeStartCallback,
} from "re-resizable";
import { ErrorBoundary } from "react-error-boundary";
import ErrorDisplay from "./ErrorDisplay";
import { logger, stringify, useTranslation } from "@deskulpt/utils";
import { LuGripVertical } from "react-icons/lu";
import { Box, Text } from "@radix-ui/themes";
import { useWidgetsStore } from "../hooks";
import { css } from "@emotion/react";
import { DeskulptWidgets } from "@deskulpt/bindings";

const styles = {
  wrapper: css({
    "&:hover": {
      ".handle": { opacity: 1 },
      boxShadow:
        "0 0 20px var(--gray-a7), 0 0 40px var(--gray-a5), 0 0 60px var(--gray-a3), inset 0 0 20px var(--gray-a2)",
    },
  }),
  handle: css({
    cursor: "grab",
    opacity: 0,
    zIndex: 2,
    transition: "opacity 200ms ease-in-out",
  }),
  container: css({
    color: "var(--gray-12)",
    zIndex: 1,
  }),
};

interface WidgetGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WidgetContainerProps {
  id: string;
}

function computeResizedGeometry(
  geometry: WidgetGeometry,
  direction: ResizeDirection,
  delta: NumberSize,
): WidgetGeometry {
  const { x, y, width, height } = geometry;
  let newX = x;
  let newY = y;
  const newWidth = width + delta.width;
  const newHeight = height + delta.height;

  // If resizing from top and/or left edges, we need to adjust position
  // accordingly to make sure their opposite edges stay in place
  switch (direction) {
    case "top":
    case "topRight":
      newY = y - delta.height;
      break;
    case "left":
    case "bottomLeft":
      newX = x - delta.width;
      break;
    case "topLeft":
      newX = x - delta.width;
      newY = y - delta.height;
      break;
  }

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}

const WidgetContainer = ({ id }: WidgetContainerProps) => {
  const { t } = useTranslation();
  const draggableRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<WidgetGeometry>(null);

  // These non-null assertions are safe based on how App.tsx filters the IDs
  const Widget = useWidgetsStore((state) => state[id]!.component);
  const settings = useWidgetsStore((state) => state[id]!.settings!);

  // Local state to avoid jittery movement during dragging and resizing
  const [geometry, setGeometry] = useState({
    x: settings.x,
    y: settings.y,
    width: settings.width,
    height: settings.height,
  });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const fullscreenRef = useRef(settings.fullscreen);
  fullscreenRef.current = settings.fullscreen;

  useEffect(() => {
    setGeometry({
      x: settings.x,
      y: settings.y,
      width: settings.width,
      height: settings.height,
    });
  }, [settings]);

  useEffect(() => {
    if (!settings.fullscreen) return;
    const publish = () => {
      if (!fullscreenRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({ width, height });
      if (
        settings.x === 0 &&
        settings.y === 0 &&
        settings.width === width &&
        settings.height === height
      ) {
        return;
      }
      DeskulptWidgets.Commands.updateSettings(id, {
        fullscreenFrame: true,
        x: 0,
        y: 0,
        width,
        height,
      }).catch(logger.error);
    };
    publish();
    window.addEventListener("resize", publish);
    return () => window.removeEventListener("resize", publish);
  }, [
    id,
    settings.fullscreen,
    settings.x,
    settings.y,
    settings.width,
    settings.height,
  ]);

  const frame = settings.fullscreen
    ? { x: 0, y: 0, width: viewport.width, height: viewport.height }
    : geometry;

  const onDragStop = (_: DraggableEvent, data: DraggableData) => {
    setGeometry((prev) => prev && { ...prev, x: data.x, y: data.y });
    DeskulptWidgets.Commands.updateSettings(id, { x: data.x, y: data.y });
  };

  const onResizeStart: ResizeStartCallback = () => {
    resizeStartRef.current = { ...geometry };
  };

  const onResize: ResizeCallback = (_, direction, __, delta) => {
    if (resizeStartRef.current === null) {
      return;
    }
    const newGeometry = computeResizedGeometry(
      resizeStartRef.current,
      direction,
      delta,
    );

    // Force position and size changes to land in the same frame to avoid
    // visual glitches
    flushSync(() => {
      setGeometry(newGeometry);
    });
  };

  const onResizeStop: ResizeCallback = (_, direction, __, delta) => {
    if (resizeStartRef.current === null) {
      return;
    }

    // We recompute with delta instead of using local state because at time
    // this callback is triggered, we cannot guarantee that the local state
    // updates has all been flushed due to react's asynchronous state updates;
    // using delta also reduces the dependency array of this callback
    const newGeometry = computeResizedGeometry(
      resizeStartRef.current,
      direction,
      delta,
    );
    DeskulptWidgets.Commands.updateSettings(id, newGeometry);
  };

  if (!settings.isLoaded) {
    return null;
  }

  return (
    <Draggable
      nodeRef={draggableRef}
      disabled={settings.fullscreen}
      position={{ x: frame.x, y: frame.y }}
      onStop={onDragStop}
      bounds="body"
      handle=".handle"
    >
      <Box
        ref={draggableRef}
        overflow="hidden"
        position="absolute"
        css={styles.wrapper}
        style={{ zIndex: settings.zIndex }}
      >
        <Box
          className="handle"
          position="absolute"
          top="1"
          right="1"
          css={styles.handle}
          asChild
        >
          <LuGripVertical size={20} />
        </Box>
        <Resizable
          size={{ width: frame.width, height: frame.height }}
          enable={
            settings.fullscreen
              ? {
                  top: false,
                  right: false,
                  bottom: false,
                  left: false,
                  topRight: false,
                  bottomRight: false,
                  bottomLeft: false,
                  topLeft: false,
                }
              : undefined
          }
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeStop={onResizeStop}
          css={styles.container}
          style={
            {
              ...(settings.opacity >= 100
                ? {}
                : { opacity: settings.opacity / 100 }),
              "--nfr-widget-bg-alpha":
                (settings.backgroundOpacity ?? 100) / 100,
            } as CSSProperties
          }
        >
          <ErrorBoundary
            resetKeys={[Widget]}
            onError={(error, info) => {
              logger.error(`Error rendering widget: ${id}`, {
                widgetId: id,
                error,
                info,
              });
            }}
            fallbackRender={({ error }) => (
              <ErrorDisplay
                id={id}
                error={t("canvas.componentFailed")}
                message={stringify(error)}
              />
            )}
          >
            {Widget === undefined ? (
              <Text>{t("canvas.loading")}</Text>
            ) : (
              <Widget
                id={id}
                x={frame.x}
                y={frame.y}
                width={frame.width}
                height={frame.height}
              />
            )}
          </ErrorBoundary>
        </Resizable>
      </Box>
    </Draggable>
  );
};

export default WidgetContainer;
