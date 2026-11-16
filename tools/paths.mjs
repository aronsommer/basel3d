// Paths from OpenStreetMap for what moves in the viewer: `node tools/paths.mjs <kind>` writes
// public/<kind>s.json, listing the paths, and public/<kind>s.bin, their points (Float32 x, y, z
// every STEP metres), for these kinds:
// - tram, train: the route=tram (train) relations, downloaded once into data/osm-<kind>s.json;
// - car: the roads of data/osm.json (tools/osm.mjs), joined into streets by name, in both
//   directions unless one way, each on the right of the way's middle.
// Heights come from the terrain, from the 3D bridges where a deck lies at the vehicle's height
// (OSM does not mark every way on a bridge), run straight across OSM bridges that have no 3D
// model and go underground in tunnels; then they are smoothed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BBOX_WGS84, DATA, PUBLIC, E_MIN, E_MAX, N_MIN, N_MAX, toX, toZ } from "./area.mjs";
import { osmElements, toLV95, onBridge } from "./osm.mjs";
import { bridgeTop, BRIDGES_FILE } from "./bsbridges.mjs";
import { heightAt } from "./heights.mjs";

const osm = await osmElements();

const KIND = process.argv[2];
// Per kind: which OSM ways (railway=… or highway=…), the lane offset to the right of the way's
// middle, the distance between points and the shortest path kept.
const KINDS = {
  tram: { railway: ["tram"], lane: 0, step: 4, shortest: 100 },
  train: { railway: ["rail", "light_rail", "narrow_gauge"], lane: 0, step: 4, shortest: 100 },
  car: {
    highway: ["motorway", "trunk", "primary", "secondary", "tertiary"].flatMap((h) => [
      h,
      `${h}_link`,
    ]),
    lane: 1.8,
    step: 8,
    shortest: 100,
  },
};
const config = KINDS[KIND];
if (!config) throw new Error(`Usage: node tools/paths.mjs ${Object.keys(KINDS).join("|")}`);
const isWay = (tags = {}) =>
  config.railway ? config.railway.includes(tags.railway) : config.highway.includes(tags.highway);
const STEP = config.step; // metres between points
const ON_DECK = 3; // metres: a bridge deck this close to the vehicle's height carries it
const NEAR_BRIDGE = 5; // metres: a track this close to an OSM bridge track is on it (twin tracks)
const TUNNEL_DEPTH = 20; // metres below the terrain in tunnels, so the terrain hides the vehicles
const SMOOTH = 3; // points averaged on each side, against jumps
const ROUTES_FILE = join(DATA, `osm-${KIND}s.json`);

if (config.railway && !existsSync(ROUTES_FILE)) {
  const [w, s, e, n] = BBOX_WGS84.split(",");
  const query = `[out:json][timeout:300][bbox:${s},${w},${n},${e}];relation[route=${KIND}];out geom;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "basel3d-converter" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass: ${res.status}`);
  writeFileSync(ROUTES_FILE, Buffer.from(await res.arrayBuffer()));
}
const routes = config.railway
  ? JSON.parse(readFileSync(ROUTES_FILE, "utf8")).elements.filter(
      (el) => el.type === "relation" && el.tags.ref,
    )
  : streets();

// Roads and paths as routes like the OSM relations: ways of the same name joined where they share
// an end node, oriented along the way of travel, one route per direction (one for one-way ways).
function streets() {
  const ways = osm
    .filter((el) => el.type === "way" && isWay(el.tags) && el.tags.area !== "yes")
    .map((way) => {
      const backwards = way.tags.oneway === "-1";
      return {
        name: way.tags.name ?? way.tags.ref ?? `way ${way.id}`,
        oneway: backwards || way.tags.oneway === "yes" || way.tags.junction === "roundabout",
        nodes: backwards ? way.nodes.toReversed() : way.nodes,
        geometry: backwards ? way.geometry.toReversed() : way.geometry,
        tags: way.tags,
      };
    });
  const byNode = new Map();
  for (const way of ways)
    for (const node of [way.nodes[0], way.nodes.at(-1)])
      byNode.set(node, [...(byNode.get(node) ?? []), way]);
  const used = new Set();
  const out = [];
  for (const first of ways) {
    if (used.has(first)) continue;
    used.add(first);
    const piece = (way, forward) =>
      forward
        ? { geometry: way.geometry, tags: way.tags, start: way.nodes[0], end: way.nodes.at(-1) }
        : {
            geometry: way.geometry.toReversed(),
            tags: way.tags,
            start: way.nodes.at(-1),
            end: way.nodes[0],
          };
    const chain = [piece(first, true)];
    // Extend at the end, then at the start, with unused ways of the same name and one-wayness.
    for (const atEnd of [true, false])
      for (;;) {
        const node = atEnd ? chain.at(-1).end : chain[0].start;
        const next = byNode
          .get(node)
          .find((w) => !used.has(w) && w.name === first.name && w.oneway === first.oneway);
        if (!next) break;
        // Turn the next way to continue the chain; a one-way way only if it already does.
        const forward = atEnd ? next.nodes[0] === node : next.nodes.at(-1) === node;
        if (!forward && next.oneway) break;
        used.add(next);
        if (atEnd) chain.push(piece(next, forward));
        else chain.unshift(piece(next, forward));
      }
    const members = chain.map(({ geometry, tags }) => ({ type: "way", geometry, tags }));
    out.push({ tags: { ref: `${first.name} →`, name: first.name }, members });
    if (!first.oneway)
      out.push({
        tags: { ref: `${first.name} ←`, name: first.name },
        members: members
          .toReversed()
          .map((m) => ({ type: "way", geometry: m.geometry.toReversed(), tags: m.tags })),
      });
  }
  return out;
}

