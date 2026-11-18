// People and dogs, low-poly: all of a body in one InstancedMesh, each with its own look and size;
// their limbs move on the GPU by their pose (POSES).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const peopleTime = { value: 0 }; // seconds

// The colours of a look ({ skin, hair, top, bottom, shoes, hat }, as 0xrrggbb), by slot; a dog's
// fur is its skin, its ears and nose its hair.
const SLOTS = ["skin", "hair", "top", "bottom", "shoes", "hat"];
// What a look may have: its head (short hair, long hair, a cap with a peak ahead or a beanie, both
// of hat colour) and a long dress (of bottom colour).
const OPTIONS = ["hair", "long", "cap", "beanie", "dress"];
// Radians: the legs and arms swing by LEG and ARM each way while walking; standing, the arms by
// SWING each way around FORWARD ahead.
const LEG = 0.45;
const ARM = 0.35;
const SWING = 0.3;
const FORWARD = 0.2;
// Their poses: standing, the arms swinging a little; walking, legs and arms swinging; lying on the
// back, still; yoga, raising the arms slowly over the head and lowering them; dancing, waving the
// arms, stepping, bouncing and twisting; up, lying on the back with arms and legs straight up,
// spreading them apart and closing them slowly; angel, lying on the back sweeping the arms along
// the ground up over the head and back and opening and closing the legs, as making a snow angel.
const POSES = ["stand", "walk", "lie", "yoga", "dance", "up", "angel"];
// Lying on the back: tilted about its own x after the heading, its back on the ground (BACK metres
// up), turned round, so it lies from its place along the heading, the head furthest.
const LYING = new Set(["lie", "up", "angel"]);
const BACK = 0.12;
// Metres up where they turn, by limb: legs, arms, a dog's legs.
const PIVOTS = [0.9, 1.47, 0.34];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// A part at [x, y, z] in a colour slot; limb: ±1 a leg, ±2 an arm, ±3 a dog's leg, the sign its
// side (or for a dog's leg its pair, the diagonal ones moving together); shown only with one of
// these options, if any given.
function piece(geometry, slot, [x, y, z], limb = 0, options = []) {
  const g = geometry.toNonIndexed();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const mask = options.reduce((m, option) => m | (1 << OPTIONS.indexOf(option)), 0);
  const n = g.attributes.position.count;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) data.set([SLOTS.indexOf(slot), limb, mask], 3 * i);
  g.setAttribute("piece", new THREE.BufferAttribute(data, 3));
  return g.translate(x, y, z);
}
// The heads' hair, caps and beanies, on a head whose top is at y.
const heads = (y) => [
  piece(box(0.24, 0.08, 0.26), "hair", [0, y + 0.02, -0.01], 0, ["hair", "long"]),
  piece(box(0.22, 0.4, 0.08), "hair", [0, y - 0.17, -0.14], 0, ["long"]),
  piece(box(0.24, 0.08, 0.26), "hat", [0, y + 0.02, -0.01], 0, ["cap"]),
  piece(box(0.2, 0.02, 0.12), "hat", [0, y - 0.01, 0.17], 0, ["cap"]),
  piece(box(0.25, 0.14, 0.27), "hat", [0, y + 0.03, -0.01], 0, ["beanie"]),
];

