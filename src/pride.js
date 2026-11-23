// The rainbow flag (six stripes, red on top) on a pole standing on a tip at y = 0, reaching into
// it, the cloth flying along +x.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";

const STRIPES = [0xe50000, 0xff8d00, 0xffee00, 0x028121, 0x004cff, 0x770088];
const [POLE, SINK, LONG, HIGH] = [6, 1, 4.8, 3]; // metres; SINK: of the pole below y = 0
const STRIPE = HIGH / STRIPES.length;
const GEOMETRY = mergeGeometries([
  part(new THREE.BoxGeometry(0.12, POLE + SINK, 0.12), 0xe8e8e8, [0, (POLE - SINK) / 2, 0]),
  ...STRIPES.map((colour, k) =>
    part(new THREE.BoxGeometry(LONG, STRIPE, 0.03), colour, [
      0.06 + LONG / 2,
      POLE - 0.1 - (k + 0.5) * STRIPE,
      0,
    ]),
  ),
]);
const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// The flag on the tip at x, y, z, turned by heading (radians about y).
export function createPride(x, y, z, heading) {
  const mesh = new THREE.Mesh(GEOMETRY, MATERIAL);
  mesh.position.set(x, y, z);
  mesh.rotation.y = heading;
  return mesh;
}
