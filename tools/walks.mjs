// Where the pedestrians walk (src/walkers.js): `node tools/walks.mjs` writes public/walks.bin,
// closed loops in BOX from the streets of data/osm.json (tools/osm.mjs), traced through a grid of
// GRID metres (marching squares), so they never cross themselves or a street:
// - around each block, along the middle of its sidewalks: where the distance to the nearest
//   street is half its width plus half a sidewalk, as the map draws them (tools/map.mjs), on a
//   bridge INSET less, so they stay on its deck;
// - along footways, paths (not sidewalks or crossings, which the loops above cover), pedestrian
//   streets and squares on the ground or a bridge, AISLE metres either side of their middle, but not into the streets'
//   sidewalks; those mostly along pedestrian streets and squares are busy.
// No aisle reaches into water (OSM water areas but bridges) or beside the passage under the
// Mittlere Brücke (src/passage.js); lines running off the grid (MARGIN
// beyond BOX) and loops enclosing less than SMALLEST or more than WETTEST of them on water are left
// out. Each is simplified to within SIMPLIFY metres, left out if it then crosses itself, and
// written as a Uint16 count of points (plus BUSY for a busy one) and the points as Uint16 pairs
// (east, south) in 1/TREE_GRID m from the area's north-west corner; the last point leads back to
// the first.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { E_MIN, N_MAX, PUBLIC, TREE_GRID } from "./area.mjs";
import { onBridge, osmElements, roadWidth, SIDEWALK_WIDTH, toLV95 } from "./osm.mjs";
import { PASSAGE } from "../src/passage.js";
import { inPassage, passageEnds, passageLength, passageLocal } from "./passage.mjs";

// The inner city in LV95: Grossbasel, Kleinbasel up to the Messe, the Bahnhof SBB.
const BOX = { e0: 2610200, e1: 2612600, n0: 1266400, n1: 1268800 };
const MARGIN = 200; // metres
const GRID = 2; // metres
const AISLE = 1.5; // metres
const INSET = 2; // metres
const SMALLEST = 50; // m²
const SIMPLIFY = 0.5; // metres
const WETTEST = 0.02; // share of a loop on water at most
const BUSY = 0x8000;
const STREETS = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
].flatMap((h) => [h, `${h}_link`]);
const BIN = 25; // metres per bin of the segments, to find the near ones

// The segments of the streets, the pedestrian streets and the other ways, each [a, b, offset],
// binned.
const [streets, pedestrian, ways] = [new Map(), new Map(), new Map()];
const bridges = new Map(); // all on bridges, as far out as their sidewalks or aisles reach
function binsOf({ highway, footway }) {
  if (STREETS.includes(highway)) return streets;
  if (highway === "pedestrian") return pedestrian;
  if (["footway", "path"].includes(highway) && !["sidewalk", "crossing"].includes(footway))
    return ways;
}
function bin(bins, a, b, offset) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / BIN) + 1;
  const keys = new Set();
  for (let s = 0; s <= steps; s++) {
    const [e, n] = [a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps];
    keys.add(`${Math.floor(e / BIN)},${Math.floor(n / BIN)}`);
  }
  for (const key of keys) (bins.get(key) ?? bins.set(key, []).get(key)).push([a, b, offset]);
}
const osm = await osmElements();
for (const way of osm) {
  const { type, tags = {}, geometry } = way;
  // The passage under the Mittlere Brücke is a street along its middle, its sidewalks a metre
  // inside its walls.
  const open = inPassage(way);
  if (type !== "way" || (tags.tunnel && tags.tunnel !== "no" && !open)) continue;
  const bins = open ? streets : binsOf(tags);
  if (!bins) continue;
  // Footways and squares off the ground (on another layer but a bridge's, or covered) have none in
  // the model to walk on.
  const off = tags.covered === "yes" || (Number(tags.layer ?? 0) !== 0 && !onBridge(tags));
  if (bins !== streets && off) continue;
  const offset = open
    ? PASSAGE.width / 2 - 1
    : bins === streets
      ? roadWidth(tags.highway) / 2 + SIDEWALK_WIDTH / 2 - (onBridge(tags) ? INSET : 0)
      : AISLE;
  const points = (open ? passageEnds : geometry).map((p) => p && toLV95(p));
  for (let i = 1; i < points.length; i++) {
    if (!points[i - 1] || !points[i]) continue;
    bin(bins, points[i - 1], points[i], offset);
    if (onBridge(tags)) bin(bridges, points[i - 1], points[i], offset + SIDEWALK_WIDTH / 2);
  }
}
// The least distance from a point to the segments near it, less their offsets (Infinity if none).
const REACH = 1; // bins around, enough for the widest offset
function nearest(bins, e, n) {
  const [be, bn] = [Math.floor(e / BIN), Math.floor(n / BIN)];
  let near = Infinity;
  for (let i = be - REACH; i <= be + REACH; i++)
    for (let j = bn - REACH; j <= bn + REACH; j++)
      for (const [[ae, an], [ce, cn], offset] of bins.get(`${i},${j}`) ?? []) {
        const [de, dn] = [ce - ae, cn - an];
        const t = Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / (de * de + dn * dn)));
        near = Math.min(near, Math.hypot(e - ae - t * de, n - an - t * dn) - offset);
      }
  return near;
}

