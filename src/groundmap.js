// Draws the map's tiles from the shapes of public/ground/map.bin and the aerial photo's part in
// public/ground/soft.bin (tools/map.mjs), with the shadows round the buildings of
// public/basel.bin. Needs no window: src/ground-worker.js runs it.
import { Packed } from "./pack.js";
import { readCity } from "./cityfile.js";

const BRIGHTEST = 1.35; // the largest factor of the patches, as in tools/map.mjs
// The shadows round the buildings: their roofs seen from above, blurred by this many metres,
// darken the ground by this share.
const SHADOWS = [
  [1.5, 0.42],
  [5, 0.5],
];
const MARGIN = 16; // metres round a tile whose roofs still shade it

// The size × size values blurred by sigma pixels, nearly as a Gaussian blur does: three running
// means each way, the edge's values repeated beyond it.
function blur(values, size, sigma) {
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  const low = Math.floor(ideal) - (Math.floor(ideal) % 2 ? 0 : 1); // odd
  const wider = Math.round((12 * sigma * sigma - 3 * low * low - 12 * low - 9) / (-4 * low - 4));
  let [from, to] = [Float32Array.from(values), new Float32Array(values.length)];
  const last = size - 1;
  for (let pass = 0; pass < 3; pass++) {
    const radius = (pass < wider ? low : low + 2) >> 1;
    if (!radius) continue;
    for (let way = 0; way < 2; way++) {
      const step = way ? size : 1; // along a row, then along a column
      const line = way ? 1 : size;
      for (let l = 0; l < size; l++) {
        const start = l * line;
        let sum = (radius + 1) * from[start];
        for (let i = 1; i <= radius; i++) sum += from[start + Math.min(i, last) * step];
        for (let i = 0; i < size; i++) {
          to[start + i * step] = sum / (2 * radius + 1);
          sum +=
            from[start + Math.min(i + radius + 1, last) * step] -
            from[start + Math.max(i - radius, 0) * step];
        }
      }
      [from, to] = [to, from];
    }
  }
  return from;
}

// Sets covered to 1 for each of its size × size pixels (`pixel` metres wide, the first at x0, y0)
// whose middle lies in one of the triangles [x, y, x, y, x, y, …].
function cover(covered, triangles, size, pixel, x0, y0) {
  for (let t = 0; t < triangles.length; t += 6) {
    let [low, high] = [Infinity, -Infinity];
    for (let k = 1; k < 6; k += 2) {
      const y = (triangles[t + k] - y0) / pixel;
      if (y < low) low = y;
      if (y > high) high = y;
    }
    for (let row = Math.max(0, Math.ceil(low - 0.5)); row <= high - 0.5 && row < size; row++) {
      const y = y0 + (row + 0.5) * pixel;
      let [left, right] = [Infinity, -Infinity];
      for (let k = 0; k < 6; k += 2) {
        const [ax, ay] = [triangles[t + k], triangles[t + k + 1]];
        const [bx, by] = [triangles[t + ((k + 2) % 6)], triangles[t + ((k + 3) % 6)]];
        if (ay <= y === by <= y) continue;
        const x = (ax + ((y - ay) / (by - ay)) * (bx - ax) - x0) / pixel;
        if (x < left) left = x;
        if (x > right) right = x;
      }
      const end = Math.min(size - 1, Math.floor(right - 0.5));
      for (let column = Math.max(0, Math.ceil(left - 0.5)); column <= end; column++)
        covered[row * size + column] = 1;
    }
  }
}

