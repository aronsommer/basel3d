// The basilisk, standing or flown as a plane (src/main.js). Facing +z, in metres.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part, profile } from "./parts.js";
import { riders } from "./riders.js";

const GREEN = 0x2f7343;
const DARK = 0x1b3f2e;
const BELLY = 0xc9a23a;
const GOLD = 0xf2a01e;
const GOLD2 = 0xffd04a;
const RED = 0xc4161c;
const RED2 = 0x6e0c12;
const YELLOW = 0xd9a21e;
const BROWN = 0x7a3d12;
const BONE = 0xead39a;
const HORN = 0x2b2320;
const IVORY = 0xf3ecd6;
const [WEB, WEB_LIT] = [0x3b2016, 0xb5401c];
const CYCLE = 12; // seconds
const BREATH = 0.25; // seconds
// Flying: wing beat (rad/s), lean (rad), bob (m), bank (rad); HIP: height it leans about (m).
const [BEAT, LEAN, BOB, BANK, HIP] = [8, 0.2, 3, 0.5, 40];

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const ease = THREE.MathUtils.smoothstep;
const X = v(1, 0, 0);
const Z = v(0, 0, 1);
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const scaly = (up) => (up > 0.5 ? DARK : up < -0.4 ? BELLY : GREEN);

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
// Its rings are carried along, so they do not twist.
function tube(points, sides, color, shape = () => 1) {
  let side;
  const rings = points.map(([x, y, z, rx, ry], i) => {
    const [a, b] = [points[Math.max(i - 1, 0)], points[Math.min(i + 1, points.length - 1)]];
    const t = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const square = (axis) => axis.clone().addScaledVector(t, -t.dot(axis));
    if (side) side = square(side).normalize();
    else {
      side = (square(X).length() > 0.3 ? square(X) : square(Z)).normalize();
      if (t.clone().cross(side).y < 0) side.negate();
    }
    const up = t.clone().cross(side);
    const f = i / (points.length - 1);
    const middle = v(x, y, z);
    return {
      middle: { p: middle, c: new THREE.Color(color(0, f)) },
      ring: [...Array(sides)].map((_, j) => {
        const angle = (2 * Math.PI * j) / sides;
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
        return {
          p: middle
            .clone()
            .addScaledVector(side, cos * rx)
            .addScaledVector(up, sin * ry * shape(sin)),
          c: new THREE.Color(color(sin, f)),
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
function walk(points, d) {
  for (let i = 1; ; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const way = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = way.length();
    if (d <= length || i === points.length - 1) {
      const f = Math.min(d / length, 1);
      return { point: a.map((x, k) => x + (b[k] - x) * f), way: way.normalize() };
    }
    d -= length;
  }
}
const lengthOf = (points) =>
  points
    .slice(1)
    .reduce(
      (sum, [x, y, z], i) => sum + Math.hypot(x - points[i][0], y - points[i][1], z - points[i][2]),
      0,
    );
const ball = (radius, at) =>
  part(new THREE.IcosahedronGeometry(radius, 1), (y) => scaly(y / radius), at);

const TORSO = [
  [0, 32.5, -13, 8.6, 9],
  [0, 33.6, -7, 10.9, 10.9],
  [0, 36.6, 0, 12.2, 12.7],
  [0, 40.6, 7, 12, 13.4],
  [0, 44.8, 12.6, 10.2, 11.4],
  [0, 49.3, 16.4, 7.3, 7.9],
];
const TAIL = (() => {
  const points = new THREE.CatmullRomCurve3(
    [
      [32.5, -13],
      [30.6, -24],
      [26.4, -36],
      [22.5, -50],
      [20.5, -64],
      [20.5, -78],
      [23, -92],
      [27, -104],
      [31, -113],
    ].map(([y, z]) => v(0, y, z)),
  ).getSpacedPoints(36);
  return points.map(({ x, y, z }, i) => {
    const r = 1.3 + 7.3 * (1 - i / 36) ** 0.6;
    return [x, y, z, r, r * 1.05];
  });
})();
const SPLIT = [0, 12, 24, 36];
const SPINE = 4.2;
const BACK = lengthOf(TORSO) + lengthOf(TAIL);
function spines(points, from, end = 0) {
  const length = lengthOf(points);
  const out = [];
  for (let k = Math.max(1, Math.ceil(from / SPINE)); k * SPINE < from + length - end; k++) {
    const { point, way } = walk(points, k * SPINE - from);
    const [, y, z, , ry] = point;
    const up = v(0, -way.z, way.y);
    if (up.y < 0) up.negate();
    const g = (k * SPINE) / BACK;
    const size = (2.6 + 5.6 * Math.sin(Math.PI * g ** 0.55) ** 1.2) * (1 - 0.5 * g);
    out.push(
      spike(
        v(0, y + up.y * ry * 0.93, z + up.z * ry * 0.93),
        up.clone().multiplyScalar(0.9).addScaledVector(way, 0.5),
        size,
        size * 0.52,
        YELLOW,
        BROWN,
        { flat: 0.2, out: X },
      ),
    );
  }
  return out;
}

const LEG_AT = [5, 38, -5];
const LEG = [
  [10, 22, 6.8, 3],
  [9.82, 16.3, 2.4, 2.6],
  [9.65, 11.2, -1.6, 2],
  [9.57, 6.75, 0.2, 2.25],
  [9.5, 2.3, 2, 2.8],
];
const LEGS = [-1, 1].map((side) => {
  const m = ([x, ...rest]) => [x * side, ...rest];
  const toes = [
    [-0.55 * side, 11],
    [0, 13],
    [0.55 * side, 11.4],
    [Math.PI - 0.25 * side, 3.6],
  ].flatMap(([toe, length]) => {
    const a = toe + 0.25 * side;
    const behind = Math.abs(a) > 2;
    const [sin, cos] = [Math.sin(a), Math.cos(a)];
    return [
      tube(
        [
          [0, 1.9, 2.3],
          [0.36, 2.4, 1.85],
          [0.7, 1.7, 1.65],
          [1, 1.15, 1.3],
        ].map(([f, y, r]) => [
          9.5 * side + sin * length * f,
          y * (behind ? 0.85 : 1),
          2.2 + cos * length * f,
          r * (behind ? 0.7 : 1),
          r * (behind ? 0.63 : 0.9),
        ]),
        6,
        () => YELLOW,
      ),
      spike(
        v(9.5 * side + sin * (length - 0.5), 1.25, 2.2 + cos * (length - 0.5)),
        v(sin, -0.25, cos),
        behind ? 2.4 : 5.8,
        1.25,
        HORN,
        HORN,
        { flat: 0.75, out: v(0, 1, 0) },
      ),
    ];
  });
  const at = v(...m(LEG_AT));
  const parts = [
    tube(
      [
        [5, 38, -5, 4.8, 6],
        [5.8, 32, -0.4, 5.4, 7],
        [8.2, 26, 3.6, 5, 6.2],
        [10, 22, 6.5, 3.9, 4.5],
        [10, 19.2, 6.9, 3.4, 3.8],
      ].map(m),
      8,
      (_, f) => mix(GREEN, DARK, ease(f, 0.2, 1)),
    ),
    tube(
      new THREE.CatmullRomCurve3(
        LEG.map(([x, y, z]) => v(x * side, y, z)),
        false,
        "centripetal",
      )
        .getPoints(24)
        .map(({ x, y, z }, k) => {
          const r = along(LEG, k / 24)[3];
          return [x, y, z, r, r];
        }),
      7,
      () => YELLOW,
    ),
    ...toes,
    ...[...Array(14)].map((_, k) => {
      const a = (k / 14) * 2 * Math.PI;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      return spike(
        v(10 * side + cos * 3.5, 22.6, 6.4 + sin * 4),
        v(cos * 0.3, -0.92, -0.3 + sin * 0.3),
        5.5 + 2.5 * random(),
        1.6,
        GREEN,
        mix(GOLD, DARK, 0.3 + 0.5 * random()),
        { flat: 0.3, out: v(cos, 0, sin) },
      );
    }),
  ];
  return { at, geometry: mergeGeometries(parts).translate(-at.x, -at.y, -at.z) };
});

const TAILS = SPLIT.slice(1).map((end, k) => {
  const points = TAIL.slice(SPLIT[k], end + 1);
  const [x, y, z, r] = points[0];
  const parts = [
    tube(points, 8, scaly),
    ball(r, [x, y, z]),
    ...spines(
      points,
      lengthOf(TORSO) + lengthOf(TAIL.slice(0, SPLIT[k] + 1)),
      end === SPLIT.at(-1) ? 8 : 0,
    ),
  ];
  if (end === SPLIT.at(-1)) {
    const length = lengthOf(points);
    const start = walk(points, length - 8).point;
    const way = v(...points.at(-1))
      .sub(v(...walk(points, length - 5).point))
      .normalize();
    parts.push(
      tube(
        [
          [0, 1.4, 1.4],
          [0.14, 2.2, 1.9],
          [0.24, 7.2, 1.5],
          [0.38, 5.6, 1.3],
          [0.6, 3.5, 0.95],
          [0.85, 1.4, 0.5],
          [1, 0, 0],
        ].map(([f, rx, ry]) => [0, start[1] + way.y * f * 22, start[2] + way.z * f * 22, rx, ry]),
        8,
        () => WEB_LIT,
      ),
    );
  }
  return { at: v(x, y, z), geometry: mergeGeometries(parts).translate(-x, -y, -z) };
});

const NECK_AT = v(0, 46, 13.5);
const RUFF = [
  [64.6, 22.4, 4.4],
  [60, 20.8, 4.8],
  [54.8, 18.4, 5.6],
  [49.3, 16.4, 7.4],
  [44.8, 12.6, 10.4],
  [41.5, 8.5, 12.6],
];
const COLLAR = [
  [0.02, 14, 6.5, 1.5, BROWN, GOLD, 0.45],
  [0.12, 16, 7.5, 1.7, DARK, GOLD, 0.5],
  [0.24, 18, 8.5, 1.9, DARK, GOLD, 0.6],
  [0.36, 20, 9.5, 2.1, DARK, GOLD, 0.7],
  [0.48, 22, 10.5, 2.3, DARK, 0xd9661a, 0.8],
  [0.6, 24, 11, 2.5, DARK, 0xb34d14, 0.85],
];
// Rings from this f on are on the breast, so stay still.
const BREAST = 0.45;
const hackles = (rings) =>
  rings.flatMap(([f, count, length, width, base, tip, tilt], k) => {
    const [y, z, r] = along(RUFF, f);
    const [ny, nz] = along(RUFF, f + 0.02);
    const down = v(0, ny - y, nz - z).normalize();
    return [...Array(count)].map((_, j) => {
      const a = ((j + (k % 2) / 2) / count) * 2 * Math.PI;
      const out = v(Math.cos(a), Math.sin(a) * down.z, -Math.sin(a) * down.y);
      return spike(
        v(0, y, z).addScaledVector(out, r * 0.95),
        down.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt)),
        length * (0.8 + 0.4 * random()) * (1 - 0.45 * Math.max(0, -Math.sin(a))),
        width * (0.85 + 0.3 * random()),
        base,
        mix(tip, GOLD2, random() * 0.35),
        { flat: 0.3, out },
      );
    });
  });
const NECK = mergeGeometries([
  tube(
    [
      [0, 43, 11, 9, 10],
      [0, 49.3, 16.4, 7.3, 7.9],
      [0, 54.8, 18.4, 5.5, 5.8],
      [0, 60, 20.8, 4.7, 5],
      [0, 63.4, 22.6, 4.2, 4.4],
    ],
    9,
    scaly,
  ),
  ...hackles(COLLAR.filter(([f]) => f < BREAST)),
]).translate(-NECK_AT.x, -NECK_AT.y, -NECK_AT.z);
const BODY = mergeGeometries([
  tube(TORSO, 10, scaly),
  ...spines(TORSO.toReversed(), 0),
  ...hackles(COLLAR.filter(([f]) => f >= BREAST)),
]);

const HEAD_AT = v(0, 62, 21.5);
const UPPER = [
  [0, 64.5, 30.4, 3.6, 3],
  [0, 64.9, 34.5, 3.1, 2.8],
  [0, 64.4, 38.6, 2.35, 2.4],
  [0, 63, 41.8, 1.5, 1.75],
  [0, 60.9, 43.6, 0.7, 1],
  [0, 58.8, 43.7, 0.04, 0.08],
];
// A tooth at f along a beak; upper ones outside the lower beak, lower ones inside the upper.
function tooth(beak, f, side, out, way, long, radius) {
  const [, y, z, rx, ry] = along(beak, f);
  const [, y0, z0] = along(beak, Math.max(0, f - 0.02));
  const [, y1, z1] = along(beak, Math.min(1, f + 0.02));
  const edge = v(0, -(z1 - z0), y1 - y0).normalize();
  if (edge.y * way < 0) edge.negate();
  return spike(
    v(side * rx * out, y, z),
    edge.add(v(side * 0.12, 0, -0.12)),
    0.4 * ry + long,
    radius,
    IVORY,
    IVORY,
    { sides: 3 },
  );
}
const COMB = (() => {
  const [top, base] = [[], []];
  for (let i = 0; i <= 32; i++) {
    const e = i / 32;
    const z = 33.2 - 11.7 * e;
    const y = 63.4 + 5.3 * Math.sqrt(Math.max(0, 1 - ((z - 26.2) / 7.6) ** 2));
    const high =
      1.4 +
      9.2 *
        Math.sin(Math.PI * e ** 0.7) ** 0.6 *
        (0.4 + 0.6 * Math.abs(Math.sin(Math.PI * (e * 5.5 + 0.25))) ** 0.8);
    top.push([z - 0.24 * high, y + high]);
    base.push([z, y]);
  }
  return [...top, ...base.toReversed()];
})();
const EYES = [-1, 1].map((side) => v(side * 4.2, 66.3, 28.6));
const HEAD = mergeGeometries([
  tube(
    [
      [0, 62, 20, 3.6, 3.8],
      [0, 64, 22.5, 4.9, 5.1],
      [0, 65.2, 25.5, 5.25, 5.35],
      [0, 65.4, 28.5, 4.65, 4.65],
      [0, 64.9, 31, 3.7, 3.4],
      [0, 64.55, 32.6, 3, 2.5],
    ],
    9,
    (up, f) => (f > 0.6 && up < -0.2 ? BONE : up < -0.1 || f > 0.55 ? RED : BROWN),
  ),
  tube(
    UPPER,
    8,
    (_, f) => mix(BONE, 0x4d2b10, ease(f, 0.45, 1)),
    (up) => (up < 0 ? 1 - 0.7 * ease(-up, 0, 0.6) : 1),
  ),
  part(profile(COMB, 1.8), (y) => (y > 71 ? RED : RED2), [0, 0, 0]),
  ...[-1, 1].flatMap((side) => [
    tube(
      [
        [0, 0.5, 0.7],
        [0.25, 1.1, 1.5],
        [0.6, 1.4, 2.5],
        [0.85, 1.2, 2.1],
        [1, 0.05, 0.1],
      ].map(([f, rx, ry]) => [(1.5 + f * 0.6) * side, 62.2 - f * 8, 30 - f * 0.6, rx, ry]),
      8,
      (_, f) => mix(RED, RED2, f * 0.5),
    ),
    tube(
      [
        [2.3, 67.6, 32.6, 0.6],
        [3.5, 68.5, 30.8, 1.15],
        [4.75, 68.5, 28.6, 1.25],
        [5.2, 67.9, 26.2, 1],
        [5.3, 67.4, 24.4, 0.5],
      ].map(([x, y, z, r]) => [x * side, y, z, r, r * 0.85]),
      6,
      () => RED2,
    ),
    part(
      new THREE.BoxGeometry(0.35, 1.9, 0.35),
      0x000000,
      EYES[(side + 1) / 2]
        .clone()
        .addScaledVector(v(0.9 * side, 0.1, 0.42).normalize(), 1.42)
        .toArray(),
    ),
    ...[0, 1, 2].map((k) =>
      spike(
        v((4.5 + 0.15 * k) * side, 68.2 - 0.5 * k, 26.6 - 1.5 * k),
        v(0.35 * side, 0.45 - 0.1 * k, -0.85),
        7 - 1 * k,
        0.8,
        BONE,
        HORN,
        { sides: 5 },
      ),
    ),
    ...[...Array(7)].map((_, k) => {
      const e = -0.5 + k * 0.32;
      const out = v(Math.cos(e) * side, Math.sin(e), 0);
      return spike(
        v(4.6 * side * Math.cos(e * 0.6), 64.2 + 3.4 * Math.sin(e), 22.2),
        v(Math.cos(e) * 0.5 * side, Math.sin(e) * 0.5, -1),
        7 + 2 * random(),
        1.3,
        BROWN,
        GOLD,
        { flat: 0.3, out },
      );
    }),
    ...[0, 1, 2, 3, 4, 5].map((k) =>
      tooth(UPPER, (3 + k) / 13, side, 0.9, -1, (1.5 - k * 0.12) * 0.95, 0.42),
    ),
  ]),
]).translate(-HEAD_AT.x, -HEAD_AT.y, -HEAD_AT.z);
const GLOWING = mergeGeometries(
  EYES.map((eye) => part(new THREE.IcosahedronGeometry(1.5, 1), 0xffffff, eye.toArray())),
).translate(-HEAD_AT.x, -HEAD_AT.y, -HEAD_AT.z);
const JAW_AT = v(0, 63.6, 28);
const LOWER = [
  [0, 63.04, 28, 3, 1.6],
  [0, 63.4, 33, 2.7, 1.4],
  [0, 63.39, 37.6, 2, 1.1],
  [0, 62.75, 40.8, 0.3, 0.3],
];
const JAW = mergeGeometries([
  tube(
    LOWER,
    8,
    () => BONE,
    (up) => (up > 0 ? 1 - 0.65 * ease(up, 0, 0.6) : 1),
  ),
  tube(
    [
      [0, 63.8, 29.6, 1.45, 0.55],
      [0, 63.85, 37.4, 0.9, 0.4],
    ],
    6,
    () => 0xb34a4a,
  ),
  ...[-1, 1].flatMap((side) =>
    [0, 1, 2, 3].map((k) =>
      tooth(LOWER, (0.75 + k * 0.4) / 3, side, 0.6, 1, (1.2 - k * 0.1) * 1.4, 0.36),
    ),
  ),
]).translate(-JAW_AT.x, -JAW_AT.y, -JAW_AT.z);

function web(a, b, scallop, sag = 2) {
  const [COLS, ROWS] = [6, 6];
  const grid = [];
  for (let i = 0; i <= ROWS; i++)
    for (let j = 0; j <= COLS; j++) {
      const [out, bulge] = [i / ROWS, Math.sin((Math.PI * j) / COLS)];
      const f = out * (1 - scallop * bulge * out);
      const p = a(f).lerp(b(f), j / COLS);
      p.y -= bulge * sag * out;
      grid.push({ p, c: mix(WEB, WEB_LIT, ease(bulge, 0, 0.6) * (0.35 + 0.65 * out)) });
    }
  const corners = [];
  for (let i = 0; i < ROWS; i++)
    for (let j = 0; j < COLS; j++) {
      const k = i * (COLS + 1) + j;
      const [p, q, r, s] = [k, k + 1, k + COLS + 2, k + COLS + 1].map((n) => grid[n]);
      corners.push(p, q, r, p, r, s, p, r, q, p, s, r);
    }
  return triangles(corners);
}
const SHOULDER = [8.5, 49, 7];
const WING_AXIS = v(0, -9, -14).normalize();
const WING = 1.35;
const LEFT = (() => {
  const m = ([x, y, z]) => v(x, y, z);
  const s = m(SHOULDER);
  const grow = (p) => p.sub(s).multiplyScalar(WING).add(s);
  const [e, w] = [grow(m([19.5, 58, 1])), grow(m([34.5, 64, 6]))];
  const tips = [
    [30, 13, -2],
    [27, -6, -22],
    [15, -15, -32],
    [3, -19, -31],
  ].map((tip) => m(tip).multiplyScalar(WING).add(w));
  const hip = s.clone().addScaledVector(WING_AXIS, 16);
  // Where the elbow's skin is split, so it cannot fold.
  const mid = tips[3].clone().lerp(hip, 0.5);
  const lerp = (a, b) => (f) => a.clone().lerp(b, f);
  const bone = (p, r) => [p.x, p.y, p.z, r, r * 1.05];
  const geometry = mergeGeometries([
    tube(
      [
        bone(s.clone().add(v(-2.5, -2, 0)), 3.4),
        bone(lerp(s, e)(0.12), 3.3),
        bone(lerp(s, e)(0.6), 2.5),
        bone(e, 2.5),
        bone(lerp(e, w)(0.5), 1.9),
        bone(w, 1.9),
        bone(lerp(e, w)(1.08), 0.9),
      ],
      6,
      () => DARK,
    ),
    spike(w, v(0.25, 0.5, 0.85), 7, 1.2, HORN, HORN),
    ...tips.map((tip) =>
      tube([bone(w, 1.45), bone(lerp(w, tip)(0.5), 0.9), bone(tip, 0.3)], 4, () => DARK),
    ),
    ...[0, 1, 2].map((k) => web(lerp(w, tips[k]), lerp(w, tips[k + 1]), 0.26 - 0.03 * k)),
    web(lerp(w, tips[3]), lerp(e, mid), 0.18),
    web(lerp(e, mid), (f) => (f < 0.5 ? lerp(e, s)(2 * f) : lerp(s, hip)(2 * f - 1)), 0.18),
  ]).translate(-s.x, -s.y, -s.z);
  return { at: s, geometry };
})();
// Mirrored across x, its triangles turned to face out.
function mirrored(geometry) {
  const g = geometry.clone().scale(-1, 1, 1);
  for (const attribute of Object.values(g.attributes))
    for (let i = 0; i < attribute.count; i += 3)
      for (let k = 0; k < attribute.itemSize; k++) {
        const second = attribute.array[(i + 1) * attribute.itemSize + k];
        attribute.array[(i + 1) * attribute.itemSize + k] =
          attribute.array[(i + 2) * attribute.itemSize + k];
        attribute.array[(i + 2) * attribute.itemSize + k] = second;
      }
  return g;
}
const WINGS = [
  { side: -1, at: LEFT.at.clone().setX(-LEFT.at.x), geometry: mirrored(LEFT.geometry) },
  { side: 1, ...LEFT },
];

export function createBasilisk(x, y, z, heading, size, level) {
  const skin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
  const group = new THREE.Group();
  group.rotation.order = "YXZ";
  group.scale.setScalar(size);
  const joint = (parent, at, geometry, material = skin) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(at);
    parent.add(mesh);
    return mesh;
  };
  const body = new THREE.Group();
  const made = new THREE.Group();
  made.position.y = -HIP;
  group.add(body.add(made));
  joint(made, v(0, 0, 0), BODY);
  const legs = LEGS.map(({ at, geometry }) => joint(made, at, geometry));
  let [before, parent] = [v(0, 0, 0), made];
  const tails = TAILS.map(({ at, geometry }) => {
    parent = joint(parent, at.clone().sub(before), geometry);
    before = at;
    return parent;
  });
  const neck = joint(made, NECK_AT, NECK);
  const head = joint(neck, HEAD_AT.clone().sub(NECK_AT), HEAD);
  joint(head, v(0, 0, 0), GLOWING, eyeMaterial);
  const jaw = joint(head, JAW_AT.clone().sub(HEAD_AT), JAW);
  const wings = WINGS.map(({ side, at, geometry }) => ({ side, wing: joint(made, at, geometry) }));

  const ride = riders([
    { object: group, materials: [skin], eye: [0, 420, -420], ahead: [0, -153, 300] },
  ]);

  let [last, air] = [0, 0];
  let breathed = -1;
  const update = (seconds, flown) => {
    air = flown ? air + (1 - air) * Math.min(1, 1.5 * (seconds - last)) : 0;
    last = seconds;
    if (flown) {
      group.position.set(flown.x, flown.y, flown.z);
      group.rotation.set(flown.nose - level, flown.heading, 0);
    } else {
      group.position.set(x, y, z);
      group.rotation.set(0, heading, 0);
    }
    const bank = flown ? -BANK * flown.turn * flown.speed : 0;
    body.position.y = HIP + air * BOB * Math.sin(BEAT * seconds - 1);
    body.rotation.set(LEAN * air, 0, bank * air);
    const stand = 1 - air;
    const t = seconds % CYCLE;
    const roar = stand * ease(t, 5, 6.5) * (1 - ease(t, 10.5, 12));
    const strike = ease(t, 6.5, 7);
    neck.rotation.set(
      stand * 0.04 * Math.sin(0.4 * seconds) +
        roar * (-0.35 + 0.6 * strike) +
        air * (-0.07 + 0.05 * Math.sin(BEAT * seconds + 1)),
      stand * 0.22 * Math.sin(0.3 * seconds) * (1 - roar),
      0,
    );
    head.rotation.set(
      stand * 0.06 * Math.sin(0.53 * seconds) + roar * (-0.25 + 0.35 * strike) - 0.13 * air,
      (0.4 * Math.sin(0.37 * seconds) + 0.15 * Math.sin(1.1 * seconds)) * (1 - roar) * stand,
      0,
    );
    const since = seconds - breathed;
    jaw.rotation.x =
      0.1 +
      0.04 * Math.sin(1.3 * seconds) +
      roar * (0.35 + 0.3 * strike) +
      (since < BREATH ? 0.4 * Math.sin((Math.PI * since) / BREATH) : 0);
    legs.forEach((leg, k) => {
      leg.rotation.x = air * (1.05 + 0.05 * Math.sin(5 * seconds + 2 * k));
    });
    tails.forEach((tail, k) => {
      tail.rotation.set(
        stand * 0.03 * Math.sin(0.37 * seconds - k) +
          air * ([-0.42, -0.06, -0.3][k] + 0.03 * k * Math.sin(2.2 * seconds - k)),
        stand * 0.15 * Math.sin(0.8 * seconds - 1.1 * k) + air * 0.08 * Math.sin(1.8 * seconds - k),
        0,
      );
    });
    const lift =
      stand * (0.08 * Math.sin(0.7 * seconds) + roar * (0.2 + 0.1 * Math.sin(8.8 * (t - 5)))) +
      air * (-0.35 + 0.7 * Math.sin(BEAT * seconds));
    for (const { side, wing } of wings) wing.quaternion.setFromAxisAngle(WING_AXIS, -side * lift);
  };
  update(0, null);
  return {
    group,
    update,
    ride,
    speed: 50,
    turn: 1,
    lift: 25, // metres
    climb: 0.35,
    low: 0,
    nose: 60, // metres
    plane: true,
    breathe: () => (breathed = last),
    launchers: [v(0, 45, 75), v(0, 45, 75)],
    fireballs: true,
    dip: 0.59,
  };
}
