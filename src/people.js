// People standing about: guys and sex workers, low-poly with vertex colours, all in one mesh.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Guys' arms swing about their shoulders by SWING radians each way around FORWARD radians ahead:
// from 0.5 ahead to 0.1 back.
const SWING = 0.3;
const FORWARD = 0.2;
export const peopleTime = { value: 0 }; // seconds

// An arm part, swinging about the shoulder at [x, y, z].
const arm = (geometry, shoulder) => Object.assign(geometry, { userData: { shoulder } });

// A man facing +z, standing on y = 0: trousers, a T-shirt, bare arms; his hair, or a cap with a
// peak ahead or a beanie of that colour.
function guy({ skin, hair, top, bottom, shoes, cap, beanie }) {
  return [
    ...[-1, 1].flatMap((s) => [
      part(box(0.14, 0.08, 0.28), shoes, [s * 0.1, 0.04, 0.03]),
      part(box(0.16, 0.82, 0.18), bottom, [s * 0.1, 0.49, 0]),
      arm(part(box(0.13, 0.2, 0.15), top, [s * 0.28, 1.39, 0]), [s * 0.28, 1.47, 0]),
      arm(part(box(0.1, 0.42, 0.12), skin, [s * 0.28, 1.08, 0]), [s * 0.28, 1.47, 0]),
    ]),
    part(box(0.44, 0.62, 0.25), top, [0, 1.21, 0]),
    part(box(0.1, 0.08, 0.1), skin, [0, 1.56, 0]),
    part(box(0.22, 0.26, 0.24), skin, [0, 1.72, 0]),
    ...(cap !== undefined
      ? [
          part(box(0.24, 0.08, 0.26), cap, [0, 1.87, -0.01]),
          part(box(0.2, 0.02, 0.12), cap, [0, 1.84, 0.17]),
        ]
      : beanie !== undefined
        ? [part(box(0.25, 0.14, 0.27), beanie, [0, 1.88, -0.01])]
        : [part(box(0.24, 0.08, 0.26), hair, [0, 1.87, -0.01])]),
  ];
}

// A woman facing +z, standing on y = 0: knee-high boots, a miniskirt, a crop top, long hair and
// a handbag.
function worker({ skin, hair, top, bottom, shoes }) {
  return [
    ...[-1, 1].flatMap((s) => [
      part(box(0.1, 0.08, 0.22), shoes, [s * 0.09, 0.04, 0.03]),
      part(box(0.12, 0.42, 0.13), shoes, [s * 0.09, 0.29, 0]),
      part(box(0.11, 0.42, 0.12), skin, [s * 0.09, 0.71, 0]),
      part(box(0.09, 0.58, 0.1), skin, [s * 0.23, 1.2, 0]),
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
  ];
}

// Sex workers, each [skin, hair, top, skirt, boots].
export const WORKERS = [
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
].map(([skin, hair, top, bottom, shoes]) => ({ body: worker, skin, hair, top, bottom, shoes }));

// Black guys, each in other clothes, some with a cap or beanie: colours from these lists in turn,
// which are of different lengths, so they mix.
const SKINS = [0x4a2c1a, 0x5a3520, 0x3d2416, 0x6b4128, 0x7a4a2a];
const TOPS = [0xffffff, 0x1e7d4a, 0x111111, 0xf2c94c, 0xc0392b, 0x1e88e5, 0x6b6b6b, 0xff6f00];
const BOTTOMS = [0x3b4d6b, 0x222222, 0x6b6b6b, 0x1d1d1d, 0xc2a878, 0x2f4f2f, 0x4a5d7a];
const SHOES = [0xffffff, 0x111111, 0xeeeeee, 0x1d1d1d];
const HEADS = [
  { cap: 0xc0392b },
  {},
  { beanie: 0x111111 },
  { cap: 0x1b2333 },
  {},
  { beanie: 0x8b0000 },
];
export const BLACK_GUYS = Array.from({ length: 28 }, (_, k) => ({
  body: guy,
  skin: SKINS[k % SKINS.length],
  hair: 0x111111,
  top: TOPS[k % TOPS.length],
  bottom: BOTTOMS[k % BOTTOMS.length],
  shoes: SHOES[k % SHOES.length],
  ...HEADS[k % HEADS.length],
}));

// Shared by all; arms turn by Rodrigues' formula about pivot.xyz (pivot.w 1 on arms, else 0) and
// the unit axis.xyz, in their own phase axis.w.
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
material.onBeforeCompile = (shader) => {
  shader.uniforms.peopleTime = peopleTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      "void main() {",
      "attribute vec4 pivot;\nattribute vec4 axis;\nuniform float peopleTime;\nvoid main() {",
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      if (pivot.w > 0.0) {
        // Positive turns the arm back.
        float a = ${SWING.toFixed(2)} * sin(peopleTime * 2.0 + axis.w) - ${FORWARD.toFixed(2)};
        vec3 p = transformed - pivot.xyz;
        transformed = pivot.xyz + p * cos(a) + cross(axis.xyz, p) * sin(a)
          + axis.xyz * dot(axis.xyz, p) * (1.0 - cos(a));
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
        const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, heading);
        return look.body(look).map((g) => {
          const n = g.attributes.position.count;
          const pivot = new Float32Array(4 * n);
          const axis = new Float32Array(4 * n);
          const shoulder = g.userData.shoulder;
          if (shoulder) {
            const at = new THREE.Vector3(...shoulder).applyAxisAngle(up, heading);
            for (let i = 0; i < n; i++) {
              pivot.set([at.x + x, at.y + y, at.z + z, 1], 4 * i);
              axis.set([side.x, side.y, side.z, k * 2.3 + shoulder[0] * 5], 4 * i);
            }
          }
          g.setAttribute("pivot", new THREE.BufferAttribute(pivot, 4));
          g.setAttribute("axis", new THREE.BufferAttribute(axis, 4));
          return g.rotateY(heading).translate(x, y, z);
        });
      }),
    ),
    material,
  );
}
