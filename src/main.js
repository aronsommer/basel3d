import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MapControls } from "three/addons/controls/MapControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { HIGHLIGHT, highlightShader } from "./highlight.js";
import { createBuildings } from "./buildings.js";
import { createCity } from "./city.js";
import { createGround } from "./ground.js";
import { createRails } from "./rails.js";
import { unpackHeights, unpackPoints } from "./pack.js";
import { facadeShader } from "./facade.js";
import { pavilionShader, pavilionTime } from "./pavilion.js";
import { createUfo } from "./ufo.js";
import { createExplosions } from "./explosions.js";
import { createRockets } from "./rockets.js";
import { createPolice } from "./police.js";
import { createDriving } from "./drive.js";
import { createMotorcycles } from "./motorcycle.js";
import { createTanks } from "./tank.js";
import { createBike } from "./bike.js";
import { createLawn } from "./lawn.js";
import { createDinos } from "./dino.js";
import { createDrones } from "./drone.js";
import { createTraining } from "./football.js";
import { createBoats } from "./boats.js";
import { createZoo } from "./zoo.js";
import { createRega } from "./rega.js";
import { createSky } from "./sky.js";
import { createJet } from "./jet.js";
import { createPeople, mix, peopleTime } from "./people.js";
import { createWalkers } from "./walkers.js";
import { createDev } from "./dev.js";
import { createPoints } from "./points.js";
import { copy } from "./copy.js";
import { glow, part } from "./parts.js";
import { ROAD, trainCar, tramCar } from "./vehicles.js";

// Scene units are metres: x = east, z = south, y = altitude − 250 m; origin at LV95 E 2611000 / N 1267400.
const LV95 = [2611000, 1267400]; // E, N of the scene's origin
const FLING_FRICTION = 3; // per second: how fast the view stops gliding after a drag
const CENTRE = 2; // metres the view's centre (turned round, zoomed to) is above the terrain
const FOLLOW = 4; // per second: how fast the view's centre follows the terrain's height
const TREE_DETAIL = 300; // metres from a chunk within which its trees get a trunk and a rounder crown
// Metres from a chunk beyond which its trees are only a three-sided cone, and fewer further away.
const TREE_FAR = 1500;
// Metres from a terrain chunk beyond which it has only every TERRAIN_STEP-th height each way.
const TERRAIN_DETAIL = 2000;
const TERRAIN_STEP = 4;
const SKY = 0xbcdcf2; // at the horizon, and the fog's
const MOVER_KINDS = ["tram", "train", "car"]; // public/<kind>s.json, .bin
// Far from the camera, moving things grow so they can be seen from above: from BOOST_FROM metres
// on, linearly up to BOOST_MAX times. Up close they have their real size. Vehicles on tracks and
// ships grow only in width and height, so their lengths and distances stay right; vehicles on
// tracks at most 1.4 times in width (see createMovers).
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
scene.fog = new THREE.Fog(SKY, 3000, 9000);
// Strong sky light keeps the sides facing away from the sun bright; the sun is warm.
scene.add(new THREE.HemisphereLight(0xe2eaf2, 0xbaa88c, 2));
const sun = new THREE.DirectionalLight(0xffdfb4, 2.7);
sun.position.set(-1, 1, 1); // from the south-west
scene.add(sun, createSky(SKY, sun.position.clone().normalize()));

// Nothing beyond the fog's end is visible anyway.
const FOV = 55; // degrees, top to bottom; FPV_FOV through a drone's camera, which is wide
const FPV_FOV = 90;
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 1, scene.fog.far);
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
  heightsBuffer,
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
    "terrain/heights.bin",
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
const heights = Float32Array.from(unpackHeights(heightsBuffer, terrainInfo.nx), (cm) => cm / 100);
const treePositions = new Uint16Array(treesBuffer);
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
  // (src/pavilion.js), before the highlight createBuildings set. Their own cache keys, as the
  // functions read the same.
  const extend = (material, ...shaders) => {
    const highlight = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      for (const add of shaders) add(shader);
      highlight(shader, renderer);
    };
    material.customProgramCacheKey = () => shaders.map((add) => add.name).join();
  };
  extend(materials.wall, facadeShader, pavilionShader);
  extend(materials.roof, pavilionShader);
}
const deckMaps = createDecks(bridges.scene, materials.bridge);
if (map) map.changed = mapChanged;
const explosions = createExplosions(scene, structures, heightAt, camera);
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
// vehicles vanish where a bridge was, people on its roof with it, and the helipads and the jet on
// it come down to the ground.
function destroy(number) {
  const [deck] = decksOf([number]);
  if (!explosions.explode(number)) return;
  scene.remove(...(onRoofs.get(number) ?? []));
  for (const land of grounding.get(number) ?? []) land();
  if (deck) for (const mover of movers) mover.cut(deck);
  if (deck) rails?.cut(deck);
  if (deck) brokenDecks.push(deck);
  if (deck) roads = null; // made anew without it
  destroyed.add(number);
  showCount();
  try {
    localStorage.setItem(
      DESTROYED_KEY,
      JSON.stringify({ models: MODELS, numbers: [...destroyed] }),
    );
  } catch {} // storage blocked
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
const tree = createTrees(treePositions, canopyTrees);
scene.add(...tree.meshes);
// In the Rhine in front of the Roche towers, its head as high as the taller one (205 m), looking
// at the middle between the two towers.
const serpent = createSerpent(1717, 68, 8.5, 1739, -196);
scene.add(serpent.group);
// Circling over the monster and the Roche towers (around the point between them), six times life
// size. At 300 m ± 25 m its lowest point (about 12 m below its centre when banking) stays 40 m
// above the monster's horns (221 m) and 50 m above the taller tower (213 m).
const flight = createFlight();
const helicopter = createHelicopter(1728, -64, 150, 300, 6);
scene.add(helicopter.group);
// Lines to check the ways of what moves (ticked in the menu): strong magenta unless given a colour,
// shown exactly (no tone mapping, as the trams' badges), 4 px wide, drawn over everything.
// vertices: flat x, y, z of each segment's two ends.
function checkLines(vertices, color = 0xff00ff) {
  const lines = new LineSegments2(
    new LineSegmentsGeometry().setPositions(vertices),
    new LineMaterial({ color, linewidth: 4, depthTest: false, toneMapped: false }),
  );
  lines.renderOrder = 1;
  return lines;
}
// The check lines, drawn over the scene in a pass of their own (render).
const overlay = new THREE.Scene();

const CELL = 20; // metres of the grids of the traffic's car points
const cell = (x, z) => (Math.floor(x / CELL) + 1000) * 4096 + Math.floor(z / CELL) + 1000;
const CELLS = 512; // cells each way of the grid of the cars noted, the scene's origin in its middle
const carCell = (x, z) =>
  (Math.floor(x / CELL) + CELLS / 2) * CELLS + Math.floor(z / CELL) + CELLS / 2;

// Trams, trains and cars on their loops (tools/paths.mjs, createMovers), sharing the traffic.
const traffic = {
  // Each car's front, centre and back, noted anew each frame: x, z per point (xz); its vehicle,
  // rail and the next point in its cell, -1 if none (of); per cell its first and last point, in
  // the order noted (head: -1 if none, tail). Each kind makes room for its own.
  noted: 0,
  xz: new Float64Array(0),
  of: new Int32Array(0),
  head: new Int32Array(CELLS * CELLS).fill(-1),
  tail: new Int32Array(CELLS * CELLS),
  taken: new Map(), // cell -> flat [x, z, …] of the starting vehicles and the space ahead
  blockers: [], // per vehicle (of all kinds): the vehicle it waits for, or -1
  walks: new Int32Array(0), // per vehicle: 1 + the vehicle whose walk reached it (drive)
};
const movers = MOVER_KINDS.map((kind, i) =>
  createMovers(
    JSON.parse(new TextDecoder().decode(moverFiles[2 * i])),
    unpackPoints(moverFiles[2 * i + 1]),
    kind,
    traffic,
  ),
);
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
const ships = createShips(new Float32Array(shipsBuffer));
scene.add(...ships.meshes);
overlay.add(ships.route);
const planes = createPlanes();
scene.add(...planes.meshes);
const birds = createBirds();
scene.add(birds.mesh);

// Two airliners circling over the city on an oval, one higher and the other way round, so they
// are always in view. 1.5 times life size (and more far away, see boost), white with a blue tail,
// no airline. Each is a craft to fly (createFlight), back on its oval at once when let go.
function createPlanes() {
  const SPEED = 80; // metres per second
  const SCALE = 1.5;
  // Along +z, in metres: fuselage, nose, wings, tailplane, fin, engines.
  const WHITE = 0xf2f2f0;
  const along = (g) => g.rotateX(Math.PI / 2); // its axis along z, its top ahead
  const fuselage = along(new THREE.CylinderGeometry(2, 2, 30, 8));
  const nose = new THREE.ConeGeometry(2, 5, 8).rotateX(Math.PI / 2);
  const tailCone = new THREE.ConeGeometry(2, 6, 8).rotateX(-Math.PI / 2);
  const geometry = mergeGeometries([
    part(fuselage, WHITE, [0, 0, 0]),
    part(nose, WHITE, [0, 0, 17.5]),
    part(tailCone, WHITE, [0, 0, -18]),
    part(new THREE.BoxGeometry(34, 0.5, 5), WHITE, [0, -0.8, 1]), // wings
    part(new THREE.BoxGeometry(12, 0.4, 3), WHITE, [0, 0.5, -17]), // tailplane
    part(new THREE.BoxGeometry(0.5, 7, 4), 0x1f4e9a, [0, 4, -18]), // fin
    // An engine under each wing: a nacelle wider at the front, a dark fan in it behind a
    // spinner, a narrower exhaust behind and a pylon up to the wing.
    ...[-6, 6].flatMap((x) => [
      part(along(new THREE.CylinderGeometry(1.25, 0.95, 4, 12)), 0xc9cdd2, [x, -2, 3]),
      part(along(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 12)), 0x22262b, [x, -2, 5]),
      part(along(new THREE.ConeGeometry(0.35, 0.8, 8)), WHITE, [x, -2, 5.3]),
      part(along(new THREE.CylinderGeometry(0.65, 0.35, 1.4, 10)), 0x4a4f55, [x, -2, 0.3]),
      part(new THREE.BoxGeometry(0.3, 0.8, 2.4), WHITE, [x, -1.1, 2.4]),
    ]),
  ]).scale(SCALE, SCALE, SCALE);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // Ovals over the city (scene metres), so the planes always stay in view: the second one higher
  // and the other way round.
  const CENTRE = [300, 0];
  const RADII = [2500, 1800];
  const flights = [
    { height: 700 - 250, direction: 1 },
    { height: 950 - 250, direction: -1 },
  ].map((flight) => {
    const mesh = new THREE.Mesh(geometry, material.clone()); // its own, highlighted under the mouse
    mesh.rotation.order = "YXZ"; // heading, then pitch and bank in the plane's frame
    // Riding along: from behind and above.
    const ride = riders([
      { object: mesh, materials: [mesh.material], eye: [0, 12, -70], ahead: [0, 0, 60] },
    ]);
    // Its engines low below its middle; a plane does not hover.
    const craft = {
      group: mesh,
      ride,
      speed: SPEED,
      turn: 0.4,
      low: 4.9,
      nose: 30, // metres from its middle to its nose
      unarmed: true,
      plane: true,
    };
    return { ...flight, mesh, craft };
  });
  // Each placed by flown (createFlight) while it is the one flown (flier), else on its oval.
  const update = (seconds, flier, flown) => {
    for (const { mesh, height, direction, craft } of flights) {
      mesh.scale.setScalar(boost(mesh.position));
      if (craft === flier) {
        mesh.position.set(flown.x, flown.y, flown.z);
        mesh.rotation.set(flown.nose - flight.LEVEL, flown.heading, -0.6 * flown.turn);
        continue;
      }
      const a = (direction * seconds * SPEED) / ((RADII[0] + RADII[1]) / 2);
      mesh.position.set(
        CENTRE[0] + RADII[0] * Math.cos(a),
        height,
        CENTRE[1] + RADII[1] * Math.sin(a),
      );
      // Along the oval: its velocity is direction × (-RADII[0] sin a, RADII[1] cos a).
      mesh.rotation.y = Math.atan2(
        -direction * RADII[0] * Math.sin(a),
        direction * RADII[1] * Math.cos(a),
      );
      mesh.rotation.x = 0;
      mesh.rotation.z = 0.3 * direction; // banking into the turn
    }
  };
  return { meshes: flights.map((f) => f.mesh), crafts: flights.map((f) => f.craft), update };
}

