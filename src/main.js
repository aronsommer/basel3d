import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MapControls } from "three/addons/controls/MapControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { createBuildings } from "./buildings.js";
import { createCity } from "./city.js";
import { createGround } from "./ground.js";
import { createRails } from "./rails.js";
import { unpackPoints } from "./pack.js";
import { readTerrain } from "./terrain.js";
import { PASSAGE } from "./passage.js";
import { RHEINWEG, RHEINRUNDE } from "./rheinweg.js";
import { createSwimmers } from "./swimmers.js";
import { facadeShader } from "./facade.js";
import { pavilionShader, pavilionTime } from "./pavilion.js";
import { createExplosions } from "./explosions.js";
import { createRockets } from "./rockets.js";
import { createDriving } from "./drive.js";
import { createLawn } from "./lawn.js";
import { LANDINGS, createFerries } from "./ferries.js";
import { BASIN } from "./basilisks.js";
import { CATALOG } from "./catalog.js";
import {
  FERRY,
  MUSEUM,
  OPEN,
  OVERVIEW,
  ROAD,
  SWIM,
  TRACK,
  TRAM,
  atMuseum,
  createButton,
  createLabels,
  exhibitsOf,
  inCity,
  settle,
  toggle as toggleMuseum,
} from "./museum.js";
import { createStation } from "./station.js";
import { createFireStation, GREY } from "./firestation.js";
import { createPride, dress, prideShader } from "./pride.js";
import { clockTime, createClocks } from "./clocks.js";
import { createRunners } from "./runners.js";
import { createSpace } from "./space.js";
import { createSky } from "./sky.js";
import { createDaylight } from "./daylight.js";
import { dodge, mix, peopleTime } from "./people.js";
import { createWalkers } from "./walkers.js";
import { createGraffiti } from "./graffiti.js";
import { createSplash } from "./splash.js";
import { createDev } from "./dev.js";
import { TIP, createPoints } from "./points.js";
import { copy } from "./copy.js";
import { LV95, fromWGS84, toWGS84 } from "./geo.js";
import { MAGENTA, checkLines } from "./lines.js";
import { riders } from "./riders.js";
import { createShips } from "./ships.js";
import { CELL, CELLS, WARN, carCell, createMovers } from "./movers.js";
import { createFlight } from "./aircraft.js";
import { createTrees } from "./trees.js";

const FLING_FRICTION = 3; // per second: how fast the view stops gliding after a drag
const CENTRE = 2; // metres the view's centre (turned round, zoomed to) is above the terrain
const FOLLOW = 4; // per second: how fast the view's centre follows the terrain's height
const TREE_DETAIL = 300; // metres from a chunk within which its trees get a trunk and a rounder crown
// Metres from a chunk beyond which its trees are only a three-sided cone, and fewer further away.
const TREE_FAR = 1500;
// Metres from a terrain chunk beyond which it is a grid of heights TERRAIN_COARSE metres apart.
const TERRAIN_DETAIL = 2000;
const TERRAIN_COARSE = 40;
const SKY = 0xbcdcf2; // at the horizon
const MOVER_KINDS = ["tram", "train", "car"]; // public/<kind>s.json, .bin
// Far from the camera, moving things grow so they can be seen from above: from BOOST_FROM metres
// on, linearly up to BOOST_MAX times. Up close they have their real size. Vehicles on tracks and
// ships grow only in width and height, so their lengths and distances stay right; vehicles on
// tracks at most 1.4 times in width (see src/movers.js).
const BOOST_FROM = 600; // metres
const BOOST_MAX = 3;
const boost = (p) =>
  THREE.MathUtils.clamp(camera.position.distanceTo(p) / BOOST_FROM, 1, BOOST_MAX);

