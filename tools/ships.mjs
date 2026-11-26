// A round course for ships on the Rhine, written to public/ships.bin (Float32 x, y, z every STEP
// metres): downstream on the right of the river's centre line, a turn at the north edge of the
// area, upstream on the other side and a turn below the Birsfelden power station. Where a lane
// would hit a bridge pier (low parts of the 3D bridges, data/bridges.bin) or the sea monster, it
// moves aside to the nearest free passage wide enough for a ship.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { N_MAX, PUBLIC, toX, toZ } from "./area.mjs";
import { osmElements, toLV95 } from "./osm.mjs";
import { BRIDGES_FILE } from "./bsbridges.mjs";
import { heightAt } from "./heights.mjs";
import { fromWGS84, toWGS84 } from "../src/geo.js";
import PLACEMENTS from "../src/placement-data.js";

const STEP = 5; // metres between points
const LANE = 25; // metres from the centre line
const REACH = 60; // metres the lanes may move from the centre line
const CLEAR = 10; // metres free around a ship's middle (half its width of 5 m plus a margin)
const SMOOTH = 16; // points averaged on each side, so the lanes swing gently around piers
const PIER = 4; // metres: bridge parts this low above the water are obstacles
const CELL = 2; // metres of the obstacle grid
const TURN_EAST = toX(2613850); // turn before the power station (E 2614070)
// The sea serpent (A3), where src/placement-data.js puts it; about 23 m round at the water.
const SERPENT = { x: 1717, z: 68 };
const moved = PLACEMENTS.find(
  ({ figure, from, to }) =>
    figure === "A3" &&
    to &&
    `${from}` === `${toWGS84(SERPENT.x, SERPENT.z).map((v) => +v.toFixed(6))}`,
)?.to;
const [mx, mz] = moved ? fromWGS84(moved[0], moved[1]) : [SERPENT.x, SERPENT.z];
const MONSTER = { x: mx, z: mz, radius: 30 };

// --- The Rhine's centre line downstream (OSM ways point downstream), from below the power
// station to the north edge of the area.
const ways = (await osmElements())
  .filter((el) => el.tags?.waterway === "river" && (el.tags["name:de"] ?? el.tags.name) === "Rhein")
  .map((way) => way.geometry.filter(Boolean).map(toLV95));
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
let line = ways.find((w) => !ways.some((o) => same(o[0], w.at(-1)))); // the last way
for (let prev; (prev = ways.find((w) => same(w.at(-1), line[0])));)
  line = prev.concat(line.slice(1));
const centre = line
  .map(([e, n]) => ({ x: toX(e), z: toZ(n) }))
  .filter((p) => p.x <= TURN_EAST && p.z >= toZ(N_MAX));

// Points every STEP metres with the direction downstream and the side to its right.
const path = [];
for (let i = 1, carry = 0; i < centre.length; i++) {
  const [a, b] = [centre[i - 1], centre[i]];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  for (; carry <= length; carry += STEP) {
    const t = carry / length;
    const [fx, fz] = [(b.x - a.x) / length, (b.z - a.z) / length];
    path.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, rx: -fz, rz: fx });
  }
  carry -= length;
}

// --- Obstacles on a CELL grid: bridge triangles reaching down near the water (piers, arches),
// rasterised along their edges, and the monster.
const blocked = new Set();
const mark = (x, z) => blocked.add(`${Math.floor(x / CELL)} ${Math.floor(z / CELL)}`);
const tri = new Float32Array(new Uint8Array(readFileSync(BRIDGES_FILE)).buffer);
for (let t = 0; t < tri.length; t += 9) {
  const v = [0, 3, 6].map((o) => [tri[t + o], tri[t + o + 1], tri[t + o + 2]]);
  const water = heightAt((v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3);
  if (Math.min(...v.map(([, y]) => y)) > water + PIER) continue;
  for (const [a, b] of [
    [v[0], v[1]],
    [v[1], v[2]],
    [v[2], v[0]],
  ]) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]));
    for (let k = 0; k <= steps; k++)
      mark(a[0] + ((b[0] - a[0]) * k) / steps, a[2] + ((b[2] - a[2]) * k) / steps);
  }
}
for (let x = -MONSTER.radius; x <= MONSTER.radius; x += CELL)
  for (let z = -MONSTER.radius; z <= MONSTER.radius; z += CELL)
    if (Math.hypot(x, z) <= MONSTER.radius) mark(MONSTER.x + x, MONSTER.z + z);
