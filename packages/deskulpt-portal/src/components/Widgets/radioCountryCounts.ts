// Station counts per ISO country code from Radio Browser
// (https://www.radio-browser.info/). One small /json/countrycodes call
// covers every option in the radio widget's "From" select, so the settings
// list can show "中国 · 2181" without probing each country.

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

export type RadioCountryCounts = {
  byCode: Record<string, number>;
  total: number;
};

let cached: Promise<RadioCountryCounts> | null = null;

function shuffled<T>(list: T[]): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function fetchCounts(mirror: string): Promise<RadioCountryCounts> {
  const response = await fetch(`${mirror}/json/countrycodes?hidebroken=true`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("unexpected payload");
  const byCode: Record<string, number> = {};
  let total = 0;
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const name = "name" in row ? String(row.name || "").toUpperCase() : "";
    const raw = "stationcount" in row ? Number(row.stationcount) : Number.NaN;
    if (!/^[A-Z]{2}$/.test(name) || !Number.isFinite(raw) || raw < 0) continue;
    byCode[name] = raw;
    total += raw;
  }
  if (Object.keys(byCode).length === 0) throw new Error("empty counts");
  return { byCode, total };
}

/// Shared across settings opens; mirrors race the same way the radio widget
/// races its catalog so a down host does not blank the labels.
export function loadRadioCountryCounts(): Promise<RadioCountryCounts> {
  if (!cached) {
    cached = Promise.any(
      shuffled(MIRRORS).map((mirror) => fetchCounts(mirror)),
    ).catch(() => ({ byCode: {}, total: 0 }));
  }
  return cached;
}
