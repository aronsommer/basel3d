// KTX2 textures for the ground: ETC1S with mipmaps, flipped, because compressed textures are
// uploaded without flipY. Tiles are encoded in parallel, by this module run as worker threads.
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";
import { E_MIN, E_MAX, CHUNK } from "./area.mjs";

const TEXTURE = 1024; // px per tile unless given: compressed mipmaps need sizes divisible by 4

// Encodes a square RGBA raster whose size is a power of two; quality 1 to 255 (smaller files).
export const encodeTexture = (data, size, quality = 255) =>
  encodeToKTX2(data, {
    isUASTC: false,
    qualityLevel: quality,
    isYFlip: true,
    imageDecoder: async () => ({ width: size, height: size, data }),
  });

if (!isMainThread)
  parentPort.on("message", async ({ data, size, quality }) =>
    parentPort.postMessage(await encodeTexture(data, size, quality)),
  );

// Cuts a raster of the whole area (north-west corner first) into one texture of texture px per
// 1 km tile: <dir>/<column>_<row>.ktx2; only those named in only if given; quality as above.
export async function writeTiles(
  raster,
  width,
  height,
  channels,
  dir,
  { texture = TEXTURE, only, quality } = {},
) {
  mkdirSync(dir, { recursive: true });
  const size = (width * CHUNK) / (E_MAX - E_MIN); // raster px per tile
  const tiles = [];
  for (let iz = 0; iz < height / size; iz++)
    for (let ix = 0; ix < width / size; ix++)
      if (!only || only.has(`${ix}_${iz}`)) tiles.push([ix, iz]);
  const threads = Math.min(availableParallelism(), tiles.length);
  await Promise.all(
    Array.from({ length: threads }, async () => {
      const worker = new Worker(new URL(import.meta.url));
      for (let tile; (tile = tiles.pop());) {
        const [ix, iz] = tile;
        const data = await sharp(raster, { raw: { width, height, channels } })
          .extract({ left: ix * size, top: iz * size, width: size, height: size })
          .resize(texture, texture)
          .ensureAlpha()
          .raw()
          .toBuffer();
        const encoded = await new Promise((resolve, reject) => {
          worker.once("message", resolve);
          worker.once("error", reject);
          worker.postMessage({ data, size: texture, quality });
        });
        worker.removeAllListeners("error");
        writeFileSync(join(dir, `${ix}_${iz}.ktx2`), encoded);
      }
      await worker.terminate();
    }),
  );
}
