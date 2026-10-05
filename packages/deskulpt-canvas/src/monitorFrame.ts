import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export interface MonitorFrame {
  width: number;
  height: number;
}

/** Logical size of the monitor under the canvas: physical resolution / scaleFactor. */
export async function currentMonitorFrame(): Promise<MonitorFrame | null> {
  const monitor = await currentMonitor();
  if (!monitor) return null;
  const logical = monitor.size.toLogical(monitor.scaleFactor);
  const width = Math.round(logical.width);
  const height = Math.round(logical.height);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

let halfZoom = false;
let zoomFailed = false;

function pageUsesOtherMonitorScale(dpr: number, scaleFactor: number): boolean {
  return Math.abs(dpr - 2) < 0.05 && Math.abs(scaleFactor - 1) < 0.05;
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * One correction when the page is laid out at 2× on a 100% monitor.
 * If the viewport does not grow, zoom goes back to 1 and this stops.
 */
export async function correctPageZoomOnce(): Promise<void> {
  const monitor = await currentMonitor();
  if (!monitor) return;
  const mismatch = pageUsesOtherMonitorScale(
    window.devicePixelRatio,
    monitor.scaleFactor,
  );
  if (!mismatch) {
    if (halfZoom) {
      await getCurrentWebview().setZoom(1);
      halfZoom = false;
    }
    return;
  }
  if (halfZoom || zoomFailed) return;

  const beforeWidth = window.innerWidth;
  const beforeHeight = window.innerHeight;
  await getCurrentWebview().setZoom(0.5);
  await nextFrames();
  if (
    window.innerWidth === beforeWidth &&
    window.innerHeight === beforeHeight
  ) {
    await getCurrentWebview().setZoom(1);
    zoomFailed = true;
    return;
  }
  halfZoom = true;
}

export async function listenMonitorScale(
  onChange: () => void,
): Promise<() => void> {
  return getCurrentWindow().onScaleChanged(() => {
    onChange();
  });
}