// Flocks of birds circling above bridges, parks and squares all over the city (FLOCKS), flapping
// their wings. All birds are instances of one V, in one draw call.
function createBirds() {
  const FLOCKS = [
    [366, -321], // Mittlere Brücke
    [537, 99], // Münster
    [-300, 1150], // Zoo
    [2300, -2150], // Lange Erlen
    [164, -896], // Johanniterbrücke
    [-100, -1500], // Dreirosenbrücke
    [-1000, -600], // Kannenfeldpark
    [-700, 400], // Schützenmattpark
    [-200, 1500], // Margarethenpark
    [500, 800], // Bahnhof SBB
    [2400, 0], // Birsköpfli
    [300, -3200], // Dreiländereck
  ];
  const BIRDS = 50; // per flock
  const SIZE = 2.5; // metres of wingspan, about three times life size so they can be seen
  // Two wings meeting at the body, along +z.
  const v = new THREE.BufferGeometry();
  v.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0.3, -0.5, 0.15, 0, 0, 0, -0.2, 0, 0, 0.3, 0, 0, -0.2, 0.5, 0.15, 0],
      3,
    ),
  );
  const mesh = new THREE.InstancedMesh(
    v,
    new THREE.MeshBasicMaterial({ color: 0x2b2b2b, side: THREE.DoubleSide }),
    FLOCKS.length * BIRDS,
  );
  mesh.frustumCulled = false; // they fly around
  // Each bird: its flock's centre, a radius, a height, a speed and a phase, from a stable hash.
  const random = (i, k) => (Math.abs(Math.sin(i * 12.9898 + k * 78.233)) * 43758.5453) % 1;
  const birds = FLOCKS.flatMap(([x, z], f) =>
    [...Array(BIRDS)].map((_, b) => {
      const i = f * BIRDS + b;
      return {
        x,
        z,
        ground: heightAt(x, z),
        radius: 30 + random(i, 1) * 60,
        height: 40 + random(i, 2) * 40,
        speed: (0.25 + random(i, 3) * 0.2) * (random(i, 4) < 0.5 ? 1 : -1),
        phase: random(i, 5) * 2 * Math.PI,
      };
    }),
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const update = (seconds) => {
    birds.forEach((bird, i) => {
      const a = bird.phase + seconds * bird.speed;
      position.set(
        bird.x + bird.radius * Math.cos(a),
        bird.ground + bird.height + 4 * Math.sin(seconds + bird.phase),
        bird.z + bird.radius * Math.sin(a),
      );
      // Heading along the circle (its velocity is speed × (-sin a, cos a)); the wings beat by
      // squashing the V up and down.
      quaternion.setFromAxisAngle(
        up,
        Math.atan2(-Math.sin(a) * bird.speed, Math.cos(a) * bird.speed),
      );
      const b = boost(position) * SIZE;
      scale.set(b, b * Math.sin(seconds * 9 + bird.phase) * 2, b);
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}
// The menu shows the names (see updateNames) and the loops of the trams (each line on its
// own), trains and cars, the course of the ships and the pedestrians' loops (kindLines.walk, set
// with them below) as lines above them; at first none. "All"
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
// than LANDMARK_RANGE from the camera are hidden, so the centre stays readable from afar.
const LANDMARK_RANGE = 3000; // metres
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
const labels = JSON.parse(new TextDecoder().decode(namesJson)).map(({ name, kind, x, z }) => {
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
  return { at, kind, element: nameLayer.appendChild(element) };
});
// The UFO (src/ufo.js) hovers over where a ray from above first meets a roof or the ground.
const ufo = createUfo(boost, (x, z) => {
  fromAbove.set(new THREE.Vector3(x, 2000, z), DOWN);
  return fromAbove.intersectObjects([buildings.scene, terrain])[0].point.y;
});
scene.add(...ufo.meshes);
// The decks of all standing bridges (deckOf), made when first needed.
let roads = null;
const bridgeDecks = () =>
  (roads ??= deckOf(
    [...structures.triangles(structures.bridgeNumbers).values()].flatMap((parts) =>
      parts.flatMap(({ positions }) => positions),
    ),
  ));
// The map's rails (src/rails.js), on the ground and on the decks, but those of destroyed bridges.
function addRails() {
  rails = createRails(tracks, terrainInfo, heights, (x, z) =>
    Math.max(-Infinity, ...[bridgeDecks(), ...brokenDecks].flatMap((deck) => deck.heights(x, z))),
  );
  for (const deck of brokenDecks) rails.cut(deck);
  scene.add(rails);
}
if (map) addRails();
// On the Rhine the terrain lies flat at the water's surface, at most WATER.
const WATER = -4.9; // scene y
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
// Police cars (src/police.js) in St. Johann and on the Rhine in Klybeck by the Dreirosenbrücke,
// both facing south, and in Kleinbasel by the men there (LV95 2611656.5, 1267907.4), facing southwest; a motorcycle (src/motorcycle.js) on the Mittlere Brücke facing Kleinbasel; a
// tank (src/tank.js) in the yard of the Kaserne facing east; a drone (src/drone.js) 2 m over the
// Münster's roof (LV95 2611577.4, 1267321.0, 301.3), facing north over the Rhine. It flies down to roofs (structures.top) as well.
const police = createPolice(
  parked([
    { x: -1002.3, z: -765.7, heading: 0 },
    { x: 132.7, z: -1427.2, heading: -0.05 },
    { x: 656.5, z: -507.4, heading: -0.93 },
  ]),
  boost,
  world,
);
const motorcycles = createMotorcycles(
  parked([{ x: 375.9, z: -320.7, heading: 2.21 }]),
  boost,
  world,
);
// People (src/people.js) at LV95 points, each facing toward
// (turned up to SPREAD radians away, each a little otherwise) or else the others within NEAR
// metres, or alone k radians from south.
const SPREAD = 0.5;
const NEAR = 10;
const fromLV95 = ([e, n]) => ({ x: e - LV95[0], z: LV95[1] - n });
function standing(points, toward) {
  const at = points.map(fromLV95);
  const target = toward && fromLV95(toward);
  const facing = (p, { x, z }) => Math.atan2(x - p.x, z - p.z);
  return parked(
    at.map((p, k) => {
      if (target) return { ...p, heading: facing(p, target) + SPREAD * Math.sin(k * 2.7) };
      const near = at.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < NEAR);
      if (!near.length) return { ...p, heading: k };
      const x = near.reduce((sum, q) => sum + q.x, 0) / near.length;
      const z = near.reduce((sum, q) => sum + q.z, 0) / near.length;
      return { ...p, heading: facing(p, { x, z }) };
    }),
  );
}
// Black men in Kleinbasel, each in other clothes, some with a cap or beanie.
const MEN = [
  [2611652.0, 1267913.7],
  [2611650.0, 1267913.0],
  [2611649.8, 1267914.9],
  [2611651.4, 1267915.3],
  [2611638.7, 1267929.8],
  [2611592.6, 1267974.9],
  [2611589.4, 1267977.4],
  [2611558.4, 1267983.2],
  [2611520.5, 1268060.2],
  [2611513.8, 1268085.4],
  [2611507.0, 1268105.0],
  [2611496.3, 1268113.9],
  [2611502.3, 1268125.4],
  [2611491.6, 1268139.5],
  [2611491.0, 1268184.5],
  [2611491.9, 1268221.2],
  [2611491.5, 1268228.4],
  [2611510.1, 1268207.5],
  [2611479.0, 1268301.9],
  [2611480.1, 1268309.8],
  [2611476.2, 1268320.4],
  [2611498.4, 1268292.8],
  [2611494.9, 1268305.5],
  [2611689.5, 1267931.0],
  [2611698.6, 1267929.3],
  [2611708.8, 1267932.1],
  [2611709.9, 1267942.5],
  [2611722.2, 1267940.4],
];
const MEN_LOOKS = mix(
  {
    body: ["man"],
    skin: [0x4a2c1a, 0x5a3520, 0x3d2416, 0x6b4128, 0x7a4a2a],
    hair: [0x111111],
    top: [0xffffff, 0x1e7d4a, 0x111111, 0xf2c94c, 0xc0392b, 0x1e88e5, 0x6b6b6b, 0xff6f00],
    bottom: [0x3b4d6b, 0x222222, 0x6b6b6b, 0x1d1d1d, 0xc2a878, 0x2f4f2f, 0x4a5d7a],
    shoes: [0xffffff, 0x111111, 0xeeeeee, 0x1d1d1d],
    head: ["cap", "hair", "beanie", "cap", "hair", "beanie"],
    hat: [0xc0392b, 0, 0x111111, 0x1b2333, 0, 0x8b0000],
  },
  MEN.length,
);
// Sex workers in a lane in Kleinbasel, from the top down, facing up it, each in other clothes.
const WOMEN = [
  [2611561.3, 1267979.2],
  [2611556.8, 1267977.7],
  [2611560.4, 1267982.1],
  [2611540.8, 1267967.4],
  [2611537.0, 1267968.0],
  [2611535.6, 1267964.4],
  [2611531.8, 1267965.0],
  [2611551.6, 1267974.2],
  [2611550.2, 1267970.7],
  [2611546.4, 1267971.2],
  [2611545.0, 1267967.7],
  [2611514.7, 1267958.2],
  [2611519.1, 1267957.5],
  [2611521.5, 1267961.1],
  [2611525.9, 1267960.4],
  [2611528.3, 1267964.1],
];
// Each [skin, hair, top, skirt, boots].
const WOMEN_LOOKS = [
  [0x8a5634, 0x111111, 0xff2d8a, 0x111111, 0xff2d8a], // pink and black
  [0xf1c7a5, 0xe2c46e, 0xe8e8e8, 0xd81b60, 0xe8e8e8], // white and pink
  [0xd9a27a, 0x7a2a1a, 0x8e24aa, 0x8e24aa, 0x111111], // purple
  [0xc58c5c, 0x111111, 0xd32f2f, 0xd32f2f, 0xd32f2f], // red
  [0xf1c7a5, 0x2a1d14, 0xffd600, 0x111111, 0x111111], // yellow and black
  [0x6b4128, 0x111111, 0x00bcd4, 0xffffff, 0xffffff], // turquoise and white
  [0xe8b996, 0xe2c46e, 0x111111, 0xd81b60, 0xd81b60], // black and pink
  [0xd9a27a, 0x111111, 0xc0c0c0, 0x111111, 0x111111], // silver and black
  [0x8a5634, 0x7a2a1a, 0x76ff03, 0x111111, 0x76ff03], // lime and black
  [0xf1c7a5, 0x7a2a1a, 0xff6f00, 0xff6f00, 0x111111], // orange
  [0xc58c5c, 0x2a1d14, 0x1e88e5, 0xe8e8e8, 0x1e88e5], // blue and white
  [0xe8b996, 0x111111, 0xffffff, 0xffffff, 0xffffff], // white
  [0x6b4128, 0xe2c46e, 0xffc107, 0xffc107, 0x111111], // gold
  [0xf1c7a5, 0x7a2a1a, 0x111111, 0x111111, 0x111111], // black
  [0xd9a27a, 0x2a1d14, 0x64ffda, 0x111111, 0x64ffda], // mint and black
  [0x8a5634, 0x111111, 0xff4081, 0x311b92, 0x311b92], // pink and indigo
].map(([skin, hair, top, bottom, shoes]) => ({ body: "night", skin, hair, top, bottom, shoes }));
// On their backs on beach towels, 0.9 by 2 m: a woman in a bikini sunbathing, her head to the
// south (her feet at LV95 2610512.9, 1268549.5) on a blue towel, and one in a black one making a
// snow angel, her head to the north (her feet at LV95 2610510.6, 1268549.7) on a red one. Their
// friends in bikinis: three doing yoga in a row facing west, one lying on her back on a pink
// towel with her head to the east, spreading her arms and legs up, two dancing facing each other.
const BIKINI = {
  body: "swim",
  skin: 0xe8b996,
  hair: 0x7a3a1a,
  top: 0xe8175d,
  bottom: 0xe8175d,
  head: "long",
};
const ANGEL = { ...BIKINI, skin: 0xf1c7a5, hair: 0xe2c46e, top: 0x111111, bottom: 0x111111 };
// Each [LV95 east, north, heading, look, pose, towel's colour].
const SUNBATHERS = [
  [2610512.9, 1268549.5, 0, BIKINI, "lie", 0x1e88e5],
  [2610510.6, 1268549.7, Math.PI, ANGEL, "angel", 0xd32f2f],
];
const sunbathing = parked(
  SUNBATHERS.map(([e, n, heading, , pose]) => ({ ...fromLV95([e, n]), heading, pose })),
);
// Metres the towels' tops are above the ground at the feet, so uneven ground does not cover them.
const TOWEL = 0.06;
const SLIDE = 0.5; // metres
const towelShape = new THREE.BoxGeometry(0.9, 0.02, 2).translate(0, TOWEL - 0.01, 0.9);
// A towel of this colour under one lying at a place (feet there, head along the heading).
function towel({ x, y, z, heading }, color) {
  const mesh = new THREE.Mesh(towelShape, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = heading;
  return mesh;
}
// Each [LV95 east, north, heading, pose]: the yoga row about 1 m apart around LV95 2610515.3,
// 1268548.5, the dancers 1.4 m apart around LV95 2610511.5, 1268552.2.
const friends = parked(
  [
    [2610515.3, 1268549.5, -Math.PI / 2, "yoga"],
    [2610515.3, 1268548.5, -Math.PI / 2, "yoga"],
    [2610515.3, 1268547.5, -Math.PI / 2, "yoga"],
    [2610513, 1268550.8, Math.PI / 2, "up"],
    [2610510.8, 1268552.2, Math.PI / 2, "dance"],
    [2610512.2, 1268552.2, -Math.PI / 2, "dance"],
  ].map(([e, n, heading, pose]) => ({ ...fromLV95([e, n]), heading, pose })),
);
const FRIENDS = mix(
  {
    body: ["swim"],
    skin: [0xf1c7a5, 0x8a5634, 0xd9a27a, 0xf6d5b8, 0xc58c5c],
    hair: [0x111111, 0xe2c46e, 0x2a1d14, 0x7a3a1a],
    top: [0x1e88e5, 0xffd600, 0x111111, 0x00bcd4, 0xff6f00],
    bottom: [0x1e88e5, 0xffd600, 0x111111, 0x00bcd4, 0xff6f00],
    head: ["long", "long", "hair", "long", "long"],
  },
  friends.length,
);
scene.add(
  ...sunbathing.map((place, k) => towel(place, SUNBATHERS[k][5])),
  ...friends.filter(({ pose }) => pose === "up").map((place) => towel(place, 0xec407a)),
  ...createPeople(
    sunbathing.map((place) => ({ ...place, y: place.y + TOWEL })),
    SUNBATHERS.map(([, , , look]) => look),
  ),
  ...createPeople(
    // On her towel, with her legs up, SLIDE back towards its middle.
    friends.map((p) =>
      p.pose === "up"
        ? {
            ...p,
            x: p.x - Math.sin(p.heading) * SLIDE,
            y: p.y + TOWEL,
            z: p.z - Math.cos(p.heading) * SLIDE,
          }
        : p,
    ),
    FRIENDS,
  ),
  ...createPeople(standing(MEN), MEN_LOOKS),
  ...createPeople(standing(WOMEN, [2611565.3, 1267979.1]), WOMEN_LOOKS),
);
// The Zoo Basel's animals, a crocodile in the Merian Gärten and wild boars, foxes, a wildcat, red
// deer, chamois, swans, goats (twice), small monkeys, ducks, geese, a lynx, donkeys and wolves in the
// Lange Erlen (src/zoo.js) at LV95 points, each group with its heading.
const zoo = createZoo(
  [
    ["giraffes", 2610723.6, 1266483.0, 0.5],
    ["elephants", 2610681.3, 1266433.3, -1],
    ["zebras", 2610415.1, 1266286.4, 2],
    ["hippos", 2610590.8, 1266337.9, 1],
    ["seals", 2610402.7, 1266201.5, 0],
    ["rhinos", 2610587.7, 1266255.8, 0.8],
    ["penguins", 2610437.5, 1266003.1, 0],
    ["crocodiles", 2613500.5, 1264409.6, 0],
    ["boars", 2612577.6, 1269243.4, 0],
    ["foxes", 2612577.1, 1269194.8, 0],
    ["wildcat", 2612617.9, 1269241.3, 0],
    ["deer", 2612649.0, 1269188.8, 0],
    ["chamois", 2612705.9, 1269201.7, 0],
    ["swans", 2612675.9, 1269269.7, 0],
    ["goats", 2612720.7, 1269278.9, 0],
    ["monkeys", 2612733.4, 1269327.0, 0],
    ["ducks", 2612756.0, 1269255.9, 0],
    ["geese", 2612797.5, 1269228.5, 0],
    ["lynx", 2612850.6, 1269239.8, 0],
    ["goats", 2612871.7, 1269272.5, 1.5],
    ["donkeys", 2612959.8, 1269327.0, 0],
    ["howler", 2612841.2, 1269383.6, -1.2],
    ["wolf", 2612810.9, 1269370.5, 1.8],
    ["wolf", 2612805.8, 1269381.3, 0.4],
  ].map(([group, e, n, heading]) => ({ group, ...fromLV95([e, n]), heading })),
  heightAt,
  tree.clear,
);
scene.add(...zoo.meshes);
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
const walkers = createWalkers(
  walksBuffer,
  terrainInfo.x0,
  terrainInfo.z0,
  {
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
        head: ["hair", "long", "cap", "long", "hair", "long", "beanie", "hair"],
        dress: [false, false, false, true],
        hat: [0x1b2333, 0xc0392b, 0x111111],
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
  },
  walkGround,
);
scene.add(...walkers.meshes);
// Their loops in the layer "Walks", on the bridge or ground.
kindLines.walk = Object.assign(
  checkLines(walkers.stretches.flatMap(([x, z]) => [x, walkGround(x, z, Infinity) + 0.3, z])),
  { visible: false },
);
overlay.add(kindLines.walk);
// The St. Jakob-Park in FC Basel's colours, blue walls and a red roof: the widest building whose
// middle is within STADIUM of its pitch's (the model joins the block behind its south stand to it).
// On the pitch a training game (src/football.js) between goals at LV95 2613704.8, 1265649.7 and
// 2613621.4, 1265686.0: goalkeepers in green, two teams in the club's kit, one in orange bibs,
// their coach in a dark tracksuit at the side.
const STADIUM = 60; // metres
const ends = parked(
  [
    [2613704.8, 1265649.7],
    [2613621.4, 1265686.0],
  ].map(fromLV95),
);
const stadium = structures.widest(
  (ends[0].x + ends[1].x) / 2,
  (ends[0].z + ends[1].z) / 2,
  STADIUM,
);
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
// What stands on a roof comes down to the ground there when destroy() blows its building up.
const grounding = new Map(); // building number → what to call then
const landOn = (number, land, { x, z }) =>
  grounding.set(number, [...(grounding.get(number) ?? []), () => land(heightAt(x, z))]);
// The Rega's helicopters (src/rega.js), an H145 and the AW109 "Da Vinci", each on a helipad on
// the roof of the Universitätsspital at an LV95 point, along its walls, else on the ground there.
// The H's upright about from LV95 2610964.8, 1267835.8 towards 2610973.9, 1267829.9.
const HELIPADS_FACE = Math.atan2(2610973.9 - 2610964.8, 1267835.8 - 1267829.9);
const regas = [
  [[2610981.2, 1267851.6], "h145"], // midway along LV95 2610963.7, 1267836.3 to 2610979.6, 1267828.4
  [[2610963.1, 1267820.5], "aw109"], // midway along LV95 2610949.3, 1267815.5 to 2610964.4, 1267805.8
].map(([point, model]) => {
  const at = fromLV95(point);
  const roof = roofAt(point);
  const heading = roof ? alongBuilding(roof.number, HELIPADS_FACE) : HELIPADS_FACE;
  const rega = createRega({ ...at, y: heightAt(at.x, at.z), ...roof, heading }, model, boost);
  if (roof) landOn(roof.number, rega.land, at);
  return rega;
});
scene.add(...regas.flatMap(({ pad, group }) => [pad, group]));
// A fighter jet (src/jet.js) on the roof of the BIZ tower (WGS84 47.548078, 7.591792), else on
// the ground there, its nose to the north.
const [jetX, jetZ] = fromWGS84(47.548078, 7.591792);
const jetAt = { x: jetX, y: heightAt(jetX, jetZ), z: jetZ };
const jetRoof = roofOver(jetAt);
const jet = createJet({ ...jetAt, ...jetRoof, heading: Math.PI }, boost, flight.LEVEL);
if (jetRoof) landOn(jetRoof.number, jet.land, jetAt);
scene.add(jet.group);
// On each Roche tower's roof, four women dressed as the friends dancing 2 m around its middle,
// each looking out another way (north-east, south-east, south-west, north-west). destroy()
// removes them with their tower.
const onRoofs = new Map(); // building number → the meshes of those on its roof
for (const [t, tower] of [
  [2612702, 1267635],
  [2612756, 1267585],
].entries()) {
  const roof = roofAt(tower); // none if the tower is destroyed
  if (!roof) continue;
  const { number, x, y, z } = roof;
  const meshes = createPeople(
    [3, 1, -1, -3].map((k) => {
      const heading = (k * Math.PI) / 4;
      return {
        x: x + 2 * Math.sin(heading),
        y,
        z: z + 2 * Math.cos(heading),
        heading,
        pose: "dance",
      };
    }),
    FRIENDS.slice(2 * t),
  );
  scene.add(...meshes);
  onRoofs.set(number, meshes);
}
// Basel SBB's platform roofs (LV95 2611267.0, 1266160.4): roofs as dark as the building's at LV95
// 2611386.8, 1266248.2, walls as beige as the station building's (LV95 2611375.6, 1266339.0).
const platforms = roofAt([2611267.0, 1266160.4]);
if (platforms) structures.paint(platforms.number, { roof: 0x6a696a, wall: 0xded3bd });
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
const KIT = {
  body: "player",
  top: 0x1d3fbf,
  bottom: 0x1d3fbf,
  hat: 0xd51f2a, // sleeves and socks
};
const KEEPER = { ...KIT, top: 0x2e7d32, bottom: 0x111111, hat: 0x2e7d32 };
const STAFF = { body: "man", top: 0x222222, bottom: 0x222222, shoes: 0xffffff };
// Eleven against eleven, then aside: the head coach and his assistant at the north touchline, the
// third goalkeeper and the goalkeeping coach facing each other behind the first goal, throwing a
// ball.
const training = createTraining(
  ends,
  [
    { ...KEEPER, skin: 0xe8b996, hair: 0x2a1d14 },
    { ...KEEPER, skin: 0x8a5634, hair: 0x111111 },
    ...mix(
      {
        ...Object.fromEntries(Object.entries(KIT).map(([key, value]) => [key, [value]])),
        top: [0x1d3fbf, 0xff6f00], // teams 0 and 1, in bibs
        skin: [0xe8b996, 0x6b4128, 0xd9a27a, 0xf1c7a5, 0x8a5634, 0xc58c5c, 0x4a2c1a],
        hair: [0x2a1d14, 0x111111, 0xe2c46e, 0x3a2414, 0x7a3a1a],
        shoes: [0x111111, 0x111111, 0xff6f00],
      },
      20,
    ),
  ],
  [
    { u: -6, v: -41, face: Math.PI / 2, look: { ...STAFF, skin: 0xe8b996, hair: 0x3a2414 } },
    { u: 6, v: -41, face: Math.PI / 2, look: { ...STAFF, skin: 0xd9a27a, hair: 0x111111 } },
    { u: -51, v: -20, face: Math.PI / 2, look: { ...KEEPER, skin: 0xf1c7a5, hair: 0xe2c46e } },
    { u: -51, v: -14, face: -Math.PI / 2, look: { ...STAFF, skin: 0xc58c5c, hair: 0x8a8a8a } },
  ],
  [3, 2], // the goalkeeping coach throws, the third goalkeeper catches
);
scene.add(...training.objects);
// A girl on her pink bike (src/bike.js) to and fro on the path from WGS84 47.571822, 7.599996 to
// 47.571540, 7.601622, her little sister running after her.
const bike = createBike([fromWGS84(47.571822, 7.599996), fromWGS84(47.57154, 7.601622)], heightAt);
scene.add(...bike.objects);
// "PUMA" mown into the grass (src/lawn.js), reading from WGS84 47.571836, 7.600411 to 47.572127,
// 7.600549.
scene.add(
  createLawn(
    "PUMA",
    [fromWGS84(47.571836, 7.600411), fromWGS84(47.572127, 7.600549)],
    terrainInfo,
    heights,
  ),
);
const tanks = createTanks(parked([{ x: 399, z: -643, heading: Math.PI / 2 }]), boost, world);
// The dinosaur of the Merian Gärten (src/dino.js) at LV95 2613556.9, 1264526.6, facing west.
const dinos = createDinos(
  parked([{ ...fromLV95([2613556.9, 1264526.6]), heading: -Math.PI / 2 }]),
  boost,
  world,
);
const drones = createDrones(
  [
    {
      x: 577.4,
      y: 51.3 + 2,
      z: 79,
      heading: Math.PI,
    },
  ],
  boost,
  {
    ...world,
    ground: (x, z, y) => Math.max(world.ground(x, z, y), structures.top(x, z, y + STEP)),
  },
  camera,
);
// Boats (src/boats.js) on the Rhine, along the river: the fireboat between the Mittlere Brücke and
// the Johanniterbrücke (LV95 2611109.0, 1267968.1), the police speedboat below the Mittlere Brücke
// (LV95 2611324.4, 1267926.5), 7 m off the bank, so it can turn. They float on the water, where the
// terrain lies flat at the water's surface, at most WATER; banks and bridge piers stop them.
const onWater = {
  ground: (x, z) => heightAt(x, z),
  blocked: (from, to) => heightAt(to.x, to.z) > WATER || structures.wall(from, to, true),
  intoArea,
};
const boat = (x, z, heading) => [{ x, y: heightAt(x, z), z, heading }];
const fireboats = createBoats("fire", boat(109, -568.1, 0.62), boost, onWater);
const policeBoats = createBoats("police", boat(324.4, -526.5, -2.53), boost, onWater);
scene.add(
  ...[...police, ...motorcycles, ...tanks, ...dinos, ...drones, ...fireboats, ...policeBoats].map(
    (vehicle) => vehicle.group,
  ),
);
let namesOn = false; // whether they were shown at the last update
function updateNames() {
  const on = namesBox.checked;
  if (!on && !namesOn) return; // all hidden already
  namesOn = on;
  for (const { at, kind, element } of labels) {
    const { x, y, front } = onScreen(at);
    const near = kind === "place" || camera.position.distanceTo(at) < LANDMARK_RANGE;
    const shown = on && front && near;
    if (element.hidden === shown) element.hidden = !shown;
    if (shown) element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

// Ships on their round course on the Rhine (tools/ships.mjs), which keeps clear of the bridge
// piers and the sea monster: SHIPS tankers, container ships, passenger ships and speedboats in
// turn, evenly spaced and all at the same speed, so they never meet. Each is at most 11 m wide (the
// course keeps 10 m clear around its middle) and 6 m high, to pass under the bridges. Whale
// families swim among them.
function createShips(course) {
  const SPEED = 5; // metres per second
  const SHIPS = 20; // about one every 650 m of the course
  // Cumulative distance along the course (x, y, z per point).
  const n = course.length / 3;
  const distance = new Float32Array(n);
  for (let i = 1; i < n; i++)
    distance[i] =
      distance[i - 1] +
      Math.hypot(course[3 * i] - course[3 * i - 3], course[3 * i + 2] - course[3 * i - 1]);
  const total = distance[n - 1];
  const at = (d, out) => {
    d = ((d % total) + total) % total;
    let [lo, hi] = [0, n - 1];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (distance[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - distance[lo]) / (distance[hi] - distance[lo] || 1);
    return out.set(
      course[3 * lo] + (course[3 * hi] - course[3 * lo]) * t,
      course[3 * lo + 1] + (course[3 * hi + 1] - course[3 * lo + 1]) * t,
      course[3 * lo + 2] + (course[3 * hi + 2] - course[3 * lo + 2]) * t,
    );
  };

  // Ships along +z, the waterline at y = 0, built from coloured parts.
  const colored = (geometry, color) => {
    const g = geometry.toNonIndexed();
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  };
  // A box of [width, height, length] centred at [x, y, z].
  const box = (size, color, [x, y, z]) =>
    colored(new THREE.BoxGeometry(...size).translate(x, y, z), color);
  // A hull 3 m high (1 m under water): a box with a triangular bow in front (+z), 8 m long or a
  // third of a short boat.
  const hull = (width, length, color) => {
    const bowLength = Math.min(8, length / 3);
    const r = width / Math.sqrt(3); // a triangle of this radius is width wide at its back
    const bow = new THREE.CylinderGeometry(r, r, 3, 3); // its first corner points along +z
    bow.scale(1, 1, bowLength / (1.5 * r)); // from its back edge (-r / 2) to the tip (r)
    bow.translate(0, 0.5, length / 2 - (bowLength / 3) * 2); // back edge where the box ends
    return [
      box([width, 3, length - bowLength], color, [0, 0.5, -bowLength / 2]),
      colored(bow, color),
    ];
  };
  const WINDOWS = 0x1f2a30;
  const WHITE = 0xf2f2f0;
  const wheelhouse = (z) => [
    box([8, 3, 5], WHITE, [0, 3.5, z]),
    box([8.1, 0.9, 5.1], WINDOWS, [0, 4.4, z]),
  ];
  const tanker = [
    ...hull(11, 90, 0x7a1f1f),
    box([10, 0.4, 70], 0x3a3f46, [0, 2.2, 2]), // deck
    box([0.8, 0.8, 66], 0xc9a227, [0, 2.8, 2]), // pipeline
    ...wheelhouse(-38),
    box([1.4, 1.4, 1.4], 0x111111, [0, 5.7, -40]), // funnel
  ];
  const containerColors = [0xb3413a, 0x2f6db5, 0xe0b52b, 0x3b8c4a];
  const container = [
    ...hull(10, 70, 0x24324a),
    ...[...Array(8)].map((_, i) =>
      box([8.6, 2.5, 5.8], containerColors[i % 4], [0, 3.25, 22 - i * 6.2]),
    ),
    ...wheelhouse(-29),
  ];
  const passenger = [
    ...hull(9, 50, WHITE),
    box([9.05, 0.5, 42.1], 0x2f6db5, [0, 1.6, -4]), // blue stripe
    box([8, 2.2, 34], WHITE, [0, 3.1, -6]),
    box([8.1, 1.0, 34.1], WINDOWS, [0, 3.2, -6]),
    box([6, 1.5, 18], WHITE, [0, 4.95, -10]),
    box([6.1, 0.7, 18.1], WINDOWS, [0, 5.0, -10]),
  ];
  const speedboat = [
    ...hull(3.5, 11, WHITE),
    box([3.55, 0.4, 7.5], 0xc8282d, [0, 1.3, -1.5]), // red stripe
    box([2.6, 1.0, 2.0], WINDOWS, [0, 2.5, 0.5]), // windscreen and cockpit
  ];
  // A whale, 32 m long and 10.5 m wide across its flukes, its head along +z; its flukes apart.
  const WHALE = 0x46566a;
  const whale = mergeGeometries([
    part(
      new THREE.LatheGeometry(
        [
          [0, -16],
          [0.75, -13.75],
          [1.6, -10],
          [2.9, -5],
          [3.75, 0],
          [4.1, 5],
          [3.9, 10],
          [3, 13.75],
          [1.6, 15.75],
          [0, 16],
        ].map(([r, z]) => new THREE.Vector2(r, z)),
        12,
      )
        .rotateX(Math.PI / 2)
        .scale(1, 0.8, 1),
      WHALE,
      [0, 1.2, 0],
    ),
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(3.2, 0.3, 1.75).rotateZ(-side * 0.35), WHALE, [
        side * 3.9,
        0.2,
        6,
      ]),
    ), // flippers
    part(new THREE.ConeGeometry(0.6, 1.1, 4).scale(0.5, 1, 2), WHALE, [0, 3.3, -7.5]), // dorsal fin
    ...[-1, 1].map((side) =>
      part(new THREE.BoxGeometry(0.4, 0.4, 0.4), 0x111111, [side * 3.25, 1.5, 12.5]),
    ), // eyes
  ]);
  // Its flukes, turning up and down about where they meet its tail (their origin).
  const flukes = part(
    new THREE.ExtrudeGeometry(
      new THREE.Shape(
        [
          [0, 0.6],
          [1.9, -0.6],
          [5.25, -2.75],
          [4.5, -3.75],
          [1.5, -2.75],
          [0, -3.25],
          [-1.5, -2.75],
          [-4.5, -3.75],
          [-5.25, -2.75],
          [-1.9, -0.6],
        ].map(([x, z]) => new THREE.Vector2(x, z)),
      ),
      { depth: 0.4, bevelEnabled: false },
    ).rotateX(Math.PI / 2),
    WHALE,
    [0, 0.2, 0],
  );
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // eye: where one rides along, above the wheelhouse, the upper deck or the cockpit.
  const types = [
    { geometry: mergeGeometries(tanker), length: 90, eye: [0, 7, -35] },
    { geometry: mergeGeometries(container), length: 70, eye: [0, 7, -26] },
    { geometry: mergeGeometries(passenger), length: 50, eye: [0, 7, -4] },
    { geometry: mergeGeometries(speedboat), length: 11, eye: [0, 3.5, -1.5] },
  ];
  // Each ship a little different: its colours tinted by one of these.
  const tints = [0xffffff, 0xcfe0ff, 0xffe2c4, 0xd6f5d0, 0xffd2d2, 0xe6d6ff, 0xfff3b0];
  const fleet = [...Array(SHIPS)].map((_, i) => {
    const { geometry, length, eye } = types[i % types.length];
    const tinted = material.clone();
    tinted.color.set(tints[(i * 3) % tints.length]);
    const mesh = new THREE.Mesh(geometry, tinted);
    mesh.matrixAutoUpdate = false; // placed by update()
    return { mesh, length, eye, start: (total * i) / SHIPS }; // evenly spaced on the course
  });
  // Whale families among the ships, each halfway between two: a large one ahead, a smaller one and
  // a calf behind, FOLLOW metres apart, so each leaps where the one ahead did. A whale swims at the
  // surface, dives DEEP metres, comes up and leaps out at LEAP metres per second, falls back and
  // dips in, then blows a spout (its rise above its course: height, c seconds after it fell back).
  const [FAMILIES, FOLLOW, DEEP, LEAP, GRAVITY] = [2, 60, 12, 12, 9.8];
  const RISE = (DEEP * Math.PI) / 2 / LEAP; // seconds up from the depth
  const CYCLE = 12 + RISE + (2 * LEAP) / GRAVITY; // seconds
  const height = (c) => {
    if (c < 2) return -2 * Math.sin((Math.PI * c) / 2); // dipping in
    if (c < 8) return 0;
    if (c < 12) return -DEEP * Math.sin((Math.PI * (c - 8)) / 8); // diving
    if (c < 12 + RISE) return -DEEP * Math.cos((Math.PI * (c - 12)) / 2 / RISE); // coming up
    c -= 12 + RISE;
    return LEAP * c - (GRAVITY / 2) * c * c; // leaping
  };
  // Whether a whale leaps in its cycle n (from falling back): not if a bridge spans the course
  // from FREE metres before its dive to FREE metres past its spout. bridged: by 5 m of the course.
  const FREE = 20;
  const bridged = [];
  const spot = new THREE.Vector3();
  const spans = (i) => {
    const { x, z } = at(i * 5, spot);
    return bridgeDecks().heights(x, z).length > 0;
  };
  const leaps = (w, n) => {
    if (n in w.leaps) return w.leaps[n];
    const from = w.start + (n * CYCLE + 8 + w.delay) * SPEED - FREE;
    for (let d = from; d < from + (CYCLE - 1) * SPEED + 2 * FREE; d += 5) {
      const i = Math.floor((((d % total) + total) % total) / 5);
      if ((bridged[i] ??= spans(i))) return (w.leaps[n] = false);
    }
    return (w.leaps[n] = true);
  };
  // A whale's rise above its course t seconds after its start, if it leaps then.
  const rise = (w, t) => {
    const n = Math.floor(t / CYCLE);
    const c = t - n * CYCLE;
    return leaps(w, c < 8 ? n - 1 : n) ? w.size * height(c) : 0;
  };
  // Its spout: DROPS droplets thrown up from its blowhole (HOLE), one after another for BURST
  // seconds once it has dipped in; each is shown until it falls below its back, else hidden
  // inside it.
  const [BURST, DROPS] = [2, 400];
  const HOLE = new THREE.Vector3(0, 4.3, 9);
  const throws = [...Array(DROPS)].map(
    () =>
      new THREE.Vector3(
        Math.random() * 2.4 - 1.2,
        9 + Math.random() * 3,
        Math.random() * 2.4 - 2.7, // a little backwards, as it swims on
      ),
  );
  const spray = new THREE.PointsMaterial({
    map: glow(0xffffff).map, // a soft round dot
    size: 0.6,
    transparent: true,
    depthWrite: false,
  });
  const whales = [...Array(FAMILIES)].flatMap((_, f) =>
    [1, 0.8, 0.5].map((size, k) => {
      const mesh = new THREE.Mesh(whale, material.clone());
      mesh.matrixAutoUpdate = false;
      const tail = new THREE.Mesh(flukes, mesh.material);
      tail.position.set(0, 1.2, -15.6);
      const drops = new THREE.BufferAttribute(new Float32Array(DROPS * 3), 3);
      const spout = new THREE.Points(
        new THREE.BufferGeometry().setAttribute("position", drops),
        spray,
      );
      spout.frustumCulled = false; // its bounds are never computed
      spout.raycast = () => {}; // not clicked
      mesh.add(tail, spout);
      const start = (total * (f * (SHIPS / FAMILIES) + 0.5)) / SHIPS - k * FOLLOW;
      const delay = (k * FOLLOW) / SPEED;
      return { mesh, tail, drops, size, delay, blowing: false, start, leaps: {} };
    }),
  );
  fleet.push(
    ...whales.map(({ mesh, size, start }) => ({
      mesh,
      length: 32 * size,
      eye: [0, 6.5, 3],
      start,
    })),
  );
  const [drop, scale] = [new THREE.Vector3(), new THREE.Vector3()];
  const tilt = new THREE.Matrix4();

  const [front, back, forward, right, up] = [...Array(5)].map(() => new THREE.Vector3());
  const yAxis = new THREE.Vector3(0, 1, 0);
  const update = (seconds) => {
    for (const ship of fleet) {
      const d = ship.start + seconds * SPEED;
      at(d + ship.length / 2, front);
      at(d - ship.length / 2, back);
      forward.subVectors(front, back).setY(0).normalize();
      right.crossVectors(yAxis, forward).normalize();
      up.crossVectors(forward, right);
      const b = boost(at(d, front));
      ship.mesh.matrix
        .makeBasis(right.multiplyScalar(b), up.multiplyScalar(b), forward)
        .setPosition(front);
    }
    // The whales, raised or lowered by height, nose up while rising, flukes beating.
    for (const w of whales) {
      const t = seconds - w.delay;
      const climb = rise(w, t + 0.5) - rise(w, t - 0.5); // metres in the second around t
      w.mesh.matrix.multiply(
        tilt.makeRotationX(-Math.atan2(climb, SPEED)).scale(scale.setScalar(w.size)),
      );
      w.mesh.matrix.elements[13] += rise(w, t);
      w.tail.rotation.x = 0.35 * Math.sin(1.6 * seconds + w.delay);
      const n = Math.floor(t / CYCLE);
      const blow = t - n * CYCLE - 2;
      const on = blow >= 0 && blow < BURST + 3 && leaps(w, n - 1);
      if (!on && !w.blowing) continue; // all hidden already
      w.blowing = on;
      throws.forEach((velocity, i) => {
        const age = blow - (i / DROPS) * BURST;
        drop.copy(HOLE).addScaledVector(velocity, age).y -= (GRAVITY / 2) * age * age;
        if (!on || age < 0 || drop.y < HOLE.y - 1) drop.set(0, 0, 0);
        w.drops.setXYZ(i, drop.x, drop.y, drop.z);
      });
      w.drops.needsUpdate = true;
    }
  };
  // The course 3 m above the water, one line segment per pair of points.
  const vertices = [];
  for (let i = 1; i < n; i++)
    for (const j of [i - 1, i])
      vertices.push(course[3 * j], course[3 * j + 1] + 3, course[3 * j + 2]);
  const route = checkLines(vertices);
  route.visible = false;
  const ride = riders(
    fleet.map(({ mesh, eye }) => ({
      object: mesh,
      materials: [mesh.material],
      eye,
      ahead: [0, 4, 200],
    })),
  );
  return { meshes: fleet.map((ship) => ship.mesh), route, update, ride };
}

// Riding along on single objects (ships, planes, the helicopter, the sea monster, the UFO, the
// police cars, the motorcycles), each { object, materials, eye, ahead } (points in the object's own frame): the
// camera at eye, looking at ahead with the horizon level; under the mouse the materials show
// HIGHLIGHT.
function riders(list) {
  const colors = list.map(({ materials }) => materials.map((m) => m.color.clone()));
  const ahead = new THREE.Vector3();
  let highlighted = -1;
  return {
    objects: list.map(({ object }) => object),
    vehicleOf: (hit) => list.findIndex(({ object }) => object.getObjectById(hit.object.id)),
    cab: (v, view) => {
      const { object } = list[v];
      object.updateWorldMatrix(true, false);
      view.position.fromArray(list[v].eye).applyMatrix4(object.matrixWorld);
      view.lookAt(ahead.fromArray(list[v].ahead).applyMatrix4(object.matrixWorld));
    },
    highlight: (v) => {
      if (v === highlighted) return;
      for (const i of [highlighted, v])
        list[i]?.materials.forEach((m, k) => {
          m.color.copy(i === v ? HIGHLIGHT : colors[i][k]);
          m.vertexColors = i !== v; // all have vertex colours
          m.needsUpdate = true;
        });
      highlighted = v;
    },
  };
}

// What moves along paths (tools/paths.mjs): trams, trains and cars, all called vehicles below.
// A vehicle has CARS cars (one for road vehicles); each car follows the path on its
// own, so long vehicles bend in curves. Its variant (say a goods train or a lorry) sets the model,
// length, height and colour of its cars.
// Also returns the paths as lines to check them (checkLines), one per line named by its ref (a
// loop of two lines has two), in a group hidden at first.
// A vehicle waits while a car of another one is on its own path just ahead: within ALONG of any
// point every ALONG up to LOOK ahead and at most SIDE beside it, so nothing that joins its path
// (at a switch or crossing) is missed.
// Those on the parallel way of the other direction pass; those ahead and at crossings block.
// Trams and trains go first: they wait only for each other, cars for all. Every path is a closed
// loop that its vehicles run round forever, about SPACING apart (round trips of cars by their
// share of the roads, so shared roads are not more crowded).
function createMovers({ routes }, points, kind, traffic) {
  const pick = (r, list) => list[Math.floor(r * list.length) % list.length];
  const KINDS = {
    tram: {
      CARS: 4,
      GAP: 0.6, // metres between cars
      SPACING: 1500, // metres
      SPEED: 10, // metres per second
      LOOK: 25, // metres
      ALONG: 8, // metres; at least half the distance between a car's front, centre and back
      SIDE: 2, // metres; less than the distance to the track of the other direction (3.5 m)
      EYE: 2.4, // metres above the path, when riding
      models: () => [tramCar()],
      variant: ({ operator }) => ({
        length: 8,
        height: 3,
        color: operator === "BLT" ? 0xf2c400 : 0x2e8b3a, // BLT yellow, BVB green
      }),
    },
    train: {
      CARS: 5,
      GAP: 1,
      SPACING: 5000,
      SPEED: 22,
      LOOK: 60,
      ALONG: 15,
      SIDE: 2, // tracks of the other direction are about 4.5 m away
      EYE: 2.6,
      models: () => [trainCar(false), trainCar(true)],
      // White passenger trains, a quarter blue goods trains (green and yellow only for trams).
      variant: (_, r) =>
        r < 0.25
          ? { model: 1, length: 20, height: 3.6, color: 0x2f4f7f }
          : { length: 25, height: 4, color: 0xf2f2f0 },
    },
    car: {
      CARS: 1,
      GAP: 0,
      SPACING: 100,
      SPEED: 12,
      LOOK: 9,
      ALONG: 2.5,
      SIDE: 1.2, // the lane of the other direction is 3.6 m away
      EYE: 1.2,
      models: () => ROAD.map(({ shape }) => shape()),
      // A model of ROAD by its share, in one of its colours.
      variant: (_, r) => {
        let model = 0;
        for (let below = ROAD[0].share; r >= below && model < ROAD.length - 1;)
          below += ROAD[++model].share;
        const { length, colors } = ROAD[model];
        return { model, length, height: 1, color: pick((r * 7919) % 1, colors) };
      },
    },
  };
  const { CARS, GAP, SPACING, SPEED, LOOK, ALONG, SIDE, EYE, models, variant } = KINDS[kind];
  // Far away the cars grow higher, but at most this much wider, so that cars on neighbouring tracks
  // and lanes never overlap.
  const MAX_WIDER = 1.4;

  const lines = routes.map(({ ref, start, count, length, share, operator, parts }) => ({
    start,
    count,
    operator,
    length,
    share: share ?? length,
    step: length / count, // metres between points
    parts: parts ?? [{ ref, from: 0 }], // where each line runs (more than one: tools/paths.mjs)
  }));
  // The point d metres along a line, round and round its loop.
  function at(line, d, out) {
    const f = (((d % line.length) + line.length) % line.length) / line.step;
    const k = Math.min(Math.floor(f), line.count - 1);
    const t = f - k;
    const i = 3 * (line.start + k);
    const j = 3 * (line.start + ((k + 1) % line.count));
    return out.set(
      points[i] + (points[j] - points[i]) * t,
      points[i + 1] + (points[j + 1] - points[i + 1]) * t,
      points[i + 2] + (points[j + 2] - points[i + 2]) * t,
    );
  }

  // Vehicles start evenly about SPACING apart on each loop; d is how far each one's front is along
  // it. Where loops share a way, one that would start on or right behind another (of any kind) is
  // left out.
  const random = (i) => (Math.abs(Math.sin(i * 12.9898 + 78.233)) * 43758.5453) % 1;
  const { taken, blockers } = traffic;
  const spot = new THREE.Vector3();
  const vehicles = [];
  for (const line of lines) {
    const n = Math.max(1, Math.round(line.share / SPACING));
    for (let k = 0; k < n; k++) {
      const {
        length,
        height,
        color,
        model = 0,
      } = variant(line, random(vehicles.length + k * 7919));
      const total = CARS * (length + GAP);
      const d = (k * line.length) / n;
      const body = [];
      for (let s = d - total; s <= d + LOOK; s += Math.min(2, length)) {
        at(line, s, spot);
        body.push(spot.x, spot.z);
      }
      let free = true;
      for (let b = 0; b < body.length && free; b += 2)
        for (let i = -1; i <= 1 && free; i++)
          for (let j = -1; j <= 1 && free; j++) {
            const list = taken.get(cell(body[b] + i * CELL, body[b + 1] + j * CELL)) ?? [];
            for (let q = 0; q < list.length && free; q += 2)
              free = Math.hypot(list[q] - body[b], list[q + 1] - body[b + 1]) > SIDE;
          }
      if (!free) continue;
      vehicles.push({ line, d, start: d, length, height, model, color: new THREE.Color(color) });
      for (let b = 0; b < body.length; b += 2) {
        const key = cell(body[b], body[b + 1]);
        if (!taken.has(key)) taken.set(key, []);
        taken.get(key).push(body[b], body[b + 1]);
      }
    }
  }
  // Per model (a geometry of length 1 along +z, scaled per car, white tinted per vehicle): its
  // vehicles (fleet; a vehicle's slot is its place there) and their cars as instances of one mesh,
  // in one draw call. Of each fleet's material, the uniforms that show the cars of the vehicle
  // under the mouse, instances highlightFrom to highlightTo - 1, and the shader that keeps the parts
  // of a car meant for the first or last one only (piece) and lights its lamps.
  const geometries = models();
  const fleets = geometries.map(() => []);
  vehicles.forEach((vehicle, v) => {
    vehicle.slot = fleets[vehicle.model].length;
    fleets[vehicle.model].push(v);
  });
  const ranges = geometries.map(() => ({ highlightFrom: { value: 0 }, highlightTo: { value: 0 } }));
  const meshes = geometries.map((geometry, m) => {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    material.customProgramCacheKey = () => kind; // the shader depends on CARS
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, ranges[m]);
      highlightShader(
        shader,
        "gl_InstanceID >= highlightFrom && gl_InstanceID < highlightTo",
        "uniform int highlightFrom, highlightTo;",
      );
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float only;\nvarying float vLamp;",
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
          vLamp = only > 2.5 ? 1.0 : 0.0;
          if (vLamp > 0.5) vColor.rgb = color.rgb;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          int part = int(only + 0.5) - (only > 2.5 ? 2 : 0), car = gl_InstanceID % ${CARS};
          if (part == 1 && car != 0 || part == 2 && car != ${CARS - 1}) transformed = vec3(0.0);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vLamp;")
        .replace(
          "#include <opaque_fragment>",
          "if (vLamp > 0.5) outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>",
        );
    };
    const mesh = new THREE.InstancedMesh(geometry, material, fleets[m].length * CARS);
    mesh.frustumCulled = false; // the vehicles move all over the city
    return mesh;
  });
  vehicles.forEach(({ model, slot, color }) => {
    for (let c = 0; c < CARS; c++) meshes[model].setColorAt(slot * CARS + c, color);
  });

  // The loops 3 m above the ground, one line segment per pair of points, each part of a loop on
  // its own (part.lines), for trams in the line's colour.
  const routeLines = new THREE.Group();
  for (const line of lines)
    line.parts.forEach((part, p) => {
      const next = line.parts[p + 1];
      const end = next ? Math.ceil(next.from / line.step) : line.count;
      const vertices = [];
      for (let k = Math.ceil(part.from / line.step); k < end; k++)
        for (const j of [line.start + k, line.start + ((k + 1) % line.count)])
          vertices.push(points[3 * j], points[3 * j + 1] + 3, points[3 * j + 2]);
      const color = kind === "tram" ? part.colour : undefined;
      part.lines = Object.assign(checkLines(vertices, color), { name: part.ref });
      routeLines.add(part.lines);
    });
  routeLines.visible = false;

  const [front, back, forward, right, up, ahead, behind] = [...Array(7)].map(
    () => new THREE.Vector3(),
  );
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Gaps where a bridge was blown up (cut): per line, per point whether it lies on such a deck. A
  // vehicle with a car over one vanishes (vehicle.away: seconds left) for BACK seconds, then is
  // back at its start unless that is in a gap too. Meanwhile it is in nobody's way.
  const BACK = 20; // seconds
  const pointAt = (line, d) =>
    Math.floor((((d % line.length) + line.length) % line.length) / line.step) % line.count;
  const overGap = ({ line, length }, d) => {
    if (!line.gone) return false;
    for (let s = d - CARS * (length + GAP); s <= d; s += line.step)
      if (line.gone[pointAt(line, s)]) return true;
    return line.gone[pointAt(line, d)] === 1;
  };

  // Vehicles by their index in traffic.blockers.
  const first = blockers.length;
  blockers.push(...vehicles.map(() => -1));
  const rail = kind === "car" ? 0 : 1;
  // Room for its cars' points among the traffic's.
  const room = 3 * CARS * vehicles.length;
  traffic.xz = new Float64Array(traffic.xz.length + 2 * room);
  traffic.of = new Int32Array(traffic.of.length + 3 * room);
  const note = (p, v) => {
    const { xz, of, head, tail } = traffic;
    const n = traffic.noted++;
    const c = carCell(p.x, p.z);
    xz[2 * n] = p.x;
    xz[2 * n + 1] = p.z;
    of[3 * n] = first + v;
    of[3 * n + 1] = rail;
    of[3 * n + 2] = -1;
    if (head[c] < 0) head[c] = n;
    else of[3 * tail[c] + 2] = n;
    tail[c] = n;
  };
  // The vehicle other than self with a car at the point d metres along line that this kind waits
  // for, or -1.
  const occupied = (line, d, self) => {
    at(line, d, ahead);
    at(line, d - 1, behind);
    const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z) || 1;
    const fx = (ahead.x - behind.x) / length;
    const fz = (ahead.z - behind.z) / length;
    const { xz, of, head } = traffic;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (
          let q = head[carCell(ahead.x + i * CELL, ahead.z + j * CELL)];
          q >= 0;
          q = of[3 * q + 2]
        ) {
          const dx = xz[2 * q] - ahead.x;
          const dz = xz[2 * q + 1] - ahead.z;
          if (
            of[3 * q] !== self &&
            of[3 * q + 1] >= rail &&
            Math.abs(dx * fx + dz * fz) < ALONG &&
            Math.abs(dx * fz - dz * fx) < SIDE
          )
            return of[3 * q];
        }
    return -1;
  };
  // Vehicles far from the camera look ahead only every SLOW-th frame (each on its own frame) and
  // move on their last result in between; from afar nobody sees the difference.
  const FAR = 1500; // metres
  const SLOW = 3;
  let frame = 0;
  // Places the cars and notes their points; those of a vehicle away are hidden.
  const place = () => {
    vehicles.forEach((vehicle, v) => {
      const { line, d, length, height, away, model, slot } = vehicle;
      const matrices = meshes[model].instanceMatrix.array;
      for (let c = 0; c < CARS; c++) {
        const m = 16 * (slot * CARS + c);
        if (away !== undefined) {
          matrices.fill(0, m, m + 15); // no size
          continue;
        }
        const end = d - c * (length + GAP);
        at(line, end, front);
        at(line, end - length, back);
        forward.subVectors(front, back).normalize();
        right.crossVectors(yAxis, forward).normalize();
        up.crossVectors(forward, right);
        note(front, v);
        note(back, v);
        const centre = front.add(back).multiplyScalar(0.5);
        note(centre, v);
        if (c === 0) vehicle.far = camera.position.distanceTo(centre) > FAR;
        const b = boost(centre);
        right.multiplyScalar(Math.min(b, MAX_WIDER));
        up.multiplyScalar(b * height);
        forward.multiplyScalar(length);
        // Its axes and its place, column by column.
        matrices[m] = right.x;
        matrices[m + 1] = right.y;
        matrices[m + 2] = right.z;
        matrices[m + 4] = up.x;
        matrices[m + 5] = up.y;
        matrices[m + 6] = up.z;
        matrices[m + 8] = forward.x;
        matrices[m + 9] = forward.y;
        matrices[m + 10] = forward.z;
        matrices[m + 12] = centre.x;
        matrices[m + 13] = centre.y;
        matrices[m + 14] = centre.z;
      }
    });
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
  // Notes for each vehicle what it waits for.
  const look = () => {
    frame++;
    vehicles.forEach(({ line, d, far, away }, v) => {
      if (far && (v + frame) % SLOW) return;
      blockers[first + v] = -1;
      if (away !== undefined) return;
      for (let s = ALONG; s <= LOOK && blockers[first + v] < 0; s += ALONG)
        blockers[first + v] = occupied(line, d + s, first + v);
    });
  };
  // Moves each vehicle that waits for none; one over a gap, even a waiting one, vanishes.
  const move = (dt) => {
    vehicles.forEach((vehicle, v) => {
      if (vehicle.away !== undefined) {
        vehicle.away -= dt;
        if (vehicle.away > 0 || overGap(vehicle, vehicle.start)) return;
        vehicle.away = undefined;
        vehicle.d = vehicle.start;
      } else if (overGap(vehicle, vehicle.d)) vehicle.away = BACK;
      else if (blockers[first + v] < 0) vehicle.d = (vehicle.d + SPEED * dt) % vehicle.line.length;
    });
  };
  // Marks the points of the loops that lie on deck (from deckOf) as a gap, but only where they
  // are at least ABOVE over the terrain, not where the bridge's ends lie on the ground.
  const ABOVE = 2; // metres
  const cut = (deck) => {
    for (const line of lines)
      for (let k = 0; k < line.count; k++) {
        const [x, y, z] = points.subarray(3 * (line.start + k), 3 * (line.start + k) + 3);
        if (y - heightAt(x, z) >= ABOVE && deck.covers(x, y, z))
          (line.gone ??= new Uint8Array(line.count))[k] = 1;
      }
  };
  // The front of vehicle v: the camera just ahead of it at eye height, looking 40 m ahead.
  const cab = (v, view) => {
    const { line, d } = vehicles[v];
    at(line, d + 0.5, front);
    at(line, d + 40, ahead);
    view.position.set(front.x, front.y + EYE, front.z);
    view.lookAt(ahead.x, ahead.y + EYE * 0.8, ahead.z);
  };
  // The part of its loop vehicle v is on; in out the top of its first car's middle.
  const roof = (v, out) => {
    const { line, d, length, height } = vehicles[v];
    at(line, d - length / 2, out);
    out.y += 1.1 * height * boost(out);
    return line.parts.findLast((part) => part.from <= d);
  };
  const vehicleOf = (hit) => fleets[meshes.indexOf(hit.object)][Math.floor(hit.instanceId / CARS)];
  // Shows vehicle v in HIGHLIGHT; -1: none.
  const highlight = (v) =>
    ranges.forEach((range, m) => {
      const on = v >= 0 && vehicles[v].model === m;
      range.highlightFrom.value = on ? vehicles[v].slot * CARS : 0;
      range.highlightTo.value = on ? (vehicles[v].slot + 1) * CARS : 0;
    });
  return {
    meshes,
    objects: meshes, // to click, as in riders
    routes: routeLines,
    count: vehicles.length,
    place,
    look,
    move,
    cab,
    roof,
    vehicleOf,
    highlight,
    cut,
    away: (v) => vehicles[v].away !== undefined, // vanished at a gap, for a while
  };
}

// A low-poly helicopter after the look of an attack helicopter: a narrow, pointed body, a ducted
// tail rotor, stub wings with rocket pods. It circles (cx, cz) at the given radius and height
// (scene metres), banking into the turn, with spinning rotors and blinking lights. Bright yellow
// with a black window, legs and weapons, to stand out against the sky as well as the red roofs.
// launchers: where its rockets leave, in its own frame.
function createHelicopter(cx, cz, radius, height, scale) {
  const YELLOW = 0xffd000;
  const DARK = 0x1c1f24; // legs, weapons, rotors
  const GLASS = 0x141a22;
  // Six-sided, along +z (the nose), narrower than high; sizes in metres before scaling.
  const hull = (g) => g.rotateX(Math.PI / 2).scale(0.95, 1, 1);
  // The windscreen, pointing forward: flat on the two upper faces of the nose (from its base at
  // z 1.1 to its tip at 2.7) and of the body behind it, a little above them, and wound both ways,
  // so it shows from outside. Its triangles on one side, as [x, y, z]:
  const screen = [
    [
      [0, 0.3, 2.14],
      [0, 0.82, 1.1],
      [0.62, 0.443, 1.1],
    ], // on the nose
    [
      [0, 0.82, 1.1],
      [0, 0.835, 0.3],
      [0.62, 0.459, 0.3],
    ], // on the body
    [
      [0, 0.82, 1.1],
      [0.62, 0.459, 0.3],
      [0.62, 0.443, 1.1],
    ],
  ];
  const both = [-1, 1].flatMap((side) =>
    screen.map((triangle) => triangle.map(([x, y, z]) => [side * x, y, z])),
  );
  const windscreen = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [...both, ...both.map((triangle) => triangle.toReversed())].flat(2),
      3,
    ),
  );
  const skids = [-1, 1].map((side) =>
    part(new THREE.BoxGeometry(0.12, 0.12, 3.6), DARK, [side * 0.9, -1.5, 0.2]),
  );
  // Struts from the belly out and down to the skids.
  const struts = [-1, 1].flatMap((side) =>
    [-0.8, 1.0].map((z) => {
      const strut = new THREE.BoxGeometry(0.1, 1, 0.1).rotateZ(side * 0.6);
      return part(strut, DARK, [side * 0.6, -1.07, z]);
    }),
  );
  // Where the rockets leave the pods, one on each side.
  const launchers = [-1, 1].map((side) => new THREE.Vector3(side * 1.6, -0.75, 0.9));
  const pod = () => new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8).rotateX(Math.PI / 2);
  // The ring around the tail rotor, upright across the tail.
  const duct = new THREE.TorusGeometry(0.6, 0.14, 6, 12).rotateY(Math.PI / 2);
  const body = mergeGeometries([
    part(hull(new THREE.CylinderGeometry(0.8, 0.85, 2.6, 6)), YELLOW, [0, 0, -0.2]), // middle
    part(hull(new THREE.ConeGeometry(0.8, 1.6, 6)), YELLOW, [0, 0, 1.9]), // pointed nose
    part(windscreen, GLASS, [0, 0, 0]),
    part(new THREE.BoxGeometry(0.85, 0.4, 1.3), YELLOW, [0, 0.88, -0.9]), // engines
    part(hull(new THREE.CylinderGeometry(0.45, 0.2, 3.5, 6)), YELLOW, [0, 0.15, -3.25]), // boom
    part(duct, YELLOW, [0, 0.35, -5.7]),
    part(new THREE.BoxGeometry(0.1, 0.9, 0.6), YELLOW, [0, 1.25, -5.75]), // fin
    part(new THREE.BoxGeometry(1.4, 0.06, 0.45), YELLOW, [0, 0.2, -4.6]), // stabiliser
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.72, 5), YELLOW, [0, 1.44, -0.4]), // mast
    part(new THREE.BoxGeometry(3.4, 0.08, 0.5), DARK, [0, -0.6, 0.2]), // stub wings
    ...launchers.map(({ x, y }) => part(pod(), DARK, [x, y, 0.3])), // rocket pods
    ...skids,
    ...struts,
  ]);
  // Four blades with yellow tips.
  const rotor = mergeGeometries(
    [0, Math.PI / 2].flatMap((angle) => [
      part(new THREE.BoxGeometry(9, 0.08, 0.35).rotateY(angle), DARK, [0, 0, 0]),
      ...[-1, 1].map((side) =>
        part(new THREE.BoxGeometry(0.6, 0.09, 0.36).rotateY(angle), YELLOW, [
          side * 4.2 * Math.cos(angle),
          0,
          -side * 4.2 * Math.sin(angle),
        ]),
      ),
    ]),
  );
  // Two blades crossed, inside the duct.
  const tailRotor = mergeGeometries(
    [0, Math.PI / 2].map((angle) =>
      part(new THREE.BoxGeometry(0.06, 0.8, 0.1).rotateX(angle), DARK, [0, 0, 0]),
    ),
  );

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  const main = new THREE.Mesh(rotor, material);
  main.position.set(0, 1.8, -0.4);
  const tail = new THREE.Mesh(tailRotor, material);
  tail.position.set(0, 0.35, -5.7); // in the middle of the duct
  // Blinking lights: a red beacon on top, a white strobe at the tail; unlit, so they glow.
  const light = (color, [x, y, z]) => {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  };
  const beacon = light(0xff2010, [0, 1.15, -1.4]);
  const strobe = light(0xffffff, [0, 1.75, -5.75]);
  group.add(new THREE.Mesh(body, material), main, tail, beacon, strobe);
  group.scale.setScalar(scale);
  group.rotation.order = "YXZ"; // heading first, then pitch and bank in the helicopter's frame

  // Placed by flown (createFlight) while steered, else back on its circle.
  const update = (seconds, flown) => {
    if (flown) {
      group.position.set(flown.x, flown.y, flown.z);
      group.rotation.set(flown.nose, flown.heading, -0.3 * flown.turn * flown.speed);
    } else {
      const angle = seconds * 0.5; // about 13 s per round
      const y = height + 25 * Math.sin(seconds * 0.35); // gently up and down, ±25 m
      group.position.set(cx + radius * Math.cos(angle), y, cz + radius * Math.sin(angle));
      group.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle)); // along the circle
      group.rotation.x = flight.LEVEL;
      group.rotation.z = 0.5; // banking towards the centre
    }
    main.rotation.y = seconds * 25;
    tail.rotation.x = seconds * 40;
    beacon.visible = seconds % 1 < 0.15; // once a second
    strobe.visible = seconds % 1.5 < 0.06 || (seconds % 1.5 > 0.18 && seconds % 1.5 < 0.24); // double flash
  };
  // Riding along: from behind and above, looking down on it a little (before scaling), its
  // crosshair (dip) just above the front of its rotor.
  const ride = riders([
    { object: group, materials: [material], eye: [0, 4.5, -22], ahead: [0, -2, 14] },
  ]);
  // Flown at speed metres per second, turning up to turn radians per second (createFlight); its
  // skids low below its middle, its rotor reaching nose ahead of it (before scaling); it fires
  // dip radians below its body.
  return {
    group,
    update,
    ride,
    launchers,
    speed: 60,
    turn: 1.1,
    low: 1.56,
    nose: 4.1,
    dip: 0.07,
  };
}