// On the stronger graphics card where there are two.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
// Neutral tone mapping keeps the aerial photo's colours; on top, a little more saturation,
// warmth and contrast for a crisp, sunny look. In every material's shader, so no extra pass.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  "vec3 CustomToneMapping( vec3 color ) { return color; }",
  /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
    color = NeutralToneMapping( color );
    float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = clamp( mix( vec3( l ), color, 1.04 ) * vec3( 1.015, 1.0, 0.98 ), 0.0, 1.0 );
    return mix( color, color * color * ( 3.0 - 2.0 * color ), 0.05 );
  }`,
);
renderer.toneMapping = THREE.CustomToneMapping;
renderer.toneMappingExposure = 1.2; // a bright, friendly day
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
// Builds the catalog's kind with this id (src/catalog.js) at its places and in the museum
// (src/museum.js), with what its maker takes from here, into the scene; what it returns.
function build(id, city) {
  const { name, places, make } = CATALOG[id];
  const built = make([...places, ...exhibitsOf(id, name, places)], city);
  scene.add(...built.objects);
  return built;
}
// Strong sky light keeps the sides facing away from the sun bright; the sun is warm. Both, and the
// sky, change with the time of day (createDaylight).
const hemisphere = new THREE.HemisphereLight(0xe2eaf2, 0xbaa88c, 2);
const sun = new THREE.DirectionalLight(0xffdfb4, 2.7);
sun.position.set(-1, 1, 1); // from the south-west
const sky = createSky(SKY, sun.position.clone().normalize());
scene.add(hemisphere, sun, sky);

const FOV = 55; // degrees, top to bottom; FPV_FOV through a drone's camera, which is wide
const FPV_FOV = 90;
// Metres seen: the area's far corner from the farthest zoom (orbit.maxDistance and its 8 km × √2).
const FAR = 17000;
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, FAR);
const orbit = new MapControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = 1.45;
orbit.minDistance = 15;
orbit.maxDistance = 5000;

const pointers = new Set(); // pressed mouse buttons and fingers
const fling = new THREE.Vector3(); // metres per second the view keeps gliding after a drag
// Whether the last press stopped the view gliding visibly (2% of its distance per second).
let stoppedGlide = false;
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => {
    // Alt + left drag rotates (MapControls already does this for Cmd, Ctrl and Shift).
    orbit.mouseButtons.LEFT = e.altKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    pointers.add(e.pointerId);
    stoppedGlide =
      orbit.enabled && fling.length() > 0.02 * camera.position.distanceTo(orbit.target);
    fling.set(0, 0, 0);
  },
  { capture: true },
);
for (const type of ["pointerup", "pointercancel"])
  addEventListener(type, (e) => pointers.delete(e.pointerId));

// Loads files from public/; show(percent) gets the exact share of their decompressed bytes,
// measured against the sizes in public/size.json (tools/size.mjs). Each file is requested with
// ?v=<content hash>, size.json with the deploy's timestamp (.github/workflows/deploy.yml).
const files = await fetch("public/size.json?v=__BUILD_TIMESTAMP__").then((r) => r.json());
function load(paths, show) {
  const total = paths.reduce((sum, path) => sum + files[path].size, 0);
  let loaded = 0;
  return Promise.all(
    paths.map(async (path) => {
      const counter = new TransformStream({
        transform(chunk, controller) {
          loaded += chunk.byteLength;
          show(Math.min(Math.floor((loaded / total) * 100), 100));
          controller.enqueue(chunk);
        },
      });
      return new Response(
        (await fetch(`public/${path}?v=${files[path].hash}`)).body.pipeThrough(counter),
      ).arrayBuffer();
    }),
  );
}

// The ground, one texture per 1 km tile named column_row: the aerial photo (SWISSIMAGE,
// tools/terrain.mjs) loaded from public/ground/photo/, the map from OpenStreetMap drawn here
// (src/ground.js) from MAP_FILES (tools/map.mjs), with its own textures for the decks of the 3D
// bridges, as it leaves their roads out of the ground, and with rails on its tracks
// (src/rails.js).
const MAP_FILES = ["ground/map.bin", "ground/soft.bin", "ground/rails.bin"];
const groundPaths = (kind) =>
  kind === "map"
    ? MAP_FILES
    : Object.keys(files).filter((path) => path.startsWith(`ground/${kind}/`));
const ktx2 = new KTX2Loader()
  .setTranscoderPath(import.meta.resolve("three/addons/libs/basis/"))
  .detectSupport(renderer);
// Textures by tile name ("column_row").
async function groundTextures(paths, buffers) {
  const textures = await Promise.all(
    buffers.map((b) => new Promise((resolve, reject) => ktx2.parse(b, resolve, reject))),
  );
  return new Map(
    textures.map((texture, i) => {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return [paths[i].split("/").pop().replace(".ktx2", ""), texture];
    }),
  );
}

// Load the buildings (tools/buildings.mjs), the bridges (tools/bridges.mjs), the terrain
// (tools/terrain.mjs), the trees (tools/trees.mjs), the water mask (tools/map.mjs), the names
// (tools/names.mjs) and the map, the ground shown first.
let groundKind = "map"; // or "photo" (showGround)
// The buildings: basel.bin (tools/compact.mjs), or with ?glb in the address the model it was made
// from, to compare.
const CITY = new URLSearchParams(location.search).has("glb") ? "basel.glb" : "basel.bin";
const progress = document.getElementById("progress");
const [
  terrainJson,
  terrainBuffer,
  cityBuffer,
  bridgesGlb,
  treesBuffer,
  canopyBuffer,
  waterBuffer,
  shipsBuffer,
  namesJson,
  walksBuffer,
  ...rest
] = await load(
  [
    "terrain/terrain.json",
    "terrain/terrain.bin",
    CITY,
    "bridges.glb",
    "trees.bin",
    "canopy.bin",
    "water.ktx2",
    "ships.bin",
    "names.json",
    "walks.bin",
    ...MOVER_KINDS.flatMap((kind) => [`${kind}s.json`, `${kind}s.bin`]),
    ...MAP_FILES,
  ],
  (percent) => (progress.textContent = `${percent}%`),
);
const moverFiles = rest.slice(0, MOVER_KINDS.length * 2);
const groundBuffers = rest.slice(MOVER_KINDS.length * 2);
const terrainInfo = JSON.parse(new TextDecoder().decode(terrainJson));
// The ground's textures by tile name, per kind once loaded; map: src/ground.js once the map was
// shown, drawing its textures from now on (without ?glb also the buildings' shadows); tracks: its
// file for the rails, which addRails makes of it.
const ground = {};
let map = null;
// The squares round the point looked at that the map draws finer than its tiles (src/ground.js),
// the finest first: their textures and where they lie (x, z of the north-west corner, metres
// across, 1 if shown), for the terrain's shader (addWater), and the same for the bridges' decks
// (deckShader).
const squares = Object.fromEntries(
  ["maps", "deckMaps"].map((name) => [name, [0, 1, 2].map(() => ({ value: null }))]),
);
for (const name of ["rects", "deckRects"])
  squares[name] = [0, 1, 2].map(() => ({ value: new THREE.Vector4(0, 0, 1, 0) }));
let tracks = null;
let rails = null;
function startMap([shapes, soft, railsFile]) {
  tracks = railsFile;
  map = createGround(
    { map: shapes, soft, city: CITY === "basel.bin" ? cityBuffer : undefined },
    terrainInfo,
    renderer,
    new URL("./ground-worker.js?v=__BUILD_TIMESTAMP__", import.meta.url),
    squares,
  );
  ground.map = map.tiles;
}
startMap(groundBuffers);
// The terrain (src/terrain.js): its tiles' meshes and its height at a scene position.
const land = readTerrain(terrainBuffer, terrainInfo);
const terrainAt = land.heightAt;
// The passage (src/passage.js) in scene metres, whose ground (passageGround) replaces the terrain
// (addWater, createPassage): its first end's middle a, its direction (ux, uz) and length, the
// terrain's heights y0 and y1 at its ends, per bank point [along, metres from the middle towards
// the Rhine] (at least to the wall) and the Rhine's surface beside it.
const passage = (() => {
  const [a, b] = PASSAGE.ends.map(([lat, lon]) => fromWGS84(lat, lon));
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  // A scene position's [along, across]: metres from a along the middle and towards the street.
  const local = (x, z) => [(x - a[0]) * ux + (z - a[1]) * uz, (x - a[0]) * uz - (z - a[1]) * ux];
  const point = (t, s) => [a[0] + ux * t + uz * s, a[1] + uz * t - ux * s];
  const half = PASSAGE.width / 2;
  const bank = PASSAGE.bank.map(([lat, lon]) => {
    const [t, s] = local(...fromWGS84(lat, lon));
    return [t, Math.max(-s, half)];
  });
  const [y0, y1] = [a, b].map(([x, z]) => terrainAt(x, z));
  const river = terrainAt(...point(length / 2, -PASSAGE.reach));
  return { a, ux, uz, length, half, bank, y0, y1, river, local, point };
})();
// The single trees but those within CLEARED metres of a Basiliskbrunnen (src/catalog.js), which
// they would hide, or of a spot of UNTREED ([latitude, longitude]).
const UNTREED = [
  [47.562538, 7.58905],
  [47.562355, 7.589198],
];
const CLEARED = 3;
const treePositions = (() => {
  const cleared = [
    ...CATALOG.L1.places.map(({ x, z }) => [x, z]),
    ...UNTREED.map(([lat, lon]) => fromWGS84(lat, lon)),
  ];
  const [all, kept] = [new Uint16Array(treesBuffer), []];
  for (let i = 0; i < all.length; i += 2) {
    const [x, z] = [terrainInfo.x0 + all[i] / 8, terrainInfo.z0 + all[i + 1] / 8];
    if (cleared.every(([cx, cz]) => (cx - x) ** 2 + (cz - z) ** 2 >= CLEARED ** 2))
      kept.push(all[i], all[i + 1]);
  }
  return Uint16Array.from(kept);
})();
const canopyTrees = new Uint16Array(canopyBuffer);
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const [glb, bridges, waterMask] = await Promise.all([
  CITY === "basel.glb" && gltfLoader.parseAsync(cityBuffer, ""),
  gltfLoader.parseAsync(bridgesGlb, ""),
  new Promise((resolve, reject) => ktx2.parse(waterBuffer, resolve, reject)),
]);

// Water on the ground wherever the mask (tools/map.mjs) is red: two blues with light patches,
// carried downstream along the flow stored in the mask's green and blue, the same from every
// viewpoint. The terrain already lies at the water surface there.
waterMask.colorSpace = THREE.NoColorSpace; // raw values, not colours
const water = {
  waterMask: { value: waterMask },
  waterTime: { value: 0 },
  waterArea: { value: new THREE.Vector4() }, // x0, z0, width, depth of the mask
  waterDark: { value: new THREE.Color(0x225d8a) },
  waterLight: { value: new THREE.Color(0x74b4de) },
};

// The GLBs have no normals; flat shading derives them per pixel.
const materials = {
  roof: new THREE.MeshLambertMaterial({
    name: "roof", // as in the model, for structures.paint
    vertexColors: true, // each building's own (tools/buildings.mjs)
    flatShading: true,
  }),
  wall: new THREE.MeshLambertMaterial({
    name: "wall",
    vertexColors: true,
    flatShading: true,
  }),
  bridge: new THREE.MeshLambertMaterial({
    color: 0xc8c3ba,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
};
const buildings = glb || { scene: createCity(cityBuffer, materials) };
for (const { scene: model } of [buildings, bridges]) {
  model.traverse((o) => {
    if (o.isMesh) o.material = materials[o.material.name];
  });
  scene.add(model);
}

const terrain = createTerrain(terrainInfo);
scene.add(terrain);
const structures = createBuildings(buildings.scene, bridges.scene, [terrain], renderer, camera);
{
  // Facades on the walls (src/facade.js), the Novartis Pavillon's lights on walls and roofs
  // (src/pavilion.js), a building dressed in the rainbow's stripes (src/pride.js), before the
  // highlight createBuildings set. Their own cache keys, as the functions read the same.
  const extend = (material, ...shaders) => {
    const highlight = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      for (const add of shaders) add(shader);
      highlight(shader, renderer);
    };
    material.customProgramCacheKey = () => shaders.map((add) => add.name).join();
  };
  extend(materials.wall, facadeShader, pavilionShader, prideShader);
  extend(materials.roof, pavilionShader, prideShader);
}
const deckMaps = createDecks(bridges.scene, materials.bridge);
if (map) map.changed = mapChanged;
// The Käppelijoch (LV95 2611379.7, 1267715.7), a building on the Mittlere Brücke (LV95
// 2611375.9, 1267720.7): it blows up with the bridge (destroy) and leaves no burning ground in the
// Rhine. Found before anything is hidden; -1 if not.
const numberUnder = (model, [e, n]) => {
  model.updateMatrixWorld();
  const from = new THREE.Vector3(e - LV95[0], 2000, LV95[1] - n);
  const hit = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0)).intersectObject(model)[0];
  return hit ? hit.object.geometry.attributes._building.getX(hit.face.a) : -1;
};
const joch = numberUnder(buildings.scene, [2611379.7, 1267715.7]);
const mittlere = numberUnder(bridges.scene, [2611375.9, 1267720.7]);
const explosions = createExplosions(scene, structures, heightAt, camera, joch);
// What is blown up stays so in this browser until "Rebuild Basel", as long as the models are the
// same (by their sizes and totals), since the numbers belong to them. Rebuild forgets it and loads
// the page again. destroyed holds only what was really removed, so the counter is exact.
const DESTROYED_KEY = "basel3d.destroyed"; // { models, numbers }
const { total } = structures;
const MODELS = [files[CITY].size, files["bridges.glb"].size, total.buildings, total.bridges].join(
  " ",
);
let saved = [];
try {
  const stored = JSON.parse(localStorage.getItem(DESTROYED_KEY));
  if (stored?.models === MODELS && Array.isArray(stored.numbers)) saved = stored.numbers;
} catch {} // storage blocked or not JSON
saved = saved.filter(Number.isInteger);
// The decks of all destroyed bridges, taken before they are hidden; cut into the ways and rails
// once these exist.
const brokenDecks = decksOf(saved);
const destroyed = new Set(explosions.ruin(saved));
const resetButton = document.getElementById("reset");
resetButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(DESTROYED_KEY);
  } catch {} // storage blocked
  location.reload();
});
// Top left, how many buildings and bridges are still standing, counting down as they are destroyed.
// "Rebuild Basel" in the menu works once something is destroyed.
function showCount() {
  let bridges = 0;
  for (const number of destroyed) if (structures.isBridge(number)) bridges++;
  const standing = {
    Buildings: total.buildings - (destroyed.size - bridges),
    Bridges: total.bridges - bridges,
  };
  for (const [kind, value] of Object.entries(standing))
    document.getElementById(kind).textContent = value;
  resetButton.disabled = !destroyed.size;
}
showCount();
// The decks of the bridges among these numbers, but hidden ones (deckOf).
function decksOf(numbers) {
  const bridges = numbers.filter((number) => structures.isBridge(number));
  return [...structures.triangles(bridges).values()].map((parts) =>
    deckOf(parts.flatMap(({ positions }) => positions)),
  );
}
// Where a bridge's triangles (nine numbers each) face up: whether a point lies within 1.5 m of
// one, above or below it, as the ways on bridges do (tools/paths.mjs), and their heights at a point.
function deckOf(triangles) {
  const GRID = 10; // metres
  const cells = new Map(); // cellKey -> offsets of the triangles reaching into it
  const cellKey = (column, row) => column * 65536 + row;
  const NONE = []; // the heights where there is no deck
  const [a, b, c, normal] = [...Array(4)].map(() => new THREE.Vector3());
  for (let t = 0; t < triangles.length; t += 9) {
    a.fromArray(triangles, t);
    b.fromArray(triangles, t + 3);
    c.fromArray(triangles, t + 6);
    if (Math.abs(THREE.Triangle.getNormal(a, b, c, normal).y) < 0.3) continue; // a wall
    for (
      let x = Math.floor(Math.min(a.x, b.x, c.x) / GRID);
      x * GRID <= Math.max(a.x, b.x, c.x);
      x++
    )
      for (
        let z = Math.floor(Math.min(a.z, b.z, c.z) / GRID);
        z * GRID <= Math.max(a.z, b.z, c.z);
        z++
      ) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(t);
      }
  }
  const side = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  // Not to be changed by the caller.
  function heights(x, z) {
    const list = cells.get(cellKey(Math.floor(x / GRID), Math.floor(z / GRID)));
    if (!list) return NONE;
    const found = [];
    for (const t of list) {
      const [ax, az] = [triangles[t], triangles[t + 2]];
      const [bx, bz] = [triangles[t + 3], triangles[t + 5]];
      const [cx, cz] = [triangles[t + 6], triangles[t + 8]];
      const d1 = side(ax, az, bx, bz, x, z);
      const d2 = side(bx, bz, cx, cz, x, z);
      const d3 = side(cx, cz, ax, az, x, z);
      const sum = d1 + d2 + d3;
      if (sum === 0 || ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) continue;
      // Barycentric.
      found.push((triangles[t + 1] * d2 + triangles[t + 4] * d3 + triangles[t + 7] * d1) / sum);
    }
    return found;
  }
  return {
    covers: (x, y, z) => heights(x, z).some((h) => Math.abs(h - y) < 1.5),
    heights,
  };
}
// Blows up the building or bridge with this number (-1: none) and remembers it, if it was there;
// vehicles vanish where a bridge was, people on its roof and Basel SBB's front with it, and the
// helipads and the jet on it come down to the ground, the Käppelijoch goes with its bridge.
function destroy(number) {
  const [deck] = decksOf([number]);
  if (!explosions.explode(number)) return;
  scene.remove(...(onRoofs.get(number) ?? []));
  for (const land of grounding.get(number) ?? []) land();
  if (number === mittlere) destroy(joch);
  if (deck) for (const mover of movers) mover.cut(deck);
  if (deck) rails?.cut(deck);
  if (deck) brokenDecks.push(deck);
  if (deck) roads = null; // made anew without it
  destroyed.add(number);
  showCount();
  save([...destroyed]);
}
// Stores these numbers as the ones destroyed; whether it could.
function save(numbers) {
  try {
    localStorage.setItem(DESTROYED_KEY, JSON.stringify({ models: MODELS, numbers }));
    return true;
  } catch {
    return false; // storage blocked
  }
}
const rockets = createRockets(scene, structures, explosions, heightAt, camera, destroy);

// Shows the map or the aerial photo ("Aerial" in the Dev panel, src/dev.js) as the ground; the
// photo is loaded on first use. Only the shown textures stay in GPU memory: the photo's are
// re-uploaded when shown again, the map's drawn again.
async function showGround(kind) {
  if (kind === "map") {
    map.show();
    await map.ready;
  } else if (!ground.photo) {
    const paths = groundPaths("photo");
    ground.photo = await groundTextures(paths, await load(paths, () => {}));
  }
  const before = groundKind;
  groundKind = kind;
  for (const mesh of terrain.children) mesh.material.map = ground[kind].get(mesh.name);
  for (const [name, deck] of deckMaps) deck.value = deckTexture(kind, name);
  if (before === "map") map.hide();
  else for (const texture of ground[before].values()) texture.dispose();
  rails.visible = kind === "map";
}
const tree = createTrees(treePositions, canopyTrees, terrainInfo, heightAt);
scene.add(...tree.meshes);
const { serpents } = build("A3", { heightAt }); // src/catalog.js
const flight = createFlight(intoArea);
const helicopters = build("V14", { heightAt, flight }).vehicles; // src/catalog.js
// The check lines, drawn over the scene in a pass of their own (render).
const overlay = new THREE.Scene();

// Trams, trains and cars on their loops (tools/paths.mjs, src/movers.js), sharing the traffic.
const traffic = {
  // Each car's front, back and centre, noted anew each frame in that order, and so of each
  // stretch of a vehicle's way within WARN seconds ahead: x, z per point (xz); its height (y); its
  // vehicle, rail (-1 on a stretch ahead) and the next point in its cell, -1 if none (of); per cell
  // its first and last point, in the order noted (head: -1 if none, tail). Each kind makes room
  // for its own.
  noted: 0,
  xz: new Float64Array(0),
  y: new Float32Array(0),
  of: new Int32Array(0),
  head: new Int32Array(CELLS * CELLS).fill(-1),
  tail: new Int32Array(CELLS * CELLS),
  taken: new Map(), // cell -> flat [x, z, …] of the starting vehicles and the space ahead
  blockers: [], // per vehicle (of all kinds): the vehicle it waits for, or -1
  halves: [], // per vehicle: metres, half its width
  walks: new Int32Array(0), // per vehicle: 1 + the vehicle whose walk reached it (drive)
};
// A kind's routes and points (tools/paths.mjs), while the museum is open (src/museum.js) with its
// as one more round course, all its kinds in turn on it (every), a point every ROAD_STEP metres on
// the ground: the cars' its road, the trams' and the trains' their tracks.
const ROAD_STEP = 8;
function withRoad(kind, data, points) {
  if (!OPEN) return [data, points];
  const ring = { car: ROAD, tram: TRAM, train: TRACK }[kind];
  const lengths = ring.map(([x, z], k) => {
    const [nx, nz] = ring[(k + 1) % ring.length];
    return Math.hypot(nx - x, nz - z);
  });
  const length = lengths.reduce((sum, l) => sum + l, 0);
  const count = Math.round(length / ROAD_STEP);
  const way = [];
  for (let n = 0, k = 0, from = 0; n < count; n++) {
    const d = (n * length) / count;
    while (d > from + lengths[k]) from += lengths[k++];
    const [[x, z], [nx, nz]] = [ring[k], ring[(k + 1) % ring.length]];
    const t = (d - from) / lengths[k];
    const [px, pz] = [x + (nx - x) * t, z + (nz - z) * t];
    way.push(px, heightAt(px, pz), pz);
  }
  const route = { ref: "Museum", start: points.length / 3, count, length, every: true };
  const all = new Float32Array(points.length + way.length);
  all.set(points);
  all.set(way, points.length);
  return [{ ...data, routes: [...data.routes, route] }, all];
}
const movers = MOVER_KINDS.map((kind, i) =>
  createMovers(
    ...withRoad(
      kind,
      JSON.parse(new TextDecoder().decode(moverFiles[2 * i])),
      unpackPoints(moverFiles[2 * i + 1]),
    ),
    kind,
    traffic,
    { boost, camera, heightAt },
  ),
);
// The museum's round course in no menu or layer (its line hidden, so no badge either), not to give
// it away.
for (const { routes } of movers)
  for (const line of routes.children.filter(({ name }) => name === "Museum")) {
    line.visible = false;
    routes.remove(line);
  }
// Moves all vehicles dt seconds on: each notes its cars, looks ahead, then goes if its way is
// clear. In a ring of vehicles waiting for each other, the first one goes.
function drive(dt) {
  traffic.head.fill(-1);
  traffic.noted = 0;
  for (const mover of movers) mover.place();
  for (const mover of movers) mover.look();
  const { blockers } = traffic;
  if (traffic.walks.length !== blockers.length) traffic.walks = new Int32Array(blockers.length);
  const walks = traffic.walks.fill(0);
  for (let v = 0; v < blockers.length; v++) {
    let u = v;
    while (u >= 0 && !walks[u]) {
      walks[u] = v + 1;
      u = blockers[u];
    }
    if (u < 0 || walks[u] !== v + 1) continue; // no new ring
    let first = u;
    for (let w = blockers[u]; w !== u; w = blockers[w]) first = Math.min(first, w);
    blockers[first] = -1;
  }
  for (const mover of movers) mover.move(dt);
}
for (const mover of movers) {
  scene.add(...mover.meshes);
  overlay.add(mover.routes);
  for (const deck of brokenDecks) mover.cut(deck);
}
// The ferries (src/ferries.js), the museum's too (src/museum.js), which the ships wait for, and the
// Basiliskbrunnen (src/catalog.js) on the ground.
const ferries = createFerries(fromWGS84, heightAt, boost, OPEN ? [FERRY] : []);
// Each midway between its landings, for the museum's pins.
inCity(
  "ferries",
  LANDINGS.map(([, a, b]) => {
    const [x, z] = fromWGS84((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    return { x, z };
  }),
);
scene.add(ferries.group);
// On the Rhine the terrain lies flat at the water's surface, at most WATER.
const WATER = -4.9; // scene y
// A fountain within RHINE metres of the Rhine faces it: the water first found, looking every 2 m
// further out in 36 directions (those found then averaged); others are turned as they may, as
// the files do not say which way they face.
const RHINE = 60;
const towardsRhine = (x, z) => {
  for (let d = 2; d <= RHINE; d += 2) {
    let [sx, sz] = [0, 0];
    for (let a = 0; a < 36; a++) {
      const [s, c] = [Math.sin((a * Math.PI) / 18), Math.cos((a * Math.PI) / 18)];
      if (heightAt(x + d * s, z + d * c) <= WATER) [sx, sz] = [sx + s, sz + c];
    }
    if (sx || sz) return Math.atan2(sx, sz);
  }
};
build("L1", { heightAt, towardsRhine });
// The decks of all standing bridges (deckOf), made when first needed.
let roads = null;
const bridgeDecks = () =>
  (roads ??= deckOf(
    [...structures.triangles(structures.bridgeNumbers).values()].flatMap((parts) =>
      parts.flatMap(({ positions }) => positions),
    ),
  ));
const ships = createShips(new Float32Array(shipsBuffer), ferries.ferries, boost, bridgeDecks);
scene.add(...ships.meshes);
// Cyclists and e-scooter riders (src/runners.js) along the Rhine's Kleinbasel bank
// (src/rheinweg.js), braking for what the people flee from (danger).
const rheinweg = RHEINWEG.map(([lat, lon]) => fromWGS84(lat, lon));
// Where those on foot and on wheels keep room from each other (src/space.js).
const space = createSpace();
const runners = createRunners([rheinweg], heightAt, danger, space);
scene.add(...runners.meshes);
// Passers-by and joggers who swim down the Rhine (src/swimmers.js) on their round
// (src/rheinweg.js), waiting for the ferries and swimming aside from them, and swans beside them.
const rheinrunde = RHEINRUNDE.map(([lat, lon]) => fromWGS84(lat, lon));
const swimmers = createSwimmers(rheinrunde, heightAt, WATER, ferries.ferries, space);
scene.add(...swimmers.meshes);
// The museum's, fewer, on its round (src/museum.js), no ferry near.
const museumSwimmers =
  OPEN && createSwimmers(SWIM, heightAt, WATER, [], space, { walkers: 6, joggers: 4 });
if (OPEN) scene.add(...museumSwimmers.meshes);
// And cyclists and e-scooter riders on their way up the bank.
const museumRunners =
  OPEN && createRunners([SWIM.slice(0, 6)], heightAt, danger, space, { bike: 2, scooter: 2 });
if (OPEN) scene.add(...museumRunners.meshes);
// The Fasnacht clique marching round the Marktplatz (src/catalog.js), and in the museum another.
const { cliques } = build("S8", { heightAt });
overlay.add(ships.route);
const { planes } = build("V13", { heightAt, boost, flight }); // src/catalog.js
const birds = build("A4", { boost, heightAt }); // src/catalog.js

// The menu shows the names (see updateNames) and the loops of the trams (each line on its
// own), trains and cars, the course of the ships and the pedestrians' loops (kindLines.walk, set
// with them below) as lines above them; at first none. "Trams"
// shows or hides all tram lines (ticked when all are shown).
const trams = movers[MOVER_KINDS.indexOf("tram")];
const tramGroup = trams.routes;
tramGroup.visible = true;
const tramLines = tramGroup.children.toSorted((a, b) =>
  a.name.localeCompare(b.name, "en", { numeric: true }),
);
const tramBox = document.getElementById("trams");
const kindLines = {
  ...Object.fromEntries(MOVER_KINDS.map((kind, i) => [kind, movers[i].routes])),
  ship: ships.route,
};
const kindBoxes = [...document.querySelectorAll("#menu input[data-kind]")];
const tramBoxes = tramLines.map((line) => {
  const box = Object.assign(document.createElement("input"), { type: "checkbox" });
  box.style.accentColor = `#${line.material.color.getHexString()}`; // the line's colour
  box.addEventListener("change", () => showTram(line, box.checked));
  const label = document.createElement("label");
  label.append(box, line.name);
  document.getElementById("tram-lines").append(label);
  return box;
});
function showTram(line, on) {
  line.visible = on;
  tramBoxes[tramLines.indexOf(line)].checked = on;
  tramBox.checked = tramLines.every((l) => l.visible);
}
const tramLinesShown = () => tramLines.some((line) => line.visible);
for (const line of tramLines) showTram(line, false);
tramBox.addEventListener("change", () => {
  const all = tramBox.checked; // showTram changes it on the way
  for (const line of tramLines) showTram(line, all);
});
for (const box of kindBoxes)
  box.addEventListener("change", () => (kindLines[box.dataset.kind].visible = box.checked));
// Where a scene point is on the screen (px) and whether it is in front of the camera, by the view
// of the camera's last updateMatrixWorld.
const projected = new THREE.Vector3();
function onScreen(point) {
  projected.copy(point).project(camera);
  return {
    x: ((projected.x + 1) / 2) * innerWidth,
    y: ((1 - projected.y) / 2) * innerHeight,
    front: projected.z < 1,
  };
}

// Over each tram whose line is shown, its number in a round badge of the line's colour, so one
// sees where a tram changes its number (tools/paths.mjs).
const badgeLayer = document.getElementById("badges");
const badges = Array.from({ length: trams.count }, () =>
  badgeLayer.appendChild(Object.assign(document.createElement("div"), { hidden: true })),
);
const badgeAt = new THREE.Vector3();
const badgeColour = new THREE.Color();
let badgesOn = false; // whether a tram line was shown at the last update
function updateBadges() {
  const on = tramLinesShown();
  if (!on && !badgesOn) return; // all hidden already
  badgesOn = on;
  badges.forEach((badge, v) => {
    const part = trams.roof(v, badgeAt);
    const { x, y, front } = onScreen(badgeAt);
    const shown = part.lines.visible && front;
    if (badge.hidden === shown) badge.hidden = !shown;
    if (!shown) return;
    if (badge.textContent !== part.ref) {
      badge.textContent = part.ref;
      badge.style.background = part.colour;
      // Black on light colours (the yellow 10, the light green 16), as on the TNW network map.
      const { r, g, b } = badgeColour.set(part.colour); // linear
      badge.style.color = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#000" : "#fff";
    }
    badge.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  });
}

