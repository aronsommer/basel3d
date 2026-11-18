// Draws a map of the area from OpenStreetMap (roads, rail, water, green areas; no text or trees),
// with the patches of the aerial photo (SWISSIMAGE, downloaded by tools/terrain.mjs) in the green
// areas and soft shadows around the buildings of public/basel.glb (tools/buildings.mjs, run it
// first), and writes it to public/ground/map/ as one KTX2 per 1 km tile, like the aerial photo.
// Also writes public/ground/deck/ for the bridge decks (see below) and public/water.ktx2 for the
// water shader in src/main.js: red marks all visible water, green and blue the downstream
// direction.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { E_MIN, E_MAX, N_MIN, N_MAX, CHUNK, PUBLIC, TREE_GRID, toX, toZ } from "./area.mjs";
import { osmElements, toLV95, roadWidth, SIDEWALK_WIDTH, onBridge } from "./osm.mjs";
import { underBridges, BRIDGES_FILE } from "./bsbridges.mjs";
import { writeTiles, encodeTexture } from "./tiles.mjs";
import { photoMosaic } from "./swisstopo.mjs";

// Pixels per 1 km tile, a power of two (compressed mipmaps). Doubling it makes the map sharper up
// close, with four times the pixels to draw, keep in memory, store and load.
const TILE_PX = 1024;
const QUALITY = 128; // of the compressed tiles, 1 to 255: lower is smaller and coarser
const PX_PER_M = TILE_PX / CHUNK;
const MASK_SIZE = 2048; // px of the water mask for the whole area (about 4 m per px)
const BACKGROUND = "#9a968c"; // built-up land
const FOOTPRINT = "#6b675e"; // under the buildings, seen where one is destroyed
const elements = await osmElements();
// Bridges built in 3D (tools/bridges.mjs, run it first): the OSM bridges whose middle lies under
// one of them are left out of the ground and drawn on their own, on sidewalk colour, into
// public/ground/deck/ for the decks (src/main.js), only the tiles holding the middle of a 3D
// bridge triangle, as the viewer sorts them.
const bridgeTriangles = new Float32Array(new Uint8Array(readFileSync(BRIDGES_FILE)).buffer);
const underBridge = underBridges(bridgeTriangles);
const deckTiles = new Set();
for (let i = 0; i < bridgeTriangles.length; i += 9) {
  const [x, z] = [0, 2].map(
    (d) => (bridgeTriangles[i + d] + bridgeTriangles[i + 3 + d] + bridgeTriangles[i + 6 + d]) / 3,
  );
  deckTiles.add(`${Math.floor((x - toX(E_MIN)) / CHUNK)}_${Math.floor((z - toZ(N_MAX)) / CHUNK)}`);
}
function coveredBridge(way) {
  if (!onBridge(way.tags ?? {})) return false;
  const points = way.geometry.filter(Boolean);
  const [a, b] = [points[(points.length - 1) >> 1], points[points.length >> 1]].map(toLV95);
  return underBridge({ x: toX((a[0] + b[0]) / 2), z: toZ((a[1] + b[1]) / 2) });
}

// --- Style: what to draw, in which colour, how wide (metres) and in which order. Muted tones about
// as bright as the aerial photo's: grey asphalt with light sidewalks and dark kerbs, greens per
// kind; the green kinds (VEGETATION) later get the photo's patches.
const WATER = "#4f8fc6";
const SIDEWALK = "#afaa9e"; // drawn on both sides of every road at least 4 m wide
const KERB = "#666564"; // a thin dark edge between sidewalk and road
const FOOTWAY = "#ada590";
const PAVED = "#a19b8d"; // squares and pedestrian areas
const BALLAST = "#5e5852"; // under railway tracks, narrow, so parallel ones stay apart
const TRAM_BED = "#5a5c5f"; // the strip of a tram track in the road, the only darker one
const ROAD = "#7a7b7a";
const GRASS = "#6a7f47";
const VEGETATION = new Set([GRASS]); // filled in by green below
const green = (colour) => (VEGETATION.add(colour), colour);
const has = (value, ...values) => values.includes(value);

