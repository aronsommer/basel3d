import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MapControls } from "three/addons/controls/MapControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Scene units are metres: x = east, z = south, y = altitude − 250 m; origin at LV95 E 2611000 / N 1267400.
const EYE = 1.7; // eye height when walking
const WALK_SPEED = 5;
const RUN_SPEED = 20;
const FLING_FRICTION = 3; // per second: how fast the view stops gliding after a drag
const TREE_DETAIL = 300; // metres from a chunk within which its trees get a trunk and a rounder crown
const SKY = 0xbfd8ea;
const MOVER_KINDS = ["tram", "train", "car"]; // public/<kind>s.json, .bin
// Far from the camera, moving things grow so they can be seen from above: from BOOST_FROM metres
// on, linearly up to BOOST_MAX times. Up close they have their real size. Vehicles on tracks and
// ships grow only in width and height, so their lengths and distances stay right; vehicles on
// tracks at most 1.4 times in width (see createMovers).
const BOOST_FROM = 600; // metres
const BOOST_MAX = 3;
const boost = (p) =>
  THREE.MathUtils.clamp(camera.position.distanceTo(p) / BOOST_FROM, 1, BOOST_MAX);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the aerial photo's colours
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 3000, 9000);
// Strong sky light keeps the sides facing away from the sun bright.
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0xb5ab95, 2));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-1, 1, 1); // from the south-west
scene.add(sun);

// Nothing beyond the fog's end is visible anyway.
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, scene.fog.far);
const orbit = new MapControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = 1.45;
orbit.minDistance = 30;
orbit.maxDistance = 9000;
const walk = new PointerLockControls(camera, renderer.domElement);

const pointers = new Set(); // pressed mouse buttons and fingers
const fling = new THREE.Vector3(); // metres per second the view keeps gliding after a drag
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => {
    // Alt + left drag rotates (MapControls already does this for Cmd, Ctrl and Shift).
    orbit.mouseButtons.LEFT = e.altKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    pointers.add(e.pointerId);
    fling.set(0, 0, 0);
  },
  { capture: true },
);
for (const type of ["pointerup", "pointercancel"])
  addEventListener(type, (e) => pointers.delete(e.pointerId));

// Loads files from public/; show(percent) gets the exact share of their decompressed bytes,
// measured against the sizes in public/size.json (tools/size.mjs).
const sizes = await fetch("public/size.json").then((r) => r.json());
function load(paths, show) {
  const total = paths.reduce((sum, path) => sum + sizes[path], 0);
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
      return new Response((await fetch(`public/${path}`)).body.pipeThrough(counter)).arrayBuffer();
    }),
  );
}

