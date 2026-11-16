// Writes public/size.json: the byte size of every file in public/, so the viewer can show an
// exact loading percentage. Run after every converter (see package.json).
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PUBLIC } from "./area.mjs";

const sizes = {};
for (const file of readdirSync(PUBLIC, { recursive: true }).sort()) {
  const stat = statSync(join(PUBLIC, file));
  if (stat.isFile() && !basename(file).startsWith(".") && file !== "size.json")
    sizes[file.replaceAll("\\", "/")] = stat.size;
}
writeFileSync(join(PUBLIC, "size.json"), JSON.stringify(sizes, null, 1));