function areaStyle(t) {
  if (t.natural === "water" || has(t.landuse, "basin", "reservoir") || t.waterway === "riverbank")
    return { order: 5, fill: WATER };
  if (t.leisure === "swimming_pool") return { order: 5, fill: WATER };
  if (t["area:highway"] || t.place === "square" || (t.highway && t.area === "yes"))
    return { order: 6, fill: PAVED };
  if (t.amenity === "parking") return { order: 4, fill: "#7c7c79" };
  if (has(t.natural, "beach", "sand")) return { order: 4, fill: "#c9b98c" };
  if (t.leisure === "pitch") return { order: 4, fill: green("#5b8a3c") };
  // Woods and scrub like lawn: their 3D trees stand on the photo's crowns (canopy.bin).
  if (t.landuse === "forest" || t.natural === "wood" || has(t.natural, "scrub", "heath", "wetland"))
    return { order: 3, fill: GRASS, wood: true };
  if (has(t.landuse, "allotments", "flowerbed", "orchard", "vineyard", "plant_nursery"))
    return { order: 3, fill: green("#717c4a") };
  if (has(t.leisure, "park", "garden", "playground")) return { order: 3, fill: green("#62783f") };
  if (t.landuse === "cemetery") return { order: 3, fill: green("#5c6e45") };
  if (
    has(t.landuse, "grass", "meadow", "village_green", "recreation_ground") ||
    has(t.leisure, "golf_course", "dog_park", "common") ||
    t.natural === "grassland"
  )
    return { order: 3, fill: GRASS };
  if (t.landuse === "farmland") return { order: 2, fill: green("#8a8957") };
  if (t.landuse === "railway") return { order: 1, fill: "#8a857c" }; // gravel
  if (has(t.landuse, "industrial", "commercial", "retail")) return { order: 0, fill: "#8a877f" };
  return null;
}

function lineStyle(t) {
  if (t.tunnel && t.tunnel !== "no") return null; // under the ground
  if (t.covered === "yes" || t.layer < 0) return null;
  if (has(t.waterway, "river", "canal")) return { order: 7, stroke: WATER, width: 20 };
  if (has(t.waterway, "stream", "ditch", "drain")) return { order: 7, stroke: WATER, width: 3 };
  if (has(t.railway, "rail", "light_rail", "narrow_gauge"))
    return { order: 8, stroke: BALLAST, width: 3 };
  if (t.railway === "tram") return { order: 12, stroke: TRAM_BED, width: 2.2 }; // on the road
  const width = roadWidth(t.highway);
  if (!width || t.area === "yes") return null;
  if (width < 4) return { order: 8, stroke: FOOTWAY, width };
  // Sidewalks and kerbs first under all roads, so junctions stay clean; wider roads on top.
  return [
    { order: 9, stroke: SIDEWALK, width: width + SIDEWALK_WIDTH },
    { order: 10, stroke: KERB, width: width + 0.5 },
    { order: 11 + width / 100, stroke: t.highway === "pedestrian" ? PAVED : ROAD, width },
  ];
}

// --- Geometry: WGS84 → LV95 → SVG metres from the north-west corner.
function toSvg(point) {
  const [e, n] = toLV95(point);
  return `${(e - E_MIN).toFixed(1)} ${(N_MAX - n).toFixed(1)}`;
}
const pathData = (points, close) =>
  "M" + points.filter(Boolean).map(toSvg).join("L") + (close ? "Z" : ""); // nodes outside the query box are null

// Joins a multipolygon's member ways into rings by matching end points.
function rings(lines) {
  const open = lines.map((l) => l.slice());
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  const result = [];
  while (open.length) {
    let ring = open.pop();
    for (let i = 0; i < open.length && !same(ring[0], ring.at(-1)); i++) {
      const l = open[i];
      if (same(ring.at(-1), l[0])) ring = ring.concat(l.slice(1));
      else if (same(ring.at(-1), l.at(-1))) ring = ring.concat(l.slice(0, -1).reverse());
      else continue;
      open.splice(i, 1);
      i = -1; // start over with the longer ring
    }
    result.push(ring);
  }
  return result;
}

const shapes = [];
for (const el of elements) {
  const tags = el.tags ?? {};
  if (el.type === "relation") {
    const style = areaStyle(tags);
    const ways = el.members.filter((m) => m.type === "way" && m.geometry).map((m) => m.geometry);
    if (style && ways.length)
      shapes.push({ ...style, d: rings(ways).map((r) => pathData(r, true)) });
    continue;
  }
  if (!el.geometry) continue;
  const deck = coveredBridge(el);
  const closed = el.nodes[0] === el.nodes.at(-1);
  const area = closed && areaStyle(tags);
  const line = lineStyle(tags);
  if (area) shapes.push({ ...area, deck, d: [pathData(el.geometry, true)] });
  else if (line)
    for (const style of [line].flat())
      shapes.push({ ...style, deck, d: [pathData(el.geometry, false)] });
}
shapes.sort((a, b) => a.order - b.order);
const ground = shapes.filter((s) => !s.deck);

