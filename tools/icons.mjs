// Writes img/favicon.ico and img/apple-touch-icon.png: the black Baselstab (src/baselstab.js) on
// magenta. Rounded corners for the browser tab; square and edge to edge for the touch icon, which
// iOS rounds itself and Google's search results can show.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { BASELSTAB } from "../src/baselstab.js";

const IMG = new URL("../img/", import.meta.url);
const MAGENTA = "#ff00ff"; // as --magenta in style.css
const HIGH = 0.78; // the Baselstab's height, of the icon's
const RADIUS = 0.2; // favicon only: corner radius, of the icon's size

const xs = BASELSTAB.flat().map(([x]) => x);
const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
const paths = BASELSTAB.map(
  (points) =>
    `<path d="M${points.map(([x, y]) => `${(0.5 + (x - middle) * HIGH).toFixed(4)} ${(0.5 + (0.5 - y) * HIGH).toFixed(4)}`).join("L")}Z"/>`,
).join("");

// The icon as a PNG, size px wide; when square, without transparency and in a palette (smaller).
const png = (size, radius) => {
  const icon = sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1 1">` +
        `<rect width="1" height="1" rx="${radius}" fill="${MAGENTA}"/><g>${paths}</g></svg>`,
    ),
  );
  return (radius ? icon.png() : icon.removeAlpha().png({ palette: true })).toBuffer();
};

writeFileSync(new URL("apple-touch-icon.png", IMG), await png(180, 0));

// An ICO of PNGs: a 6-byte header, a 16-byte entry per image, then the images.
const images = await Promise.all([48, 32, 16].map((size) => png(size, RADIUS)));
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
