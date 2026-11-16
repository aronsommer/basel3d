import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MapControls } from "three/addons/controls/MapControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Scene units are metres: x = east, z = south, y = altitude − 250 m; origin at LV95 E 2611000 / N 1267400.
const EYE = 1.7; // eye height when walking
const WALK_SPEED = 5;
const RUN_SPEED = 20;
const SKY = 0xbfd8ea;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the aerial photo's colours
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 3000, 9000);
scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x8a8170, 1.5));
const sun = new THREE.DirectionalLight(0xfff4e0, 3);
sun.position.set(-1, 1, 1); // from the south-west
scene.add(sun);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 20000);
const orbit = new MapControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = 1.45;
orbit.minDistance = 30;
orbit.maxDistance = 9000;
const walk = new PointerLockControls(camera, renderer.domElement);

// Alt + left drag rotates (MapControls already does this for Cmd, Ctrl and Shift).
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => {
    orbit.mouseButtons.LEFT = e.altKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  },
  { capture: true },
);

const loadFloats = (url) =>
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((b) => new Float32Array(b));

// Load the buildings (tools/buildings.mjs), the terrain (tools/terrain.mjs) and the trees (tools/trees.mjs).
const progress = document.getElementById("progress");
const [gltf, terrainInfo, heights, treePositions] = await Promise.all([
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("public/basel.glb", (e) => {
    progress.textContent = `${Math.round(e.loaded / 1e6)} MB`;
  }),
  fetch("public/terrain/terrain.json").then((r) => r.json()),
  loadFloats("public/terrain/heights.bin"),
  loadFloats("public/trees.bin"),
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
scene.add(createTrees(treePositions));

// All trees as one instanced low-poly model (trunk + crown, 1 unit tall), with varied size and colour.
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
  const geometry = mergeGeometries([colored(trunk, 0x6b5a45), colored(crown, 0x5d7f3e)]);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });

  const count = positions.length / 2;
  const trees = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const [x, z] = [positions[2 * i], positions[2 * i + 1]];
    const random = (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 1; // stable per tree
    const height = 8 + random * 10;
    rotation.setFromAxisAngle(up, random * 2 * Math.PI);
    matrix.compose(position.set(x, heightAt(x, z), z), rotation, scale.setScalar(height));
    trees.setMatrixAt(i, matrix);
    trees.setColorAt(i, tint.setScalar(0.75 + random * 0.25));
  }
  trees.computeBoundingSphere();
  return trees;
}

// One mesh per chunk, textured with that chunk's aerial photo (public/terrain/<column>_<row>.jpg).
function createTerrain({ x0, z0, cell, nx, nz, chunk }) {
  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();
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
      const map = loader.load(`public/terrain/${ix}_${iz}.jpg`);
      map.colorSpace = THREE.SRGBColorSpace;
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

function updateOrbit() {
  orbit.update();
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
  else updateOrbit();
  renderer.render(scene, camera);
});
