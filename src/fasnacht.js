// A Fasnacht clique marching round a loop (the Marktplatz): ahead the drum major (Tambourmajor)
// with his staff, then rows of pipers with piccolos and rows of drummers with Basel drums, all in
// one costume and one mask (Larve: a big painted head, red nose, a wig), in step. At night each
// mask carries a lit head lantern (Kopfladärnli), as at the Morgestraich.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./parts.js";
import {
  DRUM_ARMS,
  MAJOR_ARM,
  PICCOLO as PIPED,
  PIVOTS,
  createCrowd,
  peopleTime,
} from "./people.js";
import { night } from "./daylight.js";

const SPEED = 0.8; // metres per second
const STRIDE = 4.5; // radians of the march per metre
const WIDE = 4.5; // metres either side of the loop's middle line
// Metres others keep off a row (zones): beyond its outer members, and ahead and behind it; and
// off a member away from its row, either way.
const [KEEP, REACH, ALONE] = [2, 2.5, 1];
// The rows from the front: their pose, metres behind the row before and metres apart across.
const ROWS = [
  ["major", 0, 0, 1],
  ["pipe", 2.4, 1.1, 4],
  ["pipe", 1.5, 1.1, 4],
  ["drum", 1.8, 1.4, 3],
  ["drum", 1.6, 1.4, 3],
];
const COSTUME = { top: 0x2e7d32, bottom: 0xf9a825, shoes: 0x111111 };
const MAJOR = { top: 0xb71c1c, bottom: 0xb71c1c, shoes: 0x111111 };
const SKIN = [0xf1c7a5, 0xe8b996, 0xd9a27a];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rod = (r, length) => new THREE.CylinderGeometry(r, r, length, 8);
// The mask over the head (its top at 1.85 m), with its wig; the lantern on it; a piccolo at the
// mask's mouth, under its nose, out to the right (-x), where both hands hold it (src/people.js,
// pose pipe); a drum hung tilted ahead of the thighs, its upper head facing up and right; the drum
// major's staff, held upright by its middle in the right hand (HAND), raised and lowered with the
// arm.
const MASK = mergeGeometries([
  part(box(0.38, 0.48, 0.38), 0xf3dcc0, [0, 1.74, 0.02]),
  part(box(0.1, 0.13, 0.2), 0xd83a3a, [0, 1.7, 0.27]), // nose
  ...[-1, 1].map((s) => part(box(0.07, 0.05, 0.02), 0x111111, [s * 0.09, 1.82, 0.215])), // eyes
  part(box(0.16, 0.04, 0.02), 0xa01010, [0, 1.58, 0.215]), // mouth
  part(box(0.46, 0.16, 0.44), 0xff7043, [0, 2.02, 0]), // wig
  part(box(0.46, 0.34, 0.1), 0xff7043, [0, 1.8, -0.2]),
]);
const LANTERN = part(box(0.16, 0.22, 0.16), 0xfff0c0, [0, 2.21, 0]);
const PICCOLO = part(rod(0.022, 0.5).rotateZ(Math.PI / 2), 0x1a1a1a, [-0.19, ...PIPED]);
const DRUM = mergeGeometries([
  part(rod(0.21, 0.36).rotateZ(0.45), 0xc62828, [0.08, 0.7, 0.3]),
  part(rod(0.215, 0.03).rotateZ(0.45), 0xf5f5f5, [0.002, 0.862, 0.3]), // the upper head
]);
// The drumsticks, turning with the arms about the shoulders (PIVOTS[1] m up): each from the
// hand to the spot on the drum's head it strikes with its arm lowest (STRIKE, by
// side: the right -1, the left 1). HAND: per body the hand's metres out and up, the arm hanging.
const STICK = part(rod(0.012, 1).translate(0, 0.5, 0), 0x4e342e, [0, 0, 0]);
const STRIKE = { [-1]: [-0.078, 0.835, 0.33], 1: [0.082, 0.913, 0.33] };
const HAND = { man: [0.28, 0.92], woman: [0.235, 0.92] };
const [lift, turned] = [new THREE.Matrix4(), new THREE.Matrix4()];
// Into m: turning by a radians about the shoulders (as src/people.js turns the arms).
const swing = (a, m) =>
  m
    .makeTranslation(0, PIVOTS[1], 0)
    .multiply(turned.makeRotationX(a))
    .multiply(lift.makeTranslation(0, -PIVOTS[1], 0));
// Per body and side, a stick's matrix with the arm hanging.
const STICKS = Object.fromEntries(
  Object.entries(HAND).map(([body, [out, up]]) => {
    const lowest = DRUM_ARMS[0] + DRUM_ARMS[1]; // as it strikes
    const sides = [-1, 1].map((s) => {
      const hand = new THREE.Vector3(s * out, up, 0).applyMatrix4(
        swing(lowest, new THREE.Matrix4()),
      );
      const way = new THREE.Vector3(...STRIKE[s]).sub(hand);
      const length = way.length();
      const along = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        way.normalize(),
      );
      const stick = new THREE.Matrix4().compose(hand, along, new THREE.Vector3(1, length, 1));
      return swing(-lowest, new THREE.Matrix4()).multiply(stick);
    });
    return [body, sides];
  }),
);
const STAFF = mergeGeometries([
  part(rod(0.02, 1.8), 0x6d4c41, [0, 0, 0]),
  part(new THREE.SphereGeometry(0.08, 10, 8), 0xffd54f, [0, 0.95, 0]),
]);

