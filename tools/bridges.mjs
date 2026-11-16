// Writes the modelled bridges of Basel-Stadt (tools/bsbridges.mjs) inside the area into
// public/bridges.glb, compressed like the buildings and without normals. Crossings of the Rhine or
// the Birs that the canton models only in part or not at all (the Birsfelden weir on the cantonal
// border, the Dreiländerbrücke abroad) become one simple deck along their swissTLM3D line instead.
// Also writes all triangles to data/bridges.bin, so tools/map.mjs can hide the OSM bridges below.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { E_MIN, E_MAX, N_MIN, N_MAX, Y0, PUBLIC, toX, toZ } from "./area.mjs";
import { bridgeTriangles, underBridges, BRIDGES_FILE } from "./bsbridges.mjs";
import { osmElements, riverLines, crossesAny } from "./osm.mjs";
import { tlmLayer, shpLinesZ, dbfRows } from "./swisstopo.mjs";

const THICKNESS = 1.2; // metres of deck below the road
const WALL = 1; // metres of side wall above the road
const TRACK_WIDTH = 5; // metres per railway track
// swissTLM3D KUNSTBAUTE values built as bridges.
const STRUCTURES = new Set([
  "Bruecke",
  "Gedeckte Bruecke",
  "Bruecke mit Treppe",
  "Bruecke mit Galerie",
  "Steg",
  "Staumauer, Wehr",
]);
// Road widths in metres per swissTLM3D OBJEKTART that does not start with its width ("6m Strasse").
const TLM_ROAD_WIDTH = { Autobahn: 12, Autostrasse: 10, Ausfahrt: 6, Einfahrt: 6, Verbindung: 6 };

const all = await bridgeTriangles();
const inside = [];
for (let t = 0; t < all.length; t += 9) {
  const x = (all[t] + all[t + 3] + all[t + 6]) / 3;
  const z = (all[t + 2] + all[t + 5] + all[t + 8]) / 3;
  if (x >= toX(E_MIN) && x < toX(E_MAX) && z >= toZ(N_MAX) && z < toZ(N_MIN))
    inside.push(...all.subarray(t, t + 9));
}
console.log(`${inside.length / 9} of ${all.length / 9} triangles from Basel-Stadt`);

// --- swissTLM3D bridge lines in scene coordinates, joined where they share an end and a width.
async function tlmLines(layer, widthOf) {
  const base = await tlmLayer(layer);
  const row = dbfRows(`${base}.dbf`);
  const key = ([e, n]) => `${e.toFixed(2)} ${n.toFixed(2)}`;
  const lines = [];
  for (const { index, points } of shpLinesZ(`${base}.shp`, [E_MIN, N_MIN, E_MAX, N_MAX])) {
    const r = row(index);
    const width = STRUCTURES.has(r.KUNSTBAUTE) && widthOf(r);
    if (width)
      lines.push({
        points: points.map(([e, n, h]) => ({ x: toX(e), y: h - Y0, z: toZ(n) })),
        start: key(points[0]),
        end: key(points.at(-1)),
        width,
      });
  }
  return lines;
}
function joinLines(lines) {
  const byEnd = new Map();
  for (const line of lines)
    for (const key of [line.start, line.end]) byEnd.set(key, [...(byEnd.get(key) ?? []), line]);
  const used = new Set();
  const chains = [];
  for (const line of lines) {
    if (used.has(line)) continue;
    used.add(line);
    let points = line.points;
    let [first, last] = [line.start, line.end];
    for (const atEnd of [true, false])
      for (;;) {
        const key = atEnd ? last : first;
        const next = byEnd.get(key).find((o) => !used.has(o) && o.width === line.width);
        if (!next) break;
        used.add(next);
        const forward = next.start === key;
        const other = forward ? next.end : next.start;
        // Appended points must start at the shared end, prepended ones end there.
        const p = forward === atEnd ? next.points : next.points.toReversed();
        if (atEnd) [points, last] = [points.concat(p.slice(1)), other];
        else [points, first] = [p.slice(0, -1).concat(points), other];
      }
    chains.push({ points, width: line.width });
  }
  return chains;
}
const lines = [
  ...(await tlmLines(
    "TLM_STRASSEN/swissTLM3D_TLM_STRASSE",
    (r) => Number.parseFloat(r.OBJEKTART) || TLM_ROAD_WIDTH[r.OBJEKTART] || 0,
  )),
  ...(await tlmLines("TLM_OEV/swissTLM3D_TLM_EISENBAHN", (r) =>
    r.AUF_STRASS === "Wahr" ? 0 : TRACK_WIDTH * (Number(r.ANZAHL_SPU) || 1),
  )),
];
const rivers = riverLines(await osmElements());
const crossings = joinLines(lines).filter((c) => crossesAny(c.points, rivers));

