// Names to show over the scene (src/main.js): the quarters of Basel and the towns and villages
// around (OSM place=suburb, town, village) and landmarks chosen by hand by their OSM element, all
// inside the area. Downloaded once into data/osm-names.json (delete it after changing LANDMARKS);
// writes public/names.json:
// [{ name, kind ("place" or "landmark"), x, z }] in scene metres, a landmark at the centre of its
// element.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BBOX_WGS84, DATA, PUBLIC, E_MIN, E_MAX, N_MIN, N_MAX, toX, toZ } from "./area.mjs";
import { toLV95, overpass } from "./osm.mjs";

// [OSM type, id, name shown]; the ids checked against their Wikidata items.
const LANDMARKS = [
  ["way", 137472252, "Münster"], // Q666479 Basler Münster
  ["relation", 7634307, "Rathaus"], // Q688984 Rathaus Basel
  ["relation", 3531078, "Spalentor"], // Q667144
  ["way", 680531949, "Roche-Turm"], // Q103834364 Roche-Turm (Bau 1)
  ["way", 317511699, "Roche-Turm Bau 2"], // Q24037787
  ["relation", 7641750, "Novartis Campus"],
  ["node", 9007085808, "Kaserne"], // Q1726074 Kaserne Basel
  ["node", 3080746011, "Bahnhof SBB"], // Q667201 Basel SBB
  ["way", 100789428, "Badischer Bahnhof"], // station building of Q666725
  ["way", 100780159, "BIZ-Turm"], // Q18202208
  ["way", 315916699, "Messeturm"], // Q677963 Messeturm Basel
  ["way", 537788765, "Biozentrum"], // Q864916 Biozentrum der Universität Basel (new building)
  ["way", 24887273, "St. Jakob-Park"], // Q190010
  ["way", 25108339, "Zoo Basel"], // Q220009
  ["relation", 5279724, "Kunstmuseum"], // Q194626 Kunstmuseum Basel
  ["way", 317500933, "Museum Tinguely"], // Q180904
  ["way", 669208053, "Dreiländerbrücke"], // Q205682
  ["way", 645597461, "Dreirosenbrücke"], // Q687157
  ["way", 645606133, "Johanniterbrücke"], // Q1547778
  ["way", 653605685, "Mittlere Brücke"], // Q449659
  ["way", 712199705, "Wettsteinbrücke"], // Q1597642
  ["way", 413303455, "Schwarzwaldbrücke"], // Q2254477
];

const [w, s, e, n] = BBOX_WGS84.split(",");
const elements = await overpass(
  `[out:json][timeout:120];(
    node[place~"^(suburb|town|village)$"](${s},${w},${n},${e});
    ${LANDMARKS.map(([type, id]) => `${type}(${id});`).join("")}
  );out center tags;`,
  join(DATA, "osm-names.json"),
);

// In scene metres, or null outside the area.
function place(element) {
  const [e, n] = toLV95(element.center ?? element);
  return e < E_MIN || e > E_MAX || n < N_MIN || n > N_MAX
    ? null
    : { x: Math.round(toX(e)), z: Math.round(toZ(n)) };
}

const names = [];
for (const el of elements.filter((el) => el.tags?.place)) {
  const at = place(el);
  if (at) names.push({ name: el.tags.name, kind: "place", ...at });
}
for (const [type, id, name] of LANDMARKS) {
  const el = elements.find((el) => el.type === type && el.id === id);
  const at = el && place(el);
  if (at) names.push({ name, kind: "landmark", ...at });
  else console.log(`${name} left out: ${el ? "outside the area" : "not in OSM"}`);
}
console.log(`${names.length} names`);
writeFileSync(join(PUBLIC, "names.json"), JSON.stringify(names));
