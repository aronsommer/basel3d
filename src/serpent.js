import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { riders } from "./riders.js";

// A creepy sea serpent looking at (lookX, lookZ): a pale, ringed neck with spines that sways, an
// angular head with horns, fangs and glowing red eyes. It slowly rises and sinks a little, and
// every 10 s it leans back, then strikes forward. The terrain hides what is below the water.
export function createSerpent(x, z, scale, lookX, lookZ, heightAt) {
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
