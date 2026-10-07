import { type CSSProperties, useEffect, useRef, useState } from "react";
import Draggable from "react-draggable";
import { Resizable } from "re-resizable";
import { ErrorBoundary } from "react-error-boundary";
import ErrorDisplay from "./ErrorDisplay";
import { logger, stringify, useTranslation } from "@deskulpt/utils";
import { LuGripVertical } from "react-icons/lu";
import { Box, Text } from "@radix-ui/themes";
import { useWidgetsStore } from "../hooks";
import { useWidgetSnap } from "../hooks/useWidgetSnap";
import { css } from "@emotion/react";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { currentMonitorFrame, listenMonitorScale } from "../monitorFrame";

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

interface WidgetContainerProps {
  id: string;
}

const WidgetContainer = ({ id }: WidgetContainerProps) => {
  const { t } = useTranslation();
  const draggableRef = useRef<HTMLDivElement>(null);

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
  const {
    dragOffset,
    resizeSnap,
    snapGap,
    clearGuides,
    dragHandlers,
    resizeHandlers,
  } = useWidgetSnap({ id, geometry, setGeometry });
  const [viewport, setViewport] = useState({
    width: settings.width,
    height: settings.height,
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

  useEffect(() => () => clearGuides(), [clearGuides]);

  useEffect(() => {
    if (!settings.fullscreen) return;
    let unlisten = () => {};
    let disposed = false;
    const publish = async () => {
      if (!fullscreenRef.current) return;
      const frame = await currentMonitorFrame();
      if (!frame || !fullscreenRef.current) return;
      setViewport(frame);
      if (
        settings.x === 0 &&
        settings.y === 0 &&
        settings.width === frame.width &&
        settings.height === frame.height
      ) {
        return;
      }
      DeskulptWidgets.Commands.updateSettings(id, {
        fullscreenFrame: true,
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
      }).catch(logger.error);
    };
    void publish();
    void listenMonitorScale(() => {
      if (!disposed) void publish();
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(logger.error);
    return () => {
      disposed = true;
      unlisten();
    };
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

  if (!settings.isLoaded) {
    return null;
  }

  return (
    <Draggable
      nodeRef={draggableRef}
      disabled={settings.fullscreen}
      position={{ x: frame.x, y: frame.y }}
      positionOffset={settings.fullscreen ? undefined : dragOffset}
      bounds="body"
      handle=".handle"
      {...(settings.fullscreen ? {} : dragHandlers)}
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
          snap={settings.fullscreen ? undefined : resizeSnap}
          snapGap={settings.fullscreen ? undefined : snapGap}
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
          {...(settings.fullscreen ? {} : resizeHandlers)}
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
                config={settings.config}
              />
            )}
          </ErrorBoundary>
        </Resizable>
      </Box>
    </Draggable>
  );
};

export default WidgetContainer;