// The bodies, facing +z, standing on y = 0.
const BODIES = {
  // Trousers, a T-shirt, bare arms.
  man: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.14, 0.08, 0.28), "shoes", [s * 0.1, 0.04, 0.03], s),
      piece(box(0.16, 0.82, 0.18), "bottom", [s * 0.1, 0.49, 0], s),
      piece(box(0.13, 0.2, 0.15), "top", [s * 0.28, 1.39, 0], 2 * s),
      piece(box(0.1, 0.42, 0.12), "skin", [s * 0.28, 1.08, 0], 2 * s),
    ]),
    piece(box(0.44, 0.62, 0.25), "top", [0, 1.21, 0]),
    piece(box(0.1, 0.08, 0.1), "skin", [0, 1.56, 0]),
    piece(box(0.22, 0.26, 0.24), "skin", [0, 1.72, 0]),
    ...heads(1.85),
  ]),
  // Slimmer and smaller: trousers or a long dress, a T-shirt, bare arms.
  woman: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.11, 0.07, 0.24), "shoes", [s * 0.085, 0.035, 0.03], s),
      piece(box(0.13, 0.83, 0.15), "bottom", [s * 0.085, 0.48, 0], s),
      piece(box(0.11, 0.18, 0.13), "top", [s * 0.235, 1.38, 0], 2 * s),
      piece(box(0.085, 0.42, 0.1), "skin", [s * 0.235, 1.08, 0], 2 * s),
    ]),
    piece(new THREE.CylinderGeometry(0.18, 0.27, 0.75, 8), "bottom", [0, 0.55, 0], 0, ["dress"]),
    piece(box(0.36, 0.58, 0.22), "top", [0, 1.18, 0]),
    piece(box(0.09, 0.07, 0.09), "skin", [0, 1.505, 0]),
    piece(box(0.2, 0.24, 0.22), "skin", [0, 1.65, 0]),
    ...heads(1.76),
  ]),
  // Barefoot in a bikini: its top (top) and bottom (bottom).
  swim: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.1, 0.06, 0.22), "skin", [s * 0.085, 0.03, 0.03], s),
      piece(box(0.13, 0.83, 0.15), "skin", [s * 0.085, 0.48, 0], s),
      piece(box(0.085, 0.6, 0.1), "skin", [s * 0.205, 1.17, 0], 2 * s),
    ]),
    piece(box(0.34, 0.14, 0.2), "bottom", [0, 0.9, 0]),
    piece(box(0.32, 0.5, 0.19), "skin", [0, 1.2, 0]),
    piece(box(0.33, 0.05, 0.2), "top", [0, 1.36, 0]), // the top's band
    ...[-1, 1].map((s) => piece(box(0.14, 0.14, 0.11), "top", [s * 0.075, 1.31, 0.13])), // cups
    piece(box(0.09, 0.07, 0.09), "skin", [0, 1.48, 0]),
    piece(box(0.2, 0.24, 0.22), "skin", [0, 1.63, 0]),
    ...heads(1.74),
  ]),
  // Knee-high boots (shoes), a miniskirt (bottom), a crop top, long hair and a handbag.
  night: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.1, 0.08, 0.22), "shoes", [s * 0.09, 0.04, 0.03], s),
      piece(box(0.12, 0.42, 0.13), "shoes", [s * 0.09, 0.29, 0], s),
      piece(box(0.11, 0.42, 0.12), "skin", [s * 0.09, 0.71, 0], s),
      piece(box(0.09, 0.58, 0.1), "skin", [s * 0.23, 1.2, 0], 2 * s),
    ]),
    piece(new THREE.CylinderGeometry(0.17, 0.22, 0.2, 8), "bottom", [0, 0.86, 0]),
    piece(box(0.32, 0.12, 0.18), "skin", [0, 1.02, 0]),
    piece(box(0.36, 0.32, 0.21), "top", [0, 1.24, 0]),
    piece(box(0.34, 0.1, 0.19), "skin", [0, 1.45, 0]),
    piece(box(0.08, 0.07, 0.08), "skin", [0, 1.535, 0]),
    piece(box(0.2, 0.24, 0.22), "skin", [0, 1.68, 0]),
    piece(box(0.22, 0.06, 0.24), "hair", [0, 1.8, -0.01]),
    piece(box(0.22, 0.4, 0.08), "hair", [0, 1.6, -0.1]),
    piece(box(0.06, 0.16, 0.22), "top", [0.31, 0.98, 0]),
  ]),
  // Fur, darker ears and nose, a collar (top).
  dog: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.06, 0.34, 0.06), "skin", [s * 0.07, 0.17, 0.2], 3 * s),
      piece(box(0.06, 0.34, 0.06), "skin", [s * 0.07, 0.17, -0.2], -3 * s),
      piece(box(0.05, 0.08, 0.04), "hair", [s * 0.06, 0.66, 0.31]),
    ]),
    piece(box(0.2, 0.2, 0.55), "skin", [0, 0.42, 0]),
    piece(box(0.17, 0.17, 0.2), "skin", [0, 0.55, 0.34]),
    piece(box(0.09, 0.08, 0.12), "hair", [0, 0.51, 0.48]),
    piece(box(0.19, 0.04, 0.05), "top", [0, 0.5, 0.25]),
    piece(box(0.04, 0.04, 0.22), "skin", [0, 0.52, -0.36]),
  ]),
};

// n looks from lists per key ({ body: ["man"], skin: […], head: ["hair", "cap"], … }), each
// list's entries in turn; lists of different lengths mix them.
export const mix = (lists, n) =>
  Array.from({ length: n }, (_, k) =>
    Object.fromEntries(Object.entries(lists).map(([key, list]) => [key, list[k % list.length]])),
  );

