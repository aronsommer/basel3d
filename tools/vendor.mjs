// Copies the three.js the page uses from node_modules/three (package.json's version) into
// vendor/three-<version>/ and points index.html's import map there, so the page needs no CDN and
// works offline, and a browser never mixes a cached old three with a new one: three's build, each
// addon src/ imports and every file those import in turn, the KTX2 loader's Basis transcoder and
// the licence; any other version in vendor/ removed. Rerun after changing three's version or the
// addons imported (`npm run vendor`).
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const THREE = join(ROOT, "node_modules", "three");
const ADDONS = join(THREE, "examples", "jsm");
const { version } = JSON.parse(readFileSync(join(THREE, "package.json"), "utf8"));
const FOLDER = `vendor/three-${version}/`;

const sources = readdirSync(join(ROOT, "src"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(join(ROOT, "src", f), "utf8"));
const wanted = [
  join(THREE, "build", "three.module.js"),
  ...new Set(
    sources.flatMap((s) =>
      [...s.matchAll(/["']three\/addons\/([^"']+\.js)["']/g)].map(([, p]) => join(ADDONS, p)),
    ),
  ),
];
// Each file and the files it imports by relative path, once.
const seen = new Set();
while (wanted.length) {
  const file = wanted.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  for (const [, p] of readFileSync(file, "utf8").matchAll(
    /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g,
  ))
    wanted.push(join(dirname(file), p));
}
rmSync(join(ROOT, "vendor"), { recursive: true, force: true });
for (const file of [...seen, join(ADDONS, "libs", "basis"), join(THREE, "LICENSE")])
  cpSync(file, join(ROOT, FOLDER, relative(THREE, file)), { recursive: true });
const page = join(ROOT, "index.html");
writeFileSync(page, readFileSync(page, "utf8").replaceAll(/vendor\/three[^/]*\//g, FOLDER));
console.log(`${FOLDER}: ${seen.size} files and the Basis transcoder; index.html points there.`);
