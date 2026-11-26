// The sea serpent, looking at (lookX, lookZ); the terrain hides what is under water.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import { riders } from "./riders.js";

const TOP = 0x243f37;
const SIDE = 0x4c6f58;
const BELLY = 0xd9c48e;
const HORN = 0x1c1f1d;
const FIN = 0xe0561a;
const BONE = 0xcfc7a2;
const IVORY = 0xf3ecd6;
const PINK = 0xd0606e;
const EYE = 0xffb020;
const SPINE = 3.2; // metres
const HIGH = 38; // metres before scaling

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = THREE.MathUtils.smoothstep;
const X = v(1, 0, 0);
const Z = v(0, 0, 1);
const scaly = (up) => (up > 0.45 ? TOP : up < -0.35 ? BELLY : SIDE);

function triangles(corners) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      corners.flatMap(({ p }) => [p.x, p.y, p.z]),
      3,
    ),
  );
  g.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      corners.flatMap(({ c }) => [c.r, c.g, c.b]),
      3,
    ),
  );
  return g;
}
function tube(points, sides, color, shape = () => 1) {
  const rings = points.map(([x, y, z, rx, ry], i) => {
    const [a, b] = [points[Math.max(i - 1, 0)], points[Math.min(i + 1, points.length - 1)]];
    const t = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const square = (axis) => axis.clone().addScaledVector(t, -t.dot(axis));
    const side = (square(X).length() > 0.3 ? square(X) : square(Z)).normalize();
    const up = t.clone().cross(side);
    if (up.y < 0) up.negate();
    if (side.clone().cross(up).dot(t) < 0) side.negate();
    const f = i / (points.length - 1);
    const middle = v(x, y, z);
    return {
      middle: { p: middle, c: new THREE.Color(color(0, f, i)) },
      ring: [...Array(sides)].map((_, j) => {
        const angle = (2 * Math.PI * j) / sides;
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        return {
          p: middle
            .clone()
            .addScaledVector(side, cos * rx)
            .addScaledVector(up, sin * ry * shape(sin, i)),
          c: new THREE.Color(color(sin, f, i)),
        };
      }),
    };
  });
  const corners = [];
  rings.forEach(({ middle, ring }, i) =>
    ring.forEach((a, j) => {
      const b = ring[(j + 1) % sides];
      if (i === 0) corners.push(middle, b, a);
      if (i === rings.length - 1) corners.push(middle, a, b);
      else {
        const next = rings[i + 1].ring;
        const [c, d] = [next[(j + 1) % sides], next[j]];
        corners.push(a, b, d, b, c, d);
      }
    }),
  );
  return triangles(corners);
}
function spike(base, dir, length, radius, from, to, { sides = 4, flat = 1, out = Z } = {}) {
  const y = dir.clone().normalize();
  const across = Math.abs(y.dot(out.clone().normalize())) > 0.99 ? X : out;
  const z = across.clone().addScaledVector(y, -y.dot(across)).normalize();
  const g = part(
    new THREE.ConeGeometry(radius, length, sides).translate(0, length / 2, 0).scale(1, 1, flat),
    (h) => (h > length / 2 ? to : from),
    [0, 0, 0],
  );
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(y.clone().cross(z), y, z).setPosition(base));
}
function along(points, f) {
  const at = f * (points.length - 1);
  const i = Math.min(Math.floor(at), points.length - 2);
  return points[i].map((a, k) => a + (points[i + 1][k] - a) * (at - i));
}
const STRAIGHT = HIGH - 4;
const BEND = 3.5;
const neckRadius = (y) => 4.2 - (1.1 * (y + 16)) / (HIGH + 16);
const SKULL = [
  [0, 0.2, -1.5, 3.3, 3.4],
  [0, 0.9, 1.5, 4.1, 3.7],
  [0, 1.1, 4.5, 3.9, 3.2],
  [0, 0.8, 7.5, 3.2, 2.5],
  [0, 0.4, 10.5, 2.5, 1.9],
  [0, 0, 13, 1.7, 1.3],
  [0, -0.4, 14.8, 0.7, 0.7],
];
const HEAD = new THREE.Matrix4().makeTranslation(
  0,
  STRAIGHT + BEND - SKULL[1][1],
  BEND - SKULL[1][2],
);
const START = 18;
const lerp = THREE.MathUtils.lerp;
const NECK = [
  ...[...Array(13)].map((_, i) => {
    const y = -16 + ((STRAIGHT + 16) * i) / 12;
    return [0, y, 0, neckRadius(y), neckRadius(y)];
  }),
  ...[1, 2, 3, 4, 5].map((k) => {
    const a = (k / 6) * (Math.PI / 2);
    return [
      0,
      STRAIGHT + BEND * Math.sin(a),
      BEND - BEND * Math.cos(a),
      lerp(neckRadius(STRAIGHT), SKULL[1][3], k / 6),
      lerp(neckRadius(STRAIGHT), SKULL[1][4], k / 6),
    ];
  }),
  ...SKULL.slice(1).map(([x, y, z, rx, ry]) =>
    v(x, y, z).applyMatrix4(HEAD).toArray().concat(rx, ry),
  ),
];
const flatness = (i) => THREE.MathUtils.clamp((i - 12) / (START - 12), 0, 1);
const SPINES = [];
for (let y = STRAIGHT - 1; y > -1; y -= SPINE) {
  const r = neckRadius(y);
  const s = 1.4 + (1.8 * y) / HIGH;
  SPINES.push(
    spike(v(0, y, -r * 0.9), v(0, -0.45, -0.9), s, s * 0.5, HORN, FIN, { flat: 0.25, out: X }),
  );
}

