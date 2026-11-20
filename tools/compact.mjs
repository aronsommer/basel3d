// Converts public/basel.glb (tools/buildings.mjs) into public/basel.bin, read by
// src/cityfile.js: the same meshes and triangles, stored per building.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { PUBLIC } from "./area.mjs";
import { Bytes } from "./pack.mjs";

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(join(PUBLIC, "basel.glb"));

// Per mesh { scale, shift, normalized, buildings: Map from a building number to { roof, wall:
// [x, y, z, …] as stored, three corners per triangle; range: per wall triangle its wall's bottom
// and top and the building's foot (_WALL); colour: { roof, wall: RGBA } } }.
const meshes = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const buildings = new Map();
  let normalized;
  for (const primitive of mesh.listPrimitives()) {
    const kind = primitive.getMaterial().getName();
    const position = primitive.getAttribute("POSITION");
    normalized = position.getNormalized();
    const positions = position.getArray();
    const numbers = primitive.getAttribute("_BUILDING").getArray();
    const colours = primitive.getAttribute("COLOR_0").getArray();
    const ranges = primitive.getAttribute("_WALL")?.getArray();
    primitive
      .getIndices()
      .getArray()
      .forEach((i, corner) => {
        if (!buildings.has(numbers[i]))
          buildings.set(numbers[i], { roof: [], wall: [], range: [], colour: {} });
        const b = buildings.get(numbers[i]);
        b[kind].push(...positions.subarray(i * 3, i * 3 + 3));
        b.colour[kind] ??= colours.slice(i * 4, i * 4 + 4);
        if (ranges && corner % 3 === 0) b.range.push(...ranges.slice(i * 4, i * 4 + 3));
      });
  }
  meshes.push({ scale: node.getScale()[0], shift: node.getTranslation(), normalized, buildings });
}

// Per mesh its buildings: { x, z, foot, vertices: [[x, y, z], …] in order of x, z, y, roof: its
// triangles (vertex numbers), walls: [{ bottom, top, triangles }] per bottom and top (_WALL),
// base: its foot there, colour }.
for (const mesh of meshes) {
  const records = [];
  for (const b of mesh.buildings.values()) {
    let foot = Infinity;
    for (const list of [b.roof, b.wall])
      for (let i = 1; i < list.length; i += 3) foot = Math.min(foot, list[i]);

    // The triangles' vertices each once; triangles without area are dropped.
    const vertices = new Map(); // "x,y,z" -> [x, y, z, number]
    const vertex = (x, y, z) => {
      const key = `${x},${y},${z}`;
      if (!vertices.has(key)) vertices.set(key, [x, y, z, vertices.size]);
      return vertices.get(key)[3];
    };
    // each(t, number of the triangle) for every triangle of the list.
    const triangles = (list, each) => {
      for (let i = 0; i < list.length; i += 9) {
        const t = [0, 3, 6].map((k) => vertex(list[i + k], list[i + k + 1], list[i + k + 2]));
        if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) each(t, i / 9);
      }
    };
    const roof = [];
    triangles(b.roof, (t) => roof.push(t));
    const walls = new Map(); // "bottom,top" -> { bottom, top, triangles }
    triangles(b.wall, (t, n) => {
      const [bottom, top] = b.range.slice(n * 3, n * 3 + 2);
      const key = `${bottom},${top}`;
      if (!walls.has(key)) walls.set(key, { bottom, top, triangles: [] });
      walls.get(key).triangles.push(t);
    });
    if (!vertices.size) continue;

    // The vertices in order of x, z, y, so their differences are small; each triangle from its
    // lowest vertex number, the triangles in order of their numbers.
    const sorted = [...vertices.values()].sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1]);
    const renumber = [];
    sorted.forEach((v, i) => (renumber[v[3]] = i));
    const order = (list) =>
      list
        .map((t) => {
          const [a, c, d] = t.map((i) => renumber[i]);
          return a < c && a < d ? [a, c, d] : c < d ? [c, d, a] : [d, a, c];
        })
        .sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2])
        .flat();
    records.push({
      x: sorted[0][0],
      z: sorted[0][2],
      foot,
      vertices: sorted,
      roof: order(roof),
      walls: [...walls.values()]
        .sort((p, q) => p.bottom - q.bottom || p.top - q.top)
        .map((w) => ({ ...w, triangles: order(w.triangles) })),
      base: b.range[2] ?? 0,
      colour: [...(b.colour.roof ?? [0, 0, 0]).slice(0, 3), ...(b.colour.wall ?? [0, 0, 0, 0])],
    });
  }
  // Neighbours after each other (rows of 3000 steps, each from west to east), so their distances
  // are small. The meshes one after the other, this is the buildings' numbering in the viewer.
  const row = (r) => Math.floor(r.z / 3000);
  mesh.records = records.sort((p, q) => row(p) - row(q) || p.x - q.x || p.z - q.z);
}