// --- Render the whole area at once and cut it into tiles.
const svg = (size, background, paint, list = ground) => `<svg xmlns="http://www.w3.org/2000/svg"
  width="${size[0]}" height="${size[1]}" viewBox="0 0 ${E_MAX - E_MIN} ${N_MAX - N_MIN}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${list
    .map((s) =>
      s.fill
        ? `<path fill="${paint(s.fill, s)}" fill-rule="evenodd" d="${s.d.join("")}"/>`
        : `<path fill="none" stroke="${paint(s.stroke, s)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" d="${s.d.join("")}"/>`,
    )
    .join("\n")}
</svg>`;
const render = (svgText) => sharp(Buffer.from(svgText), { limitInputPixels: false });
console.time("map");
const width = Math.round((E_MAX - E_MIN) * PX_PER_M);
const height = Math.round((N_MAX - N_MIN) * PX_PER_M);
const raster = await render(svg([width, height], BACKGROUND, (c) => c))
  .raw()
  .toBuffer();
const grey = (data) => sharp(data, { raw: { width, height, channels: 1 } });
const blur = (data, metres) =>
  grey(data)
    .blur(metres * PX_PER_M)
    .extractChannel(0)
    .raw()
    .toBuffer();

// The aerial photo at the map's size: its colours (rgb), their brightness (photo) and both
// blurred a little against noise (soft).
const rgb = await sharp(await photoMosaic(), {
  raw: { width: E_MAX - E_MIN, height: N_MAX - N_MIN, channels: 3 },
})
  .resize(width, height)
  .raw()
  .toBuffer();
const soft = await sharp(rgb, { raw: { width, height, channels: 3 } })
  .blur(1.5 * PX_PER_M)
  .raw()
  .toBuffer();
const brightness = (data, i) =>
  (77 * data[i * 3] + 150 * data[i * 3 + 1] + 29 * data[i * 3 + 2]) >> 8;
const photo = Uint8Array.from({ length: width * height }, (_, i) => brightness(rgb, i));

// The photo's patches in the green areas: each pixel's brightness against the mean of the green
// within about 20 m, so lawns, fields and woods show their real stripes, paths and shade, without
// the photo's colours. Blurred only over green, so roads beside it do not shine in.
const vegetation = await render(
  svg([width, height], "#000", (c) => (VEGETATION.has(c) ? "#fff" : "#000")),
)
  .extractChannel(0)
  .raw()
  .toBuffer();
const litGreen = photo.map((v, i) => (v * vegetation[i]) / 255);
const [near, nearGreen, around, aroundGreen] = await Promise.all([
  blur(litGreen, 1.2),
  blur(vegetation, 1.2),
  blur(litGreen, 20),
  blur(vegetation, 20),
]);

// Gardens and courtyards on the built-up land OSM leaves empty: where the photo is green, lawn
// as bright as the photo there.
const land = await render(svg([width, height], "#fff", () => "#000"))
  .extractChannel(0)
  .raw()
  .toBuffer();
const LAWN_BRIGHTNESS = 105; // the photo's median on OSM lawns
const lawn = [1, 3, 5].map((i) => parseInt(GRASS.slice(i, i + 2), 16));
const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Contact shadows: the buildings' roofs seen from above darken the ground around them, softly
// and further out, then fill their footprints.
const inside = await footprints();
const [shadowNear, shadowFar] = await Promise.all([blur(inside, 1.5), blur(inside, 5)]);

// Tree crowns in the photo, only in woods (canopy, 0 to 255): green and either dark or rough (sun
// and shade change within metres, lawn is smooth), over a 5 x 5 px tent; then closed (holes
// filled) and opened (thin lines, as along paths, dropped). There the photo's patches are weakened
// to CROWN_PATCHES, so the photographed crowns do not double the 3D trees standing on them (below). Parks and courtyards
// keep the photo's patches; their trees are in trees.bin.
const CROWN_PATCHES = 0.4; // share of the photo's patches kept under crowns
const woods = await render(svg([width, height], "#000", (c, s) => (s.wood ? "#fff" : "#000")))
  .extractChannel(0)
  .raw()
  .toBuffer();
const TENT = [1, 2, 3, 2, 1];
const rough = new Uint8Array(width * height);
for (let y = 2; y < height - 2; y++)
  for (let x = 2; x < width - 2; x++) {
    if (!woods[y * width + x]) continue;
    let [sum, squares, green] = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const k = (y + dy) * width + x + dx;
        const weight = TENT[dy + 2] * TENT[dx + 2];
        sum += weight * photo[k];
        squares += weight * photo[k] * photo[k];
        green += weight * (2 * rgb[k * 3 + 1] - rgb[k * 3] - rgb[k * 3 + 2]);
      }
    const [mean, spread] = [sum / 81, Math.sqrt(Math.max(squares / 81 - (sum / 81) ** 2, 0))];
    rough[y * width + x] =
      255 *
      Math.max(smoothstep(84, 70, mean), smoothstep(9, 16, spread)) *
      smoothstep(4, 12, green / 81);
  }