const [e0, n0] = [BOX.e0 - MARGIN, BOX.n0 - MARGIN];
const w = Math.ceil((BOX.e1 - BOX.e0 + 2 * MARGIN) / GRID) + 1;
const h = Math.ceil((BOX.n1 - BOX.n0 + 2 * MARGIN) / GRID) + 1;
// Per grid point, whether it is on water (OSM water areas, each filled even-odd by rows) and not
// on a bridge.
const wet = new Uint8Array(w * h);
for (const { type, tags = {}, geometry, members } of osm) {
  if (tags.natural !== "water" && tags.waterway !== "riverbank") continue;
  const lines = type === "relation" ? members.map((m) => m.geometry ?? []) : [geometry ?? []];
  const rows = new Map(); // row → where the rings cross it, in grid steps east
  for (const line of lines) {
    const points = line.filter(Boolean).map(toLV95);
    for (let k = 1; k < points.length; k++) {
      const [[ae, an], [be, bn]] = [points[k - 1], points[k]];
      const [ja, jb] = [(an - n0) / GRID, (bn - n0) / GRID];
      for (let j = Math.max(0, Math.ceil(Math.min(ja, jb))); j < Math.min(h, Math.max(ja, jb)); j++)
        (rows.get(j) ?? rows.set(j, []).get(j)).push(
          (ae + ((j - ja) / (jb - ja)) * (be - ae) - e0) / GRID,
        );
    }
  }
  for (const [j, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil(xs[k - 1])); i <= Math.min(w - 1, xs[k]); i++)
        wet[j * w + i] = 1;
  }
}
// Beside the passage under the Mittlere Brücke (src/passage.js), towards the Rhine, as water: below
// the bridge only the passage is walked there.
for (let j = 0; j < h; j++)
  for (let i = 0; i < w; i++) {
    const [t, river] = passageLocal(e0 + i * GRID, n0 + j * GRID);
    if (t >= 0 && t <= passageLength && river > PASSAGE.width / 2 && river <= PASSAGE.reach)
      wet[j * w + i] = 1;
  }
for (let j = 0; j < h; j++)
  for (let i = 0; i < w; i++)
    if (wet[j * w + i] && nearest(bridges, e0 + i * GRID, n0 + j * GRID) < 0) wet[j * w + i] = 0;

// The grid: per point how far it is off the streets' sidewalk middles (positive in the blocks) and
// how far inside an aisle on land (positive there, but only in the blocks).
const blocks = new Float32Array(w * h);
const aisle = new Float32Array(w * h);
for (let j = 0; j < h; j++)
  for (let i = 0; i < w; i++) {
    const [e, n] = [e0 + i * GRID, n0 + j * GRID];
    const off = Math.min(nearest(streets, e, n), BIN);
    blocks[j * w + i] = off;
    const inside = -Math.min(nearest(pedestrian, e, n), nearest(ways, e, n));
    aisle[j * w + i] = wet[j * w + i] ? -1 : Math.min(inside, off);
  }

// The loops where a field is 0, anticlockwise around where it is positive: in each cell, from
// where it is left to where it is entered next, anticlockwise, so saddles part. Lines running off
// the grid are left out.
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
function contours(field) {
  const value = (i, j) => field[j * w + i];
  // The key and point of the cell's edge from corner k to k + 1.
  const edge = (i, j, k) => {
    const [[ai, aj], [bi, bj]] = [CORNERS[k], CORNERS[(k + 1) % 4]];
    const [si, sj] = [i + Math.min(ai, bi), j + Math.min(aj, bj)];
    const [di, dj] = [+(ai !== bi), +(aj !== bj)];
    const [a, b] = [value(si, sj), value(si + di, sj + dj)];
    const t = a / (a - b);
    return { key: `${si},${sj},${di}`, at: [e0 + (si + t * di) * GRID, n0 + (sj + t * dj) * GRID] };
  };
  const after = new Map(); // edge key → the next one's along the loop
  const points = new Map(); // edge key → point
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const inside = CORNERS.map(([di, dj]) => value(i + di, j + dj) > 0);
      for (let k = 0; k < 4; k++) {
        if (!inside[k] || inside[(k + 1) % 4]) continue; // not left here
        let m = (k + 1) % 4;
        while (inside[m] || !inside[(m + 1) % 4]) m = (m + 1) % 4; // entered here
        const [out, back] = [edge(i, j, k), edge(i, j, m)];
        after.set(out.key, back.key);
        points.set(out.key, out.at).set(back.key, back.at);
      }
    }
  const loops = [];
  for (const start of after.keys()) {
    if (!points.has(start)) continue;
    const loop = [];
    let key = start;
    do {
      loop.push(points.get(key));
      points.delete(key);
      key = after.get(key);
    } while (points.has(key));
    if (key === start) loops.push(loop); // else a piece of a line running off the grid
  }
  return loops;
}

