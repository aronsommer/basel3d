// Downloads swissALTI3D (terrain, 2 m) and SWISSIMAGE (aerial photo, 1 m) for the area into data/
// and writes public/terrain/ (terrain.json, and terrain.bin: per 1 km tile a mesh at most MAX_ERROR
// off swissALTI3D, read by src/terrain.js) and public/ground/photo/ (one aerial-photo KTX2 per
// 1 km tile).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromArrayBuffer } from "geotiff";
import { E_MIN, E_MAX, N_MIN, N_MAX, Y0, CHUNK, DATA, PUBLIC, toX, toZ } from "./area.mjs";
import {
  newestTiles,
  download,
  forEachParallel,
  WMTS,
  PHOTO_DIR,
  photoTiles,
  photoMosaic,
} from "./swisstopo.mjs";
import { writeTiles } from "./tiles.mjs";
import { Bytes } from "./pack.mjs";
import { GRID, walk } from "../src/terrain.js";

const CELL = 10; // metres between the points of the grid that fills where swissALTI3D has none
const ALTI_DIR = join(DATA, "swissalti3d");
const OUT = join(PUBLIC, "terrain");

// --- Terrain: newest swissALTI3D 2 m tile per square kilometre ("2612-1266") overlapping the area.
async function altiUrls() {
  const newest = await newestTiles("ch.swisstopo.swissalti3d", "_2_2056_5728.tif");
  return [...newest]
    .filter(([key]) => {
      const [e, n] = key.split("-").map((k) => k * 1000);
      return e < E_MAX && e + 1000 > E_MIN && n < N_MAX && n + 1000 > N_MIN;
    })
    .map(([, { href }]) => href);
}

async function buildHeights() {
  mkdirSync(ALTI_DIR, { recursive: true });
  const files = [];
  await forEachParallel(await altiUrls(), 6, async (href) => {
    const file = join(ALTI_DIR, href.split("/").pop());
    if (await download(href, file)) files.push(file);
  });

  // 2 m mosaic over whole kilometre tiles; NaN where swisstopo has no data (outside Switzerland).
  const RES = 2;
  const e0 = Math.floor(E_MIN / 1000) * 1000;
  const n1 = Math.ceil(N_MAX / 1000) * 1000;
  const w = (Math.ceil(E_MAX / 1000) * 1000 - e0) / RES;
  const h = (n1 - Math.floor(N_MIN / 1000) * 1000) / RES;
  const dem = new Float32Array(w * h).fill(NaN);
  for (const file of files) {
    const buf = readFileSync(file);
    const tiff = await fromArrayBuffer(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
    const image = await tiff.getImage();
    const [left, top] = image.getOrigin();
    const [raster] = await image.readRasters();
    const nodata = image.getGDALNoData();
    const tw = image.getWidth();
    const ox = (left - e0) / RES;
    const oy = (n1 - top) / RES;
    for (let y = 0; y < image.getHeight(); y++)
      for (let x = 0; x < tw; x++) {
        const v = raster[y * tw + x];
        if (v !== nodata) dem[(oy + y) * w + ox + x] = v;
      }
  }

  // Bilinear samples on the CELL grid (pixel centres sit half a pixel inside each tile).
  const nx = (E_MAX - E_MIN) / CELL + 1;
  const nz = (N_MAX - N_MIN) / CELL + 1;
  const heights = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const fx = Math.min(Math.max((E_MIN + ix * CELL - e0) / RES - 0.5, 0), w - 1.001);
      const fy = Math.min(Math.max((n1 - (N_MAX - iz * CELL)) / RES - 0.5, 0), h - 1.001);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const tx = fx - x;
      const ty = fy - y;
      const i = y * w + x;
      heights[iz * nx + ix] =
        (dem[i] * (1 - tx) + dem[i + 1] * tx) * (1 - ty) +
        (dem[i + w] * (1 - tx) + dem[i + w + 1] * tx) * ty -
        Y0;
    }
  fillGaps(heights, nx, nz);
  // The height (scene y) at LV95 e, n: swissALTI3D's, bilinear between pixel centres, else the
  // filled grid's.
  return (e, n) => {
    const [fx, fy] = [(e - e0) / RES - 0.5, (n1 - n) / RES - 0.5];
    const [x, y] = [Math.floor(fx), Math.floor(fy)];
    const i = y * w + x;
    const v =
      x >= 0 && y >= 0 && x < w - 1 && y < h - 1
        ? (dem[i] * (x + 1 - fx) + dem[i + 1] * (fx - x)) * (y + 1 - fy) +
          (dem[i + w] * (x + 1 - fx) + dem[i + w + 1] * (fx - x)) * (fy - y)
        : NaN;
    if (!Number.isNaN(v)) return v - Y0;
    const gx = Math.min(Math.max((e - E_MIN) / CELL, 0), nx - 1.001);
    const gz = Math.min(Math.max((N_MAX - n) / CELL, 0), nz - 1.001);
    const [ix, iz] = [Math.floor(gx), Math.floor(gz)];
    const j = iz * nx + ix;
    return (
      (heights[j] * (ix + 1 - gx) + heights[j + 1] * (gx - ix)) * (iz + 1 - gz) +
      (heights[j + nx] * (ix + 1 - gx) + heights[j + nx + 1] * (gx - ix)) * (gz - iz)
    );
  };
}

