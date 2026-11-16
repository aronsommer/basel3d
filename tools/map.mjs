// Draws a map of the area from OpenStreetMap (roads, rail, water, green areas; no text, buildings
// or trees) and writes it to public/ground/map/ as one KTX2 per 1 km tile, like the aerial photo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { E_MIN, E_MAX, N_MIN, N_MAX, BBOX_WGS84, DATA, PUBLIC } from "./area.mjs";
import { writeTiles } from "./tiles.mjs";

const OSM_FILE = join(DATA, "osm.json");
const PX_PER_M = 1.024; // 1024 px per 1 km tile
const BACKGROUND = "#d8d0c2"; // built-up land

// --- Download (once) everything the map shows, with geometry.
if (!existsSync(OSM_FILE)) {
  const [w, s, e, n] = BBOX_WGS84.split(",");
  const keys = ["landuse", "natural", "leisure", "waterway", "amenity", "area:highway", "place"];
  const query = `[out:json][timeout:300][bbox:${s},${w},${n},${e}];(
    way[highway];way[railway];${keys.map((k) => `way["${k}"];`).join("")}
    ${keys.map((k) => `relation[type=multipolygon]["${k}"];`).join("")});out geom;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "basel3d-converter" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: ${res.status}`);
  mkdirSync(DATA, { recursive: true });
  writeFileSync(OSM_FILE, Buffer.from(await res.arrayBuffer()));
}
const { elements } = JSON.parse(readFileSync(OSM_FILE, "utf8"));

// --- Style: what to draw, in which colour, how wide (metres) and in which order.
const GREEN = "#8cc06a";
const WATER = "#4f8fc6";
const PAVED = "#e0d6c4"; // squares and pedestrian areas
const SIDEWALK = "#ece6da"; // drawn on both sides of every road
const SIDEWALK_WIDTH = 3; // metres added to the road width
const MINOR_ROAD = "#9a9ca0";
const MAJOR_ROAD = "#7f8186";
const FOOTWAY = "#c9b48f";
const RAIL = "#6b625a";
const ROAD_WIDTH = {
  motorway: 22,
  trunk: 18,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  residential: 8,
  unclassified: 8,
  living_street: 7,
  road: 7,
  pedestrian: 6,
  service: 5,
  track: 3,
  footway: 2,
  path: 2,
  cycleway: 2,
  steps: 2,
  bridleway: 2,
};
const MAJOR = new Set(["motorway", "trunk", "primary", "secondary"]);
const has = (value, ...values) => values.includes(value);

function areaStyle(t) {
  if (t.natural === "water" || has(t.landuse, "basin", "reservoir") || t.waterway === "riverbank")
    return { order: 5, fill: WATER };
  if (t.leisure === "swimming_pool") return { order: 5, fill: WATER };
  if (t["area:highway"] || t.place === "square" || (t.highway && t.area === "yes"))
    return { order: 6, fill: PAVED };
  if (t.amenity === "parking") return { order: 4, fill: "#b9b8b5" };
  if (has(t.natural, "beach", "sand")) return { order: 4, fill: "#e8d9a6" };
  if (t.leisure === "pitch") return { order: 4, fill: "#6fb553" };
  if (t.landuse === "forest" || t.natural === "wood") return { order: 3, fill: "#5e9a4c" };
  if (
    has(t.landuse, "grass", "meadow", "village_green", "recreation_ground", "cemetery") ||
    has(t.landuse, "allotments", "flowerbed", "orchard", "vineyard", "plant_nursery") ||
    has(t.leisure, "park", "garden", "playground", "golf_course", "dog_park", "common") ||
    has(t.natural, "grassland", "scrub", "heath", "wetland")
  )
    return { order: 3, fill: GREEN };
  if (t.landuse === "farmland") return { order: 2, fill: "#d4cf8a" };
  if (t.landuse === "railway") return { order: 1, fill: "#bfb3a3" };
  if (has(t.landuse, "industrial", "commercial", "retail")) return { order: 0, fill: "#cdc6c0" };
  return null;
}