// Per instance: colours (0xrrggbb, exact in a float) look = skin, hair, top, bottom and more =
// shoes, hat, the bits of its OPTIONS, the index of its pose (POSES); phase, radians of the walk,
// or the arms' own phase while standing. Parts shown only with options it lacks collapse to a point.
const material = new THREE.MeshLambertMaterial({ flatShading: true });
material.onBeforeCompile = (shader) => {
  shader.uniforms.peopleTime = peopleTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      "void main() {",
      `attribute vec3 piece;
      attribute vec4 look;
      attribute vec4 more;
      attribute float phase;
      uniform float peopleTime;
      varying vec3 vLook;
      vec3 linear(float c) {
        vec3 s = vec3(floor(c / 65536.0), mod(floor(c / 256.0), 256.0), mod(c, 256.0)) / 255.0;
        return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
      }
      void main() {`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float slot = piece.x;
      vLook = linear(slot < 0.5 ? look.x : slot < 1.5 ? look.y : slot < 2.5 ? look.z
        : slot < 3.5 ? look.w : slot < 4.5 ? more.x : more.y);
      if (piece.z > 0.0 && (int(piece.z) & int(more.z)) == 0) transformed = vec3(0.0);
      if (piece.y != 0.0) {
        float side = sign(piece.y);
        int limb = int(abs(piece.y));
        float pivot = limb == 1 ? ${PIVOTS[0]} : limb == 2 ? ${PIVOTS[1]} : ${PIVOTS[2]};
        // Positive turns the limb back.
        int pose = int(more.w + 0.5);
        float t = peopleTime;
        float a = pose == 1 ? (limb == 2 ? ${ARM} : -${LEG}) * sin(phase) * side
          : pose == 0 && limb == 2 ? ${SWING} * sin(t * 2.0 + phase + side * 1.4) - ${FORWARD}
          : pose == 3 && limb == 2 ? -1.5 + 1.5 * cos(t * 0.6 + phase)
          : pose == 4 && limb == 2 ? -1.6 - 0.8 * sin(t * 4.0 + phase + side * 1.6)
          : pose == 4 ? 0.3 * sin(t * 4.0 + phase) * side
          : pose == 5 ? -1.5708
          : 0.0;
        vec2 p = transformed.yz - vec2(pivot, 0.0);
        transformed.yz = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a))
          + vec2(pivot, 0.0);
        if (pose == 6) {
          // Out to its side in the body's plane, about the shoulder or hip of a slim body.
          float spread = 0.5 - 0.5 * cos(t * 1.5 + phase);
          float b = side * (limb == 2 ? 0.2 + 2.2 * spread : 0.05 + 0.45 * spread);
          vec2 joint = vec2(side * (limb == 2 ? 0.2 : 0.09), pivot);
          vec2 q = transformed.xy - joint;
          transformed.xy = joint + vec2(q.x * cos(b) - q.y * sin(b), q.x * sin(b) + q.y * cos(b));
        }
        if (pose == 5) {
          // Out to its side, about the body's upright middle.
          float b = side * (0.55 + 0.35 * sin(t * 1.2 + phase));
          transformed.xz = vec2(
            transformed.x * cos(b) + transformed.z * sin(b),
            transformed.z * cos(b) - transformed.x * sin(b)
          );
        }
      }
      if (int(more.w + 0.5) == 4) {
        float w = 0.4 * sin(peopleTime * 1.0 + phase);
        transformed.xz = vec2(
          transformed.x * cos(w) + transformed.z * sin(w),
          transformed.z * cos(w) - transformed.x * sin(w)
        );
        transformed.y += 0.05 * abs(sin(peopleTime * 2.0 + phase));
      }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", "varying vec3 vLook;\nvoid main() {")
    .replace("vec4( diffuse, opacity )", "vec4( vLook, opacity )");
};

// count of a body (BODIES): { mesh, dress(i, look, pose), place(i, x, y, z, heading, phase, size,
// tilt: radians about its own x after the heading) }; a look's head is short hair unless given.
export function createCrowd(body, count) {
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "piece"])
    geometry.setAttribute(name, BODIES[body].attributes[name]);
  const attribute = (size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(size * count), size);
    return a.setUsage(THREE.DynamicDrawUsage);
  };
  const [look, more, phases] = [attribute(4), attribute(4), attribute(1)];
  Object.entries({ look, more, phase: phases }).forEach(([name, a]) =>
    geometry.setAttribute(name, a),
  );
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const [matrix, tilted, scale] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Vector3()];
  return {
    mesh,
    dress(i, { skin, hair, top = 0, bottom = 0, shoes = 0, hat = 0, head = "hair", dress }, pose) {
      const options = (1 << OPTIONS.indexOf(head)) | (dress ? 1 << OPTIONS.indexOf("dress") : 0);
      look.set([skin, hair, top, bottom], 4 * i);
      more.set([shoes, hat, options, POSES.indexOf(pose)], 4 * i);
      look.needsUpdate = more.needsUpdate = true;
    },
    place(i, x, y, z, heading, phase, size = 1, tilt = 0) {
      matrix.makeRotationY(heading).multiply(tilted.makeRotationX(tilt));
      matrix.scale(scale.setScalar(size)).setPosition(x, y, z);
      mesh.setMatrixAt(i, matrix);
      phases.array[i] = phase;
      mesh.instanceMatrix.needsUpdate = phases.needsUpdate = true;
    },
  };
}

// People at places ({ x, y, z, heading, pose }), standing unless another pose (POSES) is given;
// one lying has its place at its feet (were they on the ground) and its head away along the
// heading. With these looks in turn; a mesh per body.
export function createPeople(places, looks) {
  const bodies = Map.groupBy(places.keys(), (k) => looks[k % looks.length].body);
  return [...bodies].map(([body, ks]) => {
    const crowd = createCrowd(body, ks.length);
    ks.forEach((k, i) => {
      const { x, y, z, heading, pose = "stand" } = places[k];
      crowd.dress(i, looks[k % looks.length], pose);
      if (LYING.has(pose)) crowd.place(i, x, y + BACK, z, heading + Math.PI, 0, 1, -Math.PI / 2);
      else crowd.place(i, x, y, z, heading, k * 2.3);
    });
    crowd.mesh.computeBoundingSphere();
    return crowd.mesh;
  });
}