// Flying the helicopter or the UFO while riding it (input { climb, turn, stop }, climb and turn
// each -1, 0 or 1, from steering()), at most HIGH, over the terrain's area; nothing keeps it off
// the ground (see fly). Holding climb tilts the nose by TILT
// radians per second, and it stays when let go. Flying, it goes craft.speed (metres per second)
// along the nose, from UP above level to DOWN below; tilting through level, it stops there until
// pressed anew, and it levels out at HIGH. Stopped, it hovers and the nose only aims, from
// level to AIM down. Speed, nose and turning (up to craft.turn radians per second) are eased. A
// craft with lift (metres) first rises straight up that far at half its speed, then goes on from a
// standstill. The state, flown: { x, y, z, heading, speed (0 to 1, times craft.speed), aim (where
// the nose goes, radians down), nose, turn, levelled (the climb input that last reached level,
// while still held), lift (metres still to rise) }.
function createFlight() {
  const LEVEL = 0.12; // the nose down when flying level (radians)
  const UP = 0.35; // radians, about 20°
  const DOWN = 0.8; // radians, about 45°
  const AIM = 1.2; // radians, about 70°
  const TILT = 1.2;
  const HIGH = 1000; // scene y
  return {
    LEVEL,
    // The state to fly a craft ({ group, lift }) on from where it is.
    start: ({ group, lift = 0 }) => ({
      ...group.position,
      heading: group.rotation.y,
      speed: lift ? 0 : 1,
      aim: LEVEL,
      nose: LEVEL,
      turn: 0,
      levelled: 0,
      lift,
    }),
    step(flown, input, dt, craft) {
      if (flown.lift > 0) {
        const rise = Math.min(flown.lift, (craft.speed / 2) * dt, HIGH - flown.y);
        flown.y += rise;
        flown.lift = rise > 0 ? flown.lift - rise : 0;
        return;
      }
      const ease = (value, to, rate) => value + (to - value) * Math.min(1, dt * rate);
      if (input.climb !== flown.levelled) flown.levelled = 0;
      if (input.climb && !flown.levelled) {
        const next = flown.aim - input.climb * TILT * dt;
        // Already at HIGH, flying, the nose does not tilt on towards it, so it does not rise for
        // a moment before levelling out again.
        const bound = next < LEVEL && flown.y >= HIGH;
        if (!input.stop && ((next - LEVEL) * (flown.aim - LEVEL) < 0 || bound)) {
          flown.aim = LEVEL;
          flown.levelled = input.climb;
        } else flown.aim = next;
      }
      flown.aim = input.stop
        ? THREE.MathUtils.clamp(flown.aim, 0, AIM)
        : THREE.MathUtils.clamp(flown.aim, LEVEL - UP, LEVEL + DOWN);
      flown.speed = ease(flown.speed, input.stop ? 0 : 1, 6);
      flown.nose = ease(flown.nose, flown.aim, 8);
      flown.turn = ease(flown.turn, input.turn, 4);
      flown.heading += flown.turn * craft.turn * dt;
      const down = flown.nose - LEVEL; // the angle it flies below level
      const step = flown.speed * craft.speed * dt;
      [flown.x, flown.z] = intoArea(
        flown.x + Math.sin(flown.heading) * Math.cos(down) * step,
        flown.z + Math.cos(flown.heading) * Math.cos(down) * step,
      );
      const y = flown.y - Math.sin(down) * step;
      if (!input.stop && y > HIGH && down < 0) {
        flown.aim = LEVEL;
        flown.levelled = input.climb;
      }
      flown.y = Math.min(y, HIGH);
    },
  };
}

