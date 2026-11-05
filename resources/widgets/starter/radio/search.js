// Station search over the local catalog, matching RoamDial's bar:
// up to two country rows first (a country row tunes the most popular
// station there), then every matching station. A station ranks by how
// the query sits in its name, and only if the name misses, by its region.
// Ties go to the more popular station. The caller pages the station list.
// A query with an apostrophe that hits nothing is tried once more with
// the mark removed.

import { genreColorOf } from "./genre-color.js";

const COUNTRY_CAP = 2;

// [code, zh, en, ...aliases people type that are not the code or the name]
const NAME_ROWS = [
  ["US", "美国", "United States", "usa"],
  ["DE", "德国", "Germany"],
  ["FR", "法国", "France"],
  ["RU", "俄罗斯", "Russia"],
  ["MX", "墨西哥", "Mexico"],
  ["GB", "英国", "United Kingdom", "uk", "britain"],
  ["CN", "中国", "China"],
  ["HK", "香港", "Hong Kong"],
  ["SG", "新加坡", "Singapore"],
  ["TW", "台湾", "Taiwan"],
  ["JP", "日本", "Japan"],
  ["KR", "韩国", "Korea", "south korea"],
  ["IN", "印度", "India"],
  ["ID", "印度尼西亚", "Indonesia"],
  ["PH", "菲律宾", "Philippines"],
  ["MY", "马来西亚", "Malaysia"],
  ["TH", "泰国", "Thailand"],
  ["TR", "土耳其", "Türkiye", "turkey"],
  ["AE", "阿联酋", "United Arab Emirates", "uae"],
  ["SA", "沙特阿拉伯", "Saudi Arabia"],
  ["IL", "以色列", "Israel"],
  ["LB", "黎巴嫩", "Lebanon"],
  ["AF", "阿富汗", "Afghanistan"],
  ["NP", "尼泊尔", "Nepal"],
  ["AU", "澳大利亚", "Australia"],
  ["NZ", "新西兰", "New Zealand"],
  ["CA", "加拿大", "Canada"],
  ["DO", "多米尼加", "Dominican Republic"],
  ["JM", "牙买加", "Jamaica"],
  ["BR", "巴西", "Brazil"],
  ["AR", "阿根廷", "Argentina"],
  ["CL", "智利", "Chile"],
  ["CO", "哥伦比亚", "Colombia"],
  ["PE", "秘鲁", "Peru"],
  ["EC", "厄瓜多尔", "Ecuador"],
  ["UY", "乌拉圭", "Uruguay"],
  ["VE", "委内瑞拉", "Venezuela"],
  ["BO", "玻利维亚", "Bolivia"],
  ["ES", "西班牙", "Spain"],
  ["PT", "葡萄牙", "Portugal"],
  ["IT", "意大利", "Italy"],
  ["NL", "荷兰", "Netherlands"],
  ["BE", "比利时", "Belgium"],
  ["CH", "瑞士", "Switzerland"],
  ["AT", "奥地利", "Austria"],
  ["SE", "瑞典", "Sweden"],
  ["NO", "挪威", "Norway"],
  ["DK", "丹麦", "Denmark"],
  ["FI", "芬兰", "Finland"],
  ["IE", "爱尔兰", "Ireland"],
  ["PL", "波兰", "Poland"],
  ["CZ", "捷克", "Czechia", "czech republic"],
  ["HU", "匈牙利", "Hungary"],
  ["RO", "罗马尼亚", "Romania"],
  ["BG", "保加利亚", "Bulgaria"],
  ["GR", "希腊", "Greece"],
  ["RS", "塞尔维亚", "Serbia"],
  ["HR", "克罗地亚", "Croatia"],
  ["BA", "波黑", "Bosnia and Herzegovina"],
  ["SI", "斯洛文尼亚", "Slovenia"],
  ["SK", "斯洛伐克", "Slovakia"],
  ["UA", "乌克兰", "Ukraine"],
  ["BY", "白俄罗斯", "Belarus"],
  ["LV", "拉脱维亚", "Latvia"],
  ["LT", "立陶宛", "Lithuania"],
  ["EE", "爱沙尼亚", "Estonia"],
  ["AL", "阿尔巴尼亚", "Albania"],
  ["MK", "北马其顿", "North Macedonia"],
  ["ME", "黑山", "Montenegro"],
  ["GE", "格鲁吉亚", "Georgia"],
  ["AM", "亚美尼亚", "Armenia"],
  ["AZ", "阿塞拜疆", "Azerbaijan"],
  ["KZ", "哈萨克斯坦", "Kazakhstan"],
  ["EG", "埃及", "Egypt"],
  ["MA", "摩洛哥", "Morocco"],
  ["TN", "突尼斯", "Tunisia"],
  ["DZ", "阿尔及利亚", "Algeria"],
  ["ZA", "南非", "South Africa"],
  ["NG", "尼日利亚", "Nigeria"],
  ["GH", "加纳", "Ghana"],
  ["KE", "肯尼亚", "Kenya"],
  ["UG", "乌干达", "Uganda"],
  ["PK", "巴基斯坦", "Pakistan"],
  ["BD", "孟加拉国", "Bangladesh"],
  ["LK", "斯里兰卡", "Sri Lanka"],
  ["MO", "澳门", "Macao"],
];

