import { invoke } from "@tauri-apps/api/core";

export type RadioCacheStatus = {
  state: "off" | "downloading" | "ready" | "stale" | "error";
  count: number;
  fetchedAt: number | null;
};

const EMPTY: RadioCacheStatus = {
  state: "off",
  count: 0,
  fetchedAt: null,
};

function asStatus(raw: unknown): RadioCacheStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const state = "state" in raw ? String(raw.state) : "";
  if (
    state !== "off" &&
    state !== "downloading" &&
    state !== "ready" &&
    state !== "stale" &&
    state !== "error"
  ) {
    return null;
  }
  const count = "count" in raw ? Number(raw.count) : 0;
  const fetchedAt = "fetchedAt" in raw ? Number(raw.fetchedAt) : Number.NaN;
  return {
    state,
    count: Number.isFinite(count) && count > 0 ? count : 0,
    fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? fetchedAt : null,
  };
}

async function readWidgetFile(id: string, path: string): Promise<string> {
  const raw = await invoke<unknown>("plugin:deskulpt-core|call_plugin", {
    plugin: "fs",
    command: "read_file",
    id,
    payload: { path },
  });
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/// Live catalog-cache progress written by the radio widget. Missing file
/// means this copy has not downloaded yet (or cache is off).
export async function loadRadioCacheStatus(
  id: string,
): Promise<RadioCacheStatus> {
  try {
    const text = await readWidgetFile(id, "cache-status.json");
    const parsed = asStatus(JSON.parse(text));
    if (parsed) return parsed;
  } catch {
    // No status file yet.
  }
  return EMPTY;
}
