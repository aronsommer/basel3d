// Extracts single trees (swissTLM3D layer TLM_EINZELBAUM) for the area into public/trees.bin:
// Float32 pairs (x, z) in scene coordinates; the viewer puts them on the terrain.
// Only the needed files are read out of swisstopo's 3.6 GB zip, using HTTP range requests.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import * as shapefile from "shapefile";
import { E_MIN, E_MAX, N_MIN, N_MAX, DATA, PUBLIC, toX, toZ } from "./area.mjs";

const DIR = join(DATA, "swisstlm3d");
const LAYER = "TLM_BB/swissTLM3D_TLM_EINZELBAUM_WEST"; // the western half contains Basel

async function latestShpZip() {
  const res = await fetch(
    "https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swisstlm3d/items?limit=100",
  );
  const items = (await res.json()).features.sort((a, b) => a.id.localeCompare(b.id));
  return Object.values(items.at(-1).assets).find((a) => a.href.endsWith(".shp.zip")).href;
}

async function range(url, start, end) {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`No range support: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Reads the zip's central directory from its last 256 KB.
async function zipEntries(url) {
  const head = await fetch(url, { method: "HEAD" });
  const size = Number(head.headers.get("content-length"));
  const tail = await range(url, size - 262144, size - 1);
  const entries = new Map();
  for (let i = tail.indexOf("PK\x01\x02"); i >= 0; i = tail.indexOf("PK\x01\x02", i + 46)) {
    const nameLength = tail.readUInt16LE(i + 28);
    const name = tail.toString("utf8", i + 46, i + 46 + nameLength);
    entries.set(name.replaceAll("\\", "/"), {
      method: tail.readUInt16LE(i + 10),
      size: tail.readUInt32LE(i + 20),
      offset: tail.readUInt32LE(i + 42),
    });
  }
  return entries;
}

async function extract(url, entry, file) {
  if (entry.size === 0xffffffff || entry.offset === 0xffffffff)
    throw new Error("Zip64 entries are not supported");
  const header = await range(url, entry.offset, entry.offset + 29);
  const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = await range(url, start, start + entry.size - 1);
  writeFileSync(file, entry.method === 8 ? inflateRawSync(data) : data);
}

mkdirSync(DIR, { recursive: true });
const base = join(DIR, LAYER.split("/").pop());
if (!existsSync(`${base}.dbf`)) {
  const url = await latestShpZip();
  const entries = await zipEntries(url);
  for (const ext of ["shp", "dbf"])
    await extract(url, entries.get(`${LAYER}.${ext}`), `${base}.${ext}`);
}

const trees = [];
const kinds = {};
const source = await shapefile.open(`${base}.shp`, `${base}.dbf`);
for (let r = await source.read(); !r.done; r = await source.read()) {
  const [e, n] = r.value.geometry.coordinates;
  if (e < E_MIN || e >= E_MAX || n < N_MIN || n >= N_MAX) continue;
  const kind = r.value.properties.OBJEKTART;
  kinds[kind] = (kinds[kind] ?? 0) + 1;
  trees.push(toX(e), toZ(n));
}
console.log(kinds);
writeFileSync(join(PUBLIC, "trees.bin"), new Float32Array(trees));
