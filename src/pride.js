// The rainbow flag (six stripes, red on top): on a pole, and a building dressed in its stripes.
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

// The flag on a pole standing on the tip at x, y, z, reaching into it, the cloth flying along +x
// turned by heading (radians about y).
export function createPride(x, y, z, heading) {
  const mesh = new THREE.Mesh(GEOMETRY, MATERIAL);
  mesh.position.set(x, y, z);
  mesh.rotation.y = heading;
  return mesh;
}

// The building dressed in the stripes (its number, -1: none), twice from its top to its bottom.
const BANDS = 2 * STRIPES.length;
const dressed = {
  prideNumber: { value: -1 },
  prideRange: { value: new THREE.Vector2() }, // scene y of its bottom and top
  prideStripes: { value: STRIPES.map((colour) => new THREE.Color(colour)) },
};
export function dress(number, bottom, top) {
  dressed.prideNumber.value = number;
  dressed.prideRange.value.set(bottom, top);
}

// Dresses it on a buildings' material (onBeforeCompile): after src/facade.js's shader, so the
// facade lies on the stripes, and with the highlight's (src/buildings.js), which declares _building.
export function prideShader(shader) {
  Object.assign(shader.uniforms, dressed);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float prideNumber;\nvarying float vPride;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPride = _building == prideNumber ? (modelMatrix * vec4(transformed, 1.0)).y : -1e4;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec2 prideRange;\nuniform vec3 prideStripes[6];\nvarying float vPride;",
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      if (vPride > -1e3) {
        float down = (prideRange.y - vPride) / (prideRange.y - prideRange.x); // 0 at the top
        diffuseColor.rgb = prideStripes[int(min(down * ${BANDS}.0, ${BANDS - 1}.0)) % 6];
      }`,
    );
}