// Fills NaN cells (no data) from their neighbours, growing inwards from the known edge.
function fillGaps(grid, nx, nz) {
  let missing = grid.reduce((n, v) => n + Number.isNaN(v), 0);
  while (missing > 0) {
    const next = grid.slice();
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        if (!Number.isNaN(grid[iz * nx + ix])) continue;
        let sum = 0;
        let n = 0;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = ix + dx;
          const z = iz + dz;
          const v = grid[z * nx + x];
          if (x >= 0 && x < nx && z >= 0 && z < nz && !Number.isNaN(v)) {
            sum += v;
            n++;
          }
        }
        if (n) {
          next[iz * nx + ix] = sum / n;
          missing--;
        }
      }
    grid.set(next);
  }
}

// --- Aerial photo: SWISSIMAGE (tools/swisstopo.mjs).

async function buildPhotos() {
  mkdirSync(PHOTO_DIR, { recursive: true });
  let missing = 0;
  await forEachParallel(photoTiles(), 8, async (t) => {
    if (!(await download(`${WMTS}/${t.col}/${t.row}.jpeg`, t.file))) missing++;
  });
  if (missing) console.log(`${missing} aerial tiles not available`);
  await writeTiles(
    await photoMosaic(),
    E_MAX - E_MIN,
    N_MAX - N_MIN,
    3,
    join(PUBLIC, "ground", "photo"),
  );
}

// --- The terrain's meshes (src/terrain.js): per tile the heights on its grid, halved where the
// mesh would be more than MAX_ERROR off them (mapbox/martini's errors).
const MAX_ERROR = 1; // metres
const SIDE = GRID + 1;
// Per triangle that can be halved, its corners a, b (the longest side) as [ax, ay, bx, by].
const halvable = [];
for (let i = 0; i < GRID * GRID * 2 - 2; i++) {
  let id = i + 2;
  let [ax, ay, bx, by, cx, cy] = id & 1 ? [0, 0, GRID, GRID, GRID, 0] : [GRID, GRID, 0, 0, 0, GRID];
  while ((id >>= 1) > 1) {
    const [mx, my] = [(ax + bx) >> 1, (ay + by) >> 1];
    if (id & 1) [ax, ay, bx, by] = [cx, cy, ax, ay];
    else [ax, ay, bx, by] = [bx, by, cx, cy];
    [cx, cy] = [mx, my];
  }
  halvable.push([ax, ay, bx, by]);
}
// Per grid point the most the mesh is off within the triangles it halves.
function errorsOf(heights) {
  const errors = new Float32Array(SIDE * SIDE);
  const parents = halvable.length - GRID * GRID;
  for (let i = halvable.length - 1; i >= 0; i--) {
    const [ax, ay, bx, by] = halvable[i];
    const [mx, my] = [(ax + bx) >> 1, (ay + by) >> 1];
    const [cx, cy] = [mx + my - ay, my + ax - mx];
    const m = my * SIDE + mx;
    errors[m] = Math.max(
      errors[m],
      Math.abs((heights[ay * SIDE + ax] + heights[by * SIDE + bx]) / 2 - heights[m]),
    );
    if (i < parents)
      errors[m] = Math.max(
        errors[m],
        errors[((ay + cy) >> 1) * SIDE + ((ax + cx) >> 1)],
        errors[((by + cy) >> 1) * SIDE + ((bx + cx) >> 1)],
      );
  }
  return errors;
}

mkdirSync(OUT, { recursive: true });
console.time("terrain");
const heightAt = await buildHeights();
const [columns, rows] = [(E_MAX - E_MIN) / CHUNK, (N_MAX - N_MIN) / CHUNK];
const bits = [];
const bytes = new Bytes();
for (let iz = 0; iz < rows; iz++)
  for (let ix = 0; ix < columns; ix++) {
    const step = CHUNK / GRID;
    const heights = Float32Array.from({ length: SIDE * SIDE }, (_, k) =>
      heightAt(
        E_MIN + ix * CHUNK + (k % SIDE) * step,
        N_MAX - iz * CHUNK - Math.floor(k / SIDE) * step,
      ),
    );
    const errors = errorsOf(heights);
    const cm = Int32Array.from(heights, (v) => Math.round(v * 100));
    const stored = new Uint8Array(SIDE * SIDE);
    for (const key of [0, GRID, GRID * SIDE, GRID * SIDE + GRID]) {
      bytes.signed(cm[key]);
      stored[key] = 1;
    }
    walk(
      (a, b, m) => {
        const halve = errors[m] > MAX_ERROR;
        bits.push(halve);
        if (halve && !stored[m]) {
          bytes.signed(cm[m] - Math.floor((cm[a] + cm[b]) / 2));
          stored[m] = 1;
        }
        return halve;
      },
      () => {},
    );
  }
const flags = new Uint8Array(Math.ceil(bits.length / 8));
bits.forEach((bit, i) => (flags[i >> 3] |= bit << (i & 7)));
writeFileSync(
  join(OUT, "terrain.bin"),
  Buffer.concat([
    Buffer.from(new Uint32Array([flags.length]).buffer),
    flags,
    Buffer.from(bytes.list),
  ]),
);
writeFileSync(
  join(OUT, "terrain.json"),
  JSON.stringify({ x0: toX(E_MIN), z0: toZ(N_MAX), chunk: CHUNK, columns, rows }),
);
console.timeEnd("terrain");
console.time("photos");
await buildPhotos();
console.timeEnd("photos");
