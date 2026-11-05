// Approximate coordinates when Radio Browser has no geo_lat/geo_long.
// Match a city in the station name first (roamdial sits pins on real
// cities). Province / country centroids are the last resort.

import { cityCoordsOf } from "./geo-cities.js";

// Province capitals. Keys are lowercased; Radio Browser often uses
// Wade-Giles (Kwangtung) or older postal spellings alongside pinyin.
const CN_STATE = {
  beijing: [39.9, 116.4],
  shanghai: [31.2, 121.5],
  tianjin: [39.1, 117.2],
  chongqing: [29.6, 106.5],
  "hong kong": [22.3, 114.2],
  hongkong: [22.3, 114.2],
  macao: [22.2, 113.5],
  macau: [22.2, 113.5],
  guangdong: [23.1, 113.3],
  kwangtung: [23.1, 113.3],
  jiangsu: [32.1, 118.8],
  kiangsu: [32.1, 118.8],
  zhejiang: [30.3, 120.2],
  chekiang: [30.3, 120.2],
  shandong: [36.7, 117.0],
  shantung: [36.7, 117.0],
  henan: [34.8, 113.7],
  honan: [34.8, 113.7],
  hebei: [38.0, 114.5],
  hopeh: [38.0, 114.5],
  hubei: [30.6, 114.3],
  hupeh: [30.6, 114.3],
  hunan: [28.2, 112.9],
  fujian: [26.1, 119.3],
  fukien: [26.1, 119.3],
  anhui: [31.9, 117.3],
  anhwei: [31.9, 117.3],
  jiangxi: [28.7, 115.9],
  kiangsi: [28.7, 115.9],
  sichuan: [30.6, 104.1],
  szechuan: [30.6, 104.1],
  szechwan: [30.6, 104.1],
  yunnan: [25.0, 102.7],
  guizhou: [26.6, 106.7],
  kweichow: [26.6, 106.7],
  shanxi: [37.9, 112.6],
  shansi: [37.9, 112.6],
  shaanxi: [34.3, 108.9],
  shensi: [34.3, 108.9],
  gansu: [36.1, 103.8],
  kansu: [36.1, 103.8],
  qinghai: [36.6, 101.8],
  chinghai: [36.6, 101.8],
  liaoning: [41.8, 123.4],
  jilin: [43.9, 125.3],
  kirin: [43.9, 125.3],
  heilongjiang: [45.8, 126.5],
  heilungkiang: [45.8, 126.5],
  neimenggu: [40.8, 111.7],
  "inner mongolia": [40.8, 111.7],
  mongolia: [40.8, 111.7],
  xinjiang: [43.8, 87.6],
  sinkiang: [43.8, 87.6],
  xizang: [29.7, 91.1],
  tibet: [29.7, 91.1],
  ningxia: [38.5, 106.3],
  guangxi: [22.8, 108.3],
  kwangsi: [22.8, 108.3],
  hainan: [20.0, 110.3],
  taiwan: [25.0, 121.5],
  dalian: [38.9, 121.6],
  shenzhen: [22.5, 114.1],
  guangzhou: [23.1, 113.3],
  hangzhou: [30.3, 120.2],
  nanjing: [32.1, 118.8],
  wuhan: [30.6, 114.3],
  chengdu: [30.6, 104.1],
  xian: [34.3, 108.9],
  "xi'an": [34.3, 108.9],
  qingdao: [36.1, 120.4],
  xiamen: [24.5, 118.1],
  amoy: [24.5, 118.1],
  suzhou: [31.3, 120.6],
  ningbo: [29.9, 121.5],
  harbin: [45.8, 126.5],
  changchun: [43.9, 125.3],
  shenyang: [41.8, 123.4],
  kunming: [25.0, 102.7],
  nanning: [22.8, 108.3],
  fuzhou: [26.1, 119.3],
  hefei: [31.9, 117.3],
  nanchang: [28.7, 115.9],
  zhengzhou: [34.8, 113.7],
  jinan: [36.7, 117.0],
  taiyuan: [37.9, 112.6],
  shijiazhuang: [38.0, 114.5],
  lanzhou: [36.1, 103.8],
  urumqi: [43.8, 87.6],
  lhasa: [29.7, 91.1],
};

