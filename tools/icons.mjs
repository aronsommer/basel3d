// Writes img/apple-touch-icon.png (on white), img/favicon.ico and img/loading.png (transparent,
// edge to edge) from img/icon-1024x1024.png, a transparent design inside the safe area: a circle
// 80% as wide.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const IMG = new URL("../img/", import.meta.url);
const DESIGN = new URL("icon-1024x1024.png", IMG).pathname;
const small = { palette: true, colours: 256, dither: 1, compressionLevel: 9, effort: 10 };

writeFileSync(
  new URL("apple-touch-icon.png", IMG),
  await sharp(DESIGN).resize(180, 180).flatten({ background: "#ffffff" }).png(small).toBuffer(),
);

const trimmed = await sharp(DESIGN).trim().toBuffer();
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const square = (size) =>
  sharp(trimmed)
    .resize(size, size, { fit: "contain", background: transparent })
    .png(small)
    .toBuffer();

writeFileSync(new URL("loading.png", IMG), await square(192)); // shown at 96 px

// An ICO of PNGs: a 6-byte header, a 16-byte entry per image, then the images.
const images = await Promise.all([48, 32, 16].map(square));
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach((image, i) => {
  const entry = 6 + 16 * i;
  const size = image.readUInt32BE(16); // the PNG's width
  head[entry] = head[entry + 1] = size;
  head.writeUInt16LE(1, entry + 4);
  head.writeUInt16LE(32, entry + 6);
  head.writeUInt32LE(image.length, entry + 8);
  head.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(new URL("favicon.ico", IMG), Buffer.concat([head, ...images]));
