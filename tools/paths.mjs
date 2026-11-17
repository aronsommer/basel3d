// Closed loops from OpenStreetMap for what moves in the viewer: `node tools/paths.mjs <kind>`
// writes public/<kind>s.json, listing the loops (start, count of points, length, for round trips
// their share of the roads, for lines where each line runs), and public/<kind>s.bin, their points
// (Float32 x, y, z about STEP metres apart), for these kinds:
// - tram, train: the lines of the route=tram (train) relations, downloaded once into
//   data/osm-<kind>s.json, there and back;
// - car: round trips through the roads of data/osm.json (tools/osm.mjs), on the right of the
//   way's middle.
// Vehicles follow the network of the OSM ways and never turn back on it. Heights come from the terrain,
// from the 3D bridges where a deck lies at the vehicle's height (OSM does not mark every way on a
// bridge), run straight across OSM bridges that have no 3D model and go underground in tunnels of
// at least SHORT_TUNNEL; then they are smoothed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BBOX_WGS84, DATA, PUBLIC, E_MIN, E_MAX, N_MIN, N_MAX, toX, toZ } from "./area.mjs";
import { osmElements, toLV95, onBridge } from "./osm.mjs";
import { bridgeTop, BRIDGES_FILE } from "./bsbridges.mjs";
import { heightAt } from "./heights.mjs";

const osm = await osmElements();

