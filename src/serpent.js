import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { riders } from "./riders.js";

// A creepy sea serpent looking at (lookX, lookZ): a pale, ringed neck with spines that sways, an
// angular head with horns, glowing red eyes and a mouth, fangs and teeth above and below. It
// slowly rises and sinks a little, its mouth a little open, chewing; every 10 s it leans back,
// opening it, then strikes forward, it wide open, and shuts it again. The terrain hides what is
// below the water.
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
  // Its mouth in the eyes' red: its tongue so, inside darker.
  const [TONGUE, MOUTH] = [eyeColor, eyeColor.clone().multiplyScalar(0.45)];
  // Mossy back with darker rings, a pale yellow throat and belly towards the front (+z).
  const skin = (c, px, py, pz) =>
    c
      .copy(back)
      .lerp(belly, THREE.MathUtils.smoothstep(pz, -0.2, 0.8))
      .multiplyScalar(py < NECK ? 0.8 + 0.2 * Math.sin(py * 1.6) : 1);
  const plain = (color) => (c) => c.copy(color);
  // A part of its jaw (1, turning at HINGE: y, z) or not (0), as the attribute jaw.
  const HINGE = [NECK + 0.2, 0.6]; // up in the jaw, just ahead of its back
  const jawed = (on, g) =>
    g.setAttribute(
      "jaw",
      new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill(on), 1),
    );
  // A tooth length long from its base at x, y, z: up, or down with its tip RAKE radians ahead.
  const RAKE = 0.15;
  const tooth = (length, down, x, y, z) => {
    const g = new THREE.ConeGeometry(length / 4, length, 4).translate(0, length / 2, 0); // base at 0
    if (down) g.rotateX(Math.PI - RAKE); // its tip a little ahead
    return colored(g.translate(x, y, z), plain(bone));
  };

  // The neck reaches up into the head, so no gap shows behind it.
  const neck = new THREE.CylinderGeometry(0.9, 2.2, NECK + 0.5, 8, 16, true);
  neck.translate(0, (NECK + 0.5) / 2, 0);
  // A flat piece, thick metres down from top, its outline seen from above given by [x, z] of its
  // right half (from the middle at the back round to the middle at the front), mirrored.
  const flat = (half, thick, top) => {
    const outline = [
      ...half,
      ...half
        .filter(([x]) => x)
        .toReversed()
        .map(([x, z]) => [-x, z]),
    ];
    return new THREE.ExtrudeGeometry(
      new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z))),
      { depth: thick, bevelEnabled: false },
    )
      .rotateX(Math.PI / 2) // its outline level, thick below
      .translate(0, top, 0);
  };
  // The head (snout towards +z) and, under it, its lower jaw: flat on top, as the dinosaur's,
  // wide at its back (just in the neck) and narrowing to its rounded tip, dark red there inside its mouth; a tongue
  // on it, wider towards its tip, slit there and out of its mouth a little.
  const head = new THREE.IcosahedronGeometry(1, 2);
  head.scale(1.6, 0.85, 3.4);
  head.translate(0, NECK + 0.85, 1.8);
  // Its back blunt, not a point sticking out behind the neck: no corner further back than BLUNT.
  const BLUNT = -1.05;
  {
    const position = head.attributes.position;
    for (let i = 0; i < position.count; i++) position.setZ(i, Math.max(BLUNT, position.getZ(i)));
  }
  // Its back just inside the neck (its corners too), so head, neck and jaw meet.
  const JAW = [
    [0, 0.3],
    [0.8, 0.3],
    [0.8, 0.8],
    [0.75, 2],
    [0.55, 3.6],
    [0.35, 4.3],
    [0, 4.45],
  ];
  // Thin at the chin, thicker towards the neck: its underside (CHIN metres under its top at the
  // tip, THROAT at its back) sloping down backwards.
  const [CHIN, THROAT] = [0.3, 0.75];
  const lower = flat(JAW, THROAT, NECK + 0.275);
  {
    const position = lower.attributes.position;
    const [back, tip] = [JAW[0][1], JAW.at(-1)[1]];
    for (let i = 0; i < position.count; i++)
      if (position.getY(i) < NECK) {
        const along = (tip - position.getZ(i)) / (tip - back); // 0 at the tip, 1 at the back
        position.setY(i, NECK + 0.275 - CHIN - (THROAT - CHIN) * along);
      }
  }
  const floor = flat(
    JAW.map(([x, z]) => [Math.max(0, x - 0.08), z]),
    0.02,
    NECK + 0.295,
  );
  const tongue = flat(
    [
      [0, 1],
      [0.1, 1],
      [0.25, 4.3],
      [0.2, 4.95],
      [0.05, 4.5],
      [0, 4.4],
    ],
    0.05,
    NECK + 0.345,
  );
  // Teeth along both jaws, out of each into the mouth (hidden in the other while it is shut).
  const teeth = (down) =>
    [-1, 1].flatMap((side) =>
      (down ? [1.6, 2.3, 3, 3.6] : [1.95, 2.65, 3.3, 3.95]).map((z) =>
        tooth(
          down ? 0.3 : 0.45,
          down,
          side * (down ? 0.4 : 0.33),
          down ? NECK + 0.2 : NECK + 0.15,
          z,
        ),
      ),
    );
  const horns = [-1, 1].map((side) => {
    const horn = new THREE.ConeGeometry(0.42, 2.9, 4);
    horn.rotateX(-0.9).rotateZ(-side * 0.25); // back, and a little outwards
    horn.translate(side * 0.7, NECK + 1.6, -0.8);
    return colored(horn, plain(bone));
  });
  // Its fangs, beside the jaw's narrow tip, clear of it.
  const fangs = [-1, 1].map((side) => tooth(0.9, true, side * 0.68, NECK + 0.45, 4.3));
  // Spines down the back of the neck, smaller towards the water.
  const spines = [...Array(10)].map((_, i) => {
    const y = NECK - 1 - i * 2;
    const radius = 0.9 + ((2.2 - 0.9) * (NECK - y)) / NECK;
    const spine = new THREE.ConeGeometry(0.3, (1.6 - i * 0.08) * 1.3, 4);
    spine.rotateX(-1.2);
    spine.translate(0, y, -radius - 0.4);
    return colored(spine, plain(bone));
  });
  const body = mergeGeometries([
    ...[colored(neck, skin), colored(head, skin)].map((g) => jawed(0, g)),
    ...[...horns, ...fangs, ...teeth(true), ...spines].map((g) => jawed(0, g)),
    ...[
      colored(lower, skin),
      colored(floor, plain(MOUTH)),
      colored(tongue, plain(TONGUE)),
      ...teeth(false),
    ].map((g) => jawed(1, g)),
  ]);
  const eyes = mergeGeometries(
    [-1, 1].map((side) => {
      const eye = new THREE.IcosahedronGeometry(0.45, 2); // as fine as the head
      eye.translate(side * 1.25, NECK + 1.05, 3.2); // half out of the head's side
      return jawed(0, colored(eye, plain(eyeColor)));
    }),
  );

  // Its jaw turns open about its hinge by jaw radians; then the neck sways like a snake, the head
  // (above the neck) moving with its top.
  const time = { value: 0 };
  const jaw = { value: 0 };
  const sway = (shader) => {
    Object.assign(shader.uniforms, { serpentTime: time, serpentJaw: jaw });
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "attribute float jaw;\nuniform float serpentTime;\nuniform float serpentJaw;\nvoid main() {",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        if (jaw > 0.5) {
          vec2 hinge = vec2(${HINGE[0].toFixed(2)}, ${HINGE[1].toFixed(2)});
          float a = serpentJaw;
          transformed.yz = hinge + mat2(cos(a), sin(a), -sin(a), cos(a)) * (transformed.yz - hinge);
        }
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
    // Its mouth a little open, chewing; opening as it leans back, wide as it strikes, snapping
    // shut at its end in 0.15 s, then a little open again in 0.5 s.
    const chew = 0.18 + 0.06 * Math.sin(seconds * 1.7);
    jaw.value =
      t < 6
        ? chew + 0.45 * ease(t, 0, 6)
        : t < 6.3
          ? chew + 0.45 + 0.45 * ease(t, 6, 6.3)
          : t < 6.45
            ? (chew + 0.9) * (1 - ease(t, 6.3, 6.45))
            : chew * ease(t, 6.45, 6.95);
  };
  return { group, update, ride };
}
