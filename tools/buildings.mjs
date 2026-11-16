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

class FloatList {
  data = new Float32Array(1 << 16);
  length = 0;
  push3(a, b, c) {
    if (this.length + 3 > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }
}

// No normals: the viewer shades flat per pixel, so vertices can be shared across faces.
const chunks = new Map(); // "cx,cz" -> { roof: FloatList, wall: FloatList }
const seen = new Set();
const stats = { roof: 0, wall: 0, dupes: 0, other: {} };

function addTriangle(kind, v) {
  const x = toX(v[0]);
  const z = toZ(v[1]);
  const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
  let c = chunks.get(key);
  if (!c) chunks.set(key, (c = { roof: new FloatList(), wall: new FloatList() }));
  for (let i = 0; i < 9; i += 3) c[kind].push3(toX(v[i]), v[i + 2] - Y0, toZ(v[i + 1]));
  stats[kind]++;
}

async function readTile(file) {
  const unzip = spawn("unzip", ["-p", file]);
  let kind = null; // "roof" | "wall" | null (skip)
  let skip = false; // building already read from another tile
  for await (const line of createInterface({
    input: unzip.stdout,
    crlfDelay: Infinity,
  })) {
    const t = line.trimStart();
    if (t.startsWith("<gml:posList")) {
      if (!kind || skip) continue;
      const v = t
        .slice(t.indexOf(">") + 1, t.lastIndexOf("<"))
        .split(" ")
        .map(Number);
      if (v[0] < E_MIN || v[0] >= E_MAX || v[1] < N_MIN || v[1] >= N_MAX) continue;
      addTriangle(kind, v);
    } else if (t.startsWith("<bldg:Building ")) {
      const id = t.match(/gml:id="([^"]+)"/)[1];
      skip = seen.has(id);
      if (skip) stats.dupes++;
      seen.add(id);
    } else if (t.startsWith("<bldg:RoofSurface")) kind = "roof";
    else if (t.startsWith("<bldg:WallSurface")) kind = "wall";
    else if (/^<bldg:\w+Surface /.test(t)) {
      kind = null;
      const tag = t.slice(1, t.indexOf(" "));
      stats.other[tag] = (stats.other[tag] ?? 0) + 1;
    } else if (/^<\/bldg:\w+Surface>/.test(t)) kind = null;
  }
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
      const list = c[kind];
      if (!list.length) continue;
      const position = doc
        .createAccessor()
        .setType("VEC3")
        .setArray(list.data.slice(0, list.length))
        .setBuffer(buffer);
      mesh.addPrimitive(
        doc.createPrimitive().setAttribute("POSITION", position).setMaterial(materials[kind]),
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
