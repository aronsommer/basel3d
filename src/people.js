// People standing about, low-poly with vertex colours, all of a group in one mesh; their arms swing
// on the GPU.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";

// Arms swing about the shoulders by SWING radians each way around FORWARD radians ahead: from 0.5
// ahead to 0.1 back.
const SWING = 0.3;
const FORWARD = 0.2;
export const peopleTime = { value: 0 }; // seconds

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Parts of an arm, swinging about the shoulder at [x, y, z].
const arm = (shoulder, ...parts) =>
  parts.map((geometry) => Object.assign(geometry, { userData: { shoulder } }));

// The bodies, facing +z, standing on y = 0, by the colours of a look.
const BODIES = {
  // Trousers, a T-shirt, bare arms; his hair, or a cap with a peak ahead or a beanie.
  man: ({ skin, hair, top, bottom, shoes, cap, beanie }) => [
    ...[-1, 1].flatMap((s) => [
      part(box(0.14, 0.08, 0.28), shoes, [s * 0.1, 0.04, 0.03]),
      part(box(0.16, 0.82, 0.18), bottom, [s * 0.1, 0.49, 0]),
      ...arm(
        [s * 0.28, 1.47, 0],
        part(box(0.13, 0.2, 0.15), top, [s * 0.28, 1.39, 0]),
        part(box(0.1, 0.42, 0.12), skin, [s * 0.28, 1.08, 0]),
      ),
    ]),
    part(box(0.44, 0.62, 0.25), top, [0, 1.21, 0]),
    part(box(0.1, 0.08, 0.1), skin, [0, 1.56, 0]),
    part(box(0.22, 0.26, 0.24), skin, [0, 1.72, 0]),
    ...(cap != null
      ? [
          part(box(0.24, 0.08, 0.26), cap, [0, 1.87, -0.01]),
          part(box(0.2, 0.02, 0.12), cap, [0, 1.84, 0.17]),
        ]
      : beanie != null
        ? [part(box(0.25, 0.14, 0.27), beanie, [0, 1.88, -0.01])]
        : [part(box(0.24, 0.08, 0.26), hair, [0, 1.87, -0.01])]),
  ],
  // Knee-high boots (shoes), a miniskirt (bottom), a crop top, long hair and a handbag.
  woman: ({ skin, hair, top, bottom, shoes }) => [
    ...[-1, 1].flatMap((s) => [
      part(box(0.1, 0.08, 0.22), shoes, [s * 0.09, 0.04, 0.03]),
      part(box(0.12, 0.42, 0.13), shoes, [s * 0.09, 0.29, 0]),
      part(box(0.11, 0.42, 0.12), skin, [s * 0.09, 0.71, 0]),
      ...arm([s * 0.23, 1.47, 0], part(box(0.09, 0.58, 0.1), skin, [s * 0.23, 1.2, 0])),
    ]),
    part(new THREE.CylinderGeometry(0.17, 0.22, 0.2, 8), bottom, [0, 0.86, 0]),
    part(box(0.32, 0.12, 0.18), skin, [0, 1.02, 0]),
    part(box(0.36, 0.32, 0.21), top, [0, 1.24, 0]),
    part(box(0.34, 0.1, 0.19), skin, [0, 1.45, 0]),
    part(box(0.08, 0.07, 0.08), skin, [0, 1.535, 0]),
    part(box(0.2, 0.24, 0.22), skin, [0, 1.68, 0]),
    part(box(0.22, 0.06, 0.24), hair, [0, 1.8, -0.01]),
    part(box(0.22, 0.4, 0.08), hair, [0, 1.6, -0.1]),
    part(box(0.06, 0.16, 0.22), top, [0.31, 0.98, 0]),
  ],
};

// n looks from lists per key ({ body: ["man"], skin: […], cap: [0xc0392b, null], … }), each
// list's entries in turn; lists of different lengths mix them.
export const mix = (lists, n) =>
  Array.from({ length: n }, (_, k) =>
    Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, list[k % list.length]])),
  );

// Shared by all; an arm's vertices turn by Rodrigues' formula about the shoulder swing.xyz, with
// their own phase swing.w, about the unit axis (side.x, 0, side.y); side is 0 off the arms.
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
material.onBeforeCompile = (shader) => {
  shader.uniforms.peopleTime = peopleTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      "void main() {",
      "attribute vec4 swing;\nattribute vec2 side;\nuniform float peopleTime;\nvoid main() {",
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      if (side != vec2(0.0)) {
        // Positive turns the arm back.
        float a = ${SWING.toFixed(2)} * sin(peopleTime * 2.0 + swing.w) - ${FORWARD.toFixed(2)};
        vec3 k = vec3(side.x, 0.0, side.y);
        vec3 p = transformed - swing.xyz;
        transformed = swing.xyz + p * cos(a) + cross(k, p) * sin(a) + k * dot(k, p) * (1.0 - cos(a));
      }`,
    );
};

// One person per place ({ x, y, z, heading }), with these looks in turn.
export function createPeople(places, looks) {
  const up = new THREE.Vector3(0, 1, 0);
  return new THREE.Mesh(
    mergeGeometries(
      places.flatMap(({ x, y, z, heading }, k) => {
        const look = looks[k % looks.length];
        const [cos, sin] = [Math.cos(heading), -Math.sin(heading)]; // +x turned by heading
        return BODIES[look.body](look).map((g) => {
          const n = g.attributes.position.count;
          const swing = new Float32Array(4 * n);
          const side = new Float32Array(2 * n);
          const { shoulder } = g.userData;
          if (shoulder) {
            const at = new THREE.Vector3(...shoulder).applyAxisAngle(up, heading);
            for (let i = 0; i < n; i++) {
              swing.set([at.x + x, at.y + y, at.z + z, k * 2.3 + shoulder[0] * 5], 4 * i);
              side.set([cos, sin], 2 * i);
            }
          }
          g.setAttribute("swing", new THREE.BufferAttribute(swing, 4));
          g.setAttribute("side", new THREE.BufferAttribute(side, 2));
          return g.rotateY(heading).translate(x, y, z);
        });
      }),
    ),
    material,
  );
}
