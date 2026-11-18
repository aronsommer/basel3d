// Extracts single trees (swissTLM3D layer TLM_EINZELBAUM) for the area into public/trees.bin:
// Uint16 pairs (east, south) in 1/TREE_GRID m from the area's north-west corner; the viewer puts
// them on the terrain.
// Only the needed files are read out of swisstopo's 3.6 GB zip, using HTTP range requests.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as shapefile from "shapefile";
import { E_MIN, E_MAX, N_MIN, N_MAX, PUBLIC, TREE_GRID } from "./area.mjs";
import { tlmLayer } from "./swisstopo.mjs";

const base = await tlmLayer("TLM_BB/swissTLM3D_TLM_EINZELBAUM_WEST"); // the western half has Basel

const trees = [];
const kinds = {};
const source = await shapefile.open(`${base}.shp`, `${base}.dbf`);
for (let r = await source.read(); !r.done; r = await source.read()) {
  const [e, n] = r.value.geometry.coordinates;
  if (e < E_MIN || e >= E_MAX || n < N_MIN || n >= N_MAX) continue;
  const kind = r.value.properties.OBJEKTART;
  kinds[kind] = (kinds[kind] ?? 0) + 1;
  trees.push(Math.round((e - E_MIN) * TREE_GRID), Math.round((N_MAX - n) * TREE_GRID));
}
console.log(kinds);
writeFileSync(join(PUBLIC, "trees.bin"), new Uint16Array(trees));
