import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

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

export async function listenMonitorScale(
  onChange: () => void,
): Promise<() => void> {
  return getCurrentWindow().onScaleChanged(() => {
    onChange();
  });
}