// A creepy sea serpent looking at (lookX, lookZ): a pale, ringed neck with spines that sways, an
// angular head with horns, fangs and glowing red eyes. It slowly rises and sinks a little, and
// every 10 s it leans back, then strikes forward. The terrain hides what is below the water.
function createSerpent(x, z, scale, lookX, lookZ) {
  const NECK = 24; // metres before scaling
  // Non-indexed, coloured by a function of the position, without normals and uvs.
  const colored = (geometry, colorAt) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const position = g.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++)
      colorAt(color, position.getX(i), position.getY(i), position.getZ(i)).toArray(colors, 3 * i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  };
  const eyeColor = new THREE.Color(0xff2010);
  const back = new THREE.Color(0x6f8556);
  const belly = new THREE.Color(0xd6cc8f);
  const bone = new THREE.Color(0xe2d8bc);
  // Mossy back with darker rings, a pale yellow throat and belly towards the front (+z).
  const skin = (c, px, py, pz) =>
    c
      .copy(back)
      .lerp(belly, THREE.MathUtils.smoothstep(pz, -0.2, 0.8))
      .multiplyScalar(py < NECK ? 0.8 + 0.2 * Math.sin(py * 1.6) : 1);
  const plain = (color) => (c) => c.copy(color);

  const neck = new THREE.CylinderGeometry(0.9, 2.2, NECK, 8, 16, true);
  neck.translate(0, NECK / 2, 0);
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(1.6, 1.1, 3.4);
  head.translate(0, NECK + 0.6, 1.8); // snout towards +z
  const horns = [-1, 1].map((side) => {
    const horn = new THREE.ConeGeometry(0.35, 2.4, 4);
    horn.rotateX(-0.9);
    horn.translate(side * 0.7, NECK + 1.6, -0.8);
    return colored(horn, plain(bone));
  });
  const fangs = [-1, 1].map((side) => {
    const fang = new THREE.ConeGeometry(0.16, 1.1, 4);
    fang.rotateX(Math.PI); // pointing down
    fang.translate(side * 0.55, NECK - 0.2, 4.3);
    return colored(fang, plain(bone));
  });
  // Spines down the back of the neck, smaller towards the water.
  const spines = [...Array(10)].map((_, i) => {
    const y = NECK - 1 - i * 2;
    const radius = 0.9 + ((2.2 - 0.9) * (NECK - y)) / NECK;
    const spine = new THREE.ConeGeometry(0.25, 1.6 - i * 0.08, 4);
    spine.rotateX(-1.2);
    spine.translate(0, y, -radius - 0.4);
    return colored(spine, plain(bone));
  });
  const body = mergeGeometries([
    colored(neck, skin),
    colored(head, skin),
    ...horns,
    ...fangs,
    ...spines,
  ]);
  const eyes = mergeGeometries(
    [-1, 1].map((side) => {
      const eye = new THREE.IcosahedronGeometry(0.45, 0);
      eye.translate(side * 1.3, NECK + 0.95, 3.0); // half out of the head's side
      return colored(eye, plain(eyeColor));
    }),
  );

  // The neck sways like a snake; the head (above the neck) moves with its top.
  const time = { value: 0 };
  const sway = (shader) => {
    shader.uniforms.serpentTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "uniform float serpentTime;\nvoid main() {")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float h = clamp(transformed.y / ${NECK.toFixed(1)}, 0.0, 1.0);
        transformed.x += sin(serpentTime * 0.9 - h * 2.5) * h * h * 3.0;
        transformed.z += sin(serpentTime * 0.6 - h * 2.0 + 1.3) * h * h * 2.0;`,
      );
  };
  const skinMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // Unlit and not tone-mapped, so the eyes are always the same red.
  const glow = new THREE.MeshBasicMaterial({ color: eyeColor, toneMapped: false });
  const group = new THREE.Group();
  for (const [geometry, material] of [
    [body, skinMaterial],
    [eyes, glow],
  ]) {
    material.onBeforeCompile = sway;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // the sway moves it beyond its bounds
    group.add(mesh);
  }
  group.scale.setScalar(scale);
  group.position.set(x, heightAt(x, z), z);
  group.rotation.order = "YXZ"; // lean forward and back after turning to the target
  group.rotation.y = Math.atan2(lookX - x, lookZ - z); // the head points along +z
  const surface = group.position.y; // the water surface

  // Riding along: on the head between the horns, looking ahead and a little down; both points
  // follow the head's sway (as in sway, at its top).
  const eye = [0, NECK + 2.6, 1.5];
  const ahead = [0, NECK - 2, 20];
  const ride = riders([{ object: group, materials: [skinMaterial], eye, ahead }]);

  const ease = THREE.MathUtils.smoothstep;
  const update = (seconds) => {
    time.value = seconds;
    const swayX = Math.sin(seconds * 0.9 - 2.5) * 3;
    const swayZ = Math.sin(seconds * 0.6 - 2.0 + 1.3) * 2;
    [eye[0], eye[2], ahead[0], ahead[2]] = [swayX, 1.5 + swayZ, swayX, 20 + swayZ];
    // Rises and sinks slowly, down to a quarter of the neck under water.
    group.position.y = surface - NECK * scale * (0.125 - 0.125 * Math.sin(seconds * 0.2));
    // Every 10 s: lean back for 6 s, strike forward in 0.4 s, straighten up again.
    const t = seconds % 10;
    group.rotation.x =
      t < 6
        ? -0.18 * ease(t, 0, 6)
        : t < 6.4
          ? -0.18 + 0.48 * ease(t, 6, 6.4)
          : 0.3 * (1 - ease(t, 6.4, 10));
  };
  return { group, update, ride };
}

// Trees as instanced low-poly models (1 unit tall) with varied size and colour, one mesh per
// terrain chunk so they are frustum-culled. Near the camera a chunk gets a trunk and an
// icosahedron crown, further away only an octahedron crown, far away a three-sided cone and
// fewer of them.
// The single trees (positions: east, south) and those on the photo's crowns (canopy: east, south,
// height in dm; tools/trees.mjs, map.mjs), positions in 1/8 m (TREE_GRID in tools/area.mjs) from
// the area's north-west corner; each a little different in size, shape and green.
function createTrees(positions, canopy) {
  const colored = (geometry, color) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute("uv");
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.04, 0.06, 0.5, 5, 1, true);
  trunk.translate(0, 0.25, 0);
  const CROWN = 0.33; // radius of a crown 1 unit wide
  const crown = new THREE.IcosahedronGeometry(CROWN);
  crown.translate(0, 0.67, 0);
  const simpleCrown = new THREE.OctahedronGeometry(CROWN);
  simpleCrown.translate(0, 0.67, 0);
  const near = mergeGeometries([colored(trunk, 0x6b5a45), colored(crown, 0x5d7f3e)]);
  const middle = colored(simpleCrown, 0x5d7f3e);
  const cone = new THREE.ConeGeometry(CROWN, 0.66, 3, 1, true); // 3 triangles
  cone.translate(0, 0.67, 0);
  const far = colored(cone, 0x5d7f3e);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // Per tree x, z and height in m (0: chosen below); tree indices per chunk.
  const { x0, z0, chunk } = terrainInfo;
  const single = positions.length / 2;
  const trees = new Float32Array(single * 3 + canopy.length);
  for (let i = 0; i < single; i++)
    trees.set([x0 + positions[2 * i] / 8, z0 + positions[2 * i + 1] / 8], 3 * i);
  for (let i = 0; i < canopy.length; i += 3)
    trees.set([x0 + canopy[i] / 8, z0 + canopy[i + 1] / 8, canopy[i + 2] / 10], single * 3 + i);
  const chunks = new Map();
  for (let i = 0; i < trees.length / 3; i++) {
    const ix = Math.floor((trees[3 * i] - x0) / chunk);
    const iz = Math.floor((trees[3 * i + 1] - z0) / chunk);
    const key = `${ix}_${iz}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(i);
  }
  // A tree: where it stands, its height and width (metres) and random(k), all stable per tree.
  const treeAt = (i) => {
    const [x, z] = [trees[3 * i], trees[3 * i + 1]];
    const random = (k) => (Math.abs(Math.sin(x * 12.9898 + z * 78.233 + k * 3.7)) * 43758.5453) % 1;
    const height = trees[3 * i + 2] || 8 + random(0) * 10;
    return { x, z, random, height, width: height * (0.8 + 0.45 * random(1)) };
  };
  // Whether no tree's crown reaches within r metres of x, z.
  const clear = (x, z, r) => {
    const keys = new Set();
    for (const dx of [-r, r])
      for (const dz of [-r, r])
        keys.add(`${Math.floor((x + dx - x0) / chunk)}_${Math.floor((z + dz - z0) / chunk)}`);
    return [...keys].every((key) =>
      (chunks.get(key) ?? []).every((i) => {
        const tree = treeAt(i);
        return Math.hypot(tree.x - x, tree.z - z) >= r + CROWN * tree.width;
      }),
    );
  };

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const meshes = [...chunks.values()].map((indices) => {
    // In random order, so drawing only the first ones (updateTrees) thins them out evenly.
    for (let k = indices.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [indices[k], indices[j]] = [indices[j], indices[k]];
    }
    // Bounds are computed once, from the larger near model.
    const mesh = new THREE.InstancedMesh(near, material, indices.length);
    indices.forEach((i, n) => {
      // Stable per tree: brightness, hue (yellow to blue green), width against height.
      const { x, z, random, height, width } = treeAt(i);
      const hue = random(2) * 2 - 1;
      const light = 0.75 + random(0) * 0.25;
      rotation.setFromAxisAngle(up, random(0) * 2 * Math.PI);
      matrix.compose(position.set(x, heightAt(x, z), z), rotation, scale.set(width, height, width));
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, tint.setRGB(light * (1 + 0.14 * hue), light, light * (1 - 0.22 * hue)));
    });
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  });
  return { meshes, near, middle, far, clear };
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