// While "Names" is ticked: the quarters and towns on the ground and the landmarks just above their
// top, the first roof, bridge deck or ground hit from above (tools/names.mjs). Landmarks further
// than LANDMARK_RANGE from the camera are hidden, so the centre stays readable from afar; the many
// Basiliskbrunnen further than BASILISK_RANGE, so they do not drown the others.
const [LANDMARK_RANGE, BASILISK_RANGE] = [3000, 1000]; // metres
// Shown as last chosen in this browser, else not.
const NAMES_KEY = "basel3d.names"; // "1" (on) or "0"
const namesBox = document.getElementById("names-box");
try {
  namesBox.checked = localStorage.getItem(NAMES_KEY) === "1";
} catch {} // storage blocked
namesBox.addEventListener("change", () => {
  try {
    localStorage.setItem(NAMES_KEY, namesBox.checked ? "1" : "0");
  } catch {} // storage blocked
});
// "Mouse aim" in the menu (only where there is a mouse): what fires aims at what is under the
// mouse (mouseRay), not ahead. As last chosen in this browser, else not.
const AIM_KEY = "basel3d.aim"; // "1" (on) or "0"
const aimBox = document.getElementById("aim-box");
try {
  aimBox.checked = localStorage.getItem(AIM_KEY) === "1";
} catch {} // storage blocked
aimBox.addEventListener("change", () => {
  try {
    localStorage.setItem(AIM_KEY, aimBox.checked ? "1" : "0");
  } catch {} // storage blocked
});

// Fullscreen, also left with Esc. iPhone has no Fullscreen API.
const fullscreenBox = document.getElementById("fullscreen-box");
fullscreenBox.disabled = !document.fullscreenEnabled;
fullscreenBox.addEventListener("change", () => {
  if (fullscreenBox.checked)
    document.documentElement.requestFullscreen().catch(() => (fullscreenBox.checked = false));
  else document.exitFullscreen();
});
document.addEventListener(
  "fullscreenchange",
  () => (fullscreenBox.checked = !!document.fullscreenElement),
);
const nameLayer = document.getElementById("names");
scene.updateMatrixWorld(); // for the rays from above
const fromAbove = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
// With them the ferries named, at the middle of their line, and the Basiliskbrunnen.
const labels = [
  ...JSON.parse(new TextDecoder().decode(namesJson)),
  ...ferries.ferries
    .filter(({ name }) => name)
    .map(({ name, a, r, length }) => ({
      name,
      kind: "landmark",
      x: a.x + (r.x * length) / 2,
      z: a.z + (r.z * length) / 2,
    })),
  ...CATALOG.L1.places.map(({ x, z }) => ({
    name: "Basiliskbrunnen",
    kind: "landmark",
    x,
    z,
    range: BASILISK_RANGE,
  })),
].map(({ name, kind, x, z, range = kind === "place" ? Infinity : LANDMARK_RANGE }) => {
  const at = new THREE.Vector3(x, heightAt(x, z), z);
  if (kind === "landmark") {
    fromAbove.set(new THREE.Vector3(x, 2000, z), DOWN);
    const hit = fromAbove.intersectObjects([buildings.scene, bridges.scene, terrain])[0];
    if (hit) at.y = hit.point.y;
  }
  const element = Object.assign(document.createElement("div"), {
    textContent: name,
    className: kind,
    hidden: true,
  });
  return { at, range, element: nameLayer.appendChild(element) };
});
// The UFO (src/catalog.js) hovers over where a ray from above first meets a roof or the ground.
const ufos = build("V12", {
  boost,
  roof(x, z) {
    fromAbove.set(new THREE.Vector3(x, 2000, z), DOWN);
    return fromAbove.intersectObjects([buildings.scene, terrain])[0].point.y;
  },
}).vehicles;
scene.add(...createPassage());
// The map's rails (src/rails.js), on the ground and on the decks, but those of destroyed bridges.
function addRails() {
  rails = createRails(tracks, terrainInfo, terrainAt, (x, z) =>
    Math.max(-Infinity, ...[bridgeDecks(), ...brokenDecks].flatMap((deck) => deck.heights(x, z))),
  );
  for (const deck of brokenDecks) rails.cut(deck);
  scene.add(rails);
}
if (map) addRails();
// Where the vehicles on the ground (src/drive.js) drive: each stands on the terrain or on the
// highest bridge deck at most STEP above its wheels.
const STEP = 1; // metres
const world = {
  ground(x, z, y) {
    let top = heightAt(x, z);
    for (const h of bridgeDecks().heights(x, z)) if (h <= y + STEP && h > top) top = h;
    return top;
  },
  blocked: (from, to) => structures.wall(from, to),
  intoArea,
};
// The places ({ x, z, heading: radians from south towards east }) on the bridge or ground there.
const parked = (places) =>
  places.map((place) => {
    fromAbove.set(new THREE.Vector3(place.x, 2000, place.z), DOWN);
    return { ...place, y: fromAbove.intersectObjects([bridges.scene, terrain])[0].point.y };
  });
// What one drives (src/catalog.js), in the city and the museum.
const police = build("V1", { parked, boost, world }).vehicles;
const ambulances = build("V2", { parked, boost, world }).vehicles;
const fireTrucks = build("V3", { parked, boost, world }).vehicles;
const motorcycles = build("V4", { parked, boost, world }).vehicles;
const quads = build("V5", { parked, boost, world }).vehicles;
const xrts = build("V6", { parked, boost, world }).vehicles;
const fromLV95 = ([e, n]) => ({ x: e - LV95[0], z: LV95[1] - n });
// Metres the towels' tops are above the ground at the feet, so uneven ground does not cover them.
const TOWEL = 0.06;
const towelShape = new THREE.BoxGeometry(0.9, 0.02, 2).translate(0, TOWEL - 0.01, 0.9);
// A towel of this colour and shape under one at a place (lying: feet there, head along the
// heading), tilted forward by tilt radians.
function towel({ x, y, z, heading, tilt = 0 }, color, shape = towelShape) {
  const mesh = new THREE.Mesh(shape, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.set(tilt, heading, 0, "YXZ");
  return mesh;
}
// The women sunbathing, doing yoga and dancing in a park, the men at the Claraplatz, the women in
// a lane (src/catalog.js).
build("S2", { parked, towel, TOWEL });
build("S3", { parked });
build("S4", { parked });
// The animals of the Zoo Basel, the Merian Gärten and the Lange Erlen (src/catalog.js).
const animals = build("A1", { heightAt, clear: tree.clear });
// The old man feeding swans on the Rhine's bank (src/catalog.js).
const feeding = build("S1", { heightAt, towel, TOWEL });
// Pedestrians (src/walkers.js) in the inner city, men and women of all looks, and dogs. They stand
// as the vehicles do, but also on a deck reaching one of the points AROUND them, so they stay on a
// bridge whose sidewalk runs along its edge; never on the water: there on the highest deck at or
// around them, however high.
const AROUND = [
  [0, 0],
  ...Array.from({ length: 8 }, (_, k) => [
    2 * Math.sin((k * Math.PI) / 4),
    2 * Math.cos((k * Math.PI) / 4),
  ]),
]; // there and 2 m away in eight directions
const walkGround = (x, z, y) => {
  const below = world.ground(x, z, y); // makes roads first
  let [reached, highest] = [-Infinity, -Infinity]; // the highest deck within reach, and of all
  for (const [dx, dz] of AROUND)
    for (const h of roads.heights(x + dx, z + dz)) {
      if (h > highest) highest = h;
      if (h <= y + STEP && h > reached) reached = h;
    }
  return Math.max(below, below > WATER || reached > -Infinity ? reached : highest);
};
// The walkers' looks: men and women of all looks, and dogs; the museum's too (src/museum.js).
const passerLooks = {
  people: mix(
    {
      body: ["man", "woman"],
      skin: [0xf1c7a5, 0xe8b996, 0xd9a27a, 0xc58c5c, 0x8a5634, 0x6b4128, 0x4a2c1a],
      hair: [0x2a1d14, 0x111111, 0xe2c46e, 0x7a3a1a, 0x8a8a8a],
      top: [
        0xffffff, 0x1e88e5, 0x111111, 0xc0392b, 0x6b6b6b, 0xf2c94c, 0x1e7d4a, 0xff6f00, 0x8e24aa,
        0xe8b0c8, 0x2f3a4a,
      ],
      bottom: [0x3b4d6b, 0x222222, 0xc2a878, 0x6b6b6b, 0x4a5d7a, 0x2f4f2f],
      shoes: [0xffffff, 0x111111, 0x6b4a2a, 0x1d1d1d],
      // Men (even) and women (odd) in turn, as the bodies.
      head: ["hair", "long", "cap", "long", "hair", "long", "beanie", "hair", "backcap", "long"],
      dress: [false, false, false, true],
      hat: [0x1b2333, 0xc0392b, 0x111111],
      face: [null, null, "glasses", null, null, "shades", null, null, null, null, "glasses"],
    },
    100,
  ),
  dogs: mix(
    {
      skin: [0x8b5a2b, 0xf0e0c0, 0x2a2a2a, 0xc8a165, 0xffffff],
      hair: [0x3a2414, 0x111111],
      top: [0xc0392b, 0x1e88e5, 0x2e7d32],
    },
    15,
  ),
};
const keptOff = []; // where walkers keep off the vehicles above (footprints, below)
const walkers = createWalkers(
  walksBuffer,
  terrainInfo.x0,
  terrainInfo.z0,
  passerLooks,
  walkGround,
  [...cliques.map(({ zones }) => zones), fireTrucks.map(({ zone }) => zone), keptOff],
  (near) => [
    ...tree.trunks(near),
    ...CATALOG.L1.places.filter(({ x, z }) => near(x, z)).map(({ x, z }) => [x, z, BASIN]),
  ],
  space,
);
scene.add(...walkers.meshes);
// The museum's pedestrians (src/museum.js) on its walks: MUSEUM_WALKERS parties, each kind in turn,
// within MUSEUM_RADIUS metres of its centre, the camera near it.
const [MUSEUM_WALKERS, MUSEUM_RADIUS] = [40, 80];
const museumCentre = new THREE.Vector3(MUSEUM.x, heightAt(MUSEUM.x, MUSEUM.z), MUSEUM.z);
const museumWalkers =
  OPEN &&
  createWalkers(
    MUSEUM.buffer,
    MUSEUM.x0,
    MUSEUM.z0,
    passerLooks,
    (x, z) => heightAt(x, z),
    [],
    () => [],
    space,
    { count: MUSEUM_WALKERS, radius: MUSEUM_RADIUS, every: true },
  );
if (OPEN) scene.add(...museumWalkers.meshes);
// The museum's secret switch (src/museum.js): a click on it, a tap on it or up to reach px from
// its top (if in sight), or walking the dot on it, opens or closes the museum; the mouse over
// it gets the hand cursor, as over a vehicle.
const button = createButton(heightAt);
scene.add(button);
function buttonAt(x, y, reach = 0) {
  raycaster.setFromCamera(
    new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1),
    camera,
  );
  if (raycaster.intersectObject(button).length > 0) return true;
  if (!reach) return false;
  const top = button.position.clone().setY(button.position.y + 0.375); // the button's top
  const { x: bx, y: by, front } = onScreen(top);
  return front && Math.hypot(bx - x, by - y) < reach && !hidden(top);
}
// Those on foot the cyclists (src/runners.js) keep off.
const pedestrians = [swimmers.people, walkers.members];
// Their loops in the layer "Walks", on the bridge or ground.
kindLines.walk = Object.assign(
  checkLines(walkers.stretches.flatMap(([x, z]) => [x, walkGround(x, z, Infinity) + 0.3, z])),
  { visible: false },
);
overlay.add(kindLines.walk);
// The riders' way and the swimmers' round in the layers "Bikes" and "Swimmers", on the ground or
// water.
const wayLines = (points, closed) =>
  Object.assign(
    checkLines(
      points
        .slice(0, closed ? points.length : -1)
        .flatMap((a, i) =>
          [a, points[(i + 1) % points.length]].flatMap(([x, z]) => [x, heightAt(x, z) + 0.3, z]),
        ),
    ),
    { visible: false },
  );
kindLines.bike = wayLines(rheinweg, false);
kindLines.swim = wayLines(rheinrunde, true);
overlay.add(kindLines.bike, kindLines.swim);
// The St. Jakob-Park in FC Basel's colours, blue walls and a red roof: the widest building whose
// middle is within STADIUM of its pitch's (the model joins the block behind its south stand to it),
// where the training game (src/catalog.js) is.
const STADIUM = 60; // metres
const stadium = structures.widest(CATALOG.S7.places[0].x, CATALOG.S7.places[0].z, STADIUM);
if (stadium >= 0) structures.paint(stadium, { roof: 0xd51f2a, wall: 0x1d3fbf });
// The buildings on Roche's site (its outline in OSM, landuse=industrial "Roche", in LV95) with
// white walls as its towers, so they show as one company's; their roofs as on the aerial photo.
const ROCHE = [
  [2612493.7, 1267596.1],
  [2612482.7, 1267693.6],
  [2612556.1, 1267702.2],
  [2612546.5, 1267783.5],
  [2612562.9, 1267785.6],
  [2612554.3, 1267826.9],
  [2612554.3, 1267843.6],
  [2612606.1, 1267850.7],
  [2612664.7, 1267859.4],
  [2612695.4, 1267863.1],
  [2612730.6, 1267870.9],
  [2612776.5, 1267884.8],
  [2612803.1, 1267893.7],
  [2612834.6, 1267904.8],
  [2612858.6, 1267788.5],
  [2612885.5, 1267793.9],
  [2612891.8, 1267767.1],
  [2612913.7, 1267660.3],
  [2612875.0, 1267651.7],
  [2612845.2, 1267644.6],
  [2612844.7, 1267647.6],
  [2612834.9, 1267647.5],
  [2612821.6, 1267644.7],
  [2612831.1, 1267608.2],
  [2612847.2, 1267508.5],
  [2612598.6, 1267443.0],
  [2612573.3, 1267603.4],
].map(fromLV95);
// Whether the point x, z is inside the outline (even-odd).
const inside = (outline, x, z) =>
  outline.reduce((odd, a, i) => {
    const b = outline.at(i - 1);
    return a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x ? !odd : odd;
  }, false);
for (const number of structures.within((x, z) => inside(ROCHE, x, z)))
  structures.paint(number, { wall: 0xf4f4f2 });
// The standing building a ray from above first meets at LV95 east, north, or over a scene point:
// its number and the point hit (x, y, z); undefined if none.
const roofAt = (lv95) => roofOver(fromLV95(lv95));
function roofOver({ x, z }) {
  fromAbove.set(new THREE.Vector3(x, 2000, z), DOWN);
  const hit = fromAbove.intersectObject(buildings.scene)[0];
  return hit && { number: hit.object.geometry.attributes._building.getX(hit.face.a), ...hit.point };
}
// Its green roof (LV95 2612593.3, 1267509.4) grey as another's (LV95 2612855.8, 1267667.0).
const green = roofAt([2612593.3, 1267509.4]);
if (green) structures.paint(green.number, { roof: 0x655d5a });
// The heading nearest to near along the walls of the building with this number: its level edges'
// headings folded onto a quarter turn (times 4) and averaged, weighted by their lengths.
function alongBuilding(number, near) {
  let [c, s] = [0, 0];
  for (const { positions: p } of structures.triangles([number]).get(number) ?? [])
    for (let t = 0; t < p.length; t += 9)
      for (let k = 0; k < 3; k++) {
        const [a, b] = [t + 3 * k, t + 3 * ((k + 1) % 3)];
        const [dx, dy, dz] = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
        const flat = Math.hypot(dx, dz);
        if (flat < 1 || Math.abs(dy) > 0.1 * flat) continue; // short or sloping
        c += flat * Math.cos(4 * Math.atan2(dx, dz));
        s += flat * Math.sin(4 * Math.atan2(dx, dz));
      }
  const [base, quarter] = [Math.atan2(s, c) / 4, Math.PI / 2];
  return base + Math.round((near - base) / quarter) * quarter;
}
// What stands on a roof comes down to the ground there, and graffiti on its walls go, when
// destroy() blows its building up.
const grounding = new Map(); // building number → what to call then
const landOn = (number, land, { x, z }) =>
  grounding.set(number, [...(grounding.get(number) ?? []), () => land(heightAt(x, z))]);