const closed = (await blur(rough, 1.6)).map((v) => 255 * smoothstep(0.3, 0.55, v / 255));
const opened = await blur(closed, 2.4);
const canopy = opened.map((v, i) => smoothstep(0.5, 0.7, v / 255) * woods[i]);
const footprintColour = [1, 3, 5].map((i) => parseInt(FOOTPRINT.slice(i, i + 2), 16));
for (let i = 0; i < width * height; i++) {
  if (inside[i]) {
    raster.set(footprintColour, i * 4);
    continue;
  }
  if (land[i]) {
    const [r, g, b] = soft.subarray(i * 3, i * 3 + 3);
    const leafy = (smoothstep(15, 35, 2 * g - r - b) * land[i]) / 255;
    if (leafy) {
      const lit = Math.min(Math.max((brightness(soft, i) / LAWN_BRIGHTNESS) ** 0.8, 0.6), 1.35);
      for (let c = 0; c < 3; c++) raster[i * 4 + c] += (lawn[c] * lit - raster[i * 4 + c]) * leafy;
    }
  }
  let factor = (1 - (0.42 * shadowNear[i]) / 255) * (1 - (0.5 * shadowFar[i]) / 255);
  if (vegetation[i] && nearGreen[i] > 8 && aroundGreen[i] > 8 && around[i]) {
    const patch = (near[i] / nearGreen[i]) * (aroundGreen[i] / around[i]);
    const strength = Math.min(Math.max(patch ** 0.8, 0.6), 1.35);
    const kept = 1 + (strength - 1) * (1 - ((1 - CROWN_PATCHES) * canopy[i]) / 255);
    factor *= 1 + ((kept - 1) * vegetation[i]) / 255;
  }
  for (let c = 0; c < 3; c++) raster[i * 4 + c] = Math.min(255, raster[i * 4 + c] * factor);
}

// 3D trees on the crowns, written to public/canopy.bin (Uint16 east, south as in trees.bin, height
// in dm):
// one per TREE_SPACING cell, moved randomly within it, where at least half of the ground around
// is crown and no tree of public/trees.bin (tools/trees.mjs, run it first) stands that close.
const TREE_SPACING = 13; // metres
const crowns = await blur(canopy, 3);
const single = new Uint16Array(new Uint8Array(readFileSync(join(PUBLIC, "trees.bin"))).buffer);
const cellOf = (x, z) => `${Math.floor(x / TREE_SPACING)},${Math.floor(z / TREE_SPACING)}`;
const taken = new Set();
for (let i = 0; i < single.length; i += 2)
  taken.add(cellOf(toX(E_MIN) + single[i] / TREE_GRID, toZ(N_MAX) + single[i + 1] / TREE_GRID));
const random = (a, b) => {
  const h = Math.imul((a * 73856093) ^ (b * 19349663), 2654435761) >>> 0;
  return (Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) / 2 ** 32;
};
const [x0, z0] = [toX(E_MIN), toZ(N_MAX)];
const planted = [];
for (let row = 0; row < (N_MAX - N_MIN) / TREE_SPACING; row++)
  for (let col = 0; col < (E_MAX - E_MIN) / TREE_SPACING; col++) {
    const x = x0 + (col + 0.1 + 0.8 * random(col, row)) * TREE_SPACING;
    const z = z0 + (row + 0.1 + 0.8 * random(row, col + 7)) * TREE_SPACING;
    let close = false;
    for (let dx = -1; dx <= 1 && !close; dx++)
      for (let dz = -1; dz <= 1 && !close; dz++)
        close = taken.has(cellOf(x + dx * TREE_SPACING, z + dz * TREE_SPACING));
    const p = Math.floor((z - z0) * PX_PER_M) * width + Math.floor((x - x0) * PX_PER_M);
    if (!close && crowns[p] > 128 && !inside[p])
      planted.push(
        Math.round((x - x0) * TREE_GRID),
        Math.round((z - z0) * TREE_GRID),
        Math.round(140 + 100 * random(col + 3, row)),
      );
  }
writeFileSync(join(PUBLIC, "canopy.bin"), new Uint16Array(planted));
console.log(`${planted.length / 3} trees on crowns`);
await writeTiles(raster, width, height, 4, join(PUBLIC, "ground", "map"), {
  texture: TILE_PX,
  quality: QUALITY,
});