// files: { map, soft, city } as ArrayBuffers (city may be missing: no shadows);
// origin: the scene's x and z at the map's north-west corner; make: { canvas(width, height),
// image(bytes): a promise of a drawable WebP image, Path2D, ImageData }.
// Gives { chunk: metres across a tile, decks: the names ("column_row") of the tiles with bridge
// decks, draw }.
export function createGroundMap({ map, soft, city }, origin, make) {
  const length = new Uint32Array(map, 0, 1)[0];
  const { background, sidewalk, chunk, decks, styles } = JSON.parse(
    new TextDecoder().decode(new Uint8Array(map, 4, length)),
  );
  const packed = new Packed(new Uint8Array(map, 4 + length));
  // The green areas are painted BRIGHTEST times brighter, as their patches only darken.
  for (const style of styles) {
    style.paint = style.fill ?? style.stroke;
    if (style.green)
      style.paint = `rgb(${[1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(style.fill.slice(i, i + 2), 16) * BRIGHTEST)))})`;
  }

  // Per geometry its path and box [x0, y0, x1, y1], in metres from the north-west corner.
  const geometries = [];
  let [x, y] = [0, 0];
  for (let left = packed.number(); left > 0; left--) {
    const path = new make.Path2D();
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const rings = packed.number();
    for (let ring = rings >> 1; ring > 0; ring--) {
      for (let i = 0, points = packed.number(); i < points; i++) {
        x += packed.signed();
        y += packed.signed();
        if (i) path.lineTo(x / 10, y / 10);
        else path.moveTo(x / 10, y / 10);
        box[0] = Math.min(box[0], x / 10);
        box[1] = Math.min(box[1], y / 10);
        box[2] = Math.max(box[2], x / 10);
        box[3] = Math.max(box[3], y / 10);
      }
      if (rings & 1) path.closePath();
    }
    geometries.push({ path, box });
  }
  // The shapes of the ground and of the decks, per tile in drawing order: [{ style, path, box,
  // order: its place in that order }].
  const tiles = (column, row) => `${column}_${row}`;
  const [ground, deck] = [0, 1].map(() => {
    const perTile = new Map();
    let g = 0;
    for (let left = packed.number(), order = 0; left > 0; left--, order++) {
      const style = styles[packed.number()];
      const { path, box } = geometries[(g += packed.signed())];
      const reach = (style.width ?? 0) / 2;
      for (let c = Math.floor((box[0] - reach) / chunk); c <= (box[2] + reach) / chunk; c++)
        for (let r = Math.floor((box[1] - reach) / chunk); r <= (box[3] + reach) / chunk; r++) {
          if (!perTile.has(tiles(c, r))) perTile.set(tiles(c, r), []);
          perTile.get(tiles(c, r)).push({ style, path, box, order });
        }
    }
    return perTile;
  });

  // The soft images' bytes, by tile row by row; how many tiles a row has.
  const lengths = new Uint32Array(soft, 0, 1 + new Uint32Array(soft, 0, 1)[0]).subarray(1);
  const across = Math.sqrt(lengths.length);
  const softBytes = (column, row) => {
    if (column < 0 || row < 0 || column >= across || row >= across) return null;
    let offset = (1 + lengths.length) * 4;
    for (let i = 0; i < row * across + column; i++) offset += lengths[i];
    return new Uint8Array(soft, offset, lengths[row * across + column]);
  };

  // The roofs' triangles seen from above ([x, y, x, y, x, y, …]) per tile they or their shadows
  // reach.
  const roofs = new Map();
  if (city) {
    let transform = null;
    readCity(
      city,
      (scale, mx, my, mz, normalized) =>
        (transform = [scale / (normalized ? 32767 : 1), mx - origin[0], mz - origin[1]]),
      (number, pos, roof) => {
        const [scale, dx, dy] = transform;
        const corners = [0, 0, 0, 0, 0, 0];
        for (let t = 0; t < roof.length; t += 3) {
          for (let k = 0; k < 3; k++) {
            corners[k * 2] = pos[roof[t + k] * 3] * scale + dx;
            corners[k * 2 + 1] = pos[roof[t + k] * 3 + 2] * scale + dy;
          }
          const c0 = Math.floor((Math.min(corners[0], corners[2], corners[4]) - MARGIN) / chunk);
          const c1 = (Math.max(corners[0], corners[2], corners[4]) + MARGIN) / chunk;
          const r0 = Math.floor((Math.min(corners[1], corners[3], corners[5]) - MARGIN) / chunk);
          const r1 = (Math.max(corners[1], corners[3], corners[5]) + MARGIN) / chunk;
          for (let c = c0; c <= c1; c++)
            for (let r = r0; r <= r1; r++) {
              if (!roofs.has(tiles(c, r))) roofs.set(tiles(c, r), []);
              roofs.get(tiles(c, r)).push(...corners);
            }
        }
      },
    );
    for (const [name, list] of roofs) roofs.set(name, Float32Array.from(list));
  }

  // The square of `extent` metres with its north-west corner x0, y0 metres from the map's, as
  // { ground, deck }: canvases px wide, south up as the terrain's textures are; deck: the decks'
  // roads there if it is a tile with decks or a smaller square with a deck's road, else null.
  async function draw(x0, y0, extent, px) {
    const scale = px / extent;
    // The tiles it lies on.
    const names = [];
    for (let row = Math.floor(y0 / chunk); row * chunk < y0 + extent; row++)
      for (let column = Math.floor(x0 / chunk); column * chunk < x0 + extent; column++)
        names.push([tiles(column, row), column, row]);
    // The shapes of all of them, in drawing order, each once.
    const shapesOf = (perTile) => {
      if (names.length === 1) return perTile.get(names[0][0]) ?? [];
      const all = new Map();
      for (const [name] of names) for (const s of perTile.get(name) ?? []) all.set(s.order, s);
      return [...all.values()].sort((a, b) => a.order - b.order);
    };
    const layer = (width = px) => make.canvas(width, width).getContext("2d");
    // Metres from the north-west corner → pixels of a canvas `size` wide showing the square and
    // `margin` metres round it, `pixel` metres per pixel.
    const view = (context, pixel = 1 / scale, margin = 0, size = px) => {
      context.setTransform(
        1 / pixel,
        0,
        0,
        -1 / pixel,
        -(x0 - margin) / pixel,
        size + (y0 - margin) / pixel,
      );
      context.lineCap = context.lineJoin = "round";
    };
    const paintShapes = (context, shapes, paint) => {
      for (const { style, path } of shapes) {
        if (!paint(context, style)) continue;
        if (style.fill) context.fill(path, "evenodd");
        else {
          context.lineWidth = style.width;
          context.stroke(path);
        }
      }
    };
    const colours = (context, style) => (context.fillStyle = context.strokeStyle = style.paint);

    // The land's lawn, tile by tile (left halves of the soft images), the shapes on it.
    const shapes = shapesOf(ground);
    const context = layer();
    view(context);
    context.fillStyle = background;
    context.fillRect(x0, y0, extent, extent);
    const photos = [];
    for (const [, column, row] of names) {
      const bytes = softBytes(column, row);
      if (bytes) photos.push([await make.image(bytes), column * chunk, row * chunk]);
    }
    // A half (0 or 1) of each tile's soft image on its tile: the half's outer pixels are its
    // neighbours', so they lie round the tile and only join it smoothly to them.
    const soften = (target, half) => {
      for (const [photo, x, y] of photos) {
        const side = photo.height;
        const pixel = chunk / (side - 2);
        target.save();
        target.beginPath();
        target.rect(x, y, chunk, chunk);
        target.clip();
        target.drawImage(
          photo,
          half * side,
          0,
          side,
          side,
          x - pixel,
          y - pixel,
          chunk + 2 * pixel,
          chunk + 2 * pixel,
        );
        target.restore();
      }
    };
    soften(context, 0);
    paintShapes(context, shapes, colours);
    // The patches (right halves), where a green area shows: the others cut their shapes out of
    // the green ones.
    if (photos.length && shapes.some(({ style }) => style.green)) {
      const patches = layer();
      view(patches);
      soften(patches, 1);
      const green = layer();
      view(green);
      paintShapes(green, shapes, (c, style) => {
        c.globalCompositeOperation = style.green ? "source-over" : "destination-out";
        return true;
      });
      green.resetTransform();
      green.globalCompositeOperation = "source-in";
      green.drawImage(patches.canvas, 0, 0);
      context.resetTransform();
      context.globalCompositeOperation = "multiply";
      context.drawImage(green.canvas, 0, 0);
      context.globalCompositeOperation = "source-over";
    }
    for (const [photo] of photos) photo.close?.();
    // The shadows round the buildings: their roofs seen from above, with pixels of a quarter of
    // a metre or more (at most 1024 across) and those of MARGIN round the square, blurred, as
    // black the more opaque the darker.
    const lists = names.map(([name]) => roofs.get(name)).filter(Boolean);
    if (lists.length) {
      const pixel = Math.max(extent / px, extent / 1024, 0.25);
      const margin = Math.ceil(MARGIN / pixel);
      const size = Math.round(extent / pixel) + 2 * margin;
      const covered = new Uint8Array(size * size);
      for (const list of lists)
        cover(covered, list, size, pixel, x0 - margin * pixel, y0 - margin * pixel);
      const light = new Float32Array(size * size).fill(1);
      for (const [metres, dark] of SHADOWS) {
        const blurred = blur(covered, size, metres / pixel);
        for (let i = 0; i < light.length; i++) light[i] *= 1 - dark * blurred[i];
      }
      const shade = new make.ImageData(size, size); // south up
      for (let row = 0, i = 3; row < size; row++)
        for (let at = (size - 1 - row) * size, end = at + size; at < end; at++, i += 4)
          shade.data[i] = 255 * (1 - light[at]);
      const canvas = make.canvas(size, size);
      canvas.getContext("2d").putImageData(shade, 0, 0);
      context.resetTransform();
      context.drawImage(
        canvas,
        -margin * pixel * scale,
        -margin * pixel * scale,
        size * pixel * scale,
        size * pixel * scale,
      );
    }

    const roads = shapesOf(deck);
    const reaches = ({ box, style }) =>
      box[2] + (style.width ?? 0) / 2 > x0 &&
      box[0] - (style.width ?? 0) / 2 < x0 + extent &&
      box[3] + (style.width ?? 0) / 2 > y0 &&
      box[1] - (style.width ?? 0) / 2 < y0 + extent;
    if (extent === chunk ? !decks.includes(names[0][0]) : !roads.some(reaches))
      return { ground: context.canvas, deck: null };
    const top = layer();
    view(top);
    top.fillStyle = sidewalk;
    top.fillRect(x0, y0, extent, extent);
    paintShapes(top, roads, colours);
    return { ground: context.canvas, deck: top.canvas };
  }
  return { chunk, decks, draw };
}