// The Rega's helicopters and the fighter jet (src/catalog.js), on roofs.
const regas = build("V10", { heightAt, roofOver, alongBuilding, landOn, boost }).vehicles;
const jets = build("V11", { heightAt, roofOver, landOn, boost, flight }).vehicles;
// The friends dancing on the Roche towers' roofs (src/catalog.js); destroy() removes them with
// their tower.
const onRoofs = new Map(); // building number → the meshes that go with it
for (const [number, meshes] of build("S5", { roofAt, heightAt }).roofs) onRoofs.set(number, meshes);
// Basel SBB's platform roofs (LV95 2611267.0, 1266160.4): roofs as dark as the building's at LV95
// 2611386.8, 1266248.2, walls as beige as the station building's (LV95 2611375.6, 1266339.0).
const platforms = roofAt([2611267.0, 1266160.4]);
if (platforms) structures.paint(platforms.number, { roof: 0x6a696a, wall: 0xded3bd });
// Basel SBB's front (src/station.js) and its clocks (src/clocks.js) on the building under its
// hall's roof (LV95 2611371.9, 1266325.5).
const station = roofAt([2611371.9, 1266325.5]);
if (station) {
  const sbb = createStation();
  const meshes = [sbb.mesh, createClocks(sbb.clocks)];
  scene.add(...meshes);
  onRoofs.set(station.number, meshes);
}
// The fire station's buildings grey, with gates and its name (src/firestation.js) on their fronts
// measured on the model: the one at WGS84 47.556285, 7.583173 and the long one at 47.556228,
// 7.582426, whose wings are one building with it.
for (const [inside, front] of [
  [
    { x: -125.5, z: 105.2 },
    {
      corners: [
        [-132.32, 117.69],
        [-114.19, 96.61],
      ],
      foot: 20.4,
      street: 2.8,
      band: 10.2,
    },
  ],
  [
    { x: -175.8, z: 111.2 },
    {
      corners: [
        [-197.09, 106.73],
        [-156.45, 121.28],
      ],
      foot: 20.5,
      street: 3.2,
      band: 11.3,
    },
  ],
]) {
  const roof = roofOver(inside); // none if it is destroyed
  if (!roof) continue;
  structures.paint(roof.number, { wall: GREY });
  const mesh = createFireStation(front);
  scene.add(mesh);
  onRoofs.set(roof.number, [mesh]);
}
// A rainbow flag (src/pride.js) on the tip of each of the Münster's towers: its building's highest
// vertex within 3 m of a point on the Georgsturm's (WGS84 47.556347, 7.591933) and on the
// Martinsturm's spire (47.556214, 7.592074), flying from the one towards the other: to the right as
// seen from the front.
const spires = [fromWGS84(47.556347, 7.591933), fromWGS84(47.556214, 7.592074)];
const prideHeading = Math.atan2(spires[0][1] - spires[1][1], spires[1][0] - spires[0][0]);
for (const [x, z] of spires) {
  const roof = roofOver({ x, z }); // none if the Münster is destroyed
  if (!roof) continue;
  const tip = [x, -Infinity, z];
  for (const { positions: p } of structures.triangles([roof.number]).get(roof.number) ?? [])
    for (let i = 0; i < p.length; i += 3)
      if (p[i + 1] > tip[1] && Math.hypot(p[i] - x, p[i + 2] - z) < 3)
        tip.splice(0, 3, ...p.slice(i, i + 3));
  const flag = createPride(...tip, prideHeading);
  scene.add(flag);
  onRoofs.set(roof.number, [...(onRoofs.get(roof.number) ?? []), flag]);
}
// Graffiti on walls (src/graffiti.js).
load(["CherryBombOne.woff2"], () => {})
  .then(([font]) => createGraffiti(font, structures, walkGround, roofOver))
  .then(({ meshes, marks }) => {
    scene.add(...meshes);
    for (const [number, hide] of marks)
      grounding.set(number, [...(grounding.get(number) ?? []), hide]);
  });
// The Elisabethenkirche, under its nave's roof at WGS84 47.552741, 7.590989, dressed in the
// rainbow's stripes from its foot to its spire's tip.
const elisabethen = roofOver({ x: 468.2, z: 497.3 }); // none if it is destroyed
if (elisabethen) {
  const { number } = elisabethen;
  let [bottom, top] = [Infinity, -Infinity];
  for (const { positions: p } of structures.triangles([number]).get(number) ?? [])
    for (let i = 1; i < p.length; i += 3)
      [bottom, top] = [Math.min(bottom, p[i]), Math.max(top, p[i])];
  dress(number, bottom, top);
}
// The Badischer Bahnhof's platform roofs, each under one of these points, as dark as its building's
// roof (LV95 2612676.3, 1268528.5).
for (const point of [
  [2612677.4, 1268620.4],
  [2612700.4, 1268629.4],
  [2612723.9, 1268634.2],
  [2612743.5, 1268638.9],
  [2612758.2, 1268657.9],
  [2612792.6, 1268498.3],
  [2612827.3, 1268519.9],
  [2612772.1, 1268676.6],
  [2612801.9, 1268621.3],
]) {
  const roof = roofAt(point);
  if (roof) structures.paint(roof.number, { roof: 0x736d6a });
}
// That building with old-town windows in light surrounds and without shutters (src/facade.js:
// style 0, seed 1), not a hall's none.
const badischer = roofAt([2612676.3, 1268528.5]);
if (badischer) structures.paint(badischer.number, { facade: 1 << 5 });
// The football training on its pitch, the girl on her bike and her sister (src/catalog.js).
const training = build("S7", { parked });
const bike = build("S6", { heightAt });
// "PUMA" mown into the grass (src/lawn.js), reading from WGS84 47.571836, 7.600411 to 47.572127,
// 7.600549.
const lawn = createLawn(
  "PUMA",
  [fromWGS84(47.571836, 7.600411), fromWGS84(47.572127, 7.600549)],
  terrainAt,
);
scene.add(lawn);
const tanks = build("V7", { parked, boost, world }).vehicles;
const dinos = build("V9", { parked, boost, world }).vehicles;
// The drone flies down to roofs (structures.top) as well.
const drones = build("V8", {
  heightAt,
  boost,
  world: {
    ...world,
    ground: (x, z, y) => Math.max(world.ground(x, z, y), structures.top(x, z, y + STEP)),
  },
  camera,
}).vehicles;
// The boats float on the water, where the terrain lies flat at the water's surface, at most WATER;
// banks and bridge piers stop them.
const onWater = {
  ground: (x, z) => heightAt(x, z),
  blocked: (from, to) => heightAt(to.x, to.z) > WATER || structures.wall(from, to, true),
  intoArea,
};
const fireboats = build("V15", { heightAt, boost, onWater }).vehicles;
const policeBoats = build("V16", { heightAt, boost, onWater }).vehicles;
let namesOn = false; // whether they were shown at the last update
function updateNames() {
  const on = namesBox.checked;
  if (!on && !namesOn) return; // all hidden already
  namesOn = on;
  for (const { at, range, element } of labels) {
    const { x, y, front } = onScreen(at);
    const near = camera.position.distanceTo(at) < range;
    const shown = on && front && near;
    if (element.hidden === shown) element.hidden = !shown;
    if (shown) element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

// Detailed trees only near the camera, fewer far away.
function updateTrees() {
  for (const mesh of tree.meshes) {
    const distance = mesh.boundingBox.distanceToPoint(camera.position);
    mesh.geometry =
      distance < TREE_DETAIL ? tree.near : distance < TREE_FAR ? tree.middle : tree.far;
    // Beyond TREE_FAR about as many per screen area as there.
    const share = Math.min(1, (TREE_FAR / distance) ** 2);
    mesh.count = Math.ceil(mesh.instanceMatrix.count * share);
  }
}

// cut: whether it leaves out the terrain in the passage's area, where createPassage lays its own.
function addWater(shader, cut) {
  const { a, ux, uz, length, half } = passage;
  const f = (v) => v.toFixed(3);
  shader.uniforms.passageCut = { value: cut };
  Object.assign(shader.uniforms, water);
  squares.maps.forEach((map, i) => (shader.uniforms[`squareMap${i}`] = map));
  squares.rects.forEach((rect, i) => (shader.uniforms[`squareRect${i}`] = rect));
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", "varying vec3 vWorld;\nvoid main() {")
    .replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "void main() {",
      `uniform sampler2D waterMask;
      uniform bool passageCut;
      uniform float waterTime;
      uniform vec4 waterArea;
      uniform vec3 waterDark, waterLight;
      uniform sampler2D squareMap0, squareMap1, squareMap2;
      uniform vec4 squareRect0, squareRect1, squareRect2;
      varying vec3 vWorld;
      // The colour with a finer square of the map (src/ground.js) over it where it lies, its
      // edge blended in.
      // Read only where it lies, so with the slopes worked out before.
      vec3 withSquare(vec3 under, sampler2D squareMap, vec4 rect) {
        vec2 uv = (vWorld.xz - rect.xy) / rect.z;
        vec2 at = vec2(uv.x, 1.0 - uv.y);
        vec2 across = dFdx(at), down = dFdy(at);
        vec2 edge = min(uv, 1.0 - uv);
        float inside = rect.w * smoothstep(0.0, 0.06, min(edge.x, edge.y));
        if (inside <= 0.0) return under;
        return mix(under, textureGrad(squareMap, at, across, down).rgb, inside);
      }
      // Smooth value noise in [0, 1] (hash without sine, stable for large coordinates).
      float hash(vec2 p) {
        vec3 q = fract(p.xyx * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // A coarse and a fine layer; the fine one fades out far away against shimmering.
      float waterPattern(vec2 q, float fine) {
        return 0.65 * noise(q * 0.03) + 0.35 * mix(0.5, noise(q * 0.1 + 17.0), fine);
      }
      void main() {
      if (passageCut) {
        vec2 rel = vWorld.xz - vec2(${f(a[0])}, ${f(a[1])});
        float t = dot(rel, vec2(${f(ux)}, ${f(uz)}));
        float s = dot(rel, vec2(${f(uz)}, ${f(-ux)}));
        if (t > 0.0 && t < ${f(length)} && s < ${f(half)} && s > ${f(-PASSAGE.reach)}) discard;
      }`,
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      diffuseColor.rgb = withSquare(diffuseColor.rgb, squareMap2, squareRect2);
      diffuseColor.rgb = withSquare(diffuseColor.rgb, squareMap1, squareRect1);
      diffuseColor.rgb = withSquare(diffuseColor.rgb, squareMap0, squareRect0);`,
    )
    .replace(
      "#include <opaque_fragment>",
      `vec2 waterUv = vec2(vWorld.x - waterArea.x, waterArea.y + waterArea.w - vWorld.z) / waterArea.zw;
      vec4 mask = texture2D(waterMask, waterUv);
      float wet = smoothstep(0.3, 0.7, mask.r);
      if (wet > 0.0) {
        vec2 p = vWorld.xz;
        float fine = 1.0 / (1.0 + length(cameraPosition - vWorld) / 500.0);
        // Downstream direction; still water without a river drifts slowly.
        vec2 flow = mask.gb * 2.0 - 1.0;
        flow = mix(vec2(0.15, 0.05), flow, smoothstep(0.1, 0.4, length(flow)));
        // Two copies carried 80 m downstream every 4 s, each restarting while the other is fully
        // shown, so the pattern never stretches at bends.
        float phase = fract(waterTime * 0.25);
        float shade = mix(
          waterPattern(p - flow * phase * 80.0, fine),
          waterPattern(p - flow * fract(phase + 0.5) * 80.0 + 37.0, fine),
          abs(2.0 * phase - 1.0));
        vec3 surface = mix(waterDark, waterLight, shade) + 0.35 * smoothstep(0.66, 0.8, shade);
        outgoingLight = mix(outgoingLight, surface, wet);
      }
      #include <opaque_fragment>`,
    );
}

// The texture for the decks on a tile with this ground kind: the map's own deck tile (the map
// leaves the bridges' roads out), else the ground's, as the aerial photo shows the decks.
function deckTexture(kind, name) {
  return (kind === "map" && map.decks.get(name)) || ground[kind].get(name);
}

// The map drew the tile anew (src/ground.js): its textures go onto the terrain and the decks.
function mapChanged(name) {
  if (groundKind !== "map") return;
  terrain.getObjectByName(name).material.map = ground.map.get(name);
  const deck = deckMaps.get(name);
  if (deck) deck.value = deckTexture("map", name);
}

// The bridges' tops show their place's texture (deckTexture), as if the map or photo ran across
// them (deckShader): their triangles sorted by the ground tile under their middle, one copy of
// base per tile. Returns the uniforms holding each tile's texture, by tile name.
function createDecks(model, base) {
  const { x0, z0, chunk } = terrainInfo;
  const maps = new Map();
  const vertex = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const { geometry } = mesh;
    const { index, attributes } = geometry;
    const at = (i) => (index ? index.getX(i) : i);
    mesh.updateWorldMatrix(true, false);
    const byTile = new Map(); // tile name → its triangles' first corners
    for (let t = 0; t < (index ?? attributes.position).count; t += 3) {
      let [x, z] = [0, 0];
      for (let k = 0; k < 3; k++) {
        vertex.fromBufferAttribute(attributes.position, at(t + k)).applyMatrix4(mesh.matrixWorld);
        x += vertex.x / 3;
        z += vertex.z / 3;
      }
      const name = `${Math.floor((x - x0) / chunk)}_${Math.floor((z - z0) / chunk)}`;
      if (!byTile.has(name)) byTile.set(name, []);
      byTile.get(name).push(t);
    }
    const order = [];
    const materials = [];
    for (const [name, triangles] of byTile) {
      geometry.addGroup(order.length, triangles.length * 3, materials.length);
      for (const t of triangles) order.push(at(t), at(t + 1), at(t + 2));
      const texture = deckTexture(groundKind, name);
      if (!texture) {
        materials.push(base); // outside the ground
        continue;
      }
      const [ix, iz] = name.split("_").map(Number);
      const map = { value: texture };
      maps.set(name, map);
      const tile = new THREE.Vector3(x0 + ix * chunk, z0 + iz * chunk, chunk);
      const material = base.clone();
      material.onBeforeCompile = (shader, renderer) => {
        Object.assign(shader.uniforms, { deckMap: map, deckTile: { value: tile } });
        squares.deckMaps.forEach((m, i) => (shader.uniforms[`deckSquareMap${i}`] = m));
        squares.deckRects.forEach((r, i) => (shader.uniforms[`deckSquareRect${i}`] = r));
        deckShader(shader);
        base.onBeforeCompile(shader, renderer);
      };
      material.customProgramCacheKey = () => "deck";
      materials.push(material);
    }
    geometry.setIndex(order);
    mesh.material = materials;
  });
  return maps;
}

// Where a face looks up, seen from above, its colour from deckMap, the texture of the tile at
// deckTile (west x, north z, size). Before the colours, so the highlight still wins.
function deckShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", "varying vec3 vDeck;\nvoid main() {")
    .replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvDeck = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "void main() {",
      `uniform sampler2D deckMap, deckSquareMap0, deckSquareMap1, deckSquareMap2;
      uniform vec3 deckTile;
      uniform vec4 deckSquareRect0, deckSquareRect1, deckSquareRect2;
      varying vec3 vDeck;
      // The colour with a finer square of the decks' roads (src/ground.js) over it where it
      // lies, its edge blended in.
      // Read only where it lies, so with the slopes worked out before.
      vec3 withDeckSquare(vec3 under, sampler2D squareMap, vec4 rect) {
        vec2 uv = (vDeck.xz - rect.xy) / rect.z;
        vec2 at = vec2(uv.x, 1.0 - uv.y);
        vec2 across = dFdx(at), down = dFdy(at);
        vec2 edge = min(uv, 1.0 - uv);
        float inside = rect.w * smoothstep(0.0, 0.06, min(edge.x, edge.y));
        if (inside <= 0.0) return under;
        return mix(under, textureGrad(squareMap, at, across, down).rgb, inside);
      }
      void main() {`,
    )
    .replace(
      "#include <color_fragment>",
      `vec3 deckNormal = normalize(cross(dFdx(vDeck), dFdy(vDeck))); // towards the camera
      vec3 deckGround = texture2D(deckMap,
        vec2(vDeck.x - deckTile.x, deckTile.y + deckTile.z - vDeck.z) / deckTile.z).rgb;
      deckGround = withDeckSquare(deckGround, deckSquareMap2, deckSquareRect2);
      deckGround = withDeckSquare(deckGround, deckSquareMap1, deckSquareRect1);
      deckGround = withDeckSquare(deckGround, deckSquareMap0, deckSquareRect0);
      diffuseColor.rgb = mix(diffuseColor.rgb, deckGround, smoothstep(0.75, 0.9, deckNormal.y));
      #include <color_fragment>`,
    );
}

