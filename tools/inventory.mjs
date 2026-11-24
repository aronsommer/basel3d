// Checks INVENTORY.md against the museum's plates as src/museum.js and src/catalog.js make them:
// each plate's number once, in "Every number" and its kind's id in the lists above it, and nothing
// listed there without a plate. `npm run inventory`.
import { readFileSync } from "node:fs";

globalThis.localStorage = { getItem: () => "1" }; // the museum open (src/museum.js)
// A document whose every part takes any call and gives itself, for the canvases drawn on loading.
const anything = new Proxy(() => {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : anything),
  apply: () => anything,
  construct: () => anything,
});
globalThis.document = anything;
const { LABELS, exhibitsOf, platesOf } = await import("../src/museum.js");
const { CATALOG } = await import("../src/catalog.js");
for (const [id, { name, places, make }] of Object.entries(CATALOG))
  (make ? exhibitsOf : platesOf)(id, name, places);

const plates = LABELS.map(({ text }) => text.split(" ")[0]).filter((n) => /^[A-Z]\d/.test(n));
const kinds = new Set(plates.map((n) => n.split("-")[0]));
// The ids at the start of the table rows in this part of INVENTORY.md.
const ids = (part) => new Set(part.match(/^\| [A-Z]\d+(-\d+)? /gm)?.map((s) => s.slice(2, -1)));
const [lists, numbers] = readFileSync(new URL("../INVENTORY.md", import.meta.url), "utf8").split(
  "## Every number",
);
const [listed, numbered] = [ids(lists), ids(numbers)];
const problems = [
  ...plates.filter((n, k) => plates.indexOf(n) !== k).map((n) => `${n}: more than one plate`),
  ...[...new Set(plates)].filter((n) => !numbered.has(n)).map((n) => `${n}: not in Every number`),
  ...[...numbered].filter((n) => !plates.includes(n)).map((n) => `${n}: in Every number, no plate`),
  ...[...kinds].filter((id) => !listed.has(id)).map((id) => `${id}: in no list above`),
  ...[...listed].filter((id) => !kinds.has(id)).map((id) => `${id}: listed, no plate`),
];
if (problems.length) {
  console.error(`INVENTORY.md differs from the museum:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`INVENTORY.md matches the museum's ${plates.length} plates.`);
