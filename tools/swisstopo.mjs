// Download helpers for swisstopo's STAC catalogue (data.geo.admin.ch).
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";
import { BBOX_WGS84, DATA } from "./area.mjs";

// SWISSIMAGE WMTS tiles in LV95 at zoom 25 (1 m per pixel, 256 px per tile), as tools/terrain.mjs
// downloads them into PHOTO_DIR.
export const WMTS =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/2056/25";
export const WMTS_E = 2420000; // top-left corner of the WMTS tile matrix
export const WMTS_N = 1350000;
export const TILE = 256;
export const PHOTO_DIR = join(DATA, "swissimage");
export const photoFile = (col, row) => join(PHOTO_DIR, `25_${col}_${row}.jpeg`);

// Newest asset per tile in the area: Map tile → { year, href }. Item ids end in _<year>_<tile>.
export async function newestTiles(collection, assetSuffix) {
  const newest = new Map();
  let url = `https://data.geo.admin.ch/api/stac/v1/collections/${collection}/items?bbox=${BBOX_WGS84}&limit=100`;
  while (url) {
    const page = await (await fetch(url)).json();
    for (const item of page.features) {
      const match = item.id.match(/_(\d{4})_(\d{4}-\d{2,4})$/);
      const asset = Object.values(item.assets).find((a) => a.href.endsWith(assetSuffix));
      if (match && asset && !(newest.get(match[2])?.year >= match[1]))
        newest.set(match[2], { year: match[1], href: asset.href });
    }
    url = page.links.find((l) => l.rel === "next")?.href;
  }
  return newest;
}

// Downloads url to file unless it is already there; false if the server has no such file.
export async function download(url, file) {
  if (existsSync(file)) return true;
  const res = await fetch(url);
  if (!res.ok) return false;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

export async function forEachParallel(items, limit, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// --- swissTLM3D: single layers out of the 3.6 GB shapefile zip, via HTTP range requests.
const TLM_DIR = join(DATA, "swisstlm3d");

async function rangeResponse(url, start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`No range support: ${res.status}`);
  return res;
}

// Downloads a layer's .shp and .dbf (e.g. "TLM_OEV/swissTLM3D_TLM_EISENBAHN") into
// data/swisstlm3d/ unless they are there; returns their path without extension.
export async function tlmLayer(layer) {
  const base = join(TLM_DIR, layer.split("/").pop());
  if (existsSync(`${base}.dbf`)) return base;
  mkdirSync(TLM_DIR, { recursive: true });
  const res = await fetch(
    "https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swisstlm3d/items?limit=100",
  );
  const items = (await res.json()).features.sort((a, b) => a.id.localeCompare(b.id));
  const url = Object.values(items.at(-1).assets).find((a) => a.href.endsWith(".shp.zip")).href;

  // The zip's central directory, from its last 256 KB.
  const size = Number((await fetch(url, { method: "HEAD" })).headers.get("content-length"));
  const tail = Buffer.from(await (await rangeResponse(url, size - 262144, size - 1)).arrayBuffer());
  const entries = new Map();
  for (let i = tail.indexOf("PK\x01\x02"); i >= 0; i = tail.indexOf("PK\x01\x02", i + 46)) {
    const name = tail.toString("utf8", i + 46, i + 46 + tail.readUInt16LE(i + 28));
    entries.set(name.replaceAll("\\", "/"), {
      method: tail.readUInt16LE(i + 10),
      size: tail.readUInt32LE(i + 20),
      offset: tail.readUInt32LE(i + 42),
    });
  }

  // Written under a temporary name, and the .dbf last, so an interrupted download is retried.
  for (const ext of ["shp", "dbf"]) {
    const entry = entries.get(`${layer}.${ext}`);
    if (entry.size === 0xffffffff || entry.offset === 0xffffffff)
      throw new Error("Zip64 entries are not supported");
    const header = Buffer.from(
      await (await rangeResponse(url, entry.offset, entry.offset + 29)).arrayBuffer(),
    );
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const body = Readable.fromWeb((await rangeResponse(url, start, start + entry.size - 1)).body);
    const steps = entry.method === 8 ? [createInflateRaw()] : [];
    await pipeline(body, ...steps, createWriteStream(`${base}.part`));
    renameSync(`${base}.part`, `${base}.${ext}`);
  }
  return base;
}

// Lines with heights (PolyLineZ) from a .shp whose bounding box overlaps [eMin, nMin, eMax, nMax]:
// { index, points: [[e, n, h], …] } per part; index is the record's row in the .dbf.
export function* shpLinesZ(file, [eMin, nMin, eMax, nMax]) {
  const buf = readFileSync(file);
  for (let i = 100, index = 0; i < buf.length; index++) {
    const r = i + 8; // record content, after number and length
    i = r + buf.readInt32BE(i + 4) * 2;
    if (buf.readInt32LE(r) !== 13) continue;
    const [x0, y0, x1, y1] = [4, 12, 20, 28].map((o) => buf.readDoubleLE(r + o));
    if (x1 < eMin || x0 > eMax || y1 < nMin || y0 > nMax) continue;
    const parts = buf.readInt32LE(r + 36);
    const count = buf.readInt32LE(r + 40);
    const xy = r + 44 + 4 * parts;
    const z = xy + 16 * count + 16; // after the points and the z range
    const starts = [...Array(parts)].map((_, p) => buf.readInt32LE(r + 44 + 4 * p));
    for (const [p, start] of starts.entries()) {
      const points = [];
      for (let k = start; k < (starts[p + 1] ?? count); k++)
        points.push([
          buf.readDoubleLE(xy + 16 * k),
          buf.readDoubleLE(xy + 16 * k + 8),
          buf.readDoubleLE(z + 8 * k),
        ]);
      yield { index, points };
    }
  }
}

// Reads single rows of a .dbf by index, as { FIELD: "text" }, without loading the whole file.
export function dbfRows(file) {
  const fd = openSync(file, "r");
  const head = Buffer.alloc(32);
  readSync(fd, head, 0, 32, 0);
  const headerLength = head.readUInt16LE(8);
  const rowLength = head.readUInt16LE(10);
  const header = Buffer.alloc(headerLength);
  readSync(fd, header, 0, headerLength, 0);
  const fields = [];
  for (let o = 32, offset = 1; header[o] !== 0x0d; offset += header[o + 16], o += 32)
    fields.push({
      name: header.toString("latin1", o, o + 11).replace(/\0.*/, ""),
      offset,
      length: header[o + 16],
    });
  const row = Buffer.alloc(rowLength);
  return (index) => {
    readSync(fd, row, 0, rowLength, headerLength + index * rowLength);
    return Object.fromEntries(
      fields.map((f) => [f.name, row.toString("utf8", f.offset, f.offset + f.length).trim()]),
    );
  };
}