// Ground textures in public/ground/<kind>/, one per 1 km tile named column_row: "map" from
// OpenStreetMap (tools/map.mjs), "photo" from SWISSIMAGE (tools/terrain.mjs).
const GROUND_LABELS = { map: "Karte", photo: "Luftbild" };
const groundPaths = (kind) =>
  Object.keys(sizes).filter((path) => path.startsWith(`ground/${kind}/`));
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
// (tools/terrain.mjs), the trees (tools/trees.mjs), the water mask (tools/map.mjs) and the ground
// shown first.
let groundKind = "photo";
const progress = document.getElementById("progress");
const [
  terrainJson,
  heightsBuffer,
  glb,
  bridgesGlb,
  treesBuffer,
  waterBuffer,
  shipsBuffer,
  ...rest
] = await load(
  [
    "terrain/terrain.json",
    "terrain/heights.bin",
    "basel.glb",
    "bridges.glb",
    "trees.bin",
    "water.ktx2",
    "ships.bin",
    ...MOVER_KINDS.flatMap((kind) => [`${kind}s.json`, `${kind}s.bin`]),
    ...groundPaths(groundKind),
  ],
  (percent) => (progress.textContent = `${percent} %`),
);
const moverFiles = rest.slice(0, MOVER_KINDS.length * 2);
const groundBuffers = rest.slice(MOVER_KINDS.length * 2);
const terrainInfo = JSON.parse(new TextDecoder().decode(terrainJson));
const heights = Float32Array.from(new Int16Array(heightsBuffer), (cm) => cm / 100);
const treePositions = new Float32Array(treesBuffer);
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const [buildings, bridges, waterMask, firstGround] = await Promise.all([
  gltfLoader.parseAsync(glb, ""),
  gltfLoader.parseAsync(bridgesGlb, ""),
  new Promise((resolve, reject) => ktx2.parse(waterBuffer, resolve, reject)),
  groundTextures(groundPaths(groundKind), groundBuffers),
]);
const ground = { [groundKind]: firstGround }; // textures by tile name, per kind once loaded

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
    color: 0xa0523f,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  wall: new THREE.MeshLambertMaterial({
    color: 0xe8dcc4,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  bridge: new THREE.MeshLambertMaterial({
    color: 0xc8c3ba,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
};
for (const { scene: model } of [buildings, bridges]) {
  model.traverse((o) => {
    if (o.isMesh) o.material = materials[o.material.name];
  });
  scene.add(model);
}

const terrain = createTerrain(terrainInfo);
scene.add(terrain);

// The button switches the ground between map and aerial photo, loading each on first use. Only
// the shown textures stay in GPU memory; the others are re-uploaded when shown again.
const groundButton = document.getElementById("ground");
groundButton.addEventListener("click", async () => {
  const kind = otherGround();
  if (!ground[kind]) {
    groundButton.disabled = true;
    const paths = groundPaths(kind);
    const buffers = await load(paths, (percent) => (groundButton.textContent = `${percent} %`));
    ground[kind] = await groundTextures(paths, buffers);
    groundButton.disabled = false;
  }
  for (const texture of ground[groundKind].values()) texture.dispose();
  groundKind = kind;
  for (const mesh of terrain.children) mesh.material.map = ground[kind].get(mesh.name);
  groundButton.textContent = GROUND_LABELS[otherGround()];
});
groundButton.textContent = GROUND_LABELS[otherGround()];
function otherGround() {
  return groundKind === "map" ? "photo" : "map";
}
const tree = createTrees(treePositions);
scene.add(...tree.meshes);
// In the Rhine in front of the Roche towers, its head as high as the taller one (205 m), looking
// at the middle between the two towers.
const serpent = createSerpent(1717, 68, 8.5, 1739, -196);
scene.add(serpent.group);
// Circling over the monster and the Roche towers (around the point between them), six times life
// size. At 300 m ± 25 m its lowest point (about 12 m below its centre when banking) stays 40 m
// above the monster's horns (221 m) and 50 m above the taller tower (213 m).
const helicopter = createHelicopter(1728, -64, 150, 300, 6);
scene.add(helicopter.group);
// Trams, trains and cars on their paths (tools/paths.mjs, createMovers).
const movers = MOVER_KINDS.map((kind, i) =>
  createMovers(
    JSON.parse(new TextDecoder().decode(moverFiles[2 * i])),
    new Float32Array(moverFiles[2 * i + 1]),
    kind,
  ),
);
for (const mover of movers) scene.add(mover.mesh, mover.routes);
const ships = createShips(new Float32Array(shipsBuffer));
scene.add(...ships.meshes);
const planes = createPlanes();
scene.add(...planes.meshes);
const birds = createBirds();
scene.add(birds.mesh);

// Two airliners circling over the city on an oval, one higher and the other way round, so they
// are always in view. 1.5 times life size (and more far away, see boost), white with a blue tail,
// no airline.
function createPlanes() {
  const SPEED = 80; // metres per second
  const SCALE = 1.5;
  const part = (geometry, color, [x, y, z]) => {
    const g = geometry.toNonIndexed();
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  };
  // Along +z, in metres: fuselage, nose, wings, tailplane, fin, engines.
  const WHITE = 0xf2f2f0;
  const fuselage = new THREE.CylinderGeometry(2, 2, 30, 8).rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(2, 5, 8).rotateX(Math.PI / 2);
  const tailCone = new THREE.ConeGeometry(2, 6, 8).rotateX(-Math.PI / 2);
  const geometry = mergeGeometries([
    part(fuselage, WHITE, [0, 0, 0]),
    part(nose, WHITE, [0, 0, 17.5]),
    part(tailCone, WHITE, [0, 0, -18]),
    part(new THREE.BoxGeometry(34, 0.5, 5), WHITE, [0, -0.8, 1]), // wings
    part(new THREE.BoxGeometry(12, 0.4, 3), WHITE, [0, 0.5, -17]), // tailplane
    part(new THREE.BoxGeometry(0.5, 7, 4), 0x1f4e9a, [0, 4, -18]), // fin
    ...[-6, 6].map((x) =>
      part(new THREE.CylinderGeometry(1, 1, 4, 8).rotateX(Math.PI / 2), 0x9aa0a6, [x, -2, 3]),
    ),
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
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.order = "YXZ"; // heading, then bank in the plane's frame
    return { ...flight, mesh };
  });
  const update = (seconds) => {
    for (const { mesh, height, direction } of flights) {
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
      mesh.rotation.z = 0.3 * direction; // banking into the turn
      mesh.scale.setScalar(boost(mesh.position));
    }
  };
  return { meshes: flights.map((f) => f.mesh), update };
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
// L shows the tram and train routes as coloured lines above the tracks, to check them.
addEventListener("keydown", (e) => {
  if (e.code === "KeyL") for (const mover of movers) mover.routes.visible = !mover.routes.visible;
});

// Ships on their round course on the Rhine (tools/ships.mjs), which keeps clear of the bridge
// piers and the sea monster: SHIPS tankers, container ships, passenger ships and speedboats in
// turn, evenly spaced and all at the same speed, so they never meet. Each is at most 11 m wide (the
// course keeps 10 m clear around its middle) and 6 m high, to pass under the bridges.
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
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const types = [
    { geometry: mergeGeometries(tanker), length: 90 },
    { geometry: mergeGeometries(container), length: 70 },
    { geometry: mergeGeometries(passenger), length: 50 },
    { geometry: mergeGeometries(speedboat), length: 11 },
  ];
  // Each ship a little different: its colours tinted by one of these.
  const tints = [0xffffff, 0xcfe0ff, 0xffe2c4, 0xd6f5d0, 0xffd2d2, 0xe6d6ff, 0xfff3b0];
  const fleet = [...Array(SHIPS)].map((_, i) => {
    const { geometry, length } = types[i % types.length];
    const tinted = material.clone();
    tinted.color.set(tints[(i * 3) % tints.length]);
    const mesh = new THREE.Mesh(geometry, tinted);
    mesh.matrixAutoUpdate = false; // placed by update()
    return { mesh, length, start: (total * i) / SHIPS }; // evenly spaced on the course
  });

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
  };
  return { meshes: fleet.map((ship) => ship.mesh), update };
}

// What moves along paths (tools/paths.mjs): trams, trains and cars, all called vehicles below.
// A vehicle has CARS cars (one for road vehicles); each car follows the path on its
// own, so long vehicles bend in curves. Its variant (say a goods train or a lorry) sets the length,
// height and colour of its cars. All cars of a kind are instances of one box, in one draw call.
// Also returns the paths as lines in their line's colour (white for roads), hidden at first.
// A vehicle waits while a car of another one is on its own path just ahead: within ALONG of any
// point every ALONG up to LOOK ahead and at most SIDE beside it, so nothing that joins its path
// (at a switch or crossing) is missed.
// Those on the parallel way of the other direction pass; those ahead, at crossings and at the
// start of the path block. Vehicles start SPACING apart on a path.
function createMovers({ step, routes }, points, kind) {
  const pick = (r, list) => list[Math.floor(r * list.length) % list.length];
  const KINDS = {
    tram: {
      CARS: 4,
      GAP: 0.6, // metres between cars
      WIDTH: 2.3, // metres
      SPACING: 500, // metres
      SPEED: 10, // metres per second
      LOOK: 25, // metres
      ALONG: 8, // metres; at least half the distance between a car's front, centre and back
      SIDE: 2, // metres; less than the distance to the track of the other direction (3.5 m)
      EYE: 2.4, // metres above the path, when riding
      BAND: 0x1f2a30, // window band
      variant: ({ operator }) => ({
        length: 8,
        height: 3,
        color: operator === "BLT" ? 0xf2c400 : 0x2e8b3a, // BLT yellow, BVB green
      }),
    },
    train: {
      CARS: 5,
      GAP: 1,
      WIDTH: 3,
      SPACING: 5000,
      SPEED: 22,
      LOOK: 60,
      ALONG: 15,
      SIDE: 2, // tracks of the other direction are about 4.5 m away
      EYE: 2.6,
      BAND: 0xc8102e, // red
      // White passenger trains, a quarter goods trains in rust, grey, green or blue.
      variant: (_, r) =>
        r < 0.25
          ? {
              length: 20,
              height: 3.6,
              color: pick(r * 4, [0x8a4b2a, 0x6b6f75, 0x3f6b47, 0x2f4f7f]),
            }
          : { length: 25, height: 4, color: 0xf2f2f0 },
    },
    car: {
      CARS: 1,
      GAP: 0,
      WIDTH: 1.8,
      SPACING: 100,
      SPEED: 12,
      LOOK: 9,
      ALONG: 2.5,
      SIDE: 1.2, // the lane of the other direction is 3.6 m away
      EYE: 1.2,
      BAND: 0x1f2a30,
      // Cars in strong colours so they can be seen, some lorries.
      variant: (_, r) =>
        r < 0.15
          ? {
              length: 10,
              height: 3.2,
              color: pick(r / 0.15, [0xf2f2f0, 0x2f6db5, 0xc8102e, 0xe0b52b]),
            }
          : {
              length: 4.4,
              height: 1.5,
              color: pick(
                r,
                [0xe32b2b, 0x2f6db5, 0xf2c400, 0x3b9c4a, 0xf28c28, 0x18a5b5, 0xd6408f, 0xf2f2f0],
              ),
            },
    },
  };
  const { CARS, GAP, WIDTH, SPACING, SPEED, LOOK, ALONG, SIDE, EYE, BAND, variant } = KINDS[kind];
  // Far away the cars grow higher, but at most this much wider, so that cars on neighbouring tracks
  // and lanes never overlap.
  const MAX_WIDER = 1.4;
  const CELL = 20; // metres of the grids of car points
  const cell = (x, z) => (Math.floor(x / CELL) + 1000) * 4096 + Math.floor(z / CELL) + 1000;

  // A car of length and height 1 along +z, from 0.1 to 1.1 above the path (scaled per car):
  // white (tinted per vehicle), a window band in the third of four rows, a light roof.
  const box = new THREE.BoxGeometry(WIDTH, 1, 1, 1, 4, 1).toNonIndexed();
  box.translate(0, 0.6, 0);
  const position = box.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 3) {
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    color.set(y > 1.05 ? 0xdadcd6 : y > 0.6 && y < 0.85 ? BAND : 0xffffff);
    for (let k = 0; k < 3; k++) color.toArray(colors, 3 * (i + k));
  }
  box.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  box.deleteAttribute("normal");
  box.deleteAttribute("uv");

  const lines = routes.map(({ start, count, colour, operator }) => ({
    start,
    count,
    operator,
    length: (count - 1) * step,
    color: new THREE.Color(colour ?? 0xffffff), // of the line, for the path lines
  }));
  function at(line, d, out) {
    const f = Math.min(d / step, line.count - 1.001);
    const i = line.start + Math.floor(f);
    const t = f - Math.floor(f);
    return out.set(
      points[3 * i] + (points[3 * i + 3] - points[3 * i]) * t,
      points[3 * i + 1] + (points[3 * i + 4] - points[3 * i + 1]) * t,
      points[3 * i + 2] + (points[3 * i + 5] - points[3 * i + 2]) * t,
    );
  }

  // Vehicles start SPACING apart on each path, fully on it; d is how far each one's front is along
  // it. Where paths share a way, one that would start on or right behind another is left out.
  const random = (i) => (Math.abs(Math.sin(i * 12.9898 + 78.233)) * 43758.5453) % 1;
  const taken = new Map(); // cell -> flat [x, z, …] of the starting vehicles and the space ahead
  const spot = new THREE.Vector3();
  const vehicles = [];
  for (const line of lines)
    for (let k = 0; ; k++) {
      const { length, height, color } = variant(line, random(vehicles.length + k * 7919));
      const total = CARS * (length + GAP);
      const d = total + k * SPACING;
      if (d > line.length) break;
      const body = [];
      for (let s = d - total; s <= Math.min(d + LOOK, line.length); s += Math.min(2, length)) {
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
      vehicles.push({ line, d, length, height, color: new THREE.Color(color) });
      for (let b = 0; b < body.length; b += 2) {
        const key = cell(body[b], body[b + 1]);
        if (!taken.has(key)) taken.set(key, []);
        taken.get(key).push(body[b], body[b + 1]);
      }
    }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.InstancedMesh(box, material, vehicles.length * CARS);
  mesh.frustumCulled = false; // the vehicles move all over the city
  vehicles.forEach((vehicle, v) => {
    for (let c = 0; c < CARS; c++) mesh.setColorAt(v * CARS + c, vehicle.color);
  });

  // The paths 3 m above the ground, one line segment per pair of points.
  const vertices = [];
  const vertexColors = [];
  for (const line of lines)
    for (let i = line.start; i < line.start + line.count - 1; i++)
      for (const j of [i, i + 1]) {
        vertices.push(points[3 * j], points[3 * j + 1] + 3, points[3 * j + 2]);
        vertexColors.push(line.color.r, line.color.g, line.color.b);
      }
  const routeGeometry = new THREE.BufferGeometry();
  routeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  routeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
  const routeLines = new THREE.LineSegments(
    routeGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true }),
  );
  routeLines.visible = false;

  const [front, back, forward, right, up, ahead, behind] = [...Array(7)].map(
    () => new THREE.Vector3(),
  );
  const yAxis = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  const cars = new Map(); // cell -> flat [x, z, vehicle, …] of each car's front, centre and back
  const note = (p, v) => {
    const key = cell(p.x, p.z);
    if (!cars.has(key)) cars.set(key, []);
    cars.get(key).push(p.x, p.z, v);
  };
  const occupied = (line, d, self) => {
    at(line, Math.min(d, line.length), ahead);
    at(line, Math.max(Math.min(d, line.length) - 1, 0), behind);
    const length = Math.hypot(ahead.x - behind.x, ahead.z - behind.z) || 1;
    const [fx, fz] = [(ahead.x - behind.x) / length, (ahead.z - behind.z) / length];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const list = cars.get(cell(ahead.x + i * CELL, ahead.z + j * CELL)) ?? [];
        for (let q = 0; q < list.length; q += 3) {
          const [dx, dz] = [list[q] - ahead.x, list[q + 1] - ahead.z];
          if (
            list[q + 2] !== self &&
            Math.abs(dx * fx + dz * fz) < ALONG &&
            Math.abs(dx * fz - dz * fx) < SIDE
          )
            return list[q + 2];
        }
      }
    return -1;
  };
  // Vehicles far from the camera look ahead only every SLOW-th frame (each on its own frame) and
  // move on their last result in between; from afar nobody sees the difference.
  const FAR = 1500; // metres
  const SLOW = 3;
  let frame = 0;
  const blockers = new Int32Array(vehicles.length).fill(-1);
  const update = (dt) => {
    frame++;
    // Place the cars and note their points.
    for (const list of cars.values()) list.length = 0;
    vehicles.forEach(({ line, d, length, height }, v) => {
      for (let c = 0; c < CARS; c++) {
        const end = d - c * (length + GAP);
        if (end - length < 0) {
          mesh.setMatrixAt(v * CARS + c, hidden); // not yet on the path at its start
          continue;
        }
        at(line, end, front);
        at(line, end - length, back);
        forward.subVectors(front, back).normalize();
        right.crossVectors(yAxis, forward).normalize();
        up.crossVectors(forward, right);
        note(front, v);
        note(back, v);
        const centre = front.add(back).multiplyScalar(0.5);
        if (c === 0) vehicles[v].far = camera.position.distanceTo(centre) > FAR;
        note(centre, v);
        const b = boost(centre);
        right.multiplyScalar(Math.min(b, MAX_WIDER));
        matrix
          .makeBasis(right, up.multiplyScalar(b * height), forward.multiplyScalar(length))
          .setPosition(centre);
        mesh.setMatrixAt(v * CARS + c, matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;

    // Move every vehicle whose way is clear; of two blocking each other, the first one goes.
    vehicles.forEach(({ line, d, far }, v) => {
      if (far && (v + frame) % SLOW) return;
      blockers[v] = -1;
      for (let s = ALONG; s <= LOOK && blockers[v] < 0; s += ALONG)
        blockers[v] = occupied(line, d + s, v);
    });
    vehicles.forEach((vehicle, v) => {
      const b = blockers[v];
      if (b >= 0 && !(blockers[b] === v && v < b)) return;
      if (vehicle.d < vehicle.line.length)
        vehicle.d = Math.min(vehicle.d + SPEED * dt, vehicle.line.length);
      else if (occupied(vehicle.line, LOOK, v) < 0) vehicle.d = 0; // back to the start
    });
  };
  // The front of vehicle v: the camera just ahead of it at eye height, looking 40 m ahead.
  const cab = (v, view) => {
    const { line, d } = vehicles[v];
    at(line, d + 0.5, front);
    at(line, d + 40, ahead);
    view.position.set(front.x, front.y + EYE, front.z);
    view.lookAt(ahead.x, ahead.y + EYE * 0.8, ahead.z);
  };
  const vehicleOf = (instanceId) => Math.floor(instanceId / CARS);
  return { mesh, routes: routeLines, update, cab, vehicleOf };
}

// A low-poly helicopter circling (cx, cz) at the given radius and height (scene metres), banking
// into the turn, with spinning rotors and blinking lights. Bright yellow, to stand out against the
// sky as well as the red roofs.
function createHelicopter(cx, cz, radius, height, scale) {
  // A part at [x, y, z], coloured by a colour or by a function of its own (untranslated) position.
  const part = (geometry, color, [x, y, z]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const position = g.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const c = typeof color === "function" ? color(position.getY(i), position.getZ(i)) : color;
      new THREE.Color(c).toArray(colors, 3 * i);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.translate(x, y, z);
    return g;
  };
  const YELLOW = 0xffd000;
  const DARK = 0x2a3038;
  // Fuselage, nose towards +z; sizes in metres before scaling.
  const cabin = new THREE.IcosahedronGeometry(1, 1);
  cabin.scale(1.3, 1.2, 2.2);
  const windows = new THREE.IcosahedronGeometry(1, 1);
  windows.scale(1.05, 0.8, 1.2);
  const boom = new THREE.CylinderGeometry(0.25, 0.45, 5, 6);
  boom.rotateX(Math.PI / 2);
  const fin = new THREE.BoxGeometry(0.15, 1.6, 0.9);
  const skids = [-1, 1].map((side) => {
    const skid = new THREE.BoxGeometry(0.15, 0.15, 3.6);
    return part(skid, DARK, [side * 1.1, -1.5, 0.2]);
  });
  const struts = [-1, 1].flatMap((side) =>
    [-0.8, 1.0].map((z) => part(new THREE.BoxGeometry(0.1, 0.6, 0.1), DARK, [side * 1.0, -1.2, z])),
  );
  const mast = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 5);
  const body = mergeGeometries([
    part(cabin, (y) => (y < -0.7 ? DARK : YELLOW), [0, 0, 0]), // dark belly
    part(windows, DARK, [0, 0.25, 1.2]),
    part(boom, YELLOW, [0, 0.3, -3.6]),
    part(fin, DARK, [0, 0.9, -5.8]),
    part(mast, DARK, [0, 1.45, 0]),
    ...skids,
    ...struts,
  ]);
  const rotor = mergeGeometries(
    [0, Math.PI / 2].map((angle) => {
      const blade = new THREE.BoxGeometry(9, 0.08, 0.35);
      blade.rotateY(angle);
      return part(blade, DARK, [0, 0, 0]);
    }),
  );
  const tailRotor = part(new THREE.BoxGeometry(0.06, 1.8, 0.2), DARK, [0, 0, 0]);

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  const main = new THREE.Mesh(rotor, material);
  main.position.set(0, 1.8, 0);
  const tail = new THREE.Mesh(tailRotor, material);
  tail.position.set(0.25, 0.9, -5.8);
  // Blinking lights: a red beacon on top, a white strobe at the tail; unlit, so they glow.
  const light = (color, [x, y, z]) => {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  };
  const beacon = light(0xff2010, [0, 1.25, -1.2]);
  const strobe = light(0xffffff, [0, 1.75, -6.1]);
  group.add(new THREE.Mesh(body, material), main, tail, beacon, strobe);
  group.scale.setScalar(scale);
  group.rotation.order = "YXZ"; // heading first, then pitch and bank in the helicopter's frame

  const update = (seconds) => {
    const angle = seconds * 0.5; // about 13 s per round
    const y = height + 25 * Math.sin(seconds * 0.35); // gently up and down, ±25 m
    group.position.set(cx + radius * Math.cos(angle), y, cz + radius * Math.sin(angle));
    group.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle)); // along the circle
    group.rotation.x = 0.12; // nose down, flying forward
    group.rotation.z = 0.5; // banking towards the centre
    main.rotation.y = seconds * 25;
    tail.rotation.x = seconds * 40;
    beacon.visible = seconds % 1 < 0.15; // once a second
    strobe.visible = seconds % 1.5 < 0.06 || (seconds % 1.5 > 0.18 && seconds % 1.5 < 0.24); // double flash
  };
  return { group, update };
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

  const ease = THREE.MathUtils.smoothstep;
  const update = (seconds) => {
    time.value = seconds;
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
  return { group, update };
}

// Trees as instanced low-poly models (1 unit tall) with varied size and colour, one mesh per
// terrain chunk so they are frustum-culled. Near the camera a chunk gets a trunk and an
// icosahedron crown, further away only an octahedron crown.
function createTrees(positions) {
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
  const crown = new THREE.IcosahedronGeometry(0.33);
  crown.translate(0, 0.67, 0);
  const simpleCrown = new THREE.OctahedronGeometry(0.33);
  simpleCrown.translate(0, 0.67, 0);
  const near = mergeGeometries([colored(trunk, 0x6b5a45), colored(crown, 0x5d7f3e)]);
  const far = colored(simpleCrown, 0x5d7f3e);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // Tree indices per chunk.
  const { x0, z0, chunk } = terrainInfo;
  const chunks = new Map();
  for (let i = 0; i < positions.length / 2; i++) {
    const ix = Math.floor((positions[2 * i] - x0) / chunk);
    const iz = Math.floor((positions[2 * i + 1] - z0) / chunk);
    const key = `${ix}_${iz}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(i);
  }

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const meshes = [...chunks.values()].map((indices) => {
    // Bounds are computed once, from the larger near model.
    const mesh = new THREE.InstancedMesh(near, material, indices.length);
    indices.forEach((i, n) => {
      const [x, z] = [positions[2 * i], positions[2 * i + 1]];
      const random = (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 1; // stable per tree
      const height = 8 + random * 10;
      rotation.setFromAxisAngle(up, random * 2 * Math.PI);
      matrix.compose(position.set(x, heightAt(x, z), z), rotation, scale.setScalar(height));
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, tint.setScalar(0.75 + random * 0.25));
    });
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  });
  return { meshes, near, far };
}

// Detailed trees only near the camera.
function updateTrees() {
  for (const mesh of tree.meshes)
    mesh.geometry =
      mesh.boundingBox.distanceToPoint(camera.position) < TREE_DETAIL ? tree.near : tree.far;
}

function addWater(shader) {
  Object.assign(shader.uniforms, water);
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
      varying vec3 vWorld;
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

// One mesh per chunk, named column_row like its ground texture.
function createTerrain({ x0, z0, cell, nx, nz, chunk }) {
  water.waterArea.value.set(x0, z0, (nx - 1) * cell, (nz - 1) * cell);
  const group = new THREE.Group();
  const segments = chunk / cell;
  for (let iz = 0; iz < (nz - 1) / segments; iz++)
    for (let ix = 0; ix < (nx - 1) / segments; ix++) {
      const geometry = new THREE.PlaneGeometry(chunk, chunk, segments, segments);
      geometry.rotateX(-Math.PI / 2); // rows now run north → south, like heights
      geometry.translate(x0 + (ix + 0.5) * chunk, 0, z0 + (iz + 0.5) * chunk);
      const position = geometry.attributes.position;
      for (let row = 0, i = 0; row <= segments; row++)
        for (let col = 0; col <= segments; col++, i++)
          position.setY(i, heights[(iz * segments + row) * nx + ix * segments + col]);
      geometry.computeVertexNormals();
      const material = new THREE.MeshLambertMaterial({
        map: ground[groundKind].get(`${ix}_${iz}`),
      });
      material.onBeforeCompile = addWater;
      material.customProgramCacheKey = () => "water"; // all chunks share one program
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${ix}_${iz}`;
      group.add(mesh);
    }
  return group;
}

// Bilinear terrain height at a scene position.
function heightAt(x, z) {
  const { x0, z0, cell, nx, nz } = terrainInfo;
  const fx = THREE.MathUtils.clamp((x - x0) / cell, 0, nx - 1.001);
  const fz = THREE.MathUtils.clamp((z - z0) / cell, 0, nz - 1.001);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * nx + ix;
  return (
    (heights[i] * (1 - tx) + heights[i + 1] * tx) * (1 - tz) +
    (heights[i + nx] * (1 - tx) + heights[i + nx + 1] * tx) * tz
  );
}

// --- Walk mode: double-click the ground, then pointer lock, WASD, feet on the ground.
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

let walkStart = null; // where to stand once the browser grants pointer lock

walk.addEventListener("lock", () => {
  const { x, z } = walkStart;
  const view = orbit.target.clone().sub(camera.position);
  camera.position.set(x, heightAt(x, z) + EYE, z);
  camera.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(-view.x, -view.z), 0, "YXZ"));
  orbit.enabled = false;
  camera.near = 0.3;
  camera.updateProjectionMatrix();
  document.body.dataset.mode = "walk";
});