const EYES = [-1, 1].map((side) => v(side * 3, 2.2, 6));
const head = [
  ...[0, 1, 2, 3].map((k) =>
    spike(v(0, 3.6 - 0.2 * k, 5 - 2.2 * k), v(0, 0.9, -0.6), 2.6 - 0.2 * k, 1.1, HORN, FIN, {
      flat: 0.25,
      out: X,
    }),
  ),
  ...[-1, 1].flatMap((side) => [
    tube(
      [
        [1.6, 3.1, 8.2, 0.5],
        [2.6, 3.5, 6.8, 0.8],
        [3.2, 3.3, 5, 0.75],
        [3.3, 2.9, 3.4, 0.4],
      ].map(([x, y, z, r]) => [x * side, y, z, r, r * 0.8]),
      6,
      () => HORN,
    ),
    part(
      new THREE.BoxGeometry(0.25, 1.3, 0.25),
      0x000000,
      EYES[(side + 1) / 2]
        .clone()
        .addScaledVector(v(0.9 * side, 0.15, 0.4).normalize(), 1.05)
        .toArray(),
    ),
    ...[0, 1].map((k) =>
      spike(
        v(3.1 * side, 3.2 - 0.3 * k, 3.4 - 1.6 * k),
        v(0.3 * side, 0.5, -0.8),
        3 - k,
        0.6,
        BONE,
        HORN,
        { sides: 5 },
      ),
    ),
    ...[...Array(6)].map((_, k) => {
      const e = -0.9 + k * 0.36;
      return spike(
        v(side * 3.3, 0.6 + 2.2 * Math.sin(e), -0.5),
        v(side * 0.7, Math.sin(e) * 0.8, -0.7),
        4.2 + 1.2 * Math.cos(e),
        0.9,
        SIDE,
        FIN,
        { flat: 0.25, out: v(Math.cos(e) * side, Math.sin(e), 0) },
      );
    }),
    ...[0, 1, 2, 3, 4, 5].map((k) => {
      const [, y, z, rx, ry] = along(SKULL, (1.6 + k * 0.62) / 6);
      return spike(
        v(side * rx * 0.7, y, z),
        v(side * 0.1, -1, 0.15),
        1.1 + 0.25 * k + 0.4 * ry,
        0.55,
        IVORY,
        IVORY,
        { sides: 3 },
      );
    }),
  ]),
];
// Its top sits a little inside the skull's underside, so the jaw closes well.
const HINGE = v(0, -0.4, 0.8).applyMatrix4(HEAD);
const LOWER = [
  [0, -1.2, -0.3, 2.8, 1.7],
  [0, -0.92, 1, 3, 1.8],
  [0, -0.43, 4, 3.1, 1.6],
  [0, -0.29, 8, 2.5, 1.3],
  [0, -0.35, 10.5, 1.9, 1],
  [0, -0.35, 11.6, 1.4, 0.75],
  [0, -0.35, 12.1, 0.6, 0.35],
];
const lower = [
  tube(
    LOWER,
    8,
    (up) => (up > 0.3 ? PINK : up < -0.4 ? BELLY : SIDE),
    (up) => (up > 0 ? 1 - 0.7 * ease(up, 0, 0.6) : 1),
  ),
  tube(
    [
      [0, -0.2, 2, 1.1, 0.3],
      [0, 0.15, 6, 1, 0.3],
      [0, 0.15, 9.5, 0.7, 0.25],
      [0, 0, 12.5, 0.4, 0.18],
      [0, -0.2, 14, 0.3, 0.14],
    ],
    6,
    () => 0xc23b4a,
  ),
  ...[-1, 1].map((side) =>
    tube(
      [
        [0, -0.2, 13.8, 0.2, 0.12],
        [side * 0.45, -0.35, 15.2, 0.06, 0.05],
      ],
      4,
      () => 0xc23b4a,
    ),
  ),
  ...[-1, 1].flatMap((side) =>
    [0, 1, 2, 3].map((k) => {
      const [, y, z, rx, ry] = along(LOWER, (1.8 + k * 0.65) / 6);
      return spike(
        v(side * rx * 0.7, y, z),
        v(side * 0.1, 1, 0.1),
        1 + 0.2 * k + 0.3 * ry,
        0.5,
        IVORY,
        IVORY,
        { sides: 3 },
      );
    }),
  ),
];
// The jaw attribute: 1 on the jaw, else 0.
const jawed = (on, g) =>
  g.setAttribute(
    "jaw",
    new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill(on), 1),
  );
