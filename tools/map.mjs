// Draws a map of the area from OpenStreetMap (roads, rail, water, green areas; no text, buildings
// or trees) and writes it to public/ground/map/ as one KTX2 per 1 km tile, like the aerial photo.
// Also writes public/water.ktx2 for the water shader in src/main.js: red marks all visible water,
// green and blue the downstream direction.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { E_MIN, E_MAX, N_MIN, N_MAX, PUBLIC, toX, toZ } from "./area.mjs";
import { osmElements, toLV95, roadWidth, SIDEWALK_WIDTH, onBridge } from "./osm.mjs";
import { underBridges, BRIDGES_FILE } from "./bsbridges.mjs";
import { writeTiles, encodeTexture } from "./tiles.mjs";

const PX_PER_M = 1.024; // 1024 px per 1 km tile
const MASK_SIZE = 2048; // px of the water mask for the whole area (about 4 m per px)
const BACKGROUND = "#b8b0a2"; // built-up land, dark enough for the light roads
const elements = await osmElements();
// Bridges built in 3D (tools/bridges.mjs, run it first): hide the OSM bridges whose middle lies
// under one of them.
const underBridge = underBridges(
  new Float32Array(new Uint8Array(readFileSync(BRIDGES_FILE)).buffer),
);
function hiddenBridge(way) {
  if (!onBridge(way.tags ?? {})) return false;
  const points = way.geometry.filter(Boolean);
  const [a, b] = [points[(points.length - 1) >> 1], points[points.length >> 1]].map(toLV95);
  return underBridge({ x: toX((a[0] + b[0]) / 2), z: toZ((a[1] + b[1]) / 2) });
}

// --- Style: what to draw, in which colour, how wide (metres) and in which order.
const GREEN = "#5f8f45"; // greens about as dark as in the aerial photo
const WATER = "#4f8fc6";
const PAVED = "#d2c8b6"; // squares and pedestrian areas
const SIDEWALK = "#d6d0c4"; // drawn on both sides of every road, a little darker than it
const MINOR_ROAD = "#eceae4";
const MAJOR_ROAD = "#f5d77e";
const FOOTWAY = "#e2cfa6";
const RAIL = "#5a524a";
const MAJOR = new Set(["motorway", "trunk", "primary", "secondary"]);
const has = (value, ...values) => values.includes(value);

function areaStyle(t) {
  if (t.natural === "water" || has(t.landuse, "basin", "reservoir") || t.waterway === "riverbank")
    return { order: 5, fill: WATER };
  if (t.leisure === "swimming_pool") return { order: 5, fill: WATER };
  if (t["area:highway"] || t.place === "square" || (t.highway && t.area === "yes"))
    return { order: 6, fill: PAVED };
  if (t.amenity === "parking") return { order: 4, fill: "#a8a6a2" };
  if (has(t.natural, "beach", "sand")) return { order: 4, fill: "#e8d9a6" };
  if (t.leisure === "pitch") return { order: 4, fill: "#5a9a42" };
  if (t.landuse === "forest" || t.natural === "wood") return { order: 3, fill: "#3f6b35" };
  if (
    has(t.landuse, "grass", "meadow", "village_green", "recreation_ground", "cemetery") ||
    has(t.landuse, "allotments", "flowerbed", "orchard", "vineyard", "plant_nursery") ||
    has(t.leisure, "park", "garden", "playground", "golf_course", "dog_park", "common") ||
    has(t.natural, "grassland", "scrub", "heath", "wetland")
  )
    return { order: 3, fill: GREEN };
  if (t.landuse === "farmland") return { order: 2, fill: "#a9a66a" };
  if (t.landuse === "railway") return { order: 1, fill: "#a99d8d" };
  if (has(t.landuse, "industrial", "commercial", "retail")) return { order: 0, fill: "#b0aaa4" };
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
  const width = roadWidth(t.highway);
  if (!width || t.area === "yes") return null;
  if (width < 4) return { order: 8, stroke: FOOTWAY, width };
  // Sidewalks first under all roads, so junctions stay clean; wider roads on top.
  return [
    { order: 9, stroke: SIDEWALK, width: width + SIDEWALK_WIDTH },
    {
      order: 10 + width / 100,
      stroke: MAJOR.has(t.highway.replace("_link", "")) ? MAJOR_ROAD : MINOR_ROAD,
      width,
    },
  ];
}