const NAMES = {};
for (const [code, zh, en, ...alias] of NAME_ROWS) {
  NAMES[code] = { zh, en, alias };
}

// Directory state spellings, including the older postal ones Radio Browser
// still uses, so a Chinese query hits the same region the English one does.
const CN_ZH = {
  beijing: "北京",
  shanghai: "上海",
  tianjin: "天津",
  chongqing: "重庆",
  "hong kong": "香港",
  hongkong: "香港",
  macao: "澳门",
  macau: "澳门",
  guangdong: "广东",
  kwangtung: "广东",
  jiangsu: "江苏",
  kiangsu: "江苏",
  zhejiang: "浙江",
  chekiang: "浙江",
  shandong: "山东",
  shantung: "山东",
  henan: "河南",
  honan: "河南",
  hebei: "河北",
  hopeh: "河北",
  hubei: "湖北",
  hupeh: "湖北",
  hupei: "湖北",
  hunan: "湖南",
  fujian: "福建",
  fukien: "福建",
  anhui: "安徽",
  anhwei: "安徽",
  jiangxi: "江西",
  kiangsi: "江西",
  sichuan: "四川",
  szechuan: "四川",
  szechwan: "四川",
  yunnan: "云南",
  guizhou: "贵州",
  kweichow: "贵州",
  shanxi: "山西",
  shansi: "山西",
  shaanxi: "陕西",
  shensi: "陕西",
  gansu: "甘肃",
  kansu: "甘肃",
  qinghai: "青海",
  chinghai: "青海",
  liaoning: "辽宁",
  jilin: "吉林",
  kirin: "吉林",
  heilongjiang: "黑龙江",
  heilungkiang: "黑龙江",
  neimenggu: "内蒙古",
  "inner mongolia": "内蒙古",
  mongolia: "内蒙古",
  xinjiang: "新疆",
  sinkiang: "新疆",
  xizang: "西藏",
  tibet: "西藏",
  ningxia: "宁夏",
  guangxi: "广西",
  kwangsi: "广西",
  hainan: "海南",
  taiwan: "台湾",
  dalian: "大连",
  shenzhen: "深圳",
  guangzhou: "广州",
  hangzhou: "杭州",
  nanjing: "南京",
  wuhan: "武汉",
  chengdu: "成都",
  xian: "西安",
  "xi'an": "西安",
  qingdao: "青岛",
  xiamen: "厦门",
  amoy: "厦门",
  suzhou: "苏州",
  ningbo: "宁波",
  harbin: "哈尔滨",
  changchun: "长春",
  shenyang: "沈阳",
  kunming: "昆明",
  nanning: "南宁",
  fuzhou: "福州",
  hefei: "合肥",
  nanchang: "南昌",
  zhengzhou: "郑州",
  jinan: "济南",
  taiyuan: "太原",
  shijiazhuang: "石家庄",
  lanzhou: "兰州",
  urumqi: "乌鲁木齐",
  lhasa: "拉萨",
};

const EMPTY = { countries: [], stations: [] };

function nameRank(name, q) {
  if (!name) return -1;
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (
    name.includes(` ${q}`) ||
    name.includes(`-${q}`) ||
    name.includes(`/${q}`) ||
    name.includes(`(${q}`) ||
    name.includes(`[${q}`)
  ) {
    return 2;
  }
  if (name.includes(q)) return 3;
  return -1;
}

function placeRank(places, q) {
  let best = -1;
  for (const place of places) {
    if (!place) continue;
    let rank = -1;
    if (place === q) rank = 4;
    else if (place.startsWith(q)) rank = 5;
    else if (place.includes(q)) rank = 6;
    if (rank >= 0 && (best < 0 || rank < best)) best = rank;
  }
  return best;
}

function stationRank(row, q) {
  const named = nameRank(row.name, q);
  if (named >= 0) return named;
  return placeRank(row.places, q);
}

