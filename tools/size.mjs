// Writes public/size.json: the byte size and a content hash of every file in public/. The viewer
// shows an exact loading percentage from the sizes and loads each file with ?v=<hash>, so the
// browser cache serves a file until its content changes. Run after every converter (see
// package.json).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PUBLIC } from "./area.mjs";

const files = {};
for (const file of readdirSync(PUBLIC, { recursive: true }).sort()) {
  const path = join(PUBLIC, file);
  if (statSync(path).isFile() && !basename(file).startsWith(".") && file !== "size.json") {
    const data = readFileSync(path);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 8);
    files[file.replaceAll("\\", "/")] = { size: data.length, hash };
  }
}
writeFileSync(join(PUBLIC, "size.json"), JSON.stringify(files, null, 1));