// --- Crossings that Basel-Stadt models only in part (on the cantonal border) or not at all get one
// style along their whole length: a deck with side walls on the swissTLM3D line instead of the
// canton's model. Short ends on land beyond a modelled bridge do not count.
const RIVER_REACH = 20; // metres from the river's centre line
const MODEL_MARGIN = 8; // metres beside the deck within which the canton's model is replaced
function distanceToSegment(p, a, b) {
  const [dx, dz] = [b.x - a.x, b.z - a.z];
  const t = Math.min(
    Math.max(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0),
    1,
  );
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
const distanceToLine = (p, line) =>
  Math.min(...line.slice(1).map((q, i) => distanceToSegment(p, line[i], q)));
// Points along a line every 2 m or less.
const samples = (line) =>
  line.slice(1).flatMap((b, i) => {
    const a = line[i];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
    return [...Array(steps)].map((_, k) => ({
      x: a.x + ((b.x - a.x) * k) / steps,
      z: a.z + ((b.z - a.z) * k) / steps,
    }));
  });
const underBridge = underBridges(all);
const simple = crossings.filter(({ points }) =>
  samples(points).some(
    (p) => !underBridge(p) && rivers.some((river) => distanceToLine(p, river) < RIVER_REACH),
  ),
);
const replaced = (x, z) =>
  simple.some(({ points, width }) => distanceToLine({ x, z }, points) < width / 2 + MODEL_MARGIN);
const triangles = [];
for (let t = 0; t < inside.length; t += 9) {
  const x = (inside[t] + inside[t + 3] + inside[t + 6]) / 3;
  const z = (inside[t + 2] + inside[t + 5] + inside[t + 8]) / 3;
  if (!replaced(x, z)) triangles.push(...inside.slice(t, t + 9));
}
console.log(`${(inside.length - triangles.length) / 9} of them replaced`);

const quad = (a, b, c, d) => triangles.push(...a, ...b, ...c, ...a, ...c, ...d);
for (const { points, width } of simple)
  for (let i = 1; i < points.length; i++) {
    const [p, q] = [points[i - 1], points[i]];
    const scale = width / 2 / Math.hypot(q.x - p.x, q.z - p.z);
    const [dx, dz] = [(q.z - p.z) * scale, (p.x - q.x) * scale]; // to the right
    const at = (o, side, dy) => [o.x + side * dx, o.y + dy, o.z + side * dz];
    quad(at(p, -1, 0), at(q, -1, 0), at(q, 1, 0), at(p, 1, 0)); // road, counter-clockwise from above
    quad(at(p, 1, -THICKNESS), at(q, 1, -THICKNESS), at(q, -1, -THICKNESS), at(p, -1, -THICKNESS));
    for (const side of [1, -1])
      quad(at(p, side, -THICKNESS), at(q, side, -THICKNESS), at(q, side, WALL), at(p, side, WALL));
  }
console.log(`${simple.length} crossings from swissTLM3D, ${triangles.length / 9} triangles in all`);
// All triangles for tools/map.mjs, which leaves out the OSM bridges below them.
writeFileSync(BRIDGES_FILE, new Float32Array(triangles));

const doc = new Document();
const position = doc
  .createAccessor()
  .setType("VEC3")
  .setArray(new Float32Array(triangles))
  .setBuffer(doc.createBuffer());
const primitive = doc
  .createPrimitive()
  .setAttribute("POSITION", position)
  .setMaterial(doc.createMaterial("bridge"));
const mesh = doc.createMesh("bridges").addPrimitive(primitive);
doc.createScene("Bridges").addChild(doc.createNode("bridges").setMesh(mesh));
await MeshoptEncoder.ready;
await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
writeFileSync(join(PUBLIC, "bridges.glb"), await io.writeBinary(doc));
