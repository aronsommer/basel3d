// Writes img/apple-touch-icon.png (on white), img/favicon.ico and img/loading.png (transparent,
// edge to edge) from img/icon-1024x1024.png, a transparent design inside the safe area: a circle
// 80% as wide. Given an image (npm run icons -- image), first writes that design from it: its
// white background cleared, the rest centred and scaled to fill the safe area.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const IMG = new URL("../img/", import.meta.url);
const DESIGN = new URL("icon-1024x1024.png", IMG).pathname;
const SIZE = 1024;
const SAFE = 0.4 * SIZE - 2; // the safe area's radius, less two pixels for resizing
const WHITE = 180; // background: all channels above this, reached from the edge
const BAND = 2; // pixels this near the background are partly see-through
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const small = { palette: true, colours: 256, dither: 1, compressionLevel: 9, effort: 10 };

if (process.argv[2]) {
  const { data, info } = await sharp(process.argv[2])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  const low = new Uint8Array(w * h).map((_, i) =>
    Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]),
  );

  // The background: white pixels joined to the edge, so white inside (teeth, eyes) stays.
  const back = new Uint8Array(w * h);
  const todo = [];
  for (let x = 0; x < w; x++) todo.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) todo.push(y * w, y * w + w - 1);
  while (todo.length) {
    const i = todo.pop();
    if (back[i] || low[i] <= WHITE) continue;
    back[i] = 1;
    const x = i % w;
    if (x > 0) todo.push(i - 1);
    if (x < w - 1) todo.push(i + 1);
    if (i >= w) todo.push(i - w);
    if (i < w * (h - 1)) todo.push(i + w);
  }

  // Clear it, and take the white out of the band: each pixel there is the darkest nearby one's
  // colour blended with white.
  const alpha = new Float32Array(w * h);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (back[i]) continue;
      let [near, dark] = [false, 255];
      for (let v = Math.max(0, y - BAND); v <= Math.min(h - 1, y + BAND); v++)
        for (let u = Math.max(0, x - BAND); u <= Math.min(w - 1, x + BAND); u++)
          if (back[v * w + u]) near = true;
          else dark = Math.min(dark, low[v * w + u]);
      const a = near ? Math.min(1, (255 - low[i]) / (255 - dark || 1)) : 1;
      alpha[i] = a;
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = (px[i * 4 + c] - 255 * (1 - a)) / a;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = alpha[i] * 255;

  // Centre the design and scale it so its farthest pixel touches the safe area's rim.
  const [cx, cy] = [(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2];
  let far = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (alpha[y * w + x] > 0) far = Math.max(far, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  const [width, height] = [x1 - x0 + 1, y1 - y0 + 1];
  const scale = SAFE / far;
  const [sw, sh] = [Math.round(width * scale), Math.round(height * scale)];
  const design = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width, height })
    .resize(sw, sh)
    .png()
    .toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: transparent },
  })
    .composite([
      { input: design, left: Math.round((SIZE - sw) / 2), top: Math.round((SIZE - sh) / 2) },
    ])
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(DESIGN);
}

writeFileSync(
  new URL("apple-touch-icon.png", IMG),
  await sharp(DESIGN).resize(180, 180).flatten({ background: "#ffffff" }).png(small).toBuffer(),
);

const trimmed = await sharp(DESIGN).trim().toBuffer();
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