const area = (points) =>
  points.reduce((sum, [e, n], i) => {
    const [pe, pn] = points.at(i - 1);
    return sum + (pe * n - e * pn) / 2;
  }, 0);
// Douglas–Peucker; a closed line keeps at least its point furthest from the start.
function simplified(points) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let [far, at] = [0, 0];
  for (let i = 1; i < points.length - 1; i++) {
    const [e, n] = points[i];
    const d = length
      ? Math.abs((b[0] - a[0]) * (a[1] - n) - (a[0] - e) * (b[1] - a[1])) / length
      : Math.hypot(e - a[0], n - a[1]);
    if (d > far) [far, at] = [d, i];
  }
  if (far <= SIMPLIFY) return [a, b];
  return [...simplified(points.slice(0, at + 1)).slice(0, -1), ...simplified(points.slice(at))];
}
// Whether a closed line crosses itself.
const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
const crosses = (a, b, c, d) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
const tangled = (points) =>
  points.some((a, i) =>
    points.some(
      (c, j) =>
        j > i + 1 &&
        (j + 1) % points.length !== i &&
        crosses(a, points[i + 1], c, points[(j + 1) % points.length]),
    ),
  );
// A loop as written: in steps of the area's grid, without repeated points; at least three.
function written(points, busy) {
  const steps = simplified([...points, points[0]])
    .slice(0, -1)
    .map(([e, n]) => [Math.round((e - E_MIN) * TREE_GRID), Math.round((N_MAX - n) * TREE_GRID)])
    .filter(([x, z], i, all) => x !== all.at(i - 1)[0] || z !== all.at(i - 1)[1]);
  if (steps.length < 3 || tangled(steps)) return [];
  return [steps.length + (busy ? BUSY : 0), ...steps.flat()];
}
// Its share of points on water (sidewalks of streets along a bank), checked at the grid point
// nearest each.
const onWater = (points) =>
  points.filter(([e, n]) => wet[Math.round((n - n0) / GRID) * w + Math.round((e - e0) / GRID)])
    .length / points.length;
const kept = (loops) =>
  loops.filter((points) => Math.abs(area(points)) > SMALLEST && onWater(points) < WETTEST);
// Busy: most of its points nearer pedestrian streets than other ways.
const busy = (points) =>
  points.filter(([e, n]) => nearest(pedestrian, e, n) < nearest(ways, e, n)).length >
  points.length / 2;
// At the passage under the Mittlere Brücke only its corridors are walked (src/passage.js): below,
// the passage; above, the bridge's sidewalks, CORRIDOR metres either side. A loop is cut where it
// leaves them there or goes from one level to the other where they cross, each piece walked
// there and back.
const CORRIDOR = 1.5;
const corridors = PASSAGE.sidewalks.map((line) => line.map(([lat, lon]) => toLV95({ lat, lon })));
// A point's place: "" outside, "below", "above", "both" where they cross, or null elsewhere.
function place([e, n]) {
  const [t, river] = passageLocal(e, n);
  if (t < 0 || t > passageLength || river < -PASSAGE.street || river > PASSAGE.reach) return "";
  const below = Math.abs(river) <= PASSAGE.width / 2;
  const above = corridors.some(([[ae, an], [be, bn]]) => {
    const [de, dn] = [be - ae, bn - an];
    const f = Math.min(Math.max(((e - ae) * de + (n - an) * dn) / (de * de + dn * dn), 0), 1);
    return Math.hypot(ae + f * de - e, an + f * dn - n) <= CORRIDOR;
  });
  return below && above ? "both" : below ? "below" : above ? "above" : null;
}
function cut(points) {
  const dense = points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / GRID);
    return Array.from({ length: steps }, (_, k) => [
      a[0] + ((b[0] - a[0]) * k) / steps,
      a[1] + ((b[1] - a[1]) * k) / steps,
    ]);
  });
  const places = dense.map(place);
  const start = places.indexOf(null);
  if (start < 0 && !(places.includes("below") && places.includes("above"))) return [points];
  const pieces = [[]];
  let level = ""; // of the piece, once known
  for (let k = 1; k <= dense.length; k++) {
    const i = (start + k) % dense.length; // from a cut, if any
    const at = places[i];
    if (at === null || (level && at !== "both" && at && at !== level)) {
      if (pieces.at(-1).length) pieces.push([]);
      level = at === null ? "" : at;
      if (at === null) continue;
    }
    if (at === "") level = "";
    else if (at !== "both") level = at;
    pieces.at(-1).push(dense[i]);
  }
  return pieces
    .filter((piece) => piece.length > 2)
    .map((piece) => [...piece, ...piece.slice(1, -1).reverse()]);
}
const [sidewalks, aisles] = [kept(contours(blocks)), kept(contours(aisle))].map((loops) =>
  loops.flatMap(cut),
);
const data = [
  ...sidewalks.flatMap((points) => written(points, false)),
  ...aisles.flatMap((points) => written(points, busy(points))),
];
writeFileSync(join(PUBLIC, "walks.bin"), new Uint16Array(data));
console.log(`${sidewalks.length} + ${aisles.length} loops, ${data.length * 2} bytes`);
