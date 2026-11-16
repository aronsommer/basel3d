// Writes public/size.json: the total bytes of all files in public/, which the viewer loads once
// each, so it can show an exact loading percentage. Run after every converter (see package.json).
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PUBLIC } from "./area.mjs";

let total = 0;
for (const file of readdirSync(PUBLIC, { recursive: true })) {
  const stat = statSync(join(PUBLIC, file));
  if (stat.isFile() && !basename(file).startsWith(".") && file !== "size.json") total += stat.size;
}
writeFileSync(join(PUBLIC, "size.json"), JSON.stringify(total));
