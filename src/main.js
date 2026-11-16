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
const [terrainJson, heightsBuffer, glb, bridgesGlb, treesBuffer, waterBuffer, ...groundBuffers] =
  await load(
    [
      "terrain/terrain.json",
      "terrain/heights.bin",
      "basel.glb",
      "bridges.glb",
      "trees.bin",
      "water.ktx2",
      ...groundPaths(groundKind),
    ],
    (percent) => (progress.textContent = `${percent} %`),
  );
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
}; // The GLBs have no normals; flat shading derives them per pixel.
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
  water.waterTime.value = time / 1000;
  renderer.render(scene, camera);
});
