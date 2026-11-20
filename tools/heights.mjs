// The terrain heights of public/terrain/ (tools/terrain.mjs) for the converters: the bilinear
// height at a scene position, like heightAt() in src/main.js.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC } from "./area.mjs";
import { unpackHeights } from "../src/pack.js";

const terrain = JSON.parse(readFileSync(join(PUBLIC, "terrain", "terrain.json"), "utf8"));
const heights = unpackHeights(readFileSync(join(PUBLIC, "terrain", "heights.bin")), terrain.nx); // cm

export function heightAt(x, z) {
  const { x0, z0, cell, nx, nz } = terrain;
  const fx = Math.min(Math.max((x - x0) / cell, 0), nx - 1.001);
  const fz = Math.min(Math.max((z - z0) / cell, 0), nz - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const [tx, tz] = [fx - ix, fz - iz];
  const i = iz * nx + ix;
  return (
    ((heights[i] * (1 - tx) + heights[i + 1] * tx) * (1 - tz) +
      (heights[i + nx] * (1 - tx) + heights[i + nx + 1] * tx) * tz) /
    100
  );
}
