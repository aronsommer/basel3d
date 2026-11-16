// Shared OpenStreetMap helpers: the download (once, via the Overpass API into data/osm.json),
// WGS84 → LV95, the widths of roads and the courses of the Rhine and the Birs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BBOX_WGS84, DATA, toX, toZ } from "./area.mjs";

const OSM_FILE = join(DATA, "osm.json");

// Ways and multipolygons with geometry; nodes outside the query box are null.
export async function osmElements() {
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
  return JSON.parse(readFileSync(OSM_FILE, "utf8")).elements;
}

// WGS84 → LV95 [E, N] with swisstopo's approximate formulas (about 1 m).
export function toLV95({ lat, lon }) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  return [
    2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    1200147.07 +
      308807.95 * p +
      3745.25 * l * l +
      76.63 * p * p -
      194.56 * l * l * p +
      119.79 * p ** 3,
  ];
}

// Carriageway width in metres per highway type; links are narrower.
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
export const roadWidth = (highway = "") =>
  ROAD_WIDTH[highway.replace("_link", "")] * (highway.endsWith("_link") ? 0.6 : 1) || 0;
export const SIDEWALK_WIDTH = 3; // metres added to roads at least 4 m wide

export const onBridge = (tags) => Boolean(tags.bridge) && tags.bridge !== "no";

// --- Rivers whose crossings swissTLM3D fills in where Basel-Stadt has no bridge model.
const RIVERS = new Set(["Rhein", "Birs"]);
export const riverLines = (elements) =>
  elements
    .filter((el) => el.tags?.waterway === "river" && RIVERS.has(el.tags["name:de"] ?? el.tags.name))
    .map((way) =>
      way.geometry.filter(Boolean).map((p) => {
        const [e, n] = toLV95(p);
        return { x: toX(e), z: toZ(n) };
      }),
    );

// Whether a polyline crosses any of the given polylines (all { x, z }).
const ccw = (a, b, c) => (c.z - a.z) * (b.x - a.x) > (b.z - a.z) * (c.x - a.x);
const segmentsCross = (a, b, c, d) =>
  ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
export const crossesAny = (points, lines) =>
  points.some(
    (p, i) =>
      i > 0 &&
      lines.some((l) => l.some((q, j) => j > 0 && segmentsCross(points[i - 1], p, l[j - 1], q))),
  );
