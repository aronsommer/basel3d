// The terrain of public/terrain/ (tools/terrain.mjs) for the converters: its height at a scene
// position, as the viewer's meshes have it (src/terrain.js).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC } from "./area.mjs";
import { readTerrain } from "../src/terrain.js";

const file = readFileSync(join(PUBLIC, "terrain", "terrain.bin"));
export const { heightAt } = readTerrain(
  file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  JSON.parse(readFileSync(join(PUBLIC, "terrain", "terrain.json"), "utf8")),
);
