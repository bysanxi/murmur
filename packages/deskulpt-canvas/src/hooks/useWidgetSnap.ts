import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DraggableData, DraggableEvent } from "react-draggable";
import {
  NumberSize,
  ResizeCallback,
  ResizeDirection,
  ResizeStartCallback,
} from "re-resizable";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useGuidesStore } from "./useGuidesStore";
import { useSettingsStore } from "./useSettingsStore";
import { useWidgetsStore } from "./useWidgetsStore";
import {
  type Rect,
  type ResizeSnapTargets,
  collectGuides,
  neighborRects,
  resizeSnapTargets,
  snapDragPosition,
} from "../utils/snap";

interface WidgetGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
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

interface UseWidgetSnapArgs {
  id: string;
  geometry: WidgetGeometry;
  setGeometry: (updater: (prev: WidgetGeometry) => WidgetGeometry) => void;
}

export const useWidgetSnap = ({
  id,
  geometry,
  setGeometry,
}: UseWidgetSnapArgs) => {
  const resizeStartRef = useRef<WidgetGeometry | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeSnap, setResizeSnap] = useState<ResizeSnapTargets>({});
  const snapThreshold = useSettingsStore((state) => state.snapThreshold ?? 8);
  const showGuides = useSettingsStore((state) => state.showGuides ?? true);
  const setGuides = useGuidesStore((state) => state.setGuides);
  const clearGuides = useGuidesStore((state) => state.clearGuides);

  const applyGuides = (rect: Rect) => {
    if (!showGuides || snapThreshold <= 0) {
      clearGuides();
      return;
    }
    setGuides(
      collectGuides(rect, neighborRects(useWidgetsStore.getState(), id)),
    );
  };

  const onDragStart = () => {
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
  };

  const onDrag = (_: DraggableEvent, data: DraggableData) => {
    if (snapThreshold <= 0) {
      dragOffsetRef.current = { x: 0, y: 0 };
      setDragOffset({ x: 0, y: 0 });
      clearGuides();
      return;
    }
    const result = snapDragPosition(
      { x: data.x, y: data.y, width: geometry.width, height: geometry.height },
      neighborRects(useWidgetsStore.getState(), id),
      snapThreshold,
    );
    const offset = { x: result.x - data.x, y: result.y - data.y };
    dragOffsetRef.current = offset;
    setDragOffset(offset);
    if (showGuides) {
      setGuides(result.guides);
    } else {
      clearGuides();
    }
  };

  const onDragStop = (_: DraggableEvent, data: DraggableData) => {
    const offset = dragOffsetRef.current;
    const x = data.x + offset.x;
    const y = data.y + offset.y;
    dragOffsetRef.current = { x: 0, y: 0 };
    setDragOffset({ x: 0, y: 0 });
    clearGuides();
    setGeometry((prev) => ({ ...prev, x, y }));
    DeskulptWidgets.Commands.updateSettings(id, { x, y });
  };

  const onResizeStart: ResizeStartCallback = (_e, direction) => {
    resizeStartRef.current = { ...geometry };
    const targets =
      snapThreshold > 0
        ? resizeSnapTargets(
            geometry,
            direction,
            neighborRects(useWidgetsStore.getState(), id),
          )
        : {};
    flushSync(() => setResizeSnap(targets));
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
      setGeometry(() => newGeometry);
    });
    applyGuides(newGeometry);
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
    resizeStartRef.current = null;
    setResizeSnap({});
    clearGuides();
    DeskulptWidgets.Commands.updateSettings(id, newGeometry);
  };

  return {
    dragOffset,
    resizeSnap,
    snapGap: snapThreshold + 1,
    clearGuides,
    dragHandlers: { onStart: onDragStart, onDrag, onStop: onDragStop },
    resizeHandlers: {
      onResizeStart,
      onResize,
      onResizeStop,
    },
  };
};