function addWater(shader) {
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
      void main() {`,
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

// One mesh per chunk, named column_row like its ground texture.
function createTerrain({ x0, z0, cell, nx, nz, chunk }) {
  water.waterArea.value.set(x0, z0, (nx - 1) * cell, (nz - 1) * cell);
  const group = new THREE.Group();
  const segments = chunk / cell;
  // A chunk with every step-th height. A coarse one gets a skirt hanging SKIRT metres down from
  // its edges, both ways round, so no gaps show where it meets a finer one.
  const SKIRT = 50;
  function chunkGeometry(ix, iz, step) {
    const n = segments / step;
    const geometry = new THREE.PlaneGeometry(chunk, chunk, n, n);
    geometry.rotateX(-Math.PI / 2); // rows now run north → south, like heights
    geometry.translate(x0 + (ix + 0.5) * chunk, 0, z0 + (iz + 0.5) * chunk);
    const position = geometry.attributes.position;
    for (let row = 0, i = 0; row <= n; row++)
      for (let col = 0; col <= n; col++, i++)
        position.setY(i, heights[(iz * segments + row * step) * nx + ix * segments + col * step]);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    if (step === 1) return geometry;
    const ring = []; // the edge's vertices, once round
    for (let col = 0; col < n; col++) ring.push(col);
    for (let row = 0; row < n; row++) ring.push(row * (n + 1) + n);
    for (let col = n; col > 0; col--) ring.push(n * (n + 1) + col);
    for (let row = n; row > 0; row--) ring.push(row * (n + 1));
    const count = position.count;
    for (const name of ["position", "normal", "uv"]) {
      const { array, itemSize } = geometry.attributes[name];
      const grown = new Float32Array(array.length + ring.length * itemSize);
      grown.set(array);
      ring.forEach((v, k) => {
        for (let j = 0; j < itemSize; j++)
          grown[(count + k) * itemSize + j] =
            array[v * itemSize + j] - (name === "position" && j === 1 ? SKIRT : 0);
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(grown, itemSize));
    }
    const index = [...geometry.index.array];
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length];
      const [c, d] = [count + k, count + ((k + 1) % ring.length)];
      index.push(a, b, c, b, d, c, a, c, b, b, c, d);
    });
    geometry.setIndex(index);
    return geometry;
  }
  for (let iz = 0; iz < (nz - 1) / segments; iz++)
    for (let ix = 0; ix < (nx - 1) / segments; ix++) {
      const fine = chunkGeometry(ix, iz, 1);
      const material = new THREE.MeshLambertMaterial({
        map: ground[groundKind].get(`${ix}_${iz}`),
      });
      material.onBeforeCompile = addWater;
      material.customProgramCacheKey = () => "water"; // all chunks share one program
      const mesh = new THREE.Mesh(fine, material);
      mesh.name = `${ix}_${iz}`;
      mesh.userData.levels = [fine, chunkGeometry(ix, iz, TERRAIN_STEP)]; // for updateTerrain
      group.add(mesh);
    }
  return group;
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
  const { x0, z0, cell, nx, nz } = terrainInfo;
  const edge = (at, d, low, high) => (d > 0 ? (high - at) / d : d < 0 ? (low - at) / d : Infinity);
  return Math.max(
    0,
    Math.min(
      edge(from.x, direction.x, x0, x0 + (nx - 1) * cell),
      edge(from.z, direction.z, z0, z0 + (nz - 1) * cell),
    ),
  );
}

// A scene position moved into the terrain's area, as [x, z].
function intoArea(x, z) {
  const { x0, z0, cell, nx, nz } = terrainInfo;
  const { clamp } = THREE.MathUtils;
  return [clamp(x, x0, x0 + (nx - 1) * cell), clamp(z, z0, z0 + (nz - 1) * cell)];
}

// The terrain's height at a scene position as its mesh has it: each cell's two triangles meet
// along the line from its south-west to its north-east corner.
function heightAt(x, z) {
  const { x0, z0, cell, nx, nz } = terrainInfo;
  const fx = THREE.MathUtils.clamp((x - x0) / cell, 0, nx - 1.001);
  const fz = THREE.MathUtils.clamp((z - z0) / cell, 0, nz - 1.001);
  const tx = fx % 1;
  const tz = fz % 1;
  const i = Math.floor(fz) * nx + Math.floor(fx);
  const ne = heights[i + 1];
  const sw = heights[i + nx];
  if (tx + tz <= 1) return heights[i] + (ne - heights[i]) * tx + (sw - heights[i]) * tz;
  const se = heights[i + nx + 1];
  return se + (sw - se) * (1 - tx) + (ne - se) * (1 - tz);
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
// monster, the UFO, a police car, a motorcycle, the tank, a boat or the drone to ride along; while
// riding, but not steering, a click or tap on another one changes to it. A finger also finds one
// up to FINGER beside it. The button or Esc gets off.
const FINGER = 25; // px
// The UFO from behind and above, looking down on it, its crosshair (its dip) just above its rim.
// The Rega's helicopters from behind and above, each its own ride.
const regaRides = regas.map(({ group, material }) =>
  riders([{ object: group, materials: [material], eye: [0, 5, -20], ahead: [0, -1, 14] }]),
);
const ufoRide = riders([
  { object: ufo.group, materials: [ufo.material], eye: [0, 22, -80], ahead: [0, 0, 30] },
]);
// The jet from behind and a little above, looking over it: below the middle of the screen, above
// the steering buttons, its crosshair (its dip) in the middle, just above its nose.
const jetRide = riders([
  { object: jet.group, materials: [jet.material], eye: [0, 8, -48], ahead: [0, 2.6, 40] },
]);
// What is driven or flown by their own rules, each [vehicles, ride]: the police cars, the
// motorcycles, the tanks, the dinosaur and the boats, from behind and above; the drones through their own
// camera (look).
const drives = [
  [police, [0, 3, -8.5], [0, 1.2, 8]],
  [motorcycles, [0, 2.6, -6], [0, 0.6, 5]],
  [tanks, [0, 5, -16], [0, 2, 14]],
  [dinos, [0, 30, -55], [0, 8, 20]],
  [fireboats, [0, 9, -24], [0, 3, 20]],
  [policeBoats, [0, 4, -14], [0, 1.5, 11]],
  [drones],
].map(([vehicles, eye, ahead]) => {
  const ride = riders(
    vehicles.map(({ group, material }) => ({ object: group, materials: [material], eye, ahead })),
  );
  if (!eye) ride.cab = (v, view) => vehicles[v].look(view);
  return [vehicles, ride];
});
// What one can ride, each with its objects to click, vehicleOf(hit), cab and highlight.
const rides = [
  ...movers,
  ships.ride,
  ...planes.crafts.map(({ ride }) => ride),
  helicopter.ride,
  serpent.ride,
  ufoRide,
  jetRide,
  ...regaRides,
  ...drives.map(([, ride]) => ride),
];
let riding = null; // { ride, vehicle } the camera rides in
let before = null; // { position, target } of the camera before riding
// The helicopter, the UFO, the jet, a Rega helicopter or a plane, each { group, speed, turn, low,
// nose, lift?, unarmed?, launchers? (it fires rockets from them), dip? (radians it fires below its
// body), plane? (it does not hover) }, while riding and so steering it.
const pilots = new Map([
  [helicopter.ride, helicopter],
  [ufoRide, ufo],
  [jetRide, jet],
  ...regaRides.map((ride, k) => [ride, regas[k]]),
  ...planes.crafts.map((craft) => [craft.ride, craft]),
]);
const pilot = () => pilots.get(riding?.ride);
const flying = () => pilot() !== undefined;
// The tank ridden, if any (src/tank.js).
const tankRide = drives.find(([vehicles]) => vehicles === tanks)[1];
const gunner = () => (riding?.ride === tankRide ? tanks[riding.vehicle] : null);
// Whether what is ridden fires (flying or in a tank); then clicks fire instead of riding or
// looking around.
const armed = () => (flying() && !pilot().unarmed) || gunner() !== null;
const droneRide = drives.find(([vehicles]) => vehicles === drones)[1];
// Walking oneself: after the button with the figure, a click or tap on the ground or a bridge
// (not a building or the water) sets one down there, facing as the camera; walked as driven in
// src/drive.js, at most a run, the water a wall; seen from EYE_HEIGHT, looking level ahead.
// Getting off takes one away.
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
let flown = null; // the state of flying it (createFlight)
document.getElementById("off").addEventListener("click", getOff);
addEventListener("keydown", (e) => {
  if (e.code !== "Escape") return;
  if (riding) getOff();
  else if (placing) setPlacing(false);
});
// Steering the helicopters, the UFO or the drone while riding it: W/S or ↑/↓ up and down, A/D or
// ←/→ turn; the buttons at the bottom hold the arrow keys while pressed. Q or the stop button
// stops or goes on. The police cars, motorcycles and the tank are driven with the same keys and
// buttons, without stop (the tank with fire).
const keys = new Set(); // codes of the keys held
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space" && armed()) e.preventDefault(); // fires, presses nothing else
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
function stop(on) {
  stopped = on;
  stopButton.firstChild.data = on ? "Go" : "Stop";
}
stopButton.addEventListener("click", () => stop(!stopped));
addEventListener("keydown", (e) => {
  const hovers = (flying() && !pilot().plane) || riding?.ride === droneRide;
  if (e.code === "KeyQ" && hovers && !e.repeat) stop(!stopped);
});
function steering() {
  const held = (...codes) => (codes.some((code) => keys.has(code)) ? 1 : 0);
  return {
    climb: held("KeyW", "ArrowUp") - held("KeyS", "ArrowDown"),
    turn: held("KeyA", "ArrowLeft") - held("KeyD", "ArrowRight"),
    stop: stopped,
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
  if (armed() && e.pointerType === "mouse" && e.button === 0) keys.add("Mouse");
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
  ufo.fire(target, rockets.meets, (met, at) => {
    if (met === "ground") explosions.burst(at);
    else if (met !== null) destroy(met);
  });
}

const raycaster = new THREE.Raycaster();
// A click or tap that did not drag (5 px with the mouse, 10 px with a finger), except one that
// only stopped the gliding map, copies where a finger was held for HOLD (copyAt; on letting go,
// as browsers allow copying only then), else is recorded while recording (src/points.js), else
// rides what is there; nothing while steering.
let down = { x: 0, y: 0, time: 0 }; // where and when the last button or finger went down
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => (down = { x: e.clientX, y: e.clientY, time: e.timeStamp }),
);
renderer.domElement.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || stoppedGlide || steered()) return;
  const mouse = e.pointerType === "mouse";
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= (mouse ? 5 : 10)) return;
  if (!mouse && e.timeStamp - down.time >= HOLD) return copyAt(e.clientX, e.clientY);
  if (placing) return setDown(e.clientX, e.clientY);
  if (pointsPanel.click(e.clientX, e.clientY)) return;
  const found = vehicleAt(e.clientX, e.clientY, mouse ? 0 : FINGER);
  if (found) ride(found, e.clientX, e.clientY);
});
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
  stopButton.hidden = driving ? found.ride !== droneRide : !!pilots.get(found.ride)?.plane;
  fireButton.hidden = driving ? found.ride !== tankRide : !!pilots.get(found.ride)?.unarmed;
  flown = null; // from where it is
  hover = { x: clientX, y: clientY }; // clears the highlight, as it is the one ridden now
  head.yaw = head.pitch = 0;
}
// Looking around while riding, but not while steering (steered): dragging turns the head, up to PITCH up or
// down and sideways as far as no view ray points behind the camera, so the front of a tram, train
// or car (just behind it) stays out of view; walking, sideways it turns oneself instead.
const PITCH = 0.25; // radians
const head = { yaw: 0, pitch: 0 }; // radians, left and up
let dragged = null; // { x, y } of the primary pointer while dragging
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (riding && !steered() && e.isPrimary) dragged = { x: e.clientX, y: e.clientY };
});
addEventListener("pointermove", (e) => {
  if (!dragged || !e.isPrimary) return;
  // Radians per px, so the scene follows the pointer.
  const turn = THREE.MathUtils.degToRad(camera.fov) / innerHeight;
  const up = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // The widest ray, at a corner pitched by PITCH.
  const wide = Math.atan((up * camera.aspect) / (Math.cos(PITCH) - up * Math.sin(PITCH)));
  const yaw = Math.max(0, Math.PI / 2 - wide);
  const sideways = (e.clientX - dragged.x) * turn;
  if (riding?.ride === footRide) onFoot.state.heading += sideways;
  else head.yaw = THREE.MathUtils.clamp(head.yaw + sideways, -yaw, yaw);
  head.pitch = THREE.MathUtils.clamp(head.pitch + (e.clientY - dragged.y) * turn, -PITCH, PITCH);
  dragged = { x: e.clientX, y: e.clientY };
});
for (const type of ["pointerup", "pointercancel"])
  addEventListener(type, (e) => {
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
  for (const mover of movers) for (const mesh of mover.meshes) mesh.boundingSphere = null; // they moved since computed
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
// Whether the terrain, a building or a bridge is between the camera and a point.
function hidden(point) {
  raycaster.set(camera.position, point.clone().sub(camera.position).normalize());
  raycaster.far = camera.position.distanceTo(point);
  const behind = raycaster.intersectObjects([terrain, buildings.scene, bridges.scene]).length > 0;
  raycaster.far = Infinity;
  return behind;
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
  raycaster.far = hit.distance;
  const hidden = raycaster.intersectObjects([terrain, buildings.scene, bridges.scene]).length > 0;
  raycaster.far = Infinity;
  return hidden ? null : { ride, vehicle };
}

// The vehicle under the mouse (but the one ridden) shows HIGHLIGHT and gets the hand cursor;
// checked at most once per frame, only after the mouse moved, and not while dragging or steering.
let hover = null; // { x, y } of the mouse since the last check
renderer.domElement.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") hover = { x: e.clientX, y: e.clientY };
});
function updateHover() {
  if (!hover) return;
  const found = pointers.size || steered() || placing ? null : vehicleAt(hover.x, hover.y);
  hover = null;
  for (const ride of rides) ride.highlight(found?.ride === ride ? found.vehicle : -1);
  renderer.domElement.style.cursor = placing ? "crosshair" : found ? "pointer" : "";
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
// (degrees, 0 north, 90 east) and the tilt (degrees, 0 straight down), both optional (0). Kept up
// to date while the view changes (at most every VIEW_DELAY ms; not when it did not move, so it
// does not creep by rounding), read at the start and when the URL changes.
const VIEW_DELAY = 300;
// WGS84 <-> scene x, z with swisstopo's approximate formulas for LV95 (about 1 m). The two are not
// each other's inverse (about 1 m apart), so fromWGS84 corrects its result twice to undo toWGS84
// (to a few cm), so a copied point comes back where it was.
function fromWGS84(lat, lon) {
  const formula = (lat, lon) => {
    const p = (lat * 3600 - 169028.66) / 10000;
    const l = (lon * 3600 - 26782.5) / 10000;
    const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
    const n =
      1200147.07 +
      308807.95 * p +
      3745.25 * l * l +
      76.63 * p * p -
      194.56 * l * l * p +
      119.79 * p ** 3;
    return [e - LV95[0], LV95[1] - n];
  };
  const [x0, z0] = formula(lat, lon);
  let [x, z] = [x0, z0];
  for (let k = 0; k < 2; k++) {
    const [x1, z1] = formula(...toWGS84(x, z));
    [x, z] = [x + x0 - x1, z + z0 - z1];
  }
  return [x, z];
}
function toWGS84(x, z) {
  const y = (x + LV95[0] - 2600000) / 1e6;
  const v = (LV95[1] - z - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * v + 0.1306 * y * v * v - 0.0436 * y ** 3;
  const lat =
    16.9023892 +
    3.238272 * v -
    0.270978 * y * y -
    0.002528 * v * v -
    0.0447 * y * y * v -
    0.014 * v ** 3;
  return [(lat * 100) / 36, (lon * 100) / 36];
}
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
let viewWritten = 0; // when the URL was last updated (ms)
function writeView(time) {
  if (riding || time - viewWritten < VIEW_DELAY) return;
  const shown = [...camera.position.toArray(), ...orbit.target.toArray()].join();
  if (shown === viewShown) return;
  [viewShown, viewWritten] = [shown, time];
  const offset = camera.position.clone().sub(orbit.target);
  const r = offset.length();
  const [lat, lon] = toWGS84(orbit.target.x, orbit.target.z);
  const zoom = Math.log2(perZoom(lat) / r);
  const bearing = Math.round(THREE.MathUtils.radToDeg(Math.atan2(-offset.x, offset.z)) + 360) % 360;
  const pitch = Math.round(THREE.MathUtils.radToDeg(Math.acos(offset.y / r)));
  const hash = `#map=${zoom.toFixed(2)}/${lat.toFixed(6)}/${lon.toFixed(6)}/${bearing}/${pitch}`;
  if (hash !== location.hash) history.replaceState(null, "", hash);
}
addEventListener("hashchange", readView);

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

let last = performance.now();
renderer.setAnimationLoop((time) => {
  // The first frame's time can be before last.
  const dt = THREE.MathUtils.clamp((time - last) / 1000, 0, 0.1);
  last = time;
  if (!riding) updateOrbit(dt);
  writeView(time);
  updateHover();
  updateTrees();
  updateTerrain();
  water.waterTime.value = time / 1000;
  pavilionTime.value = time / 1000;
  peopleTime.value = time / 1000;
  walkers.update(dt, riding ? camera.position : orbit.target, camera.position);
  training.update(dt);
  bike.update(dt);
  serpent.update(time / 1000);
  const flier = fly(dt);
  helicopter.update(time / 1000, flier === helicopter ? flown : null);
  jet.update(time / 1000, flier === jet ? flown : null);
  for (const rega of regas) rega.update(time / 1000, flier === rega ? flown : null);
  ufo.update(time / 1000, dt, flier === ufo ? flown : null);
  for (const [vehicles, ride] of drives)
    vehicles.forEach((vehicle, v) =>
      vehicle.update(
        time / 1000,
        dt,
        riding?.ride === ride && riding.vehicle === v ? steering() : null,
      ),
    );
  if (riding?.ride === footRide) onFoot.step(dt, steering());
  drive(dt);
  if (riding?.ride.away?.(riding.vehicle)) getOff();
  ships.update(time / 1000);
  zoo.update(time / 1000);
  explosions.update(dt);
  rockets.update(dt);
  planes.update(time / 1000, flier, flown);
  birds.update(time / 1000);
  if (riding) {
    riding.ride.cab(riding.vehicle, camera); // after all that moves
    turnHead();
  }
  camera.updateMatrixWorld(); // this frame's view for onScreen, not the last one rendered
  shoot(time / 1000);
  updateBadges();
  pointsPanel.update();
  updateNames();
  drawFrame();
});