const deckDir = join(PUBLIC, "ground", "deck");
rmSync(deckDir, { recursive: true, force: true });
const decks = svg(
  [width, height],
  SIDEWALK,
  (c) => c,
  shapes.filter((s) => s.deck),
);
await writeTiles(await render(decks).raw().toBuffer(), width, height, 4, deckDir, {
  texture: TILE_PX,
  only: deckTiles,
  quality: QUALITY,
});

// Water white, everything else black, in the same order, so roads drawn over water stay dry.
const mask = svg([MASK_SIZE, MASK_SIZE], "#000", (c) => (c === WATER ? "#fff" : "#000"));
const maskData = await render(mask).ensureAlpha().raw().toBuffer();

// Flow: OSM rivers and streams point downstream. Each segment is drawn wide in a colour for its
// direction (green = east, blue = south, 128 = none), rivers over streams, then blurred so bends
// and junctions turn smoothly.
const FLOW_WIDTH = { stream: 60, ditch: 60, drain: 60, river: 400, canal: 400 }; // metres
const segments = elements
  .filter((el) => el.type === "way" && FLOW_WIDTH[el.tags?.waterway])
  .sort((a, b) => FLOW_WIDTH[a.tags.waterway] - FLOW_WIDTH[b.tags.waterway])
  .flatMap((way) => {
    const points = way.geometry.filter(Boolean).map((p) => {
      const [e, n] = toLV95(p);
      return [e - E_MIN, N_MAX - n];
    });
    return points.slice(1).map(([bx, by], i) => {
      const [ax, ay] = points[i];
      const length = Math.hypot(bx - ax, by - ay) || 1;
      const green = Math.round(128 + (127 * (bx - ax)) / length);
      const blue = Math.round(128 + (127 * (by - ay)) / length);
      return `<path stroke="rgb(0,${green},${blue})" stroke-width="${FLOW_WIDTH[way.tags.waterway]}" stroke-linecap="round" d="M${ax} ${ay}L${bx} ${by}"/>`;
    });
  });
const flowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASK_SIZE}" height="${MASK_SIZE}"
  viewBox="0 0 ${E_MAX - E_MIN} ${N_MAX - N_MIN}"><rect width="100%" height="100%"
  fill="rgb(0,128,128)"/>${segments.join("")}</svg>`;
const flow = await render(flowSvg).removeAlpha().blur(6).raw().toBuffer();
for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) {
  maskData[4 * i + 1] = flow[3 * i + 1];
  maskData[4 * i + 2] = flow[3 * i + 2];
}
writeFileSync(join(PUBLIC, "water.ktx2"), await encodeTexture(maskData, MASK_SIZE));
console.timeEnd("map");

// 255 where a roof of public/basel.glb covers a pixel of the map, else 0.
async function footprints() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(join(PUBLIC, "basel.glb"));
  const covered = new Uint8Array(width * height);
  const [x0, z0] = [toX(E_MIN), toZ(N_MAX)];
  const v = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const m = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMaterial()?.getName() !== "roof") continue;
      const position = primitive.getAttribute("POSITION");
      const indices = primitive.getIndices();
      const pixel = (k) => {
        position.getElement(indices ? indices.getScalar(k) : k, v);
        return [
          (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] - x0) * PX_PER_M,
          (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] - z0) * PX_PER_M,
        ];
      };
      const count = indices ? indices.getCount() : position.getCount();
      for (let k = 0; k < count; k += 3)
        fillTriangle(covered, pixel(k), pixel(k + 1), pixel(k + 2));
    }
  }
  return covered;
}

// Sets the pixels whose centres lie in the triangle to 255.
function fillTriangle(out, [ax, ay], [bx, by], [cx, cy]) {
  const sign = Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  if (!sign) return;
  const edge = (px, py, qx, qy, x, y) => sign * ((qx - px) * (y - py) - (qy - py) * (x - px)) >= 0;
  const xs = [
    Math.max(0, Math.floor(Math.min(ax, bx, cx))),
    Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx))),
  ];
  const ys = [
    Math.max(0, Math.floor(Math.min(ay, by, cy))),
    Math.min(height - 1, Math.ceil(Math.max(ay, by, cy))),
  ];
  for (let y = ys[0]; y <= ys[1]; y++)
    for (let x = xs[0]; x <= xs[1]; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      if (
        edge(ax, ay, bx, by, px, py) &&
        edge(bx, by, cx, cy, px, py) &&
        edge(cx, cy, ax, ay, px, py)
      )
        out[y * width + x] = 255;
    }
}
