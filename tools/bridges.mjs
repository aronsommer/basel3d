// Builds 3D bridges over the Rhine and the Birs into public/bridges.glb, from swissTLM3D roads and
// railways with measured heights. Which ones cross the rivers decides the river course from OSM.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { E_MIN, E_MAX, N_MIN, N_MAX, Y0, PUBLIC, toX, toZ } from "./area.mjs";
import { osmElements, SIDEWALK_WIDTH, riverLines, joinLines, crossesAny } from "./osm.mjs";
import { tlmLayer, shpLinesZ, dbfRows } from "./swisstopo.mjs";

const THICKNESS = 1.2; // metres of deck below the road
const WALL = 1; // metres of side wall above the road
const TRACK_WIDTH = 5; // metres per railway track
const STRUCTURES = new Set([
  "Bruecke",
  "Gedeckte Bruecke",
  "Bruecke mit Treppe",
  "Bruecke mit Galerie",
  "Steg",
  "Staumauer, Wehr", // the road over the Birsfelden power station
]); // swissTLM3D KUNSTBAUTE values built as bridges

// Road widths in metres per swissTLM3D OBJEKTART that does not start with its width ("6m Strasse").
const TLM_ROAD_WIDTH = {
  Autobahn: 12,
  Autostrasse: 10,
  Ausfahrt: 6,
  Einfahrt: 6,
  Zufahrt: 6,
  Dienstzufahrt: 5,
  Verbindung: 6,
};

const rivers = riverLines(await osmElements());

// --- swissTLM3D bridges over the rivers, in scene coordinates with measured heights.
function tlmBridges(base, widthOf) {
  const row = dbfRows(`${base}.dbf`);
  const key = ([e, n]) => `${e.toFixed(2)} ${n.toFixed(2)}`;
  const lines = [];
  for (const { index, points } of shpLinesZ(`${base}.shp`, [E_MIN, N_MIN, E_MAX, N_MAX])) {
    const r = row(index);
    const width = STRUCTURES.has(r.KUNSTBAUTE) && widthOf(r);
    if (!width) continue;
    lines.push({
      points: points.map(([e, n, h]) => ({ x: toX(e), y: h - Y0, z: toZ(n) })),
      start: key(points[0]),
      end: key(points.at(-1)),
      group: width,
    });
  }
  return joinLines(lines)
    .filter((chain) => crossesAny(chain.points, rivers))
    .map((chain) => ({ points: chain.points, width: chain.members[0].group }));
}
const roadBridges = tlmBridges(await tlmLayer("TLM_STRASSEN/swissTLM3D_TLM_STRASSE"), (r) => {
  const width = Number.parseFloat(r.OBJEKTART) || TLM_ROAD_WIDTH[r.OBJEKTART] || 0;
  return width >= 4 && r.OBJEKTART.endsWith("Strasse") ? width + SIDEWALK_WIDTH : width;
});
const railBridges = tlmBridges(await tlmLayer("TLM_OEV/swissTLM3D_TLM_EISENBAHN"), (r) =>
  r.AUF_STRASS === "Wahr" ? 0 : TRACK_WIDTH * (Number(r.ANZAHL_SPU) || 1),
);

// --- Geometry: per segment a deck (top), and below and beside it the structure (side).
const deck = [];
const side = [];
const quad = (list, a, b, c, d) => list.push(...a, ...b, ...c, ...a, ...c, ...d);
const at = ([x, y, z], dy) => [x, y + dy, z];
let triangles = 0;
for (const { points, width } of [...roadBridges, ...railBridges]) {
  // Left and right edge of the road at each point, straight across the middle direction.
  const edges = points.map((p, i) => {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, points.length - 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const scale = width / 2 / (Math.hypot(dx, dz) || 1);
    return {
      left: [p.x - dz * scale, p.y, p.z + dx * scale],
      right: [p.x + dz * scale, p.y, p.z - dx * scale],
    };
  });
  for (let i = 1; i < edges.length; i++) {
    const [a, b] = [edges[i - 1], edges[i]];
    quad(deck, a.left, b.left, b.right, a.right); // counter-clockwise from above
    const [al, ar, bl, br] = [a.left, a.right, b.left, b.right].map((v) => at(v, -THICKNESS));
    quad(side, al, ar, br, bl);
    for (const edge of ["left", "right"])
      quad(
        side,
        at(a[edge], -THICKNESS),
        at(a[edge], WALL),
        at(b[edge], WALL),
        at(b[edge], -THICKNESS),
      );
    triangles += 8;
  }
}
console.log(
  `${roadBridges.length} road and ${railBridges.length} rail bridges, ${triangles} triangles`,
);

const doc = new Document();
const buffer = doc.createBuffer();
const mesh = doc.createMesh("bridges");
for (const [name, list] of Object.entries({ deck, side })) {
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(list))
    .setBuffer(buffer);
  const material = doc.createMaterial(name);
  mesh.addPrimitive(doc.createPrimitive().setAttribute("POSITION", position).setMaterial(material));
}
doc.createScene("Bridges").addChild(doc.createNode("bridges").setMesh(mesh));
await MeshoptEncoder.ready;
await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
writeFileSync(join(PUBLIC, "bridges.glb"), await io.writeBinary(doc));