const BODY = mergeGeometries([
  ...[
    tube(
      NECK,
      10,
      (up, f, i) => (up < -0.5 && i > START ? PINK : scaly(up)),
      (up, i) => (up < 0 ? 1 - 0.6 * flatness(i) * ease(-up, 0, 0.6) : 1),
    ),
    ...SPINES,
  ].map((g) => jawed(0, g)),
  ...head.map((g) => jawed(0, g.applyMatrix4(HEAD))),
  ...lower.map((g) => jawed(1, g.applyMatrix4(HEAD))),
]);
const GLOWING = mergeGeometries(
  EYES.map((eye) =>
    jawed(0, part(new THREE.IcosahedronGeometry(1.1, 1), EYE, eye.toArray()).applyMatrix4(HEAD)),
  ),
);

export function createSerpent(x, z, scale, lookX, lookZ, heightAt) {
  // The jaw opens about its hinge, then the neck sways.
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
          vec2 hinge = vec2(${HINGE.y.toFixed(2)}, ${HINGE.z.toFixed(2)});
          float a = serpentJaw;
          transformed.yz = hinge + mat2(cos(a), sin(a), -sin(a), cos(a)) * (transformed.yz - hinge);
        }
        float h = clamp(transformed.y / ${HIGH.toFixed(1)}, 0.0, 1.0);
        transformed.x += sin(serpentTime * 0.9 - h * 2.5) * h * h * 5.0;
        transformed.z += sin(serpentTime * 0.6 - h * 2.0 + 1.3) * h * h * 3.5;`,
      );
  };
  const skin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const group = new THREE.Group();
  for (const [geometry, material] of [
    [BODY, skin],
    [GLOWING, glow],
  ]) {
    material.onBeforeCompile = sway;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // the sway moves it beyond its bounds
    group.add(mesh);
  }
  group.scale.setScalar(scale);
  group.position.set(x, heightAt(x, z), z);
  group.rotation.order = "YXZ";
  group.rotation.y = Math.atan2(lookX - x, lookZ - z); // the head points along +z
  const surface = group.position.y; // the water surface

  const [EYE_AT, AHEAD_AT] = [v(0, 6, 0), v(0, 2, 120)].map((p) => p.applyMatrix4(HEAD));
  const [eye, ahead] = [EYE_AT.toArray(), AHEAD_AT.toArray()];
  const ride = riders([{ object: group, materials: [skin], eye, ahead }]);

  const update = (seconds) => {
    time.value = seconds;
    const swayX = Math.sin(seconds * 0.9 - 2.5) * 5;
    const swayZ = Math.sin(seconds * 0.6 - 2.0 + 1.3) * 3.5;
    [eye[0], eye[2]] = [EYE_AT.x + swayX, EYE_AT.z + swayZ];
    [ahead[0], ahead[2]] = [AHEAD_AT.x + swayX, AHEAD_AT.z + swayZ];
    group.position.y = surface - HIGH * scale * (0.125 - 0.125 * Math.sin(seconds * 0.2));
    const t = seconds % 10;
    group.rotation.x =
      t < 6
        ? -0.18 * ease(t, 0, 6)
        : t < 6.4
          ? -0.18 + 0.48 * ease(t, 6, 6.4)
          : 0.3 * (1 - ease(t, 6.4, 10));
    const chew = 0.32 + 0.06 * Math.sin(seconds * 1.7);
    jaw.value =
      t < 6
        ? chew + 0.3 * ease(t, 0, 6)
        : t < 6.3
          ? chew + 0.3 + 0.35 * ease(t, 6, 6.3)
          : t < 6.45
            ? (chew + 0.65) * (1 - ease(t, 6.3, 6.45))
            : chew * ease(t, 6.45, 6.95);
  };
  return { group, update, ride };
}