const streams = [...Array(9)].map(() => new Bytes());
const [head, xs, zs, columns, heights, ranks, walls, triangles, colours] = streams;
for (const { records } of meshes) {
  let [lastX, lastZ, lastFoot] = [0, 0, 0];
  for (const r of records) encode(r);
  // One building's part of each stream.
  function encode(r) {
    const table = [...new Set(r.vertices.map((v) => v[1]))].sort((p, q) => p - q);
    head.number(r.vertices.length);
    head.number(r.roof.length / 3);
    head.number(r.walls.length);
    head.number(table.length);
    head.signed(r.x - lastX);
    head.signed(r.z - lastZ);
    head.signed(r.foot - lastFoot);
    head.number(r.base);
    [lastX, lastZ, lastFoot] = [r.x, r.z, r.foot];
    let y = r.foot;
    for (const height of table) {
      heights.number(height - y);
      y = height;
    }
    // The vertices column by column (those above each other): where it stands, how many more than
    // one it has, and each one's height in the table, counted from the one below.
    let [x, z] = [r.x, r.z];
    for (let i = 0; i < r.vertices.length;) {
      const [vx, , vz] = r.vertices[i];
      let end = i + 1;
      while (end < r.vertices.length && r.vertices[end][0] === vx && r.vertices[end][2] === vz)
        end++;
      xs.number(vx - x);
      zs.signed(vz - z);
      columns.number(end - i - 1);
      for (let rank = -1; i < end; i++) {
        const next = table.indexOf(r.vertices[i][1]);
        ranks.number(next - rank - 1);
        rank = next;
      }
      [x, z] = [vx, vz];
    }
    let bottom = r.base;
    for (const w of r.walls) {
      walls.signed(w.bottom - bottom);
      walls.number(w.top - w.bottom);
      walls.number(w.triangles.length / 3);
      bottom = w.bottom;
    }
    for (const list of [r.roof, ...r.walls.map((w) => w.triangles)])
      for (let i = 0, last = 0; i < list.length; i += 3) {
        triangles.number(list[i] - last);
        triangles.number(list[i + 1] - list[i]);
        triangles.number(list[i + 2] - list[i]);
        last = list[i];
      }
    colours.list.push(...r.colour);
  }
}

// Per mesh: scale, x, y, z, normalized, buildings.
const table = Buffer.from(
  new Float64Array(
    meshes.flatMap((m) => [m.scale, ...m.shift, m.normalized ? 1 : 0, m.records.length]),
  ).buffer,
);
const parts = [table, ...streams.map((s) => Buffer.from(s.list))];
const header = Buffer.from(new Uint32Array(parts.map((p) => p.length)).buffer);
const file = Buffer.concat([header, ...parts]);
writeFileSync(join(PUBLIC, "basel.bin"), file);

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
const zipped = (bytes) => mb(gzipSync(bytes, { level: 9 }).length);
console.log(`${meshes.reduce((sum, m) => sum + m.records.length, 0)} buildings`);
[
  "meshes",
  "head",
  "x",
  "z",
  "columns",
  "heights",
  "ranks",
  "walls",
  "triangles",
  "colours",
].forEach((name, i) => console.log(name.padEnd(10), mb(parts[i].length), "gzip", zipped(parts[i])));
console.log(`basel.bin ${mb(file.length)}, gzip ${zipped(file)}`);
const old = readFileSync(join(PUBLIC, "basel.glb"));
console.log(`basel.glb ${mb(old.length)}, gzip ${zipped(old)}`);
