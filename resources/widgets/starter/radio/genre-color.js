// Soft genre palette for station pins — the same eleven hues roamdial
// paints when a city opens into a cloud of overlapping stars.

const GENRES = [
  { key: "pop", rgb: [0.91, 0.66, 0.63] }, // #E8A9A0
  { key: "rock", rgb: [0.85, 0.6, 0.49] }, // #D99A7E
  { key: "electronic", rgb: [0.5, 0.78, 0.75] }, // #7FC8C0
  { key: "jazz", rgb: [0.85, 0.7, 0.43] }, // #D8B26E
  { key: "blues", rgb: [0.85, 0.7, 0.43] },
  { key: "classical", rgb: [0.93, 0.89, 0.8] }, // #EDE3CC
  { key: "news", rgb: [0.62, 0.71, 0.84] }, // #9DB4D6
  { key: "talk", rgb: [0.62, 0.71, 0.84] },
  { key: "hip", rgb: [0.72, 0.64, 0.85] }, // #B7A3D9
  { key: "rap", rgb: [0.72, 0.64, 0.85] },
  { key: "country", rgb: [0.66, 0.75, 0.54] }, // #A9C08A
  { key: "folk", rgb: [0.66, 0.75, 0.54] },
  { key: "world", rgb: [0.89, 0.76, 0.35] }, // #E2C35A
  { key: "local", rgb: [0.89, 0.76, 0.35] },
  { key: "religious", rgb: [0.78, 0.71, 0.6] }, // #C8B49A
  { key: "christian", rgb: [0.78, 0.71, 0.6] },
];

const ALIAS = [
  ["流行", "pop"],
  ["流行音乐", "pop"],
  ["摇滚", "rock"],
  ["电子", "electronic"],
  ["电音", "electronic"],
  ["爵士", "jazz"],
  ["蓝调", "blues"],
  ["古典", "classical"],
  ["新闻", "news"],
  ["资讯", "news"],
  ["谈话", "talk"],
  ["脱口秀", "talk"],
  ["说唱", "hip"],
  ["嘻哈", "hip"],
  ["乡村", "country"],
  ["民谣", "folk"],
  ["世界", "world"],
  ["宗教", "religious"],
];

const PALETTE = [];
for (const genre of GENRES) {
  const key = genre.rgb.join(",");
  if (!PALETTE.some((p) => p.join(",") === key)) PALETTE.push(genre.rgb);
}

// Roamdial base ink #F5F1E8 — continent zoom reads as white sparks.
const CREAM = [0.961, 0.945, 0.91];

function matchKey(tag) {
  const t = String(tag || "").toLowerCase();
  for (const [zh, key] of ALIAS) {
    if (t.includes(zh) || t.includes(key)) {
      return GENRES.find((g) => g.key === key)?.rgb ?? null;
    }
  }
  for (const genre of GENRES) {
    if (t.includes(genre.key)) return genre.rgb;
  }
  return null;
}

function hashHue(uuid) {
  const s = String(uuid || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.codePointAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[(h >>> 0) % PALETTE.length];
}

function genreRgb(station) {
  for (const tag of station?.tags ?? []) {
    const hit = matchKey(tag);
    if (hit) return hit;
  }
  const blob = (station?.tags ?? []).join(" ");
  const fromBlob = matchKey(blob);
  if (fromBlob) return fromBlob;
  return hashHue(station?.uuid);
}

/// Pin colour. `toward` 0.45 = roamdial globe carpet; 1 = full genre on the fan.
export function genreColorOf(station, toward = 0.45) {
  const t = Math.max(0, Math.min(1, toward));
  const rgb = genreRgb(station);
  return [
    CREAM[0] * (1 - t) + rgb[0] * t,
    CREAM[1] * (1 - t) + rgb[1] * t,
    CREAM[2] * (1 - t) + rgb[2] * t,
  ];
}
