// The modelled bridges of the canton Basel-Stadt (3D-Tiles BS, dataset "Brücken" of the
// Amtliche Vermessung, CC BY 4.0, "Quelle: Geodaten Kanton Basel-Stadt"). The tiles are cached in
// data/bs-bruecken/ and converted to scene coordinates.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { DATA, Y0, toX, toZ } from "./area.mjs";
import { toLV95 } from "./osm.mjs";

const TILESET = "https://3d.geo.bs.ch/cesium/tiles/av-bruecken/tileset.json";
const DIR = join(DATA, "bs-bruecken");
// All bridge triangles that tools/bridges.mjs builds, for tools/map.mjs.
export const BRIDGES_FILE = join(DATA, "bridges.bin");

// Downloads (once) every b3dm of the tileset, following nested tilesets; returns their files.
async function tiles() {
  const list = join(DIR, "tiles.json");
  if (existsSync(list)) return JSON.parse(readFileSync(list, "utf8"));
  mkdirSync(DIR, { recursive: true });
  const files = [];
  async function visit(url) {
    const stack = [(await (await fetch(url)).json()).root];
    while (stack.length) {
      const tile = stack.pop();
      stack.push(...(tile.children ?? []));
      const uri = tile.content?.uri ?? tile.content?.url;
      if (!uri) continue;
      const href = new URL(uri, url).href;
      if (uri.endsWith(".json")) await visit(href);
      else {
        const file = join(DIR, `${files.length}.b3dm`);
        writeFileSync(file, Buffer.from(await (await fetch(href)).arrayBuffer()));
        files.push(file);
      }
    }
  }
  await visit(TILESET);
  writeFileSync(list, JSON.stringify(files));
  return files;
}

// WGS84 earth-centred coordinates → scene [x, y, z] (latitude by Bowring's formula).
function toScene(x, y, z) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = f * (2 - f);
  const p = Math.hypot(x, y);
  const theta = Math.atan2(z * a, p * b);
  const lat = Math.atan2(
    z + ((a * a - b * b) / (b * b)) * b * Math.sin(theta) ** 3,
    p - e2 * a * Math.cos(theta) ** 3,
  );
  const height = p / Math.cos(lat) - a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const [e, n] = toLV95({ lat: (lat * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI });
  return [toX(e), height - Y0, toZ(n)]; // the tiles store heights above sea level
}

// All bridge triangles as scene positions, three vertices (nine numbers) per triangle.
export async function bridgeTriangles() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const out = [];
  for (const file of await tiles()) {
    const b3dm = readFileSync(file);
    const glb = 28 + [12, 16, 20, 24].reduce((sum, o) => sum + b3dm.readUInt32LE(o), 0);
    const doc = await io.readBinary(new Uint8Array(b3dm.subarray(glb)));
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue;
      const m = node.getWorldMatrix();
      for (const primitive of node.getMesh().listPrimitives()) {
        const position = primitive.getAttribute("POSITION");
        const indices = primitive.getIndices();
        const count = indices ? indices.getCount() : position.getCount();
        const v = [0, 0, 0];
        for (let i = 0; i < count; i++) {
          position.getElement(indices ? indices.getScalar(i) : i, v);
          out.push(
            ...toScene(
              m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
              m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
              m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
            ),
          );
        }
      }
    }
  }
  return new Float32Array(out);
}

// The height of the highest triangle above a scene point { x, z }, or -Infinity if none is.
export function bridgeTop(triangles) {
  const CELL = 20; // metres
  const grid = new Map();
  for (let t = 0; t < triangles.length; t += 9) {
    const xs = [triangles[t], triangles[t + 3], triangles[t + 6]];
    const zs = [triangles[t + 2], triangles[t + 5], triangles[t + 8]];
    for (
      let cx = Math.floor(Math.min(...xs) / CELL);
      cx <= Math.floor(Math.max(...xs) / CELL);
      cx++
    )
      for (
        let cz = Math.floor(Math.min(...zs) / CELL);
        cz <= Math.floor(Math.max(...zs) / CELL);
        cz++
      )
        grid.set(`${cx} ${cz}`, [...(grid.get(`${cx} ${cz}`) ?? []), t]);
  }
  const side = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  return ({ x, z }) => {
    let top = -Infinity;
    for (const t of grid.get(`${Math.floor(x / CELL)} ${Math.floor(z / CELL)}`) ?? []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(t, t + 9);
      const d1 = side(ax, az, bx, bz, x, z);
      const d2 = side(bx, bz, cx, cz, x, z);
      const d3 = side(cx, cz, ax, az, x, z);
      const sum = d1 + d2 + d3; // twice the signed area; 0 for walls seen edge-on
      if (sum === 0 || ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) continue;
      top = Math.max(top, (ay * d2 + by * d3 + cy * d1) / sum); // barycentric
    }
    return top;
  };
}

// Whether a scene point { x, z } lies under one of the triangles (seen from above).
export function underBridges(triangles) {
  const top = bridgeTop(triangles);
  return (p) => top(p) > -Infinity;
}