// --- Geometry: WGS84 → LV95 → SVG metres from the north-west corner.
function toSvg(point) {
  const [e, n] = toLV95(point);
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
  if (!el.geometry || hiddenBridge(el)) continue;
  const closed = el.nodes[0] === el.nodes.at(-1);
  const area = closed && areaStyle(tags);
  const line = lineStyle(tags);
  if (area) shapes.push({ ...area, d: [pathData(el.geometry, true)] });
  else if (line)
    for (const style of [line].flat()) shapes.push({ ...style, d: [pathData(el.geometry, false)] });
}
shapes.sort((a, b) => a.order - b.order);

// --- Render the whole area at once and cut it into tiles.
const svg = (size, background, paint) => `<svg xmlns="http://www.w3.org/2000/svg"
  width="${size[0]}" height="${size[1]}" viewBox="0 0 ${E_MAX - E_MIN} ${N_MAX - N_MIN}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${shapes
    .map((s) =>
      s.fill
        ? `<path fill="${paint(s.fill)}" fill-rule="evenodd" d="${s.d.join("")}"/>`
        : `<path fill="none" stroke="${paint(s.stroke)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" d="${s.d.join("")}"/>`,
    )
    .join("\n")}
</svg>`;
const render = (svgText) => sharp(Buffer.from(svgText), { limitInputPixels: false });
console.time("map");
const width = Math.round((E_MAX - E_MIN) * PX_PER_M);
const height = Math.round((N_MAX - N_MIN) * PX_PER_M);
const raster = await render(svg([width, height], BACKGROUND, (c) => c))
  .raw()
  .toBuffer();
await writeTiles(raster, width, height, 4, join(PUBLIC, "ground", "map"));

// Water white, everything else black, in the same order, so roads drawn over water stay dry.
const mask = svg([MASK_SIZE, MASK_SIZE], "#000", (c) => (c === WATER ? "#fff" : "#000"));
const maskData = await render(mask).ensureAlpha().raw().toBuffer();

// Flow: OSM rivers and streams point downstream. Each segment is drawn wide in a colour for its
// direction (green = east, blue = south, 128 = none), rivers over streams, then blurred so bends
// and junctions turn smoothly.
const FLOW_WIDTH = { stream: 60, ditch: 60, drain: 60, river: 400, canal: 400 }; // metres
const segments = elements
  .filter((el) => el.type === "way" && FLOW_WIDTH[el.tags?.waterway])
  .sort((a, b) => FLOW_WIDTH[a.tags.waterway] - FLOW_WIDTH[b.tags.waterway])
  .flatMap((way) => {
    const points = way.geometry.filter(Boolean).map((p) => {
      const [e, n] = toLV95(p);
      return [e - E_MIN, N_MAX - n];
    });
    return points.slice(1).map(([bx, by], i) => {
      const [ax, ay] = points[i];
      const length = Math.hypot(bx - ax, by - ay) || 1;
      const green = Math.round(128 + (127 * (bx - ax)) / length);
      const blue = Math.round(128 + (127 * (by - ay)) / length);
      return `<path stroke="rgb(0,${green},${blue})" stroke-width="${FLOW_WIDTH[way.tags.waterway]}" stroke-linecap="round" d="M${ax} ${ay}L${bx} ${by}"/>`;
    });
  });
const flowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASK_SIZE}" height="${MASK_SIZE}"
  viewBox="0 0 ${E_MAX - E_MIN} ${N_MAX - N_MIN}"><rect width="100%" height="100%"
  fill="rgb(0,128,128)"/>${segments.join("")}</svg>`;
const flow = await render(flowSvg).removeAlpha().blur(6).raw().toBuffer();
for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
  maskData[4 * i + 1] = flow[3 * i + 1];
  maskData[4 * i + 2] = flow[3 * i + 2];
}
writeFileSync(join(PUBLIC, "water.ktx2"), await encodeTexture(maskData, MASK_SIZE));
console.timeEnd("map");