// Rough country centroids for the radio's country filter list. Enough to
// park a pin on the right landmass when the directory has no coordinates.
const COUNTRY = {
  CN: [35.9, 104.2],
  HK: [22.3, 114.2],
  MO: [22.2, 113.5],
  TW: [23.7, 121.0],
  JP: [36.2, 138.3],
  KR: [36.5, 127.9],
  KP: [40.3, 127.5],
  US: [39.8, -98.6],
  CA: [56.1, -106.3],
  MX: [23.6, -102.6],
  BR: [-14.2, -51.9],
  AR: [-38.4, -63.6],
  CL: [-35.7, -71.5],
  CO: [4.6, -74.1],
  PE: [-9.2, -75.0],
  EC: [-1.8, -78.2],
  UY: [-32.5, -55.8],
  VE: [6.4, -66.6],
  BO: [-16.3, -63.6],
  GB: [54.7, -3.4],
  IE: [53.1, -8.2],
  FR: [46.2, 2.2],
  DE: [51.2, 10.5],
  IT: [41.9, 12.6],
  ES: [40.5, -3.7],
  PT: [39.4, -8.2],
  NL: [52.1, 5.3],
  BE: [50.5, 4.5],
  CH: [46.8, 8.2],
  AT: [47.5, 14.6],
  SE: [60.1, 18.6],
  NO: [60.5, 8.5],
  DK: [56.3, 9.5],
  FI: [61.9, 25.7],
  PL: [51.9, 19.1],
  CZ: [49.8, 15.5],
  HU: [47.2, 19.5],
  RO: [45.9, 25.0],
  BG: [42.7, 25.5],
  GR: [39.1, 21.8],
  RS: [44.0, 21.0],
  HR: [45.1, 15.2],
  BA: [43.9, 17.7],
  SI: [46.2, 14.8],
  SK: [48.7, 19.7],
  UA: [48.4, 31.2],
  BY: [53.7, 27.9],
  LV: [56.9, 24.6],
  LT: [55.2, 23.9],
  EE: [58.6, 25.0],
  AL: [41.2, 20.2],
  MK: [41.6, 21.7],
  ME: [42.7, 19.4],
  GE: [42.3, 43.4],
  AM: [40.1, 45.0],
  AZ: [40.1, 47.6],
  KZ: [48.0, 68.0],
  RU: [61.5, 105.3],
  TR: [39.0, 35.2],
  IL: [31.0, 34.9],
  LB: [33.9, 35.9],
  AE: [23.4, 53.8],
  SA: [23.9, 45.1],
  EG: [26.8, 30.8],
  MA: [31.8, -7.1],
  TN: [33.9, 9.5],
  DZ: [28.0, 1.7],
  ZA: [-30.6, 22.9],
  NG: [9.1, 8.7],
  GH: [7.9, -1.0],
  KE: [-0.0, 37.9],
  UG: [1.4, 32.3],
  IN: [20.6, 79.0],
  PK: [30.4, 69.3],
  BD: [23.7, 90.4],
  LK: [7.9, 80.8],
  NP: [28.4, 84.1],
  AF: [33.9, 67.7],
  ID: [-2.5, 118.0],
  PH: [12.9, 121.8],
  MY: [4.2, 101.9],
  TH: [15.9, 100.9],
  SG: [1.4, 103.8],
  VN: [14.1, 108.3],
  AU: [-25.3, 133.8],
  NZ: [-40.9, 174.9],
  DO: [18.7, -70.2],
  JM: [18.1, -77.3],
};

function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.codePointAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function jitter(seed, lat, lon, spread) {
  const a = hash01(`${seed}:lat`);
  const b = hash01(`${seed}:lon`);
  return [lat + (a - 0.5) * 2 * spread, lon + (b - 0.5) * 2 * spread];
}

function stateBase(countryCode, region) {
  if (!region) return null;
  const key = String(region).trim().toLowerCase();
  if (!key) return null;
  if (countryCode === "CN" || countryCode === "TW" || countryCode === "HK") {
    return CN_STATE[key] || null;
  }
  return null;
}

/// Fill missing coordinates. Real Radio Browser coords are left
/// untouched. A city hit is treated as a true pin (same city stacks
/// dim via aDen instead of being fanned into a disk).
export function resolveCoords({ uuid, countryCode, region, name, lat, lon }) {
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon, approx: false };
  }
  const code = String(countryCode || "").toUpperCase();
  const seed = uuid || `${code}|${region}|${name}`;
  const city = cityCoordsOf(name, region);
  if (city) {
    const [jlat, jlon] = jitter(seed, city[0], city[1], 0.04);
    return { lat: jlat, lon: jlon, approx: false };
  }
  const province = stateBase(code, region);
  const base = province || COUNTRY[code] || null;
  if (!base) return { lat: null, lon: null, approx: false };
  // Centidegree-scale noise only — a wide lat/lon box reads as streaks.
  const [jlat, jlon] = jitter(seed, base[0], base[1], 0.04);
  return { lat: jlat, lon: jlon, approx: true };
}
