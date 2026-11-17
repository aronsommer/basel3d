// Downloads swissBUILDINGS3D 3.0 (CityGML, newest per map sheet) for the area into data/
// and converts it into public/basel.glb.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { E_MIN, E_MAX, N_MIN, N_MAX, Y0, CHUNK, DATA, PUBLIC, toX, toZ } from "./area.mjs";
import { newestTiles, download } from "./swisstopo.mjs";

const SRC = join(DATA, "swissbuildings3d");

// A growing typed array.
class List {
  constructor(Type) {
    this.data = new Type(1 << 16);
    this.length = 0;
  }
  push(value) {
    if (this.length === this.data.length) {
      const next = new this.data.constructor(this.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
}

// No normals: the viewer shades flat per pixel, so vertices can be shared across faces.
// _BUILDING is each vertex's building number (0, 1, …), to tell buildings apart.
const chunks = new Map(); // "cx,cz" -> { roof, wall: { position: List, building: List } }
const seen = new Set();
const stats = { buildings: 0, roof: 0, wall: 0, dupes: 0, other: {} };
let building = null; // { roof, wall: [x, y, z, …] } of the building being read

function addTriangle(kind, v) {
  for (let i = 0; i < 9; i += 3) building[kind].push(toX(v[i]), v[i + 2] - Y0, toZ(v[i + 1]));
  stats[kind]++;
}

// Adds the building read into the chunk of its middle, so it stays in one mesh.
function addBuilding() {
  const b = building;
  building = null;
  if (!b || !(b.roof.length || b.wall.length)) return;
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const list of [b.roof, b.wall])
    for (let i = 0; i < list.length; i += 3) {
      x0 = Math.min(x0, list[i]);
      x1 = Math.max(x1, list[i]);
      z0 = Math.min(z0, list[i + 2]);
      z1 = Math.max(z1, list[i + 2]);
    }
  const key = `${Math.floor((x0 + x1) / 2 / CHUNK)},${Math.floor((z0 + z1) / 2 / CHUNK)}`;
  let c = chunks.get(key);
  if (!c) {
    const lists = () => ({ position: new List(Float32Array), building: new List(Uint16Array) });
    chunks.set(key, (c = { roof: lists(), wall: lists() }));
  }
  const number = stats.buildings++;
  if (number > 0xffff) throw new Error("Too many buildings for 16-bit numbers");
  for (const kind of ["roof", "wall"]) {
    for (const value of b[kind]) c[kind].position.push(value);
    for (let i = 0; i < b[kind].length; i += 3) c[kind].building.push(number);
  }
}

async function readTile(file) {
  const unzip = spawn("unzip", ["-p", file]);
  let kind = null; // "roof" | "wall" | null (skip)
  for await (const line of createInterface({
    input: unzip.stdout,
    crlfDelay: Infinity,
  })) {
    const t = line.trimStart();
    if (t.startsWith("<gml:posList")) {
      if (!kind || !building) continue;
      const v = t
        .slice(t.indexOf(">") + 1, t.lastIndexOf("<"))
        .split(" ")
        .map(Number);
      if (v[0] < E_MIN || v[0] >= E_MAX || v[1] < N_MIN || v[1] >= N_MAX) continue;
      addTriangle(kind, v);
    } else if (t.startsWith("<bldg:Building ")) {
      addBuilding();
      const id = t.match(/gml:id="([^"]+)"/)[1];
      if (seen.has(id))
        stats.dupes++; // already read from another tile
      else building = { roof: [], wall: [] };
      seen.add(id);
    } else if (t.startsWith("<bldg:RoofSurface")) kind = "roof";
    else if (t.startsWith("<bldg:WallSurface")) kind = "wall";
    else if (/^<bldg:\w+Surface /.test(t)) {
      kind = null;
      const tag = t.slice(1, t.indexOf(" "));
      stats.other[tag] = (stats.other[tag] ?? 0) + 1;
    } else if (/^<\/bldg:\w+Surface>/.test(t)) kind = null;
  }
  addBuilding();
}

async function writeGlb() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const materials = {
    roof: doc.createMaterial("roof").setBaseColorFactor([0.62, 0.33, 0.27, 1]),
    wall: doc.createMaterial("wall").setBaseColorFactor([0.9, 0.86, 0.78, 1]),
  };
  const scene = doc.createScene("Basel");
  for (const [key, c] of chunks) {
    const mesh = doc.createMesh(`chunk ${key}`);
    for (const kind of ["roof", "wall"]) {
      const { position, building } = c[kind];
      if (!position.length) continue;
      const accessor = (type, list) =>
        doc
          .createAccessor()
          .setType(type)
          .setArray(list.data.slice(0, list.length))
          .setBuffer(buffer);
      mesh.addPrimitive(
        doc
          .createPrimitive()
          .setAttribute("POSITION", accessor("VEC3", position))
          .setAttribute("_BUILDING", accessor("SCALAR", building))
          .setMaterial(materials[kind]),
      );
    }
    scene.addChild(doc.createNode(`chunk ${key}`).setMesh(mesh));
  }
  await MeshoptEncoder.ready;
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  writeFileSync(join(PUBLIC, "basel.glb"), await io.writeBinary(doc));
}

mkdirSync(SRC, { recursive: true });
const tiles = await newestTiles("ch.swisstopo.swissbuildings3d_3_0", ".citygml.zip");
if (!tiles.size) throw new Error("No swissBUILDINGS3D tiles found");
// Fixed order (by map sheet), so the same input always gives a byte-identical basel.glb.
for (const sheet of [...tiles.keys()].sort()) {
  const { href } = tiles.get(sheet);
  const file = join(SRC, href.split("/").pop());
  if (!(await download(href, file))) throw new Error(`Download failed: ${href}`);
  console.time(file);
  await readTile(file);
  console.timeEnd(file);
}
console.log(stats);

await writeGlb();
console.log("done");