// The loop: from a to b ([x, z]) and back, WIDE either side, round at the ends. ground(x, z): the
// height there. { meshes, update(dt), carry(), zones }: carry puts what they carry on them, after
// they fled (dodge, src/people.js); zones where others keep off (src/main.js, src/walkers.js), per
// row and then per member away from it (after carry): back x, z, way x, z (unit), length, half
// width and height.
export function createClique([a, b], ground) {
  // The loop: half round b, on to a, half round a, back to b; exact, so turning is smooth.
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const arc = Math.PI * WIDE;
  const half = arc + length;
  // A point on the loop at distance s and the heading there, moved across (to the left) by side.
  function at(s, side) {
    s = ((s % (2 * half)) + 2 * half) % (2 * half);
    const k = s < half ? 0 : 1;
    const [[cx, cz], r] = [k ? a : b, s - k * half];
    const turn = angle + (k - 0.5) * Math.PI + Math.min(r, arc) / WIDE;
    const [ux, uz] = [-Math.sin(turn), Math.cos(turn)];
    const ahead = Math.max(r - arc, 0);
    return [
      cx + WIDE * uz + ux * ahead + uz * side,
      cz - WIDE * ux + uz * ahead - ux * side,
      Math.atan2(ux, uz),
    ];
  }

  // Its members, men and women in turn: per member its pose, metres behind the front and across;
  // per row its metres behind the front and half width.
  const [members, rows] = [[], []];
  let back = 0;
  for (const [pose, behind, apart, count] of ROWS) {
    back += behind;
    rows.push([back, ((count - 1) / 2) * apart + KEEP]);
    for (let c = 0; c < count; c++)
      members.push({ pose, back, side: (c - (count - 1) / 2) * apart, zone: new Float64Array(7) });
  }
  const zones = rows.map(() => new Float64Array(7));
  const bodies = ["man", "woman"];
  const crowds = bodies.map((body, k) =>
    createCrowd(body, members.filter((_, i) => i % 2 === k).length, "march"),
  );
  members.forEach((m, i) => {
    Object.assign(m, { crowd: crowds[i % 2], i: i >> 1, body: bodies[i % 2] });
    const skin = SKIN[i % SKIN.length];
    m.crowd.dress(m.i, { skin, hair: 0x2a1d14, ...(m.pose === "major" ? MAJOR : COSTUME) }, m.pose);
  });
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowing = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: 0xffb347,
    emissiveIntensity: 0,
  });
  const meshOf = (geometry, count, m = material) => new THREE.InstancedMesh(geometry, m, count);
  const carried = [
    [meshOf(MASK, members.length), () => true],
    [meshOf(LANTERN, members.length, glowing), () => true],
    [meshOf(PICCOLO, members.filter((m) => m.pose === "pipe").length), (m) => m.pose === "pipe"],
    [meshOf(DRUM, members.filter((m) => m.pose === "drum").length), (m) => m.pose === "drum"],
  ];
  const lanterns = carried[1][0];
  const sticks = meshOf(STICK, 2 * members.filter((m) => m.pose === "drum").length);
  const staff = meshOf(STAFF, 1);
  const [matrix, swung, arm] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  let [front, phase] = [0, 0];

  // It halts while any of its members flees (dodge, src/people.js), marking time, so they find
  // their places where they left them.
  function update(dt) {
    if (!members.some((m) => m.crowd.away(m.i))) front += SPEED * dt;
    phase += SPEED * dt * STRIDE;
    for (const m of members) {
      const [x, z, heading] = at(front - m.back, m.side);
      m.crowd.place(m.i, x, ground(x, z), z, heading, phase, 1, 0);
    }
    rows.forEach(([behind, half], r) => {
      const [x, z, heading] = at(front - behind, 0);
      const [ux, uz] = [Math.sin(heading), Math.cos(heading)];
      zones[r].set([x - ux * REACH, z - uz * REACH, ux, uz, 2 * REACH, half, ground(x, z)]);
    });
    // The lanterns only at night, lit.
    lanterns.visible = night.value > 0.05;
    glowing.emissiveIntensity = 2 * night.value;
  }
  function carry() {
    const counts = carried.map(() => 0);
    let stick = 0;
    zones.length = rows.length;
    for (const m of members) {
      m.crowd.mesh.getMatrixAt(m.i, matrix);
      if (m.crowd.away(m.i)) {
        const e = matrix.elements;
        m.zone.set([e[12] - ALONE, e[14], 1, 0, 2 * ALONE, ALONE, e[13]]);
        zones.push(m.zone);
      }
      carried.forEach(([mesh, has], k) => has(m) && mesh.setMatrixAt(counts[k]++, matrix));
      if (m.pose === "drum")
        STICKS[m.body].forEach((rest, k) => {
          const s = 2 * k - 1;
          const a =
            DRUM_ARMS[0] + DRUM_ARMS[1] * Math.sin(peopleTime.value * DRUM_ARMS[2] + s * 1.5708);
          sticks.setMatrixAt(stick++, swung.multiplyMatrices(matrix, swing(a, arm)).multiply(rest));
        });
      if (m.pose === "major") {
        const a =
          MAJOR_ARM[0] + MAJOR_ARM[1] * Math.sin(m.crowd.mesh.geometry.attributes.phase.array[m.i]);
        const [out, up] = HAND[m.body];
        const grip = up - PIVOTS[1];
        arm.makeTranslation(-out, PIVOTS[1] + grip * Math.cos(a), grip * Math.sin(a));
        staff.setMatrixAt(0, swung.multiplyMatrices(matrix, arm));
      }
    }
    for (const mesh of [...carried.map(([mesh]) => mesh), sticks, staff])
      mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  carry();
  const meshes = [
    ...crowds.map(({ mesh }) => mesh),
    ...carried.map(([mesh]) => mesh),
    sticks,
    staff,
  ];
  for (const mesh of meshes) mesh.frustumCulled = false; // they move
  return { meshes, update, carry, zones };
}
