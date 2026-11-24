// Checks that data/ still holds the raw data listed in tools/data.json (name and size of each
// file), so lost or newly downloaded data cannot change the city unnoticed. Runs after every
// converter (see package.json); `npm run accept-data` lists data/ as it is now.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DATA } from "./area.mjs";

const LIST = new URL("data.json", import.meta.url);

const files = {}; // data/bridges.bin is left out: tools/bridges.mjs writes it
for (const file of existsSync(DATA) ? readdirSync(DATA, { recursive: true }).sort() : []) {
  const stat = statSync(join(DATA, file));
  if (stat.isFile() && file !== "bridges.bin" && !basename(file).startsWith("."))
    files[file.replaceAll("\\", "/")] = stat.size;
}

if (process.argv[2] === "accept") writeFileSync(LIST, `${JSON.stringify(files, null, 2)}\n`);
else {
  const listed = JSON.parse(readFileSync(LIST, "utf8"));
  const changes = [
    ...Object.keys(listed)
      .filter((file) => !(file in files))
      .map((file) => `missing  ${file}`),
    ...Object.entries(files)
      .filter(([file, size]) => listed[file] !== size)
      .map(([file]) => `${file in listed ? "changed" : "new    "}  ${file}`),
  ];
  if (changes.length) {
    console.error(
      `data/ differs from tools/data.json, so the result may differ:\n${changes.join("\n")}\n` +
        "If that is intended: npm run accept-data",
    );
    process.exit(1);
  }
}