// Each way decides by its own OSM tags whether it is on a bridge or in a tunnel; through a
// building ("building_passage") it stays at street level. Route members come without tags.
const tagsOf = new Map(osm.filter((el) => el.type === "way").map((el) => [el.id, el.tags ?? {}]));
const inTunnel = (tags) => tags.tunnel && !["no", "building_passage"].includes(tags.tunnel);
// OSM railway bridges as scene segments, on a 20 m grid: OSM does not mark every track on a
// bridge, but its twin track beside it, so a track this near one counts as on a bridge too.
const bridgeCells = new Map();
for (const way of osm) {
  if (!config.railway || way.type !== "way" || !isWay(way.tags) || !onBridge(way.tags)) continue;
  const line = way.geometry.filter(Boolean).map((p) => {
    const [e, n] = toLV95(p);
    return { x: toX(e), z: toZ(n) };
  });
  for (let i = 1; i < line.length; i++)
    for (const q of [line[i - 1], line[i]]) {
      const key = `${Math.floor(q.x / 20)} ${Math.floor(q.z / 20)}`;
      bridgeCells.set(key, [...(bridgeCells.get(key) ?? []), [line[i - 1], line[i]]]);
    }
}
function distanceToSegment(p, a, b) {
  const [dx, dz] = [b.x - a.x, b.z - a.z];
  const t = Math.min(
    Math.max(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0),
    1,
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
const near = (cells, p) => {
  const [cx, cz] = [Math.floor(p.x / 20), Math.floor(p.z / 20)];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const [a, b] of cells.get(`${cx + i} ${cz + j}`) ?? [])
        if (distanceToSegment(p, a, b) < NEAR_BRIDGE) return true;
  return false;
};
const top = bridgeTop(new Float32Array(new Uint8Array(readFileSync(BRIDGES_FILE)).buffer));

const meta = [];
const points = [];
for (const route of routes) {
  // The track ways in order, each turned to continue where the previous one ends.
  const ways = route.members.filter(
    (m) => m.type === "way" && !m.role && m.geometry?.some(Boolean),
  );
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  // { x, z, ll: the OSM point, gap: not joined to the point before, bridge, tunnel: of its way }
  const track = [];
  ways.forEach((way, i) => {
    let g = way.geometry.filter(Boolean); // nodes outside the query box are null
    const next = ways[i + 1]?.geometry.filter(Boolean);
    const joinsNext = (end) => next && (same(end, next[0]) || same(end, next.at(-1)));
    const prev = track.at(-1)?.ll;
    if (prev ? !same(prev, g[0]) && same(prev, g.at(-1)) : !joinsNext(g.at(-1)) && joinsNext(g[0]))
      g = g.toReversed();
    const joined = prev && same(prev, g[0]);
    const tags = way.tags ?? tagsOf.get(way.ref) ?? {};
    const [bridge, tunnel] = [onBridge(tags), inTunnel(tags)];
    for (const [k, p] of (joined ? g.slice(1) : g).entries()) {
      const [e, n] = toLV95(p);
      track.push({ x: toX(e), z: toZ(n), ll: p, gap: k === 0 && prev && !joined, bridge, tunnel });
    }
  });
  // Separate paths inside the area, split where the track leaves it or two ways do not join.
  const inside = (p) =>
    p.x >= toX(E_MIN) && p.x <= toX(E_MAX) && p.z >= toZ(N_MAX) && p.z <= toZ(N_MIN);
  let piece = [];
  for (const p of track) {
    if (p.gap || !inside(p)) {
      addPath(piece, route.tags);
      piece = [];
    }
    if (inside(p)) piece.push(p);
  }
  addPath(piece, route.tags);
}

function addPath(way, tags) {
  // Each direction on the right of the way's middle (the right of (fx, fz) is (-fz, fx)).
  const track = way.map((p, i) => {
    const [a, b] = [way[Math.max(i - 1, 0)], way[Math.min(i + 1, way.length - 1)]];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      x: p.x - ((b.z - a.z) / length) * config.lane,
      z: p.z + ((b.x - a.x) / length) * config.lane,
      bridge: p.bridge,
      tunnel: p.tunnel,
    };
  });
  const length = track.reduce(
    (sum, p, i) => sum + (i && Math.hypot(p.x - track[i - 1].x, p.z - track[i - 1].z)),
    0,
  );
  if (length < config.shortest) return; // scraps at the edge of the area, short side ways
  // Points every STEP metres, by the way of the segment (that of its end point): underground in
  // a tunnel, on a bridge deck at about the height so far (not one passed under), otherwise on the
  // terrain, or left open (NaN) on an OSM bridge without a deck.
  const start = points.length / 3;
  let carry = 0; // distance into the current segment of the next point
  for (let i = 1; i < track.length; i++) {
    const [a, b] = [track[i - 1], track[i]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (; carry <= length; carry += STEP) {
      const t = carry / length;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const ground = heightAt(p.x, p.z);
      const deck = top(p);
      const last = points.findLast((v, k) => k % 3 === 1 && k >= start * 3 && !Number.isNaN(v));
      const y = b.tunnel
        ? ground - TUNNEL_DEPTH
        : Math.abs(deck - (last ?? ground)) < ON_DECK
          ? Math.max(deck, ground)
          : b.bridge || near(bridgeCells, p)
            ? NaN
            : ground;
      points.push(p.x, y, p.z);
    }
    carry -= length;
  }
  // Open stretches run straight between the heights before and after them.
  for (let i = start; i < points.length / 3; i++) {
    if (!Number.isNaN(points[3 * i + 1])) continue;
    let j = i;
    while (j < points.length / 3 && Number.isNaN(points[3 * j + 1])) j++;
    const before = i > start ? points[3 * (i - 1) + 1] : points[3 * j + 1];
    const after = j < points.length / 3 ? points[3 * j + 1] : before;
    for (let k = i; k < j; k++)
      points[3 * k + 1] = before + ((after - before) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const ys = [];
  for (let i = start; i < points.length / 3; i++) ys.push(points[3 * i + 1]);
  ys.forEach((_, i) => {
    const window = ys.slice(Math.max(0, i - SMOOTH), i + SMOOTH + 1);
    points[3 * (start + i) + 1] = window.reduce((sum, y) => sum + y, 0) / window.length;
  });
  const count = points.length / 3 - start;
  meta.push({
    ref: tags.ref,
    name: tags.name,
    operator: tags.operator,
    colour: tags.colour,
    start,
    count,
  });
}
// Per line, drop variants whose track a longer variant in the same direction mostly covers
// already, so vehicles do not run on top of each other.
const NEAR = 6; // metres between points on the same track
const COVERED = 0.7; // share of a variant's points that makes it a duplicate
const sorted = meta.toSorted((a, b) => b.count - a.count);
const kept = [];
const cells = new Map(); // "ref cx cz" -> [x, z, dx, dz] of kept points
const point = (i) => [points[3 * i], points[3 * i + 2]];
for (const path of sorted) {
  const own = [];
  let covered = 0;
  for (let i = path.start; i < path.start + path.count; i++) {
    const [x, z] = point(i);
    const [nx, nz] = point(Math.min(i + 1, path.start + path.count - 1));
    const [px, pz] = point(Math.max(i - 1, path.start));
    const [dx, dz] = [nx - px, nz - pz];
    const [cx, cz] = [Math.floor(x / NEAR), Math.floor(z / NEAR)];
    own.push([`${path.ref} ${cx} ${cz}`, [x, z, dx, dz]]);
    const near = [-1, 0, 1].some((i) =>
      [-1, 0, 1].some((j) =>
        (cells.get(`${path.ref} ${cx + i} ${cz + j}`) ?? []).some(
          ([qx, qz, qdx, qdz]) => Math.hypot(qx - x, qz - z) < NEAR && qdx * dx + qdz * dz > 0, // same direction
        ),
      ),
    );
    if (near) covered++;
  }
  if (covered / path.count >= COVERED) continue;
  kept.push(path);
  for (const [key, value] of own) cells.set(key, [...(cells.get(key) ?? []), value]);
}
const out = [];
const routesOut = kept.map(({ start, count, ...path }) => {
  const at = out.length / 3;
  out.push(...points.slice(3 * start, 3 * (start + count)));
  return { ...path, start: at, count };
});
console.log(
  `${routes.length} routes, ${routesOut.length} paths kept, ${(((out.length / 3) * STEP) / 1000).toFixed(0)} km`,
);
writeFileSync(join(PUBLIC, `${KIND}s.json`), JSON.stringify({ step: STEP, routes: routesOut }));
writeFileSync(
  join(PUBLIC, `${KIND}s.bin`),
  new Float32Array(out.map((v) => Math.round(v * 10) / 10)),
);