// One mesh per tile, named column_row like its ground texture: the terrain's own (src/terrain.js),
// and a grid of heights TERRAIN_COARSE metres apart for when it is far (updateTerrain).
function createTerrain({ x0, z0, chunk, columns, rows }) {
  water.waterArea.value.set(x0, z0, columns * chunk, rows * chunk);
  const group = new THREE.Group();
  // A tile's geometry from its points (x, z on the tile from its north-west corner, flat, and their
  // heights) and triangles, with a skirt hanging SKIRT metres down from its edge (ring: the points
  // there, once round), both ways round, so no gaps show where it meets another tile.
  const SKIRT = 50;
  function tileGeometry(ix, iz, places, heights, index, ring) {
    const [left, top] = [x0 + ix * chunk, z0 + iz * chunk];
    const count = heights.length;
    const position = new Float32Array((count + ring.length) * 3);
    const uv = new Float32Array((count + ring.length) * 2);
    for (let i = 0; i < count; i++) {
      position[3 * i] = left + places[2 * i];
      position[3 * i + 1] = heights[i];
      position[3 * i + 2] = top + places[2 * i + 1];
      uv[2 * i] = places[2 * i] / chunk;
      uv[2 * i + 1] = 1 - places[2 * i + 1] / chunk;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeVertexNormals();
    const normal = geometry.attributes.normal.array;
    const all = new Uint32Array(index.length + ring.length * 12);
    all.set(index);
    ring.forEach((a, k) => {
      const c = count + k;
      position.set([position[3 * a], position[3 * a + 1] - SKIRT, position[3 * a + 2]], 3 * c);
      uv.set(uv.subarray(2 * a, 2 * a + 2), 2 * c);
      normal.set(normal.subarray(3 * a, 3 * a + 3), 3 * c);
      const b = ring[(k + 1) % ring.length];
      const d = count + ((k + 1) % ring.length);
      all.set([a, b, c, b, d, c, a, c, b, b, c, d], index.length + 12 * k);
    });
    geometry.setIndex(new THREE.BufferAttribute(all, 1));
    geometry.computeBoundingBox();
    return geometry;
  }
  const side = land.step;
  const GRID_SIDE = chunk / side + 1; // points a side of the terrain's own grid
  // The far grid's points, triangles and edge, n cells a side.
  const n = chunk / TERRAIN_COARSE;
  const places = new Float32Array((n + 1) * (n + 1) * 2);
  for (let k = 0; k < (n + 1) * (n + 1); k++)
    places.set([(k % (n + 1)) * TERRAIN_COARSE, Math.floor(k / (n + 1)) * TERRAIN_COARSE], 2 * k);
  const far = new Uint32Array(n * n * 6);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const k = row * (n + 1) + col;
      far.set([k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2], 6 * (row * n + col));
    }
  const farRing = [];
  for (let k = 0; k < 4 * n; k++) {
    const s = k % n;
    farRing.push([s, n + s * (n + 1), n * (n + 1) + n - s, (n - s) * (n + 1)][(k / n) | 0]);
  }
  for (let iz = 0; iz < rows; iz++)
    for (let ix = 0; ix < columns; ix++) {
      const { keys, heights, index, ring } = land.tiles[iz * columns + ix];
      const grid = new Float32Array(keys.length * 2);
      keys.forEach((key, i) => {
        grid[2 * i] = (key % GRID_SIDE) * side;
        grid[2 * i + 1] = Math.floor(key / GRID_SIDE) * side;
      });
      const fine = tileGeometry(ix, iz, grid, heights, index, ring);
      const farHeights = new Float32Array(places.length / 2);
      for (let k = 0; k < farHeights.length; k++)
        farHeights[k] = terrainAt(
          x0 + ix * chunk + places[2 * k],
          z0 + iz * chunk + places[2 * k + 1],
        );
      const coarse = tileGeometry(ix, iz, places, farHeights, far, farRing);
      const material = new THREE.MeshLambertMaterial({
        map: ground[groundKind].get(`${ix}_${iz}`),
      });
      material.onBeforeCompile = (shader) => addWater(shader, true);
      material.customProgramCacheKey = () => "water"; // all chunks share one program
      const mesh = new THREE.Mesh(fine, material);
      mesh.name = `${ix}_${iz}`;
      mesh.userData.levels = [fine, coarse]; // for updateTerrain
      group.add(mesh);
    }
  return group;
}