const KIND = process.argv[2];
// Per kind: which OSM ways (railway=… or highway=…), the lane offset to the right of the way's
// middle, the distance between points, the sharpest turn from one segment to the next (radians;
// flat for the switches of tracks), how far a line may go to join its next stretch (metres), the
// pairs of lines whose vehicles run on as the other one at their shared end and the lines'
// colours where OSM's are not used.
const KINDS = {
  tram: {
    railway: ["tram"],
    lane: 0,
    step: 4,
    turn: Math.PI / 3,
    reach: 1500,
    through: [
      ["1", "14"], // at Dreirosenbrücke
      ["15", "16"], // at Bruderholz
    ],
    // From the TNW network map valid from 14.12.2025 (CMYK there, in RGB as macOS shows it).
    colours: {
      1: "#744C37",
      2: "#997A50",
      3: "#32468A",
      6: "#0067A5",
      8: "#E36C9F",
      10: "#F9C623",
      11: "#D8232A",
      12: "#81689C",
      14: "#E7792B",
      15: "#00994A",
      16: "#9EC83D",
      17: "#00A3DA",
      21: "#00A38F",
    },
  },
  train: {
    railway: ["rail", "light_rail", "narrow_gauge"],
    lane: 0,
    step: 4,
    turn: Math.PI / 4,
    reach: 3000,
  },
  car: {
    highway: ["motorway", "trunk", "primary", "secondary", "tertiary"].flatMap((h) => [
      h,
      `${h}_link`,
    ]),
    lane: 1.8,
    step: 8,
    turn: (2 * Math.PI) / 3,
    reach: 0,
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
const SHORT_TUNNEL = 100; // metres: tunnels shorter than this stay on the terrain
const SMOOTH = 3; // points averaged on each side, against jumps
const TERMINUS = 100; // metres: the widest gap between stretches of a line joined straight across
const SHORTEST_TRIP = 1500; // metres
const COVER = 0.9; // share of the roads (by length) the round trips should drive
const TRIES = 3000; // round trips tried at most
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

// The network: the OSM nodes inside the area and the directed edges between them along the ways,
// one-way ways (and roundabouts) only forwards.
const inside = (p) =>
  p.x >= toX(E_MIN) && p.x <= toX(E_MAX) && p.z >= toZ(N_MAX) && p.z <= toZ(N_MIN);
const nodes = new Map(); // id -> { x, z }
const edges = new Map(); // id -> [{ from, to, tags, length }] leaving it
// For trams and trains also every way of their relations, whatever its tags (a track under
// construction, one of another kind of railway).
const relations = config.railway
  ? JSON.parse(readFileSync(ROUTES_FILE, "utf8")).elements.filter(
      (el) => el.type === "relation" && el.tags.ref,
    )
  : [];
const members = new Set(relations.flatMap((r) => r.members.map((m) => m.type === "way" && m.ref)));
const ways = osm.filter(
  (el) => el.type === "way" && ((isWay(el.tags) && el.tags.area !== "yes") || members.has(el.id)),
);
for (const way of ways) {
  way.nodes.forEach((id, i) => {
    if (!way.geometry[i]) return; // outside the query box
    const [e, n] = toLV95(way.geometry[i]);
    const p = { x: toX(e), z: toZ(n) };
    if (inside(p)) nodes.set(id, p);
  });
  const { oneway, junction } = way.tags;
  const ahead = oneway !== "-1";
  const back = !["yes", "1", "true", "-1"].includes(oneway) && junction !== "roundabout";
  const add = (from, to) => {
    const length = Math.hypot(
      nodes.get(to).x - nodes.get(from).x,
      nodes.get(to).z - nodes.get(from).z,
    );
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push({ from, to, tags: way.tags, length });
  };
  for (let i = 1; i < way.nodes.length; i++) {
    const [a, b] = [way.nodes[i - 1], way.nodes[i]];
    if (a === b || !nodes.has(a) || !nodes.has(b)) continue;
    if (ahead) add(a, b);
    if (back) add(b, a);
  }
}
// The angle (radians) a vehicle turns going on from edge e to edge f.
function turn(e, f) {
  const [a, b, c] = [nodes.get(e.from), nodes.get(e.to), nodes.get(f.to)];
  const [ux, uz, vx, vz] = [b.x - a.x, b.z - a.z, c.x - b.x, c.z - b.z];
  const cos = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
  return Math.acos(Math.min(Math.max(cos, -1), 1));
}
// Where a vehicle may go on from edge e: never back, and turning by at most config.turn.
const onwards = (e) =>
  (edges.get(e.to) ?? []).filter((f) => f.to !== e.from && turn(e, f) <= config.turn);
const edge = (from, to) => edges.get(from)?.find((e) => e.to === to);
// The shortest way (node ids after e.to) from edge e to node target, arriving so that it may go
// on to node then; null if there is none within config.reach metres.
function route(e, target, then) {
  const best = new Map([[e, 0]]);
  const before = new Map();
  const queue = [[0, e]];
  while (queue.length) {
    queue.sort((p, q) => q[0] - p[0]);
    const [length, f] = queue.pop();
    if (length > best.get(f)) continue;
    if (f !== e && f.to === target) {
      const next = edge(target, then);
      if (!next || (next.to !== f.from && turn(f, next) <= config.turn)) {
        const way = [];
        for (let g = f; g !== e; g = before.get(g)) way.unshift(g.to);
        return way;
      }
    }
    for (const g of onwards(f)) {
      const total = length + g.length;
      if (total > config.reach || total >= (best.get(g) ?? Infinity)) continue;
      best.set(g, total);
      before.set(g, f);
      queue.push([total, g]);
    }
  }
  return null;
}
// Trams and trains: per line the longest pair of OSM relations there and back (from and to
// swapped) that closes a loop, each in the order of its track ways; for a pair of lines in
// config.through the longest such pairs of both in one loop, the number changing at their shared
// end. Each stretch inside the area joins the next one (at the end of the line, the way back,
// where it comes back into the area) along the network, by a turning loop, or where OSM has none,
// straight across a gap of at most TERMINUS. Lines without such a pair are left out. Each loop
// with its parts: from which node of the ring on each line runs.
function lines() {
  const byId = new Map(ways.map((way) => [way.id, way]));
  // The stretches inside the area of a relation: runs of node ids.
  const stretches = (relation) => {
    const members = relation.members
      .filter((m) => m.type === "way" && !m.role && byId.has(m.ref))
      .map((m) => byId.get(m.ref).nodes);
    const ids = [];
    members.forEach((way, i) => {
      const last = ids.at(-1);
      const next = members[i + 1] ?? [];
      const joinsNext = (id) => id === next[0] || id === next.at(-1);
      const turned =
        last === way.at(-1) || (last !== way[0] && !joinsNext(way.at(-1)) && joinsNext(way[0]));
      const ordered = turned ? way.toReversed() : way;
      ids.push(...(ordered[0] === last ? ordered.slice(1) : ordered));
    });
    const runs = [[]];
    for (const id of ids)
      if (nodes.has(id)) runs.at(-1).push(id);
      else if (runs.at(-1).length) runs.push([]);
    return runs.filter((run) => run.length > 1);
  };
  // The node ids of the loop through the stretches in turn and the index in it where each stretch
  // starts, or null if one does not join the next.
  const close = (runs) => {
    const ring = [];
    const starts = [];
    for (const [i, run] of runs.entries()) {
      starts.push(ring.length);
      const next = runs[(i + 1) % runs.length];
      const [a, b] = run.slice(-2);
      ring.push(...run.slice(0, -1));
      if (b === next[0]) continue;
      ring.push(b);
      const way = route(edge(a, b) ?? { from: a, to: b }, next[0], next[1]);
      const [p, q] = [nodes.get(b), nodes.get(next[0])];
      if (way) ring.push(...way.slice(0, -1));
      else if (Math.hypot(p.x - q.x, p.z - q.z) > TERMINUS) return null;
    }
    return { ring, starts };
  };
  // Every chain of relations with these refs in turn, each ending where the next (after the last:
  // the first) starts.
  const chains = (refs, chain = []) =>
    chain.length === refs.length
      ? chain.at(-1).tags.to === chain[0].tags.from
        ? [chain]
        : []
      : relations
          .filter(
            (r) =>
              r.tags.ref === refs[chain.length] &&
              r.tags.from &&
              !chain.includes(r) &&
              (!chain.length || r.tags.from === chain.at(-1).tags.to),
          )
          .flatMap((r) => chains(refs, [...chain, r]));
  // The loop of the longest chain with these refs that closes, or null.
  const loop = (refs) => {
    const options = chains(refs)
      .map((chain) => {
        const runs = chain.map(stretches);
        return { chain, runs, size: runs.flat(2).length };
      })
      .filter((o) => o.size)
      .sort((p, q) => q.size - p.size);
    for (const { chain, runs } of options) {
      const closed = close(runs.flat());
      if (!closed) continue;
      const parts = [];
      let k = 0; // index of the relation's first stretch
      chain.forEach(({ tags }, i) => {
        if (runs[i].length && tags.ref !== parts.at(-1)?.tags.ref)
          parts.push({ tags, at: closed.starts[k] });
        k += runs[i].length;
      });
      return { ring: closed.ring, parts };
    }
    return null;
  };
  const loops = [];
  const done = new Set(); // refs in a loop of two lines
  for (const pair of config.through ?? []) {
    const found = loop(pair.flatMap((ref) => [ref, ref]));
    if (!found) {
      console.log(`lines ${pair.join(" and ")} run on their own: no chain of both closes a loop`);
      continue;
    }
    loops.push(found);
    for (const ref of pair) done.add(ref);
  }
  for (const ref of new Set(relations.map((r) => r.tags.ref))) {
    if (done.has(ref)) continue;
    const found = loop([ref, ref]);
    if (found) loops.push(found);
    else console.log(`line ${ref} left out: no pair of relations there and back closes a loop`);
  }
  return loops;
}

// Cars: round trips through the road network, as many as cover most of it. Each starts on a road
// not driven yet and goes on at random, mostly straight on and preferring roads not driven yet,
// until it comes back onto a road it took before: the loop is the trip from there. Loops shorter
// than SHORTEST_TRIP are not taken.
function trips() {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const all = [...edges.values()].flat();
  const total = all.reduce((sum, e) => sum + e.length, 0);
  const driven = new Set();
  let covered = 0;
  const loops = [];
  for (let attempt = 0; attempt < TRIES && covered < COVER * total; attempt++) {
    const open = all.filter((e) => !driven.has(e));
    const trip = [open[Math.floor(random() * open.length)]];
    const at = new Map([[trip[0], 0]]); // edge -> its index in the trip
    const along = [0]; // metres before each edge of the trip
    for (let step = 0; step < 5000; step++) {
      const e = trip.at(-1);
      const length = along.at(-1) + e.length;
      // Going on to an edge taken before closes the loop from there; only if it is long enough.
      const options = onwards(e).filter(
        (f) => !at.has(f) || length - along[at.get(f)] >= SHORTEST_TRIP,
      );
      if (!options.length) break;
      const weights = options.map(
        (f) => (driven.has(f) ? 1 : 5) * ((1 + Math.cos(turn(e, f))) ** 2 + 0.05),
      );
      let r = random() * weights.reduce((sum, w) => sum + w, 0);
      const f = options.find((_, i) => (r -= weights[i]) < 0) ?? options.at(-1);
      if (at.has(f)) {
        const loop = trip.slice(at.get(f));
        for (const g of loop)
          if (!driven.has(g)) {
            driven.add(g);
            covered += g.length;
          }
        loops.push({ tags: { ref: `Rundkurs ${loops.length + 1}` }, loop });
        break;
      }
      at.set(f, trip.length);
      trip.push(f);
      along.push(length);
    }
  }
  console.log(`${((100 * covered) / total).toFixed(0)} % of the roads driven`);
  // Each loop's share of the roads: those it shares with others count by their part.
  const times = new Map();
  for (const { loop } of loops) for (const e of loop) times.set(e, (times.get(e) ?? 0) + 1);
  return loops.map(({ tags, loop }) => ({
    tags,
    ring: loop.map((e) => e.from),
    share: loop.reduce((sum, e) => sum + e.length / times.get(e), 0),
  }));
}

// The points of a loop of node ids, about STEP apart: each direction on the right of the way's
// middle, by the way of the segment (that of its end point) underground in a tunnel, on a bridge
// deck at about the height so far (not one passed under), otherwise on the terrain, or left open
// (NaN) on an OSM bridge without a deck, then run straight across; smoothed. Null if no height is
// known anywhere (all on OSM bridges without a deck).
function sample(ring) {
  const track = [...ring, ring[0]].map((id, i, all) => {
    const tags = (i && edge(all[i - 1], id)?.tags) || {};
    return { ...nodes.get(id), bridge: onBridge(tags), tunnel: inTunnel(tags) };
  });
  // The right of (fx, fz) is (-fz, fx); the neighbours go round the loop.
  const n = track.length - 1;
  const shifted = track.map((p, i) => {
    const [a, b] = [track[(i - 1 + n) % n], track[(i + 1) % n]];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      ...p,
      x: p.x - ((b.z - a.z) / length) * config.lane,
      z: p.z + ((b.x - a.x) / length) * config.lane,
    };
  });
  const points = [];
  const tunnels = []; // indices of the points in tunnels, ascending
  let carry = 0; // distance into the current segment of the next point
  for (let i = 1; i < shifted.length; i++) {
    const [a, b] = [shifted[i - 1], shifted[i]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (; carry < length; carry += STEP) {
      const t = carry / length;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const ground = heightAt(p.x, p.z);
      const deck = top(p);
      const last = points.findLast((q) => !Number.isNaN(q.y))?.y;
      if (b.tunnel) tunnels.push(points.length);
      const y = b.tunnel
        ? ground - TUNNEL_DEPTH
        : Math.abs(deck - (last ?? ground)) < ON_DECK
          ? Math.max(deck, ground)
          : b.bridge || near(bridgeCells, p)
            ? NaN
            : ground;
      points.push({ ...p, y });
    }
    carry -= length;
  }
  // Short tunnels (underpasses, which the terrain grid fills) stay on the terrain, so nothing
  // vanishes in them.
  for (let k = 0; k < tunnels.length;) {
    let j = k + 1;
    while (j < tunnels.length && tunnels[j] === tunnels[j - 1] + 1) j++;
    if ((j - k) * STEP < SHORT_TUNNEL)
      for (const i of tunnels.slice(k, j)) points[i].y = heightAt(points[i].x, points[i].z);
    k = j;
  }
  if (points.every((p) => Number.isNaN(p.y))) return null;
  for (let i = 0; i < points.length; i++) {
    if (!Number.isNaN(points[i].y)) continue;
    let j = i;
    while (j < points.length && Number.isNaN(points[j].y)) j++;
    const before = i > 0 ? points[i - 1].y : points[j].y;
    const after = j < points.length ? points[j].y : before;
    for (let k = i; k < j; k++)
      points[k].y = before + ((after - before) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const ys = points.map((p) => p.y);
  points.forEach((p, i) => {
    let sum = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k++) sum += ys[(i + k + ys.length) % ys.length];
    p.y = sum / (2 * SMOOTH + 1);
  });
  return points;
}

// The share of the loop of node ids before its node i.
function shareBefore(ring, i) {
  let before = 0;
  let total = 0;
  ring.forEach((id, k) => {
    const [p, q] = [nodes.get(id), nodes.get(ring[(k + 1) % ring.length])];
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    total += d;
    if (k < i) before += d;
  });
  return before / total;
}

// Each loop with evenly spaced points, about STEP apart.
const out = [];
const routesOut = [];
for (const { tags, ring, share, parts } of KIND === "car" ? trips() : lines()) {
  const points = sample(ring);
  if (!points) continue;
  const closed = [...points, points[0]];
  const along = [0];
  for (let i = 1; i < closed.length; i++)
    along.push(
      along[i - 1] + Math.hypot(closed[i].x - closed[i - 1].x, closed[i].z - closed[i - 1].z),
    );
  const length = along.at(-1);
  const count = Math.max(3, Math.round(length / STEP));
  const start = out.length / 3;
  for (let k = 0, i = 0; k < count; k++) {
    const s = (k * length) / count;
    while (along[i + 1] < s) i++;
    const t = (s - along[i]) / (along[i + 1] - along[i] || 1);
    const [a, b] = [closed[i], closed[i + 1]];
    out.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  }
  const round = (metres) => Math.round(metres * 10) / 10;
  routesOut.push({
    ref: tags?.ref ?? parts.map((p) => p.tags.ref).join("/"),
    operator: parts?.[0].tags.operator,
    start,
    count,
    length: round(length),
    share: share && Math.round(share), // metres of roads that are its own (round trips)
    // Lines: each one's colour and from how many metres along the loop on it runs.
    parts: parts?.map(({ tags, at }) => ({
      ref: tags.ref,
      colour: config.colours?.[tags.ref] ?? tags.colour,
      from: round(length * shareBefore(ring, at)),
    })),
  });
}
console.log(
  `${routesOut.length} loops, ${(routesOut.reduce((sum, r) => sum + r.length, 0) / 1000).toFixed(0)} km`,
);
writeFileSync(join(PUBLIC, `${KIND}s.json`), JSON.stringify({ routes: routesOut }));
writeFileSync(
  join(PUBLIC, `${KIND}s.bin`),
  new Float32Array(out.map((v) => Math.round(v * 10) / 10)),
);
