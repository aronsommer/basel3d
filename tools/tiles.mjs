// KTX2 textures for the ground: ETC1S with mipmaps, flipped, because compressed textures are
// uploaded without flipY.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";
import { E_MIN, E_MAX, CHUNK } from "./area.mjs";

const TEXTURE = 1024; // px per tile: compressed mipmaps need sizes divisible by 4

// Encodes a square RGBA raster whose size is a power of two.
export const encodeTexture = (data, size) =>
  encodeToKTX2(data, {
    isUASTC: false,
    qualityLevel: 255,
    isYFlip: true,
    imageDecoder: async () => ({ width: size, height: size, data }),
  });

// Cuts a raster of the whole area (north-west corner first) into one texture per 1 km tile:
// <dir>/<column>_<row>.ktx2.
export async function writeTiles(raster, width, height, channels, dir) {
  mkdirSync(dir, { recursive: true });
  const size = (width * CHUNK) / (E_MAX - E_MIN); // raster px per tile
  for (let iz = 0; iz < height / size; iz++)
    for (let ix = 0; ix < width / size; ix++) {
      const data = await sharp(raster, { raw: { width, height, channels } })
        .extract({ left: ix * size, top: iz * size, width: size, height: size })
        .resize(TEXTURE, TEXTURE)
        .ensureAlpha()
        .raw()
        .toBuffer();
      writeFileSync(join(dir, `${ix}_${iz}.ktx2`), await encodeTexture(data, TEXTURE));
    }
}