// The passage's ground (passageGround), every metre, and a wall on the street's side from there up
// to the terrain.
function createPassage() {
  const { x0, z0, chunk } = terrainInfo;
  const { length, half, point } = passage;
  const { reach } = PASSAGE;
  const [ix, iz] = point(length / 2, 0).map((d, k) => Math.floor((d - [x0, z0][k]) / chunk));
  // Beyond its ends and its edge in the water it reaches UNDER metres on, DROP below the terrain,
  // so no seam shows between them.
  const [UNDER, DROP] = [1, 0.02];
  const [nt, ns] = [Math.ceil(length + 2 * UNDER), Math.ceil(half + reach + UNDER)];
  const position = [];
  const uv = [];
  for (let i = 0; i <= nt; i++)
    for (let j = 0; j <= ns; j++) {
      const t = -UNDER + ((length + 2 * UNDER) * i) / nt;
      const s = half - ((half + reach + UNDER) * j) / ns;
      const [x, z] = point(t, s);
      const inside = t >= 0 && t <= length && s >= -reach;
      position.push(x, inside ? passageGround(t, s) : terrainAt(x, z) - DROP, z);
      uv.push((x - x0) / chunk - ix, 1 - ((z - z0) / chunk - iz));
    }
  const index = [];
  for (let i = 0; i < nt; i++)
    for (let j = 0; j < ns; j++) {
      const k = i * (ns + 1) + j;
      index.push(k, k + 1, k + ns + 1, k + 1, k + ns + 2, k + ns + 1);
    }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  ground.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  ground.setIndex(index);
  ground.computeVertexNormals();
  // Along the street's side every metre, from its ground up to the terrain; elsewhere it turns
  // into the terrain (passageGround).
  const walls = [];
  const steps = Math.ceil(length);
  for (let i = 1; i <= steps; i++) {
    const [[xa, za], [xb, zb]] = [i - 1, i].map((k) => point((length * k) / steps, half));
    const [ya, yb] = [i - 1, i].map((k) => passageGround((length * k) / steps, half));
    const [ta, tb] = [terrainAt(xa, za), terrainAt(xb, zb)];
    walls.push(xa, ya, za, xb, yb, zb, xa, ta, za, xb, yb, zb, xb, tb, zb, xa, ta, za);
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute("position", new THREE.Float32BufferAttribute(walls, 3));
  // Drawn like its terrain tile (its map, also when changed, and water), but not cut (addWater).
  const tile = terrain.getObjectByName(`${ix}_${iz}`).material;
  const material = new THREE.MeshLambertMaterial({ map: tile.map });
  Object.defineProperty(material, "map", { get: () => tile.map });
  material.onBeforeCompile = (shader) => addWater(shader, false);
  material.customProgramCacheKey = tile.customProgramCacheKey;
  return [
    new THREE.Mesh(ground, material),
    new THREE.Mesh(
      wall,
      new THREE.MeshLambertMaterial({
        color: materials.bridge.color,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    ),
  ];
}

// The coarse terrain for the chunks TERRAIN_DETAIL metres or more from the camera, the map as
// sharp as each chunk's distance needs, if in view, and the rails of the chunks near enough to
// show them.
const bufferSize = new THREE.Vector2();
const view = new THREE.Frustum();
const viewMatrix = new THREE.Matrix4();
const squareBox = new THREE.Box3();
const DECKS = 40; // metres the bridges' decks are above the ground at most
// Whether the ground or a deck on a square (x, z of its north-west corner, metres across) may be
// in the view last drawn: the box round the terrain at nine points of it, a quarter of its width
// higher and lower for what lies between them.
function squareSeen(x, z, extent) {
  let [low, high] = [Infinity, -Infinity];
  for (let i = 0; i <= 2; i++)
    for (let j = 0; j <= 2; j++) {
      const h = heightAt(x + (i * extent) / 2, z + (j * extent) / 2);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  squareBox.min.set(x, low - extent / 4, z);
  squareBox.max.set(x + extent, high + extent / 4 + DECKS, z + extent);
  return view.intersectsBox(squareBox);
}
function updateTerrain() {
  view.setFromProjectionMatrix(
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const distances = new Map();
  const seen = new Set(); // the chunks that may be in the view last drawn
  for (const mesh of terrain.children) {
    const [fine, coarse] = mesh.userData.levels;
    distances.set(mesh.name, fine.boundingBox.distanceToPoint(camera.position));
    mesh.geometry = distances.get(mesh.name) < TERRAIN_DETAIL ? fine : coarse;
    if (view.intersectsBox(fine.boundingBox)) seen.add(mesh.name);
  }
  if (groundKind !== "map") return;
  // The pixels a metre takes on the screen a metre away.
  const focal =
    (renderer.getDrawingBufferSize(bufferSize).y / 2) * camera.projectionMatrix.elements[5];
  const focus = riding ? camera.position : orbit.target;
  map.update(
    (name) => distances.get(name),
    (name) => seen.has(name),
    focal,
    focus,
    camera.position.distanceTo(focus),
    squareSeen,
  );
  // The rails have faded where a pixel spans 1.6 m (src/rails.js), and lie on the fine terrain.
  const far = Math.min(1.6 * focal, TERRAIN_DETAIL);
  for (const mesh of rails.children) mesh.visible = distances.get(mesh.name) < far;
}

// Metres along a line (from a point along a unit direction) until it leaves the terrain's area,
// seen from above; 0 from outside it.
function within(from, direction) {
  const { x0, z0, chunk, columns, rows } = terrainInfo;
  const edge = (at, d, low, high) => (d > 0 ? (high - at) / d : d < 0 ? (low - at) / d : Infinity);
  return Math.max(
    0,
    Math.min(
      edge(from.x, direction.x, x0, x0 + columns * chunk),
      edge(from.z, direction.z, z0, z0 + rows * chunk),
    ),
  );
}

// A scene position moved into the terrain's area, as [x, z].
function intoArea(x, z) {
  const { x0, z0, chunk, columns, rows } = terrainInfo;
  const { clamp } = THREE.MathUtils;
  return [clamp(x, x0, x0 + columns * chunk), clamp(z, z0, z0 + rows * chunk)];
}

// The ground's height at a scene position: the passage's (passageGround) in its area, else the
// terrain's.
function heightAt(x, z) {
  const [t, s] = passage.local(x, z);
  return t >= 0 && t <= passage.length && s <= passage.half && s >= -PASSAGE.reach
    ? passageGround(t, s)
    : terrainAt(x, z);
}

// The passage's ground at [along, across] (passage.local): level from the street's wall to the
// bank's edge, from there falling evenly to the Rhine's surface at its edge; towards its ends and
// its edge in the water it turns into the terrain.
function passageGround(t, s) {
  const { bank, y0, y1, length, river, point } = passage;
  let edge = bank[0][1];
  for (let i = 1; i < bank.length; i++)
    if (t > bank[i - 1][0])
      edge =
        bank[i - 1][1] +
        (bank[i][1] - bank[i - 1][1]) *
          Math.min((t - bank[i - 1][0]) / (bank[i][0] - bank[i - 1][0]), 1);
  const level = y0 + ((y1 - y0) * t) / length;
  const y =
    level + (river - level) * Math.min(Math.max((-s - edge) / (PASSAGE.water - edge), 0), 1);
  const blend = Math.max(0, 1 - Math.min(t, length - t, s + PASSAGE.reach) / PASSAGE.blend);
  return blend ? y + (terrainAt(...point(t, s)) - y) * blend : y;
}

// Flies the craft piloted, if any, on by dt seconds and returns it; but where its underside or
// its front (craft.nose ahead of its middle, along its body) meets the ground or is below a
// roof, a wall is between its middle and its front, or it sinks through a bridge's deck, it blows
// up, and with it the building or bridge it met (destroy), and one is off, the
// camera staying where it is: the view's centre is where it looks at the ground, CENTRE above it
// as updateOrbit keeps it, so nothing moves; only a camera looking less far down than the view
// allows (maxPolarAngle) tilts down to that. Not while it still rises after boarding (lift).
const looking = new THREE.Vector3();
const flownFrom = new THREE.Vector3();
const flownTo = new THREE.Vector3();
const front = new THREE.Vector3();
const bottom = new THREE.Vector3();
function fly(dt) {
  const craft = pilot();
  if (!craft) return;
  flown ??= flight.start(craft);
  const rising = flown.lift > 0;
  flownFrom.copy(flown);
  flight.step(flown, steering(), dt, craft);
  const { x, y, z } = flownTo.copy(flown);
  const { rotation, scale } = craft.group;
  const under = y - craft.low * scale.y;
  const level = Math.cos(rotation.x) * craft.nose * scale.y; // metres ahead, seen from above
  front.set(
    x + Math.sin(flown.heading) * level,
    y - Math.sin(rotation.x) * craft.nose * scale.y,
    z + Math.cos(flown.heading) * level,
  );
  const built =
    structures.top(x, z, Infinity, under) > under ||
    structures.top(front.x, front.z, Infinity, front.y) > front.y ||
    structures.wall(flownTo, front, true) ||
    bridgeDecks()
      .heights(x, z)
      .some((h) => under < h && h <= flownFrom.y);
  const met = built || under < heightAt(x, z) || front.y < heightAt(front.x, front.z);
  if (rising || !met) return craft;
  const velocity = flownTo.clone().sub(flownFrom).setY(0);
  explosions.crash(flownTo, craft.group, velocity.divideScalar(dt || 1));
  if (built) destroy(structures.hit(bottom.set(x, under, z), front));
  camera.getWorldDirection(looking);
  looking.y = Math.min(
    looking.y,
    -Math.hypot(looking.x, looking.z) / Math.tan(orbit.maxPolarAngle - 0.01),
  );
  raycaster.set(camera.position, looking.normalize());
  const ground = raycaster.intersectObject(terrain)[0]?.point;
  before = {
    position: camera.position.clone(),
    target: ground?.addScaledVector(looking, CENTRE / looking.y) ?? flownTo.clone(),
  };
  fling.set(0, 0, 0);
  getOff();
}

// Gets off: back to the view from before riding.
function getOff() {
  if (mouseLook()) document.exitPointerLock();
  riding = null;
  onFoot = null;
  stop(false);
  steerBox.hidden = true;
  camera.position.copy(before.position);
  orbit.target.copy(before.target);
  camera.near = 1;
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  orbit.enabled = true;
  document.body.dataset.mode = "orbit";
}

// --- Riding: click or tap a tram, train, car, ship, plane, a helicopter, the jet, the sea
// monster, the UFO, a police car, the ambulance, the fire truck, a motorcycle, the quad, the XRT, the tank, a boat or the drone to ride along; while
// riding, but not steering, a click or tap on another one changes to it. A finger also finds one
// up to FINGER beside it. The button or Esc gets off.
const FINGER = 25; // px
// The UFO from behind and above, looking down on it, its crosshair (its dip) just above its rim.
// The Rega's helicopters from behind and above, each its own ride.
const regaRides = regas.map(({ group, material }) =>
  riders([{ object: group, materials: [material], eye: [0, 5, -20], ahead: [0, -1, 14] }]),
);
const ufoRides = ufos.map(({ group, material }) =>
  riders([{ object: group, materials: [material], eye: [0, 22, -80], ahead: [0, 0, 30] }]),
);
// The jet from behind and a little above, looking over it: below the middle of the screen, above
// the steering buttons, its crosshair (its dip) in the middle, just above its nose.
const jetRides = jets.map(({ group, material }) =>
  riders([{ object: group, materials: [material], eye: [0, 8, -48], ahead: [0, 2.6, 40] }]),
);
// What is driven or flown by their own rules, each [vehicles, ride]: the police cars, the ambulance, the fire truck, the
// motorcycles, the quads, the XRT, the tanks, the dinosaur and the boats, from behind and above; the fire truck from its own eye
// and ahead; the XRT and the drones through their own camera (look).
const drives = [
  [police, [0, 3, -8.5], [0, 1.2, 8]],
  [ambulances, [0, 3.8, -10], [0, 1.5, 9]],
  [fireTrucks],
  [motorcycles, [0, 2.6, -6], [0, 0.6, 5]],
  [quads, [0, 2.6, -6], [0, 0.6, 5]],
  [xrts],
  [tanks, [0, 5, -16], [0, 2, 14]],
  [dinos, [0, 30, -55], [0, 8, 20]],
  [fireboats, [0, 9, -24], [0, 3, 20]],
  [policeBoats, [0, 4, -14], [0, 1.5, 11]],
  [drones],
].map(([vehicles, eye, ahead]) => {
  const ride = riders(
    vehicles.map(({ group, material, ...own }) => ({
      object: group,
      materials: [material],
      eye: eye ?? own.eye,
      ahead: ahead ?? own.ahead,
    })),
  );
  if (vehicles[0]?.look) ride.cab = (v, view) => vehicles[v].look(view);
  return [vehicles, ride];
});
// Water splashing round the wheels of the road vehicles and dinos on the Rhine (src/splash.js).
const splash = createSplash(
  [police, ambulances, fireTrucks, motorcycles, quads, xrts, tanks, dinos].flat(),
  (x, z, y) => y <= WATER + 0.5 && heightAt(x, z) <= WATER,
  WATER,
);
scene.add(splash.points);
// People and animals of src/people.js flee (dodge) from what moves on the ground or water: the
// cars of trams, trains and road vehicles that go and their ways WARN seconds ahead (traffic), and
// the vehicles above (but the drones) while they move faster than slow, with their ways WARN
// seconds ahead along their heading; and, but the clique itself, the Fasnacht clique's rows and
// members (src/fasnacht.js, its zones).
// In danger is one up to margin metres beside the vehicles (steered metres more beside the vehicles
// above, as they may turn) or in a row's zone, at most level metres above or below.
const DANGER = { margin: 0.5, steered: 4, level: 3, slow: 0.5 }; // metres, metres per second
const CLEAR = 0.5; // metres one flees beyond a danger
const TRY = 0.25; // metres between the spots tried on a way out
// Metres a way out counts more that crosses another danger, or that leads into one.
const [CROSS, TRAPPED] = [100, 1000];
// The vehicles above, each with where it was the frame before.
const driven = drives
  .flatMap(([vehicles]) => vehicles)
  .filter(({ half }) => half)
  .map((vehicle) => ({ vehicle, ...vehicle.group.position, speed: 0 }));
// The dangers within SPAN metres of the spot last asked (asked), at most MOST, each back x, z,
// way x, z (unit), length and half width, with the car or stretch (its first point) or driven
// vehicle (-1 - its index) or clique row (-1 - driven vehicles - its index) it is of.
const [SPAN, MOST] = [20, 32]; // metres, more than any way out (src/people.js)
const zones = new Float64Array(6 * MOST);
const zoneOf = new Int32Array(MOST);
let zoneCount = 0;
const asked = [0, 0];
function zone(of, bx, bz, ux, uz, length, half) {
  const [dx, dz] = [asked[0] - bx, asked[1] - bz];
  const along = dx * ux + dz * uz;
  if (along < -SPAN || along > length + SPAN || Math.abs(dx * uz - dz * ux) > half + SPAN) return;
  if (zoneCount === MOST || zoneOf.subarray(0, zoneCount).includes(of)) return;
  zoneOf[zoneCount] = of;
  zones.set([bx, bz, ux, uz, length, half], 6 * zoneCount++);
}
// How far x, z is beside the danger at k (of zones), to its right; NaN if not along it.
function beside(k, x, z) {
  const [dx, dz] = [x - zones[k], z - zones[k + 1]];
  const along = dx * zones[k + 2] + dz * zones[k + 3];
  return along >= 0 && along <= zones[k + 4] ? dx * zones[k + 3] - dz * zones[k + 2] : NaN;
}
const inDanger = (x, z) => {
  for (let k = 0; k < 6 * zoneCount; k += 6)
    if (Math.abs(beside(k, x, z)) < zones[k + 5]) return true;
  return false;
};
const [wallFrom, wallTo] = [new THREE.Vector3(), new THREE.Vector3()];
// Whether one at x, y, z may go straight to tx, tz: ground all the way, at each metre at most STEP
// up or down from the one before (not off a bridge's edge), and no wall of a building or bridge.
function open(x, y, z, tx, tz) {
  const n = Math.ceil(Math.hypot(tx - x, tz - z));
  let h = walkGround(x, z, y);
  for (let i = 1; i <= n; i++) {
    const g = walkGround(x + ((tx - x) * i) / n, z + ((tz - z) * i) / n, h);
    if (Math.abs(g - h) > STEP) return false;
    h = g;
  }
  return !structures.wall(wallFrom.set(x, y + 1, z), wallTo.set(tx, y + 1, tz), true);
}
const way = [0, 0];
// Null if x, y, z is in no danger (the clique's zones not counted if march; none under the
// water's surface, swimming), else the shortest
// way out ([x, z]) within reach metres, open all the way (open): across one of the dangers there,
// to either side, turn radians off straight across, CLEAR and clear more metres beyond it and on
// until out of all, rather not across another (CROSS); only if there is none, as far out of one
// on its own side as it may; [0, 0] if not even that.
function danger(x, y, z, reach, march, clear = 0, turn = 0) {
  if (y < WATER - 0.1) return null; // swimming
  zoneCount = 0;
  [asked[0], asked[1]] = [x, z];
  const { xz, y: ys, of, head, blockers, halves } = traffic;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let q = head[carCell(x + i * CELL, z + j * CELL)]; q >= 0; q = of[3 * q + 2]) {
        const v = of[3 * q];
        if (blockers[v] >= 0 || Math.abs(ys[q] - y) > DANGER.level) continue;
        const p = q - (q % 3);
        const [fx, fz, bx, bz] = xz.subarray(2 * p, 2 * p + 4); // its front, then back (traffic)
        const length = Math.hypot(fx - bx, fz - bz) || 1;
        const [ux, uz] = [(fx - bx) / length, (fz - bz) / length];
        zone(p, bx, bz, ux, uz, length, halves[v] + DANGER.margin);
      }
  driven.forEach(({ vehicle, speed }, d) => {
    const { position, rotation, scale } = vehicle.group;
    if (Math.abs(speed) < DANGER.slow || Math.abs(position.y - y) > DANGER.level) return;
    // Along its heading, or back in reverse.
    const s = Math.sign(speed);
    const [ux, uz] = [s * Math.sin(rotation.y), s * Math.cos(rotation.y)];
    const [half, width] = [vehicle.half * scale.x, (vehicle.width / 2) * scale.x];
    const [bx, bz] = [position.x - ux * half, position.z - uz * half];
    const side = width + DANGER.margin + DANGER.steered;
    zone(-1 - d, bx, bz, ux, uz, 2 * half + Math.abs(speed) * WARN, side);
  });
  let r = 0; // over all cliques' zones
  for (const { zones } of march ? [] : cliques)
    for (const c of zones) {
      if (Math.abs(c[6] - y) <= DANGER.level)
        zone(-1 - driven.length - r, c[0], c[1], c[2], c[3], c[4], c[5]);
      r++;
    }
  if (!inDanger(x, z)) return null;
  let best = Infinity;
  way[0] = way[1] = 0;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  for (let k = 0; k < 6 * zoneCount; k += 6) {
    const side = beside(k, x, z);
    if (!(Math.abs(side) < zones[k + 5])) continue;
    // Beside a vehicle above's track (only in its steered metres), it never runs across it.
    const d = -1 - zoneOf[k / 6];
    const aside = d >= 0 && d < driven.length && Math.abs(side) > zones[k + 5] - DANGER.steered;
    for (const s of [-1, 1]) {
      const [ax, az] = [
        s * (zones[k + 3] * cos + zones[k + 2] * sin),
        s * (zones[k + 3] * sin - zones[k + 2] * cos),
      ];
      const out = (zones[k + 5] - s * side + CLEAR + clear) / cos;
      let t = out;
      while (t <= reach && inDanger(x + ax * t, z + az * t)) t += TRY;
      // Else just out of this danger; but only as far as reach, walls and edges let.
      let full = t <= reach;
      let length = full ? t : Math.min(out, reach);
      while (length > TRY && !open(x, y, z, x + ax * length, z + az * length)) {
        length /= 2;
        full = false;
      }
      // Not out or aside, it stays on its own side, at a wall rather than running back across.
      if ((!full || aside) && s * side < 0) continue;
      const cost = full ? t + (t > out ? CROSS : 0) : TRAPPED + out - length;
      if (length <= TRY || cost >= best) continue;
      best = cost;
      [way[0], way[1]] = [ax * length, az * length];
    }
  }
  return way;
}
// The vehicles above as zones walkers keep off (keptOff): each one's footprint, back x, z, way x,
// z, length and half width; far off while it is more than DANGER.level over the ground.
keptOff.push(...driven.map(() => new Float64Array(6)));
function footprints() {
  driven.forEach(({ vehicle: { group, half, width } }, d) => {
    const { position: p, rotation, scale } = group;
    const [ux, uz, h] = [Math.sin(rotation.y), Math.cos(rotation.y), half * scale.x];
    if (p.y - walkGround(p.x, p.z, p.y) > DANGER.level) keptOff[d][0] = Infinity;
    else keptOff[d].set([p.x - ux * h, p.z - uz * h, ux, uz, 2 * h, (width / 2) * scale.x]);
  });
}
// Figures flee after all has moved this frame, from the vehicles above at their speed along
// their heading.
function flee(dt) {
  for (const d of driven) {
    const { position, rotation } = d.vehicle.group;
    const [dx, dz] = [position.x - d.x, position.z - d.z];
    d.speed = dt && (dx * Math.sin(rotation.y) + dz * Math.cos(rotation.y)) / dt;
    [d.x, d.z] = [position.x, position.z];
  }
  dodge(dt, danger, walkGround);
}
// The ferries seated on the open deck before the hut, looking upstream.
const ferryRide = riders(
  ferries.ferries.map(({ mesh, material }) => ({
    object: mesh,
    materials: [material],
    eye: [0.8, 1.65, 0.5],
    ahead: [0.8, 1.4, 20],
  })),
);
// What one can ride, each with its objects to click, vehicleOf(hit), cab and highlight.
const rides = [
  ...movers,
  ships.ride,
  ferryRide,
  ...planes.crafts.map(({ ride }) => ride),
  ...helicopters.map(({ ride }) => ride),
  ...serpents.map(({ ride }) => ride),
  ...ufoRides,
  ...jetRides,
  ...regaRides,
  ...drives.map(([, ride]) => ride),
];
let riding = null; // { ride, vehicle } the camera rides in
let before = null; // { position, target } of the camera before riding
// The helicopter, the UFO, the jet, a Rega helicopter or a plane, each { group, speed, turn, low,
// nose, lift?, unarmed?, launchers? (it fires rockets from them), dip? (radians it fires below its
// body), plane? (it does not hover) }, while riding and so steering it.
const pilots = new Map([
  ...helicopters.map((helicopter) => [helicopter.ride, helicopter]),
  ...ufoRides.map((ride, k) => [ride, ufos[k]]),
  ...jetRides.map((ride, k) => [ride, jets[k]]),
  ...regaRides.map((ride, k) => [ride, regas[k]]),
  ...planes.crafts.map((craft) => [craft.ride, craft]),
]);
const pilot = () => pilots.get(riding?.ride);
// Each kind one drives or flies oneself (drives, and those flown as listed here), with one at the
// museum (src/museum.js): checked once all are placed, after the first frame, warning of any not.
const kinds = [
  ...drives.map(([, ride]) => ride.objects),
  ...[helicopters, ufos, jets, regas].map((list) => list.map(({ group }) => group)),
  planes.meshes,
];
let museumChecked = false;
function checkMuseum() {
  museumChecked = true;
  for (const objects of kinds)
    if (!objects.some(({ position: { x, z } }) => atMuseum(x, z)))
      console.warn("Not in the museum (src/museum.js):", objects[0]);
}
const flying = () => pilot() !== undefined;
// The tank ridden, if any (src/tank.js).
const tankRide = drives.find(([vehicles]) => vehicles === tanks)[1];
const gunner = () => (riding?.ride === tankRide ? tanks[riding.vehicle] : null);
// Whether what is ridden fires (flying or in a tank); then clicks fire instead of riding or
// looking around.
const armed = () => (flying() && !pilot().unarmed) || gunner() !== null;
const droneRide = drives.find(([vehicles]) => vehicles === drones)[1];
const fireRide = drives.find(([vehicles]) => vehicles === fireTrucks)[1];
const flipRide = drives.find(([vehicles]) => vehicles === xrts)[1];
// Walking oneself: after the button with the figure, a click or tap on the ground or a bridge
// (not a building or the water) sets one down there, facing as the camera; walked as driven in
// src/drive.js, at most a run, the water a wall, always the way one looks; seen from EYE_HEIGHT,
// looking ahead, up or down as the head is turned (head). Getting off takes one away.
const ON_FOOT = {
  max: 7,
  back: 3,
  accelerate: 14,
  brake: 20,
  roll: 12,
  steer: 0,
  grip: 1,
  spin: 2,
  react: 10,
  axles: 0.6,
  half: 0.3,
  width: 0.5,
};
const EYE_HEIGHT = 1.65; // metres
const footWorld = {
  ...world,
  blocked: (from, to) => world.ground(to.x, to.z, from.y - 1) <= WATER || structures.wall(from, to),
};
let onFoot = null; // createDriving's, while walking
const footRide = {
  cab(v, view) {
    const { x, y, z, heading } = onFoot.state;
    view.position.set(x, y + EYE_HEIGHT, z);
    view.lookAt(x + Math.sin(heading), y + EYE_HEIGHT, z + Math.cos(heading));
  },
};
const walkButton = document.getElementById("walk");
const where = document.getElementById("where");
let placing = false; // the next click or tap sets one down, as #where says meanwhile
function setPlacing(on) {
  placing = on;
  walkButton.setAttribute("aria-pressed", on);
  where.hidden = !on;
}
walkButton.addEventListener("click", () => setPlacing(!placing));
// Looks straight down from as far away; right above its target the orbit faces north.
document.getElementById("north").addEventListener("click", () => {
  camera.position.set(
    orbit.target.x,
    orbit.target.y + camera.position.distanceTo(orbit.target),
    orbit.target.z,
  );
  fling.set(0, 0, 0);
});
// Its needle turned to the north on the screen (whole degrees, set only when they change).
const needle = document.querySelector("#north svg");
let needleTurn = 0;
function turnNeedle() {
  const [x, z] = [camera.position.x - orbit.target.x, camera.position.z - orbit.target.z];
  const turn = Math.round(THREE.MathUtils.radToDeg(Math.atan2(x, z))); // minus the bearing
  if (turn !== needleTurn) needle.style.transform = `rotate(${(needleTurn = turn)}deg)`;
}
// Sets one down at a screen point, if there.
function setDown(clientX, clientY) {
  raycaster.setFromCamera(
    new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1),
    camera,
  );
  const hit = raycaster.intersectObjects([buildings.scene, bridges.scene, terrain])[0];
  if (!hit || buildings.scene.getObjectById(hit.object.id) || hit.point.y <= WATER) return;
  const looking = camera.getWorldDirection(new THREE.Vector3());
  const heading = Math.atan2(looking.x, looking.z);
  onFoot = createDriving({ ...hit.point, heading }, ON_FOOT, footWorld);
  setPlacing(false);
  ride({ ride: footRide, vehicle: 0 }, clientX, clientY);
}
// Whether what is ridden is steered (in drives or pilots); then clicks do not change to another
// and dragging does not look around (both do while walking, as in a tram).
const steered = () => flying() || drives.some(([, ride]) => ride === riding?.ride);
let flown = null; // the state of flying it (src/aircraft.js, createFlight)
document.getElementById("off").addEventListener("click", getOff);
addEventListener("keydown", (e) => {
  if (e.code !== "Escape") return;
  if (riding) getOff();
  else if (placing) setPlacing(false);
});
// Steering the helicopters, the UFO or the drone while riding it: W/S or ↑/↓ up and down, A/D or
// ←/→ turn; the buttons at the bottom hold the arrow keys while pressed. Q or the stop button
// stops or goes on. The police cars, motorcycles, the quad, the XRT and the tank are driven with the same
// keys and buttons, without stop (the tank with fire); the fire truck with both, stop switching to
// its ladder and back, fire spraying water; the XRT with fire as Flip, a backflip.
const keys = new Set(); // codes of the keys held
addEventListener("keydown", (e) => {
  keys.add(e.code);
  // Fires, sprays or flips, presses nothing else.
  if (e.code === "Space" && (armed() || [fireRide, flipRide].includes(riding?.ride)))
    e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear()); // the keyups come to another window
// Buttons, the menu and its boxes take no focus when clicked, so later key presses neither show a
// focus ring on one nor press it.
addEventListener("mousedown", (e) => {
  if (e.target.closest("button, summary, label")) e.preventDefault();
});
const steerBox = document.getElementById("steer");
for (const button of steerBox.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", () => keys.add(button.dataset.key));
  for (const type of ["pointerup", "pointercancel", "pointerleave"])
    button.addEventListener(type, () => keys.delete(button.dataset.key));
  button.addEventListener("contextmenu", (e) => e.preventDefault()); // long press on phones
}
let stopped = false;
const stopButton = document.getElementById("stop");
const fireButton = steerBox.querySelector('[data-key="Space"]');
// On the fire truck it switches to its ladder and back, the water button there only then.
function stop(on) {
  stopped = on;
  const ladder = riding?.ride === fireRide;
  stopButton.firstChild.data = ladder ? (on ? "Drive" : "Work") : on ? "Go" : "Stop";
  if (ladder) fireButton.hidden = !on;
}
stopButton.addEventListener("click", () => stop(!stopped));
addEventListener("keydown", (e) => {
  const hovers = (flying() && !pilot().plane) || riding?.ride === droneRide;
  if (e.code === "KeyQ" && (hovers || riding?.ride === fireRide) && !e.repeat) stop(!stopped);
});
function steering() {
  const held = (...codes) => (codes.some((code) => keys.has(code)) ? 1 : 0);
  return {
    climb: held("KeyW", "ArrowUp") - held("KeyS", "ArrowDown"),
    turn: held("KeyA", "ArrowLeft") - held("KeyD", "ArrowRight"),
    stop: stopped,
    fire: keys.has("Space") || keys.has("Mouse"),
  };
}

// Shooting while flying or in a tank: holding Space, the fire button or the left mouse button on
// the scene ("Mouse" in keys) aims, from the camera through a point AHEAD metres along the nose
// or the tank's gun, to where that line first meets something, as far as the terrain's area goes
// (rockets.aim), which the crosshair shows. The helicopter sends a rocket there every FIRE_GAP
// seconds, the jet every MISSILE_GAP, from their launchers in turn. The UFO sends a laser bolt
// there every BOLT_GAP seconds, from its cannons in turn, which destroys what it meets: a
// building or bridge (destroy) or the ground (a small blast). The tank fires a shell there every
// SHELL_GAP seconds. With "Mouse aim" ticked, all aim along the line from the camera through the
// mouse instead, while it is over the scene: the craft fire at what it first meets, the tank's
// turret turns towards it as far as it goes.
const FIRE_GAP = 0.1; // seconds
const MISSILE_GAP = 0.8; // seconds
const BOLT_GAP = 0.12; // seconds
const SHELL_GAP = 1; // seconds
const AHEAD = 900; // metres along a craft's nose, the point its crosshair is aimed through
renderer.domElement.addEventListener("pointerdown", (e) => {
  const aims = armed() || ladderView(); // the fire truck's water too
  if (aims && e.pointerType === "mouse" && e.button === 0) keys.add("Mouse");
});
addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse") keys.delete("Mouse");
});
const muzzle = new THREE.Vector3(); // where shots leave
const nose = new THREE.Vector3(); // which way
const through = new THREE.Vector3(); // which way from the camera
const start = new THREE.Vector3(); // where a craft's line of fire is looked along from
const launcher = new THREE.Vector3();
const carried = new THREE.Vector3(); // a plane's velocity
const crosshair = document.getElementById("crosshair");
let nextShot = 0; // when the next may go (seconds)
// The direction (unit) from the camera through the mouse (mouseAt).
const pointer = new THREE.Vector2();
function mouseRay() {
  pointer.set((mouseAt.x / innerWidth) * 2 - 1, -(mouseAt.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.direction;
}
let side = 0; // the launcher the next rocket goes from
function shoot(seconds) {
  const flier = pilot()?.unarmed ? undefined : pilot();
  const tank = gunner();
  // The line from the camera through the mouse, if it is aimed with and over the scene (else all
  // aim ahead, as without it); the crosshair is then where
  // the mouse is (the tank's as far as its gun turns), so the mouse's own pointer is hidden
  // (style.css).
  const ray = (flier || tank) && aimBox.checked && mouseAt ? mouseRay() : null;
  renderer.domElement.classList.toggle("aiming", !!ray);
  if (!flier && !tank) {
    crosshair.hidden = true;
    return;
  }
  if (tank) {
    // Its gun towards the point AHEAD on the line through the mouse, as far as it turns; where it
    // then points, its crosshair is on that line, as it is found below.
    tank.aim(muzzle, nose);
    if (ray)
      tank.train(start.copy(camera.position).addScaledVector(ray, AHEAD).sub(muzzle).normalize());
  } else {
    // Along its body as it is tilted, lower by its dip, so its crosshair stays in place in the
    // view from it.
    const { heading } = flown;
    const pitch = flier.group.rotation.x + (flier.dip ?? 0);
    muzzle.copy(flier.group.position);
    nose.set(
      Math.sin(heading) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(heading) * Math.cos(pitch),
    );
  }
  // A craft or the tank aims along the line from the camera through a point far along its nose
  // or gun: from itself, as the camera is above and behind it, near and far hits would show at
  // different heights, so the crosshair would wander with whatever the line meets. Looked along
  // from abreast of it, so a hill behind it, where the camera may be, is not met. A craft aimed
  // with the mouse aims along the line through the mouse itself.
  if (ray && flier) through.copy(ray);
  else through.copy(muzzle).addScaledVector(nose, AHEAD).sub(camera.position).normalize();
  const abreast = start.copy(muzzle).sub(camera.position).dot(through); // metres along it
  start.copy(camera.position).addScaledVector(through, abreast);
  const target = rockets.aim(start, through, within(start, through));
  const { x, y, front } = onScreen(target);
  crosshair.hidden = !front;
  crosshair.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  const firing = keys.has("Space") || keys.has("Mouse");
  if (!firing || seconds < nextShot) return;
  if (tank) {
    nextShot = seconds + SHELL_GAP;
    tank.fire();
    rockets.fire(muzzle, target, true);
    return;
  }
  const { group } = flier;
  if (flier.launchers) {
    nextShot = seconds + (flier.plane ? MISSILE_GAP : FIRE_GAP);
    side = 1 - side;
    // A plane's rockets drop from it at its velocity first (src/rockets.js).
    const down = flown.nose - flight.LEVEL;
    carried
      .set(
        Math.sin(flown.heading) * Math.cos(down),
        -Math.sin(down),
        Math.cos(flown.heading) * Math.cos(down),
      )
      .multiplyScalar(flown.speed * flier.speed);
    if (flown.lift > 0) carried.set(0, flier.speed / 2, 0); // still rising after boarding
    rockets.fire(
      group.localToWorld(launcher.copy(flier.launchers[side])),
      target,
      false,
      flier.plane ? carried : null,
    );
    return;
  }
  nextShot = seconds + BOLT_GAP;
  flier.fire(target, rockets.meets, (met, at) => {
    if (met === "ground") explosions.burst(at);
    else if (met !== null) destroy(met);
  });
}

const raycaster = new THREE.Raycaster();
// A click or tap that did not drag (5 px with the mouse, 10 px with a finger), except one that
// only stopped the gliding map, copies where a finger was held for HOLD (copyAt; on letting go,
// as browsers allow copying only then), else is recorded while recording (src/points.js), else
// destroys or rebuilds in God mode (godAt), else sets one down (setDown; with a mouse, captures
// it: mouseLook), else rides what is there, else, walking with a mouse, captures it again;
// nothing while steering. While it is captured, rides what the dot in the middle is on, if
// anything.
let down = { x: 0, y: 0, time: 0 }; // where and when the last button or finger went down
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => (down = { x: e.clientX, y: e.clientY, time: e.timeStamp }),
);
renderer.domElement.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || stoppedGlide || steered() || movingLabels) return;
  if (mouseLook()) {
    if (buttonAt(innerWidth / 2, innerHeight / 2)) return switchMuseum();
    // Gets on what the dot in the middle is on, freeing the mouse, if anything.
    const found = vehicleAt(innerWidth / 2, innerHeight / 2);
    if (!found) return;
    document.exitPointerLock();
    ride(found, innerWidth / 2, innerHeight / 2);
    return;
  }
  const mouse = e.pointerType === "mouse";
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= (mouse ? 5 : 10)) return;
  if (!mouse && e.timeStamp - down.time >= HOLD) return copyAt(e.clientX, e.clientY);
  if (pointsPanel.click(e.clientX, e.clientY)) return;
  if (god) return godAt(e.clientX, e.clientY);
  if (placing) {
    setDown(e.clientX, e.clientY);
    if (mouse && riding?.ride === footRide) captureMouse();
    return;
  }
  if (buttonAt(e.clientX, e.clientY, mouse ? 0 : FINGER)) return switchMuseum();
  const label = labelAt(e.clientX, e.clientY);
  if (label) return press(label);
  const found = vehicleAt(e.clientX, e.clientY, mouse ? 0 : FINGER);
  if (found) ride(found, e.clientX, e.clientY);
  else if (mouse && riding?.ride === footRide) captureMouse();
});
// "God mode" in the Dev panel: a click or tap destroys the building or bridge there; elsewhere it
// rebuilds the destroyed one there (explosions.removedAt) by storing the others alone and loading
// the page again, so all comes back as after "Rebuild Basel".
let god = false;
function godAt(clientX, clientY) {
  const number = structures.at(clientX, clientY);
  if (number >= 0) return destroy(number);
  const point = pointAt(clientX, clientY);
  const gone = point ? explosions.removedAt(point) : -1;
  if (gone >= 0 && save([...destroyed].filter((n) => n !== gone))) location.reload();
}
// Rides found ({ ride, vehicle }), clicked or tapped at a screen point.
function ride(found, clientX, clientY) {
  if (!riding) {
    before = { position: camera.position.clone(), target: orbit.target.clone() };
    orbit.enabled = false;
    camera.near = 0.3;
    document.body.dataset.mode = "ride";
  }
  riding = found;
  camera.fov = found.ride === droneRide ? FPV_FOV : FOV;
  camera.updateProjectionMatrix();
  const driving = found.ride === footRide || drives.some(([, ride]) => ride === found.ride);
  steerBox.hidden = !pilots.has(found.ride) && !driving;
  stopButton.hidden = driving
    ? ![droneRide, fireRide].includes(found.ride)
    : !!pilots.get(found.ride)?.plane;
  fireButton.hidden = driving
    ? ![tankRide, flipRide].includes(found.ride)
    : !!pilots.get(found.ride)?.unarmed;
  fireButton.firstChild.data =
    found.ride === fireRide ? "Water" : found.ride === flipRide ? "Flip" : "Fire";
  stop(false);
  flown = null; // from where it is
  hover = { x: clientX, y: clientY }; // clears the highlight, as it is the one ridden now
  head.yaw = head.pitch = 0;
}
// Looking around while riding, but not while steering (steered): dragging turns the head, up to
// PITCH up or down and sideways as far as no view ray points behind the camera, so the front of a
// tram, train or car (just behind it) stays out of view; walking, sideways it turns oneself
// instead, and up or down LOOK.
const PITCH = 0.25; // radians
const LOOK = 1.2; // radians
const head = { yaw: 0, pitch: 0 }; // radians, left and up
let dragged = null; // { x, y } of the primary pointer while dragging
// The fire truck's camera orbit (src/firetruck.js) while its ladder is worked (stopped): dragging
// turns it around the ladder and tilts it, ORBITING radians per px; the wheel or two fingers zoom.
const ORBITING = 0.006;
const ladderView = () =>
  riding?.ride === fireRide && stopped ? fireTrucks[riding.vehicle].orbit : null;
