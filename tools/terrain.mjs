// Downloads swissALTI3D (terrain, 2 m) and SWISSIMAGE (aerial photo, 1 m) for the area into data/
// and writes public/terrain/ (terrain.json, heights.bin in cm, packed by tools/pack.mjs) and public/ground/photo/
// (one aerial-photo KTX2 per 1 km tile).
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
import { packHeights } from "./pack.mjs";

const CELL = 10; // terrain grid spacing in metres (must divide CHUNK)
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
  return { heights, nx, nz };
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

mkdirSync(OUT, { recursive: true });
console.time("terrain");
const { heights, nx, nz } = await buildHeights();
const cm = Int16Array.from(heights, (v) => Math.round(v * 100));
if (cm.some((v, i) => v !== Math.round(heights[i] * 100))) throw new Error("Heights exceed ±327 m");
writeFileSync(join(OUT, "heights.bin"), packHeights(cm, nx));
writeFileSync(
  join(OUT, "terrain.json"),
  JSON.stringify({
    x0: toX(E_MIN),
    z0: toZ(N_MAX),
    cell: CELL,
    nx,
    nz,
    chunk: CHUNK,
  }),
);
console.timeEnd("terrain");
console.time("photos");
await buildPhotos();
console.timeEnd("photos");
