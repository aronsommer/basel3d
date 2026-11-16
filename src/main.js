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

// Load the buildings (tools/buildings.mjs), the terrain (tools/terrain.mjs) and the trees
// (tools/trees.mjs). Every file in public/ is loaded once, so counting the decompressed bytes
// against their total in public/size.json (tools/size.mjs) gives the exact percentage.
const progress = document.getElementById("progress");
const total = await fetch("public/size.json").then((r) => r.json());
let loaded = 0;
const load = async (path) => {
  const counter = new TransformStream({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      progress.textContent = `${Math.min(Math.floor((loaded / total) * 100), 100)} %`;
      controller.enqueue(chunk);
    },
  });
  return new Response((await fetch(`public/${path}`)).body.pipeThrough(counter)).arrayBuffer();
};

const terrainInfo = JSON.parse(new TextDecoder().decode(await load("terrain/terrain.json")));
const columns = (terrainInfo.nx - 1) / (terrainInfo.chunk / terrainInfo.cell);
const rows = (terrainInfo.nz - 1) / (terrainInfo.chunk / terrainInfo.cell);
const ktx2 = new KTX2Loader()
  .setTranscoderPath(import.meta.resolve("three/addons/libs/basis/"))
  .detectSupport(renderer);
const [gltf, heights, treePositions, maps] = await Promise.all([
  load("basel.glb").then((b) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b, ""),
  ),
  load("terrain/heights.bin").then((b) => Float32Array.from(new Int16Array(b), (cm) => cm / 100)),
  load("trees.bin").then((b) => new Float32Array(b)),
  // Aerial photos in row order from the north-west, named column_row.
  Promise.all(
    Array.from({ length: columns * rows }, (_, i) =>
      load(`terrain/${i % columns}_${Math.floor(i / columns)}.ktx2`).then(
        (b) => new Promise((resolve, reject) => ktx2.parse(b, resolve, reject)),
      ),
    ),
  ),
]);

// The GLB has no normals; flat shading derives them per pixel.
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
};
gltf.scene.traverse((o) => {
  if (o.isMesh) o.material = materials[o.material.name];
});
scene.add(gltf.scene);

const terrain = createTerrain(terrainInfo);
scene.add(terrain);
const tree = createTrees(treePositions);
scene.add(...tree.meshes);

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

// One mesh per chunk, textured with that chunk's aerial photo.
function createTerrain({ x0, z0, cell, nx, chunk }) {
  const group = new THREE.Group();
  const segments = chunk / cell;
  for (let iz = 0; iz < rows; iz++)
    for (let ix = 0; ix < columns; ix++) {
      const geometry = new THREE.PlaneGeometry(chunk, chunk, segments, segments);
      geometry.rotateX(-Math.PI / 2); // rows now run north → south, like heights
      geometry.translate(x0 + (ix + 0.5) * chunk, 0, z0 + (iz + 0.5) * chunk);
      const position = geometry.attributes.position;
      for (let row = 0, i = 0; row <= segments; row++)
        for (let col = 0; col <= segments; col++, i++)
          position.setY(i, heights[(iz * segments + row) * nx + ix * segments + col]);
      geometry.computeVertexNormals();
      const map = maps[iz * columns + ix];
      map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map })));
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

// Leaving pointer lock (Esc) returns to the overview, looking at where you stood.
walk.addEventListener("unlock", () => {
  const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  orbit.target.copy(camera.position);
  camera.position.addScaledVector(forward, -150).setY(camera.position.y + 120);
  camera.near = 1;
  camera.updateProjectionMatrix();
  orbit.enabled = true;
  document.body.dataset.mode = "orbit";
});

const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener("dblclick", (e) => {
  if (walk.isLocked) return;
  const pointer = new THREE.Vector2(
    (e.clientX / innerWidth) * 2 - 1,
    -(e.clientY / innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
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
  else updateOrbit(dt);
  updateTrees();
  renderer.render(scene, camera);
});