const fingers = new Map(); // pointerId → [x, y], of those down on the scene
const spread = () =>
  Math.hypot(...[...fingers.values()].reduce(([x, y], [a, b]) => [x - a, y - b]));
renderer.domElement.addEventListener("pointerdown", (e) => {
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (riding && (!steered() || ladderView()) && e.isPrimary)
    dragged = { x: e.clientX, y: e.clientY };
});
// Dragging with the right button turns it without spraying (the left one sprays: steering's fire).
renderer.domElement.addEventListener("contextmenu", (e) => {
  if (ladderView()) e.preventDefault();
});
renderer.domElement.addEventListener("wheel", (e) => {
  const view = ladderView();
  if (view) view.distance *= Math.exp(e.deltaY * 0.001);
});
addEventListener("pointermove", (e) => {
  const view = ladderView();
  if (fingers.has(e.pointerId)) {
    const before = fingers.size === 2 && spread();
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (before && view) view.distance *= before / spread();
  }
  if (!dragged || !e.isPrimary) return;
  if (view) {
    if (fingers.size < 2) {
      view.turn -= (e.clientX - dragged.x) * ORBITING;
      view.tilt += (e.clientY - dragged.y) * ORBITING;
    }
    dragged = { x: e.clientX, y: e.clientY };
    return;
  }
  // Radians per px, so the scene follows the pointer.
  const turn = THREE.MathUtils.degToRad(camera.fov) / innerHeight;
  const up = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // The widest ray, at a corner pitched by PITCH.
  const wide = Math.atan((up * camera.aspect) / (Math.cos(PITCH) - up * Math.sin(PITCH)));
  const yaw = Math.max(0, Math.PI / 2 - wide);
  const sideways = (e.clientX - dragged.x) * turn;
  if (riding?.ride === footRide) onFoot.state.heading += sideways;
  else head.yaw = THREE.MathUtils.clamp(head.yaw + sideways, -yaw, yaw);
  look(head.pitch + (e.clientY - dragged.y) * turn);
  dragged = { x: e.clientX, y: e.clientY };
});
// Turns the head up or down to pitch, as far as it goes.
function look(pitch) {
  const most = riding?.ride === footRide ? LOOK : PITCH;
  head.pitch = THREE.MathUtils.clamp(pitch, -most, most);
}
// Walking, moving the mouse over the scene turns oneself and the head up or down, MOUSE_LOOK
// radians per px, as in games (with a button held, dragging does). Being set down or clicking
// the scene again captures the mouse (pointer lock), so it turns on past the screen's edge. Esc
// frees it, and as browsers keep that key then, being freed gets off, but not by leaving the
// window; meanwhile #esc tells so, as the Off button cannot be clicked, and #dot in the middle
// shows what a click gets on (updateHover).
const MOUSE_LOOK = 0.0025;
const mouseLook = () => document.pointerLockElement === renderer.domElement;
const captureMouse = () => renderer.domElement.requestPointerLock()?.catch(() => {}); // refused
const escHint = document.getElementById("esc");
const dot = document.getElementById("dot");
document.addEventListener("pointerlockchange", () => {
  escHint.hidden = dot.hidden = !mouseLook();
  if (!mouseLook()) for (const ride of rides) ride.highlight(-1); // the dot's
  if (!mouseLook() && riding?.ride === footRide && document.hasFocus()) getOff();
});
// Whether the last pointer was a mouse: a finger's tap brings a mousemove too, which must not turn.
let byMouse = true;
for (const type of ["pointerdown", "pointermove"])
  addEventListener(type, (e) => (byMouse = e.pointerType === "mouse"));
renderer.domElement.addEventListener("mousemove", (e) => {
  if (riding?.ride !== footRide || !byMouse || (e.buttons && !mouseLook())) return;
  onFoot.state.heading -= e.movementX * MOUSE_LOOK;
  look(head.pitch - e.movementY * MOUSE_LOOK);
});
for (const type of ["pointerup", "pointercancel"])
  addEventListener(type, (e) => {
    fingers.delete(e.pointerId);
    if (e.isPrimary) dragged = null;
  });
// Turns the camera, just placed by cab, by the head.
function turnHead() {
  camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, head.yaw);
  camera.rotateX(head.pitch);
}
// The { ride, vehicle } at a screen point; else the nearest of the steerable ones (handles) whose
// middle is within REACH + reach on the screen, not ridden and not hidden; else the first one
// found around the point at reach / 2, then at reach px (eight points each); if any.
const REACH = 50; // px
// All that is steered, flown (pilots) or driven (drives), small to hit: each { ride, vehicle,
// object, up (metres from its origin to its middle, before scaling) }.
const handles = [
  ...[...pilots].map(([ride, { group }]) => ({ ride, vehicle: 0, object: group, up: 0 })),
  ...drives.flatMap(([vehicles, ride]) =>
    vehicles.map(({ group }, vehicle) => ({ ride, vehicle, object: group, up: 0.8 })),
  ),
];
const middle = new THREE.Vector3();
function vehicleAt(clientX, clientY, reach = 0) {
  const found = vehicleOn(clientX, clientY);
  if (found) return found;
  let [best, nearest] = [null, REACH + reach];
  for (const { ride, vehicle, object, up } of handles) {
    if (riding?.ride === ride && riding.vehicle === vehicle) continue;
    middle.copy(object.position).y += up * object.scale.y;
    const { x, y, front } = onScreen(middle);
    const away = Math.hypot(x - clientX, y - clientY);
    if (front && away < nearest && !hidden(middle)) [best, nearest] = [{ ride, vehicle }, away];
  }
  if (best) return best;
  for (const r of reach ? [reach / 2, reach] : [])
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const near = vehicleOn(clientX + r * Math.cos(a), clientY + r * Math.sin(a));
      if (near) return near;
    }
  return null;
}
// Whether the terrain (looked up every SIGHT metres), a building or a bridge is between the camera
// and a point.
const SIGHT = 5; // metres
const sight = new THREE.Vector3();
function hidden(point) {
  const length = camera.position.distanceTo(point);
  for (let d = SIGHT; d < length; d += SIGHT)
    if (sight.lerpVectors(camera.position, point, d / length).y < heightAt(sight.x, sight.z))
      return true;
  return structures.between(camera.position, point);
}
// The { ride, vehicle } at a screen point, if visible: not in a tunnel under the terrain or
// behind a building or bridge; not the one ridden.
function vehicleOn(clientX, clientY) {
  const pointer = new THREE.Vector2(
    (clientX / innerWidth) * 2 - 1,
    -(clientY / innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(rides.flatMap((r) => r.objects))[0];
  if (!hit) return null;
  const ride = rides.find((r) => r.objects.some((o) => o.getObjectById(hit.object.id)));
  const vehicle = ride.vehicleOf(hit);
  if (ride === riding?.ride && vehicle === riding.vehicle) return null;
  return hidden(hit.point) ? null : { ride, vehicle };
}

// The vehicle under the mouse (but the one ridden), unless the museum's switch or a label with pins
// is, shows HIGHLIGHT and gets the hand cursor, as those do;
// checked at most once per frame, only after the mouse moved, and not while dragging or steering
// nor while clicks set one down, destroy (God mode) or record points: then it gets a crosshair.
// Walking with the mouse captured, the one under the dot in the middle, every frame.
let hover = null; // { x, y } of the mouse since the last check
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") hover = { x: e.clientX, y: e.clientY };
});
function updateHover() {
  if (mouseLook()) hover = { x: innerWidth / 2, y: innerHeight / 2 };
  if (!hover) return;
  const aiming = placing || god || pointsPanel.recording(); // clicks pick a point, not a vehicle
  const free = !pointers.size && !steered() && !aiming;
  // The museum's switch or a label with pins goes before a vehicle, as a click does.
  const clickable =
    free && (buttonAt(hover.x, hover.y) || (!mouseLook() && labelAt(hover.x, hover.y)));
  const found = free && !clickable ? vehicleAt(hover.x, hover.y) : null;
  hover = null;
  for (const ride of rides) ride.highlight(found?.ride === ride ? found.vehicle : -1);
  renderer.domElement.style.cursor = aiming ? "crosshair" : found || clickable ? "pointer" : "";
}