// Whether the circle of CLEAR around the point offset beside p is free. With such circles every
// STEP along a lane, the whole strip a ship sweeps is free.
const free = (p, offset) => {
  const [x, z] = [p.x + p.rx * offset, p.z + p.rz * offset];
  for (let dx = -CLEAR; dx <= CLEAR; dx += CELL / 2)
    for (let dz = -CLEAR; dz <= CLEAR; dz += CELL / 2)
      if (
        Math.hypot(dx, dz) <= CLEAR &&
        blocked.has(`${Math.floor((x + dx) / CELL)} ${Math.floor((z + dz) / CELL)}`)
      )
        return false;
  return true;
};

// --- A lane: per point the free offset nearest to the wanted one, then smoothed; points the
// smoothing pushes back onto an obstacle keep their own free offset, three rounds.
function lane(wanted) {
  const nearest = (p) => {
    for (let d = 0; d <= 2 * REACH; d += 1)
      for (const o of [wanted + d, wanted - d]) if (Math.abs(o) <= REACH && free(p, o)) return o;
    throw new Error(`No free passage near ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
  };
  const own = path.map(nearest);
  let offsets = own;
  for (let round = 0; round < 3; round++) {
    offsets = offsets.map((_, i) => {
      const w = offsets.slice(Math.max(0, i - SMOOTH), i + SMOOTH + 1);
      const smooth = w.reduce((sum, o) => sum + o, 0) / w.length;
      return free(path[i], smooth) ? smooth : own[i];
    });
  }
  // The water height from the centre line: near a bank the terrain may already rise.
  return path.map((p, i) => ({
    x: p.x + p.rx * offsets[i],
    y: heightAt(p.x, p.z),
    z: p.z + p.rz * offsets[i],
  }));
}
const down = lane(LANE); // on the right going downstream
const up = lane(-LANE).toReversed(); // on the right going upstream

// A half circle from the end of one lane to the start of the other, bulging away from the river.
function turn(from, to, away) {
  const [cx, cz] = [(from.x + to.x) / 2, (from.z + to.z) / 2];
  const radius = Math.hypot(to.x - from.x, to.z - from.z) / 2;
  const [ux, uz] = [(from.x - cx) / radius, (from.z - cz) / radius];
  const points = [];
  for (let a = STEP / radius; a < Math.PI; a += STEP / radius) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    points.push({
      x: cx + radius * (ux * c + away.x * s),
      y: from.y,
      z: cz + radius * (uz * c + away.z * s),
    });
  }
  return points;
}
const [first, last] = [path[0], path.at(-1)];
const forward = (p, q) => {
  const length = Math.hypot(q.x - p.x, q.z - p.z);
  return { x: (q.x - p.x) / length, z: (q.z - p.z) / length };
};
const course = [
  ...down,
  ...turn(down.at(-1), up[0], forward(path.at(-2), last)), // beyond the north edge
  ...up,
  ...turn(up.at(-1), down[0], forward(path[1], first)), // upstream, before the power station
];
const out = course.flatMap(({ x, y, z }) => [x, y, z].map((v) => Math.round(v * 10) / 10));
writeFileSync(join(PUBLIC, "ships.bin"), new Float32Array(out));
console.log(
  `Round course of ${((course.length * STEP) / 1000).toFixed(1)} km, ${course.length} points`,
);