// Back from walking or riding to the overview, looking at where the camera was.
function backToOverview() {
  const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  orbit.target.copy(camera.position);
  camera.position.addScaledVector(forward, -150).setY(camera.position.y + 120);
  camera.near = 1;
  camera.updateProjectionMatrix();
  orbit.enabled = true;
  document.body.dataset.mode = "orbit";
}
// Leaving pointer lock (Esc) ends walking.
walk.addEventListener("unlock", backToOverview);

// --- Riding: double-click a tram, train or car to ride along, Esc to get off.
let riding = null; // { mover, vehicle } the camera rides in
addEventListener("keydown", (e) => {
  if (e.code !== "Escape" || !riding) return;
  riding = null;
  backToOverview();
});

const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener("dblclick", (e) => {
  if (walk.isLocked || riding) return;
  const pointer = new THREE.Vector2(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  for (const mover of movers) mover.mesh.boundingSphere = null; // they moved since computed
  const vehicle = raycaster.intersectObjects(movers.map((mover) => mover.mesh))[0];
  if (vehicle) {
    const mover = movers.find((m) => m.mesh === vehicle.object);
    riding = { mover, vehicle: mover.vehicleOf(vehicle.instanceId) };
    orbit.enabled = false;
    camera.near = 0.3;
    camera.updateProjectionMatrix();
    document.body.dataset.mode = "ride";
    return;
  }
  const hit = raycaster.intersectObject(terrain)[0];
  if (!hit) return;
  walkStart = { x: hit.point.x, z: hit.point.z };
  walk.lock();
});

function updateWalk(dt) {
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN_SPEED : WALK_SPEED;
  const forward =
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
    Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const right =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  walk.moveForward(forward * speed * dt);
  walk.moveRight(right * speed * dt);
  camera.position.y = heightAt(camera.position.x, camera.position.z) + EYE;
}

// While dragging, measure how fast the view moves; after letting go, keep gliding and slow down.
const lastTarget = new THREE.Vector3();
const velocity = new THREE.Vector3();
function updateOrbit(dt) {
  if (!pointers.size) {
    orbit.target.addScaledVector(fling, dt);
    camera.position.addScaledVector(fling, dt);
    fling.multiplyScalar(Math.exp(-FLING_FRICTION * dt));
  }
  orbit.update();
  if (pointers.size && dt > 0)
    fling.lerp(velocity.subVectors(orbit.target, lastTarget).divideScalar(dt), 0.5);
  lastTarget.copy(orbit.target);
  camera.position.y = Math.max(
    camera.position.y,
    heightAt(camera.position.x, camera.position.z) + 10,
  );
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Start above the city, looking at the Münster.
orbit.target.set(537, heightAt(537, 99) + 30, 99);
camera.position.copy(orbit.target).add(new THREE.Vector3(-1500, 1400, 2200));
document.body.dataset.mode = "orbit";

let last = performance.now();
renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  if (walk.isLocked) updateWalk(dt);
  else if (!riding) updateOrbit(dt);
  updateTrees();
  water.waterTime.value = time / 1000;
  serpent.update(time / 1000);
  helicopter.update(time / 1000);
  for (const mover of movers) mover.update(dt);
  if (riding) riding.mover.cab(riding.vehicle, camera);
  ships.update(time / 1000);
  planes.update(time / 1000);
  birds.update(time / 1000);
  renderer.render(scene, camera);
});
