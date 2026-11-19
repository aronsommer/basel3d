// Downloads swissBUILDINGS3D 3.0 (CityGML, newest per map sheet) for the area into data/
// and converts it into public/basel.glb, each building coloured: its roof as on the aerial photo
// (SWISSIMAGE, downloaded by tools/terrain.mjs), its walls guessed.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import {
  E_MIN,
  E_MAX,
  N_MIN,
  N_MAX,
  Y0,
  CHUNK,
  DATA,
  PUBLIC,
  BBOX_WGS84,
  toX,
  toZ,
} from "./area.mjs";
import { overpass, toLV95 } from "./osm.mjs";
import { newestTiles, download, WMTS_E, WMTS_N, TILE, photoFile } from "./swisstopo.mjs";

const SRC = join(DATA, "swissbuildings3d");

// A growing typed array.
class List {
  constructor(Type) {
    this.data = new Type(1 << 16);
    this.length = 0;
  }
  push(value) {
    if (this.length === this.data.length) {
      const next = new this.data.constructor(this.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
}

// No normals: the viewer shades flat per pixel, so vertices can be shared across faces.
// _BUILDING is each vertex's building number (0, 1, …), to tell buildings apart; COLOR_0 its
// building's roof or wall colour (a wall's alpha its facade style); _WALL on walls its wall's
// bottom and top and its building's foot, for the storeys (src/facade.js).
const chunks = new Map(); // "cx,cz" -> { roof, wall: { position, building, range: List } }
const seen = new Set();
const stats = { buildings: 0, roof: 0, wall: 0, dupes: 0, other: {} };
// The building being read: roof, wall: [x, y, z, …]; spots: [e, n, …] on its roof, about 2 m
// apart; area of its roof, flat: of which slopes less than 14°.
let building = null;
const info = []; // per building number: { spots, flat (share of its roof), height, size, e, n }

function addTriangle(kind, v) {
  for (let i = 0; i < 9; i += 3) building[kind].push(toX(v[i]), v[i + 2] - Y0, toZ(v[i + 1]));
  stats[kind]++;
  if (kind !== "roof") return;
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = v;
  const [ux, uy, uz, wx, wy, wz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
  const [nx, ny, nz] = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx];
  const area = Math.hypot(nx, ny, nz) / 2;
  building.area += area;
  if (Math.abs(nz) / 2 > 0.97 * area) building.flat += area;
  const steps = Math.ceil(Math.max(Math.hypot(ux, uy), Math.hypot(wx, wy)) / 2);
  for (let i = 0; i <= steps; i++)
    for (let j = 0; i + j <= steps; j++)
      building.spots.push(ax + (ux * i + wx * j) / steps, ay + (uy * i + wy * j) / steps);
}

// Adds the building read into the chunk of its middle, so it stays in one mesh.
function addBuilding() {
  const b = building;
  building = null;
  if (!b || !(b.roof.length || b.wall.length)) return;
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const list of [b.roof, b.wall])
    for (let i = 0; i < list.length; i += 3) {
      x0 = Math.min(x0, list[i]);
      x1 = Math.max(x1, list[i]);
      z0 = Math.min(z0, list[i + 2]);
      z1 = Math.max(z1, list[i + 2]);
    }
  const key = `${Math.floor((x0 + x1) / 2 / CHUNK)},${Math.floor((z0 + z1) / 2 / CHUNK)}`;
  let c = chunks.get(key);
  if (!c) {
    const lists = () => ({
      position: new List(Float32Array),
      building: new List(Uint16Array),
      range: new List(Uint16Array),
    });
    chunks.set(key, (c = { roof: lists(), wall: lists() }));
  }
  const number = stats.buildings++;
  if (number > 0xffff) throw new Error("Too many buildings for 16-bit numbers");
  let [y0, y1] = [Infinity, -Infinity];
  for (const list of [b.roof, b.wall])
    for (let i = 1; i < list.length; i += 3)
      [y0, y1] = [Math.min(y0, list[i]), Math.max(y1, list[i])];
  info[number] = {
    spots: b.spots,
    flat: b.area ? b.flat / b.area : 1,
    height: y1 - y0,
    size: [x1 - x0, z1 - z0],
    e: (x0 + x1) / 2 + (E_MIN + E_MAX) / 2,
    n: (N_MIN + N_MAX) / 2 - (z0 + z1) / 2,
  };
  for (const kind of ["roof", "wall"]) {
    for (const value of b[kind]) c[kind].position.push(value);
    for (let i = 0; i < b[kind].length; i += 3) c[kind].building.push(number);
  }
  for (const value of wallRanges(b.wall, y0)) c.wall.range.push(value);
}

// Per wall vertex the heights of its wall's bottom and top and of its building's foot (y0), in
// whole metres + 100 (so neighbouring walls mostly agree and their vertices stay shared), and a 0
// (vertex attributes align to 4 bytes). A wall: the triangles facing the same way (to 1°) at the
// same distance (to 10 cm).
function wallRanges(w, y0) {
  const walls = new Map(); // key -> [bottom, top]
  const keys = [];
  for (let i = 0; i < w.length; i += 9) {
    const [ux, uy, uz] = [w[i + 3] - w[i], w[i + 4] - w[i + 1], w[i + 5] - w[i + 2]];
    const [vx, vy, vz] = [w[i + 6] - w[i], w[i + 7] - w[i + 1], w[i + 8] - w[i + 2]];
    const [nx, nz] = [uy * vz - uz * vy, ux * vy - uy * vx];
    const length = Math.hypot(nx, nz) || 1;
    const angle = Math.round((Math.atan2(nz, nx) * 180) / Math.PI);
    const key = `${angle},${Math.round(((w[i] * nx + w[i + 2] * nz) / length) * 10)}`;
    const range = walls.get(key) ?? [Infinity, -Infinity];
    for (let k = i + 1; k < i + 9; k += 3)
      [range[0], range[1]] = [Math.min(range[0], w[k]), Math.max(range[1], w[k])];
    walls.set(key, range);
    keys.push(key);
  }
  return keys.flatMap((key) => {
    const [bottom, top, foot] = [...walls.get(key), y0].map((y) => Math.round(y) + 100);
    return [bottom, top, foot, 0, bottom, top, foot, 0, bottom, top, foot, 0];
  });
}

async function readTile(file) {
  const unzip = spawn("unzip", ["-p", file]);
  let kind = null; // "roof" | "wall" | null (skip)
  for await (const line of createInterface({
    input: unzip.stdout,
    crlfDelay: Infinity,
  })) {
    const t = line.trimStart();
    if (t.startsWith("<gml:posList")) {
      if (!kind || !building) continue;
      const v = t
        .slice(t.indexOf(">") + 1, t.lastIndexOf("<"))
        .split(" ")
        .map(Number);
      if (v[0] < E_MIN || v[0] >= E_MAX || v[1] < N_MIN || v[1] >= N_MAX) continue;
      addTriangle(kind, v);
    } else if (t.startsWith("<bldg:Building ")) {
      addBuilding();
      const id = t.match(/gml:id="([^"]+)"/)[1];
      if (seen.has(id))
        stats.dupes++; // already read from another tile
      else building = { roof: [], wall: [], spots: [], area: 0, flat: 0 };
      seen.add(id);
    } else if (t.startsWith("<bldg:RoofSurface")) kind = "roof";
    else if (t.startsWith("<bldg:WallSurface")) kind = "wall";
    else if (/^<bldg:\w+Surface /.test(t)) {
      kind = null;
      const tag = t.slice(1, t.indexOf(" "));
      stats.other[tag] = (stats.other[tag] ?? 0) + 1;
    } else if (/^<\/bldg:\w+Surface>/.test(t)) kind = null;
  }
  addBuilding();
}

// Optional reference buildings, not in the repo:
// [{ p: footprint [[e, n], …] in LV95, h: height, w, r: wall and roof colour (sRGB), f: flags
// (1: hall; bits 2–3: roof kind, 0 clay), n: name }]. Ours take the colours and facade style of
// the one holding most of their middle and roof spots (a middle may lie in a courtyard); the
// others get them from their own size and the aerial photo.
const REFERENCE = join(DATA, "reference", "buildings.json");

// Facade styles (src/facade.js), in the alpha of a wall's COLOR_0 with the flags and 3 seed bits.
const STYLE = { old: 0, modern: 1, office: 2, glass: 3, church: 4, townHall: 5, hall: 7 };
const SHOP = 8; // shop windows on the ground floor
const BALCONY = 16;

const ROOF = [158, 84, 69]; // sRGB, where the photo has nothing
// Roofs brighter than this (luminance, sRGB) are darkened to DARK, as white ones look out of
// place; those of the buildings whose middle is within 20 m of one in RED (LV95) get ROOF's clay
// red instead, those of Roche's in KEEP stay light.
const BRIGHT = 140;
const DARK = 110;
const RED = [
  [2612214, 1267843],
  [2612241, 1267825],
  [2612236, 1267873],
];
const KEEP = [
  [2612699, 1267652],
  [2612727, 1267579],
  [2612738, 1267660],
];
// Walls without a match: old-town tones (sandstone, ochre, salmon, pale green and blue,
// off-white), concrete and glass from 42 m.
const WALLS = [
  0xe9d8b4, 0xdcb98a, 0xe4b9a0, 0xc9d3b8, 0xbfcdd6, 0xf1ece0, 0xd8a48f, 0xe7d18e, 0xcdbfae,
];
const HIGH = [0xc9ced2, 0xb8c4cc, 0xd6d3cc];
const CHURCH = [0xc4826b]; // red sandstone

// Footprints of the OSM buildings tagged as churches, as { p: [[e, n], …] }, downloaded once.
async function churches() {
  const [w, s, e, n] = BBOX_WGS84.split(",");
  const tag = '[building~"^(church|cathedral|chapel)$"]';
  const elements = await overpass(
    `[out:json][timeout:120][bbox:${s},${w},${n},${e}];(way${tag};relation${tag};);out geom;`,
    join(DATA, "osm-churches.json"),
  );
  return elements.flatMap((el) =>
    (el.type === "way" ? [el] : el.members.filter((m) => m.role === "outer" && m.geometry)).map(
      (way) => ({ p: way.geometry.filter(Boolean).map(toLV95) }), // nodes outside the box are null
    ),
  );
}

// A finder of the item whose footprint p holds a point (e, n), or null.
function footprintFinder(items) {
  const CELL = 100;
  const cells = new Map(); // "i,j" -> items reaching into that cell
  for (const b of items) {
    const es = b.p.map((q) => q[0]);
    const ns = b.p.map((q) => q[1]);
    for (let i = Math.floor(Math.min(...es) / CELL); i <= Math.floor(Math.max(...es) / CELL); i++)
      for (let j = Math.floor(Math.min(...ns) / CELL); j <= Math.floor(Math.max(...ns) / CELL); j++)
        cells.get(`${i},${j}`)?.push(b) ?? cells.set(`${i},${j}`, [b]);
  }
  const inside = (p, e, n) => {
    let hit = false;
    for (let i = 0, k = p.length - 1; i < p.length; k = i++)
      if (
        p[i][1] > n !== p[k][1] > n &&
        e < ((p[k][0] - p[i][0]) * (n - p[i][1])) / (p[k][1] - p[i][1]) + p[i][0]
      )
        hit = !hit;
    return hit;
  };
  return (e, n) =>
    cells.get(`${Math.floor(e / CELL)},${Math.floor(n / CELL)}`)?.find((b) => inside(b.p, e, n)) ??
    null;
}

// The item found most often at the points [e, n, …], or null if found less than least times.
function majority(find, points, least = 1) {
  const votes = new Map();
  for (let i = 0; i < points.length; i += 2) {
    const b = find(points[i], points[i + 1]);
    if (b) votes.set(b, (votes.get(b) ?? 0) + 1);
  }
  let best = null;
  for (const [b, count] of votes) if (!best || count > votes.get(best)) best = b;
  return best && votes.get(best) >= least ? best : null;
}

// Area and narrowest width of a footprint [[e, n], …].
function measure(p) {
  let area = 0;
  let narrow = Infinity;
  for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
    area += p[k][0] * p[i][1] - p[i][0] * p[k][1];
    const [dx, dy] = [p[i][0] - p[k][0], p[i][1] - p[k][1]];
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const across = p.map((q) => ((q[0] - p[i][0]) * -dy + (q[1] - p[i][1]) * dx) / length);
    narrow = Math.min(narrow, Math.max(...across) - Math.min(...across));
  }
  return { area: Math.abs(area) / 2, narrow };
}