// The roof, bridge or ground at a screen point (px), or null.
function pointAt(x, y) {
  raycaster.setFromCamera(
    new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1),
    camera,
  );
  return raycaster.intersectObjects([buildings.scene, bridges.scene, terrain])[0]?.point ?? null;
}
// A scene point <-> "latitude, longitude, altitude" (WGS84 degrees, 6 decimals; metres above sea,
// 1 decimal), as copied, recorded and pasted; fromText gives null for any other text.
function toText(point) {
  const [lat, lon] = toWGS84(point.x, point.z);
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}, ${(point.y + 250).toFixed(1)}`;
}
function fromText(text) {
  const values = text.split(",").map((v) => v.trim() && Number(v));
  if (values.length !== 3 || !values.every(Number.isFinite)) return null;
  const [lat, lon, altitude] = values;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const [x, z] = fromWGS84(lat, lon);
  return new THREE.Vector3(x, altitude - 250, z);
}
// C copies the coordinates (toText) of what is under the mouse, as holding a finger still for HOLD
// does of what is under it (the tap handler above), and shows "Coordinates copied" there for a
// moment.
const HOLD = 2000; // ms
let mouseAt = null; // { x, y } of the mouse while over the scene
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") mouseAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("pointerleave", () => (mouseAt = null));
const copied = document.getElementById("copied");
let hideCopied = 0; // timeout
addEventListener("keydown", (e) => {
  if (e.code !== "KeyC" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || !mouseAt) return;
  copyAt(mouseAt.x, mouseAt.y);
});
function copyAt(x, y) {
  const point = pointAt(x, y);
  if (!point) return;
  copy(toText(point)).then((done) => {
    if (!done) return; // not allowed: nothing to show
    copied.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
    copied.hidden = false;
    clearTimeout(hideCopied);
    hideCopied = setTimeout(() => (copied.hidden = true), 1200);
  });
}

// While dragging, measure how fast the view moves; after letting go, keep gliding and slow down.
const lastTarget = new THREE.Vector3();
const velocity = new THREE.Vector3();
const shift = new THREE.Vector3();
function updateOrbit(dt) {
  if (!pointers.size) {
    orbit.target.addScaledVector(fling, dt);
    camera.position.addScaledVector(fling, dt);
    fling.multiplyScalar(Math.exp(-FLING_FRICTION * dt));
  }
  orbit.update();
  // The view's centre stays over the terrain's area, CENTRE above it, so a drag moves the ground
  // under the pointer and zooming goes towards it; the camera moves along, the gliding stops at
  // the area's edge. It follows the terrain's height smoothly (FOLLOW), so the view does not bob
  // over every slope when dragged fast.
  const [x, z] = intoArea(orbit.target.x, orbit.target.z);
  const above = heightAt(x, z) + CENTRE;
  const y = orbit.target.y + (above - orbit.target.y) * (1 - Math.exp(-FOLLOW * dt));
  camera.position.add(shift.set(x, y, z).sub(orbit.target));
  if (x !== orbit.target.x) fling.x = 0;
  if (z !== orbit.target.z) fling.z = 0;
  orbit.target.set(x, y, z);
  if (pointers.size && dt > 0) {
    fling.lerp(velocity.subVectors(orbit.target, lastTarget).divideScalar(dt), 0.5);
    fling.y = 0; // the centre follows the terrain by itself
  }
  lastTarget.copy(orbit.target);
  camera.position.y = Math.max(
    camera.position.y,
    heightAt(camera.position.x, camera.position.z) + 5,
  );
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- The view in the URL like on openstreetmap.org, with bearing and pitch as in MapLibre:
// #map=zoom/latitude/longitude/bearing/pitch. The point looked at (WGS84); the zoom of a web map
// (256 px tiles) showing as much ground across the screen's height there; the direction looked in
// (degrees, 0 north, 90 east) and the tilt (degrees, 0 straight down), both optional (0). Written
// at most every VIEW_EVERY ms (browsers block changing it far more often), so a reload soon after
// a move keeps it, and not when the view did not move, so it does not creep by rounding; read at
// the start and when the URL changes.
const VIEW_EVERY = 500;
// Camera distance (metres) <-> web map zoom at a latitude, for the window's height.
const EARTH = 40075016.686; // metres around the equator
const perZoom = (lat) =>
  (EARTH * Math.cos(THREE.MathUtils.degToRad(lat)) * innerHeight) /
  (256 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
// Sets the view from the URL; false if it holds none.
function readView() {
  const values = /^#map=([^/]+)\/([^/]+)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(location.hash);
  const [zoom, lat, lon, bearing, pitch] = values?.slice(1).map((v) => Number(v ?? 0)) ?? [];
  if (!values || [zoom, lat, lon, bearing, pitch].some((n) => !Number.isFinite(n))) return false;
  const [x, z] = intoArea(...fromWGS84(lat, lon));
  const r = THREE.MathUtils.clamp(perZoom(lat) / 2 ** zoom, orbit.minDistance, orbit.maxDistance);
  const [h, t] = [bearing, THREE.MathUtils.clamp(pitch, 0, 83)].map(THREE.MathUtils.degToRad);
  orbit.target.set(x, heightAt(x, z) + CENTRE, z);
  camera.position
    .copy(orbit.target)
    .add(
      new THREE.Vector3(
        -Math.sin(t) * Math.sin(h),
        Math.cos(t),
        Math.sin(t) * Math.cos(h),
      ).multiplyScalar(r),
    );
  fling.set(0, 0, 0);
  viewShown = [...camera.position.toArray(), ...orbit.target.toArray()].join();
  return true;
}
let viewShown = ""; // camera position and target as last read or written
let viewWritten = -Infinity; // when it was written last (ms)
function writeView(time) {
  if (riding) return;
  const shown = [...camera.position.toArray(), ...orbit.target.toArray()].join();
  if (shown === viewShown || time - viewWritten < VIEW_EVERY) return;
  const offset = camera.position.clone().sub(orbit.target);
  const r = offset.length();
  const [lat, lon] = toWGS84(orbit.target.x, orbit.target.z);
  const zoom = Math.log2(perZoom(lat) / r);
  const bearing = Math.round(THREE.MathUtils.radToDeg(Math.atan2(-offset.x, offset.z)) + 360) % 360;
  const pitch = Math.round(THREE.MathUtils.radToDeg(Math.acos(offset.y / r)));
  const hash = `#map=${zoom.toFixed(2)}/${lat.toFixed(6)}/${lon.toFixed(6)}/${bearing}/${pitch}`;
  [viewShown, viewWritten] = [shown, time];
  if (hash !== location.hash) history.replaceState(null, "", hash);
}
addEventListener("hashchange", readView);
// Puts the view looking straight down on all of the museum (src/museum.js, OVERVIEW), north up,
// into the URL.
function overview() {
  const [lat, lon, height, width] = OVERVIEW;
  const metres = Math.max(height, (width * innerHeight) / innerWidth); // the screen's height
  const zoom = Math.log2(
    (EARTH * Math.cos(THREE.MathUtils.degToRad(lat)) * innerHeight) / (256 * metres),
  );
  history.replaceState(null, "", `#map=${zoom.toFixed(2)}/${lat}/${lon}/0/0`);
}
// Opens or closes the museum; opening, the page comes back in its overview, which no view written
// meanwhile overwrites.
function switchMuseum() {
  if (!OPEN) {
    overview();
    viewWritten = Infinity;
  }
  toggleMuseum();
}

// Start where the URL says, else above the city, looking at the Münster.
if (!readView()) {
  orbit.target.set(537, heightAt(537, 99) + CENTRE, 99);
  camera.position.copy(orbit.target).add(new THREE.Vector3(-1500, 1400, 2200));
}
await map.ready;
document.body.dataset.mode = "orbit";

// While a tram line is shown, the scene but the trams is drawn in light grey under the check
// lines, so the lines' colours stand out: into greyTarget first, then onto the screen by its
// brightness. The trams mark their pixels there with alpha 0 (all else is opaque, alpha 1); on
// the screen they stay opaque, as the canvas has alpha.
const greyTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const tramAlpha = { value: 1 };
const [tramMesh] = trams.meshes; // trams have one model
const highlightTrams = tramMesh.material.onBeforeCompile; // as all vehicles on tracks
tramMesh.material.onBeforeCompile = (shader) => {
  highlightTrams(shader);
  shader.uniforms.tramAlpha = tramAlpha;
  shader.fragmentShader = `uniform float tramAlpha;\n${shader.fragmentShader.replace(
    "#include <dithering_fragment>",
    "#include <dithering_fragment>\ngl_FragColor.a = tramAlpha;",
  )}`;
};
const greySize = new THREE.Vector2();
const greyQuad = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: { map: { value: greyTarget.texture } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(map, vUv);
        float amount = min(texel.a, 1.0); // additive blending raises the alpha past 1
        float grey = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(mix(texel.rgb, vec3(grey), amount), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), 0.4 * amount); // lighter
      }`,
  }),
);
function render(grey = tramLinesShown()) {
  if (grey) {
    renderer.getDrawingBufferSize(greySize);
    greyTarget.setSize(greySize.x, greySize.y); // only reallocates when resized
    renderer.setRenderTarget(greyTarget);
  }
  tramAlpha.value = grey ? 0 : 1;
  renderer.render(scene, camera);
  if (grey) {
    renderer.setRenderTarget(null);
    greyQuad.render(renderer);
  }
  renderer.autoClear = false; // over the scene
  renderer.render(overlay, camera);
  renderer.autoClear = true;
}
// Once before the first frame, so the first switch to grey does not stutter: allocates greyTarget
// and compiles the shaders the scene needs to be drawn into it, and the grey one. Then the normal
// view over it, so the grey one is never seen. Both with all in the scene drawn, also what is out
// of view, so its geometry and textures are on the GPU before it first comes into view.
const culled = [];
scene.traverse((object) => {
  if (object.frustumCulled) culled.push(object);
});
for (const object of culled) object.frustumCulled = false;
render(true);
render(false);
for (const object of culled) object.frustumCulled = true;

// "Riders" in the Dev panel: the riders on all vehicles that have one, not only on the one ridden.
let showRiders = false;
// Draws a frame, with the Dev panel (src/dev.js) while it is ticked.
const drawFrame = createDev(
  renderer,
  render,
  [
    ["Buildings", [buildings.scene, bridges.scene]],
    ["Trees", tree.meshes],
    ["Terrain", [terrain]],
  ],
  (on) => showGround(on ? "photo" : "map"),
  (on) => (god = on),
  (on) => (showRiders = on),
  OPEN && moveLabels,
);
// Moves the view over the middle of scene points, looking the same way, out as far as shows them
// all with FIT around them (as seen from above), but not nearer.
const FIT = 1.2;
function showPoints(points) {
  const middle = points
    .reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(points.length);
  const [x, z] = intoArea(middle.x, middle.z);
  const reach = Math.max(...points.map((p) => Math.hypot(p.x - middle.x, p.z - middle.z)));
  const offset = camera.position.clone().sub(orbit.target);
  const fit =
    (FIT * reach) /
    (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
  offset.setLength(Math.min(Math.max(fit, offset.length()), orbit.maxDistance));
  orbit.target.set(x, heightAt(x, z) + CENTRE, z);
  camera.position.copy(orbit.target).add(offset);
  fling.set(0, 0, 0);
}
const pointsPanel = createPoints(pointAt, toText, fromText, onScreen, showPoints);

// Day or night (src/daylight.js) by "Night" in the menu, as last chosen in this browser, else day;
// the mown lawn darkening with the light, as no light shines on it.
const daylight = createDaylight({
  sun,
  hemisphere,
  sky,
  water,
  dim: [lawn.material],
});
const NIGHT_KEY = "basel3d.night"; // "1" (on) or "0"
const nightBox = document.getElementById("night-box");
try {
  nightBox.checked = localStorage.getItem(NIGHT_KEY) === "1";
} catch {} // storage blocked
daylight.set(nightBox.checked);
nightBox.addEventListener("change", () => {
  daylight.set(nightBox.checked);
  try {
    localStorage.setItem(NIGHT_KEY, nightBox.checked ? "1" : "0");
  } catch {} // storage blocked
});

let last = performance.now();
let afloat = 0; // seconds the ferries and ships have moved, so they keep in step
// The museum's labels on the ground (src/museum.js), once all is built. "Move labels" in the Dev
// panel (src/dev.js): while ticked, a label dragged follows the pointer over the ground and clicks
// do nothing else; unticked, every label's place is copied (src/copy.js), "text: latitude,
// longitude, altitude" a line, to be set so in src/museum.js. Over the Rhine they lie over its
// water, not its bed.
const labelGround = (x, z) => Math.max(heightAt(x, z), WATER);
const museumLabels = OPEN && createLabels(labelGround, renderer.capabilities.getMaxAnisotropy());
if (museumLabels) scene.add(museumLabels);
let movingLabels = false;
let draggedLabel = null; // { mesh, orbit: whether the view's controls were on }
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragHit = new THREE.Vector3();
function moveLabels(on) {
  const was = movingLabels;
  movingLabels = on;
  if (on || !was) return; // copied only after moving
  const lines = museumLabels.children.map((m) => `${m.userData.text}: ${toText(m.position)}`);
  copy(lines.join("\n"));
}
function pointerRay({ clientX, clientY }) {
  const at = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(at, camera);
}
// A click or tap on a label with a city pins its places there, the label's letters in
// MAGENTA as the pins (style.css), each on the roof, water or ground there; another unpins them.
// The label for all pins unpins all if any are pinned, else pins all, in MAGENTA while any
// are; the label "Museum" (home) shows its overview. The mouse over such a label gets the hand
// cursor (updateHover).
const pins = new Map(); // label → its pins, { point, mark }
function labelAt(clientX, clientY) {
  if (!museumLabels) return null;
  pointerRay({ clientX, clientY });
  const label = raycaster.intersectObjects(museumLabels.children)[0]?.object;
  const { city, all, home } = label?.userData ?? {};
  return city || all || home ? label : null;
}
function press(label) {
  if (label.userData.home) {
    overview();
    readView();
    return;
  }
  const labels = museumLabels.children;
  if (!label.userData.all) toggle(label);
  else {
    const on = !pins.size;
    for (const l of labels) if (l.userData.city && pins.has(l) !== on) toggle(l);
  }
  labels.find((l) => l.userData.all).material.color.set(pins.size ? MAGENTA : 0xffffff);
}
function toggle(label) {
  const pinned = pins.get(label);
  label.material.color.set(pinned ? 0xffffff : MAGENTA);
  if (pinned) {
    pinned.forEach(({ mark }) => mark.remove());
    pins.delete(label);
    return;
  }
  const mark = () =>
    badgeLayer.appendChild(Object.assign(document.createElement("div"), { className: "mark pin" }));
  pins.set(
    label,
    label.userData.city.map(({ x, z }) => ({
      point: new THREE.Vector3(x, Math.max(labelGround(x, z), structures.top(x, z, Infinity)), z),
      mark: mark(),
    })),
  );
}
// Moves the pins to their points, after the camera's updateMatrixWorld.
function updatePins() {
  for (const list of pins.values())
    for (const { point, mark } of list) {
      const { x, y, front } = onScreen(point);
      mark.hidden = !front;
      mark.style.transform = `translate(${x}px, ${y - TIP}px) translate(-50%, -50%)`;
    }
}
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (!movingLabels) return;
  pointerRay(e);
  const hit = raycaster.intersectObjects(museumLabels.children)[0];
  if (!hit) return;
  draggedLabel = { mesh: hit.object, orbit: orbit.enabled };
  orbit.enabled = false;
  dragPlane.constant = -hit.object.position.y;
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!draggedLabel) return;
  pointerRay(e);
  if (!raycaster.ray.intersectPlane(dragPlane, dragHit)) return;
  draggedLabel.mesh.position.set(dragHit.x, 0, dragHit.z);
  settle(draggedLabel.mesh, labelGround);
});
addEventListener("pointerup", () => {
  if (!draggedLabel) return;
  orbit.enabled = draggedLabel.orbit;
  draggedLabel = null;
});
renderer.setAnimationLoop((time) => {
  // The first frame's time can be before last.
  const dt = THREE.MathUtils.clamp((time - last) / 1000, 0, 0.1);
  last = time;
  if (!riding) {
    updateOrbit(dt);
    turnNeedle();
  }
  writeView(time);
  updateHover();
  updateTrees();
  updateTerrain();
  water.waterTime.value = time / 1000;
  daylight.update(dt);
  pavilionTime.value = time / 1000;
  peopleTime.value = time / 1000;
  const now = new Date();
  clockTime.value = (now / 1000 - now.getTimezoneOffset() * 60) % 86400;
  footprints();
  space.update();
  walkers.update(dt, riding ? camera.position : orbit.target, camera.position);
  runners.update(dt, pedestrians);
  if (OPEN) museumWalkers.update(dt, museumCentre, camera.position);
  swimmers.update(dt);
  if (OPEN) museumSwimmers.update(dt);
  if (OPEN) museumRunners.update(dt, [museumSwimmers.people]);
  for (const clique of cliques) clique.update(dt);
  training.update(dt);
  bike.update(dt);
  for (const serpent of serpents) serpent.update(time / 1000);
  const flier = fly(dt);
  for (const helicopter of helicopters)
    helicopter.update(time / 1000, flier === helicopter ? flown : null);
  for (const jet of jets) jet.update(time / 1000, flier === jet ? flown : null);
  for (const rega of regas) rega.update(time / 1000, flier === rega ? flown : null);
  for (const ufo of ufos) ufo.update(time / 1000, dt, flier === ufo ? flown : null);
  for (const [vehicles, ride] of drives)
    vehicles.forEach((vehicle, v) => {
      const ridden = riding?.ride === ride && riding.vehicle === v;
      vehicle.update(time / 1000, dt, ridden ? steering() : null);
      if (vehicle.driver) vehicle.driver.visible = ridden || showRiders;
    });
  if (riding?.ride === footRide) onFoot.step(dt, steering());
  drive(dt);
  flee(dt);
  splash.update(dt);
  for (const clique of cliques) clique.carry();
  if (riding?.ride.away?.(riding.vehicle)) getOff();
  afloat += dt;
  ferries.update(afloat);
  ships.update(afloat, dt);
  animals.update(time / 1000);
  feeding.update(time / 1000);
  explosions.update(dt);
  rockets.update(dt);
  planes.update(time / 1000, flier, flown);
  birds.update(time / 1000);
  if (riding) {
    riding.ride.cab(riding.vehicle, camera); // after all that moves
    turnHead();
  }
  if (OPEN && !museumChecked) checkMuseum();
  camera.updateMatrixWorld(); // this frame's view for onScreen, not the last one rendered
  shoot(time / 1000);
  updateBadges();
  pointsPanel.update();
  updatePins();
  updateNames();
  drawFrame();
});