function lineStyle(t) {
  if (t.tunnel && t.tunnel !== "no") return null; // under the ground
  if (t.covered === "yes" || t.layer < 0) return null;
  if (has(t.waterway, "river", "canal")) return { order: 7, stroke: WATER, width: 20 };
  if (has(t.waterway, "stream", "ditch", "drain")) return { order: 7, stroke: WATER, width: 3 };
  if (has(t.railway, "rail", "light_rail", "narrow_gauge"))
    return { order: 8, stroke: RAIL, width: 3.5 };
  if (t.railway === "tram") return { order: 11, stroke: RAIL, width: 1.2 }; // on the road
  const type = t.highway?.replace("_link", "");
  if (!ROAD_WIDTH[type] || t.area === "yes") return null;
  const width = ROAD_WIDTH[type] * (t.highway.endsWith("_link") ? 0.6 : 1);
  if (width < 4) return { order: 8, stroke: FOOTWAY, width };
  // Sidewalks first under all roads, so junctions stay clean; wider roads on top.
  return [
    { order: 9, stroke: SIDEWALK, width: width + SIDEWALK_WIDTH },
    { order: 10 + width / 100, stroke: MAJOR.has(type) ? MAJOR_ROAD : MINOR_ROAD, width },
  ];
}

// --- Geometry: WGS84 → LV95 (swisstopo's approximate formulas, about 1 m) → SVG metres.
function toSvg({ lat, lon }) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const n =
    1200147.07 +
    308807.95 * p +
    3745.25 * l * l +
    76.63 * p * p -
    194.56 * l * l * p +
    119.79 * p ** 3;
  return `${(e - E_MIN).toFixed(1)} ${(N_MAX - n).toFixed(1)}`;
}
const pathData = (points, close) =>
  "M" + points.filter(Boolean).map(toSvg).join("L") + (close ? "Z" : ""); // nodes outside the query box are null

// Joins a multipolygon's member ways into rings by matching end points.
function rings(lines) {
  const open = lines.map((l) => l.slice());
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  const result = [];
  while (open.length) {
    let ring = open.pop();
    for (let i = 0; i < open.length && !same(ring[0], ring.at(-1)); i++) {
      const l = open[i];
      if (same(ring.at(-1), l[0])) ring = ring.concat(l.slice(1));
      else if (same(ring.at(-1), l.at(-1))) ring = ring.concat(l.slice(0, -1).reverse());
      else continue;
      open.splice(i, 1);
      i = -1; // start over with the longer ring
    }
    result.push(ring);
  }
  return result;
}

const shapes = [];
for (const el of elements) {
  const tags = el.tags ?? {};
  if (el.type === "relation") {
    const style = areaStyle(tags);
    const ways = el.members.filter((m) => m.type === "way" && m.geometry).map((m) => m.geometry);
    if (style && ways.length)
      shapes.push({ ...style, d: rings(ways).map((r) => pathData(r, true)) });
    continue;
  }
  if (!el.geometry) continue;
  const closed = el.nodes[0] === el.nodes.at(-1);
  const area = closed && areaStyle(tags);
  const line = lineStyle(tags);
  if (area) shapes.push({ ...area, d: [pathData(el.geometry, true)] });
  else if (line)
    for (const style of [line].flat()) shapes.push({ ...style, d: [pathData(el.geometry, false)] });
}
shapes.sort((a, b) => a.order - b.order);

// --- Render the whole area at once and cut it into tiles.
const width = Math.round((E_MAX - E_MIN) * PX_PER_M);
const height = Math.round((N_MAX - N_MIN) * PX_PER_M);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="0 0 ${E_MAX - E_MIN} ${N_MAX - N_MIN}">
  <rect width="100%" height="100%" fill="${BACKGROUND}"/>
  ${shapes
    .map((s) =>
      s.fill
        ? `<path fill="${s.fill}" fill-rule="evenodd" d="${s.d.join("")}"/>`
        : `<path fill="none" stroke="${s.stroke}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" d="${s.d.join("")}"/>`,
    )
    .join("\n")}
</svg>`;
console.time("map");
const raster = await sharp(Buffer.from(svg), { limitInputPixels: false }).raw().toBuffer();
await writeTiles(raster, width, height, 4, join(PUBLIC, "ground", "map"));
console.timeEnd("map");