function countryHit(row, q) {
  if (!row.code) return null;
  const exact =
    row.code === q ||
    row.zh === q ||
    row.en === q ||
    row.dir === q ||
    row.alias.includes(q);
  const partial =
    (row.zh && row.zh.includes(q)) ||
    (row.en && row.en.includes(q)) ||
    (row.dir && row.dir.includes(q));
  if (!exact && !partial) return null;
  return exact;
}

function dotColor(station) {
  const [r, g, b] = genreColorOf(station, 1);
  return `rgb(${(r * 255) | 0}, ${(g * 255) | 0}, ${(b * 255) | 0})`;
}

function countryLabel(row, en) {
  if (en) return row.enLabel || row.dirLabel || row.code.toUpperCase();
  return row.zhLabel || row.dirLabel || row.code.toUpperCase();
}

function regionLabel(row, en) {
  if (!en && row.zhRegion) return row.zhRegion;
  return row.region;
}

function placeLine(row, en) {
  const country = countryLabel(row, en);
  if ((row.station.prec ?? 0) > 2) return country;
  const region = regionLabel(row, en);
  if (!region) return country;
  if (!country) return region;
  return en ? `${region}, ${country}` : `${region} · ${country}`;
}

function stationSub(row, en) {
  const parts = [];
  const place = placeLine(row, en);
  if (place) parts.push(place);
  const tag = row.station.tags?.[0];
  if (tag) parts.push(tag);
  if (row.station.bitrate > 0) parts.push(`${row.station.bitrate} kbps`);
  return parts.join(" · ");
}

function compareCountry(a, b) {
  if (a.exact !== b.exact) return a.exact ? -1 : 1;
  return b.count - a.count;
}

/// Lowercased fields for one catalog, built once per load.
export function compileStations(stations) {
  return (stations ?? []).map((station) => {
    const code = String(station.countryCode || "").toUpperCase();
    const named = NAMES[code];
    const region = String(station.region || "");
    const regionKey = region.toLowerCase();
    const zhRegion = code === "CN" ? CN_ZH[regionKey] || "" : "";
    const places = [];
    if (regionKey) places.push(regionKey);
    if (zhRegion) places.push(zhRegion.toLowerCase());
    return {
      station,
      name: String(station.name || "").toLowerCase(),
      places,
      region,
      zhRegion,
      code: code.toLowerCase(),
      zh: (named?.zh || "").toLowerCase(),
      en: (named?.en || "").toLowerCase(),
      dir: String(station.country || "").toLowerCase(),
      alias: (named?.alias ?? []).map((item) => item.toLowerCase()),
      zhLabel: named?.zh || "",
      enLabel: named?.en || "",
      dirLabel: station.country || "",
      pop: Number(station.pop) || 0,
    };
  });
}

function run(rows, query, language) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q || !rows?.length) return EMPTY;
  const en = language === "en";
  const groups = new Map();
  const found = [];

  for (const row of rows) {
    if (row.code) {
      let group = groups.get(row.code);
      if (!group) {
        group = { row, count: 0, best: row, exact: false, hit: false };
        groups.set(row.code, group);
      }
      group.count += 1;
      if (row.pop > group.best.pop) group.best = row;
      const exact = countryHit(row, q);
      if (exact !== null) {
        group.hit = true;
        if (exact) group.exact = true;
      }
    }
    const rank = stationRank(row, q);
    if (rank >= 0) found.push({ row, rank });
  }

  const countries = [...groups.values()]
    .filter((group) => group.hit)
    .toSorted(compareCountry)
    .slice(0, COUNTRY_CAP)
    .map((group) => ({
      kind: "country",
      station: group.best.station,
      label: countryLabel(group.best, en),
      count: group.count,
      color: "#f5f1e8",
      cc: group.best.station.countryCode || "",
    }));

  found.sort((a, b) => a.rank - b.rank || b.row.pop - a.row.pop);
  const stations = found.map((item) => ({
    kind: "station",
    station: item.row.station,
    label: item.row.station.name || "",
    sub: stationSub(item.row, en),
    color: dotColor(item.row.station),
    cc: item.row.station.countryCode || "",
  }));
  return { countries, stations };
}

export function searchCompiled(rows, query, language = "zh-CN") {
  const first = run(rows, query, language);
  if (
    first.countries.length > 0 ||
    first.stations.length > 0 ||
    !/['’]/.test(String(query || ""))
  ) {
    return first;
  }
  return run(rows, String(query).replaceAll(/['’]/g, ""), language);
}