// A building's facade style with flags, after its name, size, roof and whether OSM has a church
// there.
function facadeStyle({ name, church, height, narrow, area, pitched, hall }, seed) {
  const [a, b, c] = [(seed % 7) / 7, (seed % 11) / 11, (seed % 13) / 13];
  if (church || /kirche|Münster|Dom\b|Kapelle|Tor$/i.test(name)) return STYLE.church;
  if (name === "Rathaus") return STYLE.townHall | SHOP;
  if (/Roche|BIZ|Baloise|Universitätsspital/.test(name)) return STYLE.office;
  if (/Messeturm|Claraturm|Biozentrum/.test(name)) return STYLE.glass;
  if (hall) return STYLE.hall;
  if (height > 42) return a < 0.5 ? STYLE.glass : STYLE.office;
  if (pitched || (narrow <= 17 && height <= 25 && area < 700))
    return STYLE.old | (b < 0.3 ? SHOP : 0);
  if ((area > 1100 || height > 27) && a < 0.45) return STYLE.office;
  return STYLE.modern | (b < 0.4 ? BALCONY : 0) | (c < 0.25 ? SHOP : 0);
}

// Each building's roof and wall colour as linear RGBA bytes, for COLOR_0 (a wall's alpha: its
// facade style).
async function colours() {
  const count = info.length;
  const roof = new Uint8Array(count * 4);
  const wall = new Uint8Array(count * 4);
  const linear = (c) => {
    const v = c / 255;
    return Math.round(255 * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  };
  const put = (array, i, [r, g, b], alpha = 255) =>
    array.set([linear(r), linear(g), linear(b), alpha], i * 4);
  const rgb = (hex) => [hex >> 16, (hex >> 8) & 255, hex & 255];
  const luma = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
  const grey = (colour) => {
    const v = luma(colour);
    return colour.map((c, i) => Math.round(v * [0.75, 0.82, 0.86][i] + c * [0.25, 0.18, 0.14][i]));
  };
  const near = (list, e, n) => list.some(([a, b]) => Math.hypot(a - e, b - n) < 20);
  // A roof's colour, toned as BRIGHT says.
  const tone = (colour, e, n) => {
    const v = luma(colour);
    if (v <= BRIGHT || near(KEEP, e, n)) return colour;
    return near(RED, e, n) ? ROOF : colour.map((c) => Math.round((c * DARK) / v));
  };

  // The median per channel of the photo's pixels on a roof.
  const tiles = new Map(); // "col,row" -> raw RGB, or null if not downloaded
  const tile = async (col, row) => {
    const key = `${col},${row}`;
    if (!tiles.has(key)) {
      const file = photoFile(col, row);
      tiles.set(key, existsSync(file) ? await sharp(file).removeAlpha().raw().toBuffer() : null);
    }
    return tiles.get(key);
  };
  const photo = async (spots) => {
    const histograms = [0, 1, 2].map(() => new Uint32Array(256));
    let seen = 0;
    for (let i = 0; i < spots.length; i += 2) {
      const [x, y] = [Math.floor(spots[i] - WMTS_E), Math.floor(WMTS_N - spots[i + 1])];
      const data = await tile(Math.floor(x / TILE), Math.floor(y / TILE));
      if (!data) continue;
      const p = ((y % TILE) * TILE + (x % TILE)) * 3;
      for (let c = 0; c < 3; c++) histograms[c][data[p + c]]++;
      seen++;
    }
    if (!seen) return ROOF;
    return histograms.map((h) => {
      let c = 0;
      for (let sum = h[0]; sum * 2 < seen;) sum += h[++c];
      return c;
    });
  };

  const find = existsSync(REFERENCE)
    ? footprintFinder(JSON.parse(readFileSync(REFERENCE, "utf8")))
    : null;
  const findChurch = footprintFinder(await churches());
  let matched = 0;
  for (let number = 0; number < count; number++) {
    const { spots, flat, height, size, e, n } = info[number];
    const seed = Math.imul(number + 1, 2654435761) >>> 0;
    const pitched = flat < 0.5;
    const points = [e, n, ...spots];
    const match = find && majority(find, points);
    const church = majority(findChurch, points, points.length / 4) !== null; // half the points
    let style;
    if (match) {
      matched++;
      const { area, narrow } = measure(match.p);
      const clay = ((match.f >> 2) & 3) === 0;
      style = facadeStyle(
        {
          name: match.n,
          church,
          height: match.h,
          narrow,
          area,
          pitched: pitched || (clay && narrow <= 48),
          hall: match.f & 1,
        },
        seed,
      );
      put(roof, number, tone(pitched || !clay ? rgb(match.r) : grey(rgb(match.r)), e, n));
      put(wall, number, rgb(match.w), style | ((seed >>> 29) << 5));
    } else {
      style = facadeStyle(
        {
          name: "",
          church,
          height,
          narrow: Math.min(...size),
          area: size[0] * size[1],
          pitched,
          hall: 0,
        },
        seed,
      );
      const colour = await photo(spots);
      put(roof, number, tone(pitched ? colour : grey(colour), e, n));
      const palette = church ? CHURCH : height > 42 ? HIGH : WALLS;
      put(wall, number, rgb(palette[seed % palette.length]), style | ((seed >>> 29) << 5));
    }
  }
  console.log(`${matched} of ${count} buildings matched a reference building`);
  return { roof, wall };
}

async function writeGlb() {
  const colour = await colours();
  const doc = new Document();
  const buffer = doc.createBuffer();
  const materials = {
    roof: doc.createMaterial("roof"),
    wall: doc.createMaterial("wall"),
  };
  const scene = doc.createScene("Basel");
  for (const [key, c] of chunks) {
    const mesh = doc.createMesh(`chunk ${key}`);
    for (const kind of ["roof", "wall"]) {
      const { position, building, range } = c[kind];
      if (!position.length) continue;
      const accessor = (type, array) =>
        doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
      const numbers = building.data.slice(0, building.length);
      const rgba = new Uint8Array(numbers.length * 4);
      numbers.forEach((n, i) => rgba.set(colour[kind].subarray(n * 4, n * 4 + 4), i * 4));
      const primitive = doc
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", position.data.slice(0, position.length)))
        .setAttribute("_BUILDING", accessor("SCALAR", numbers))
        .setAttribute("COLOR_0", accessor("VEC4", rgba).setNormalized(true))
        .setMaterial(materials[kind]);
      if (range.length)
        primitive.setAttribute("_WALL", accessor("VEC4", range.data.slice(0, range.length)));
      mesh.addPrimitive(primitive);
    }
    scene.addChild(doc.createNode(`chunk ${key}`).setMesh(mesh));
  }
  await MeshoptEncoder.ready;
  await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  writeFileSync(join(PUBLIC, "basel.glb"), await io.writeBinary(doc));
}

mkdirSync(SRC, { recursive: true });
const tiles = await newestTiles("ch.swisstopo.swissbuildings3d_3_0", ".citygml.zip");
if (!tiles.size) throw new Error("No swissBUILDINGS3D tiles found");
// Fixed order (by map sheet), so the same input always gives a byte-identical basel.glb.
for (const sheet of [...tiles.keys()].sort()) {
  const { href } = tiles.get(sheet);
  const file = join(SRC, href.split("/").pop());
  if (!(await download(href, file))) throw new Error(`Download failed: ${href}`);
  console.time(file);
  await readTile(file);
  console.timeEnd(file);
}
console.log(stats);

await writeGlb();
console.log("done");
