// People and dogs, low-poly: all of a body in one InstancedMesh, each with its own look and size;
// their limbs move on the GPU by their pose (POSES).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const peopleTime = { value: 0 }; // seconds

// The colours of a look ({ skin, hair, top, bottom, shoes, hat }, as 0xrrggbb), by slot, then
// white, black and grey, the same for all (eyes, metal); a dog's fur is its skin, its ears, eyes
// and nose its hair.
const SLOTS = ["skin", "hair", "top", "bottom", "shoes", "hat", "white", "black", "grey"];
// What a look may have: its head (short hair, long hair, a cap with its peak ahead or back, or a
// beanie, all of hat colour), a long dress (of bottom colour) and its face (glasses or
// sunglasses, black) and forearm crutches with a plaster cast on the right lower leg.
const OPTIONS = [
  "hair",
  "long",
  "cap",
  "backcap",
  "beanie",
  "dress",
  "glasses",
  "shades",
  "crutches",
];
// Radians: the legs and arms swing by LEG and ARM each way while walking; standing, the arms by
// SWING each way around FORWARD ahead.
const LEG = 0.45;
const ARM = 0.35;
// Radians running: the legs swing by RUN_LEG each way, the arms by RUN_ARM around RUN_FORWARD
// ahead; metres it bounces up each step.
const [RUN_LEG, RUN_ARM, RUN_FORWARD, BOUNCE] = [0.75, 0.7, 0.3, 0.06];
// Radians fleeing: the arms UP_ARM ahead (up over the head), flailing by FLAIL each way.
export const UP_ARM = 2.7;
const FLAIL = 0.3;
// Radians steering: the arms STEER[0] ahead, opened STEER[1] out about the shoulders.
export const STEER = [1.1, 0.15];
// Radians cheering: the raised arms (UP_ARM) opened CHEER[0] out, the legs CHEER[1] apart, each
// about its shoulder or hip.
export const CHEER = [0.3, 0.08];
// Radians the raised arms of one cheering sway either way together, about the shoulders, and
// radians a second (by peopleTime and its phase): SWAY[0] * sin(time * SWAY[1] + phase).
export const SWAY = [0.2, 2.5];
// Radians the legs swing each way under a long dress while walking or running, not through it.
const DRESS_LEG = 0.2;
const SWING = 0.3;
const FORWARD = 0.2;
// Their poses: standing, the arms swinging a little; walking, legs and arms swinging; lying on the
// back, still; yoga, raising the arms slowly over the head and lowering them; dancing, waving the
// arms, stepping, bouncing and twisting; up, lying on the back with arms and legs straight up,
// spreading them apart and closing them slowly; angel, lying on the back sweeping the arms along
// the ground up over the head and back and opening and closing the legs, as making a snow angel;
// ride, on a bike: the arms ahead to the handlebar, the legs pedalling by phase; trike, the same
// with the legs far ahead, as to a tricycle's pedals on its front wheel; sit, on the ground with
// the legs straight ahead, leaning back LEAN radians, propped on the left hand, the right arm
// tossing food ahead; run, as walking with longer strides, bouncing; scoot, standing on an
// e-scooter, the left foot a little ahead, the arms ahead to its handlebar; swim, upright in the
// water, the arms stretched straight ahead, reaching far onto what it holds, the legs treading water; crawl, the arms
// stretched over the head (ahead, tilted to lie in the water) and turning round in turn, the legs
// kicking; pipe, drum and major, marching (the legs as walking): the upper arms a little ahead,
// the forearms up to a piccolo held out to the right under the mouth; the arms beating a drum fast
// in turn; the right arm raising and lowering a staff in step and the left swinging; flee, as
// running with the arms up over the head, flailing; push, walking with the arms ahead to a
// wheelchair's handles (PUSH radians), hold, the same standing; hobble, on crutches: the arms
// CRUTCH[0] radians ahead swinging by CRUTCH[1] together, the left leg walking, the right in its
// cast held CAST radians ahead; prop, the same standing; shoulders, sitting on someone's
// shoulders, the arms SHOULDERS[0] radians ahead to the head, the legs SHOULDERS[1] ahead over the
// shoulders and turned SHOULDERS[2] out round the neck; lift, as running with the arms held still
// up over the head (UP_ARM), holding something up; steer, as ride with the legs still and the
// arms opened out (STEER), as to a wide steering wheel; cheer, standing a little astride, the arms
// up over the head (UP_ARM), opened out (CHEER) and swaying together (SWAY).
const POSES = [
  "stand",
  "walk",
  "lie",
  "yoga",
  "dance",
  "up",
  "angel",
  "ride",
  "trike",
  "sit",
  "run",
  "scoot",
  "swim",
  "crawl",
  "pipe",
  "drum",
  "major",
  "flee",
  "push",
  "hold",
  "hobble",
  "prop",
  "shoulders",
  "lift",
  "steer",
  "cheer",
];
const SHOULDERS = [0.6, 1.2, 0.6];
const CRUTCH = [0.2, 0.3];
const CAST = 0.3;
// Lying on the back: tilted about its own x after the heading, its back on the ground (LIE metres
// up), turned round, so it lies from its place along the heading, the head furthest.
const LYING = new Set(["lie", "up", "angel"]);
const LIE = 0.12;
// Metres up where they turn, by limb: legs, arms, a dog's legs, a wheelchair's wheels (by its phase,
// rolling), the arms of one sitting in it (walking, pushing the rims: ROW radians ahead, either way,
// strokes per turn of the wheels).
export const PIVOTS = [0.9, 1.41, 0.34, 0.34, 1.15];
// Metres up the hanging arms end, at the hands (every body's but night's).
export const HAND_Y = 0.87;
// Where a point of an arm, y metres up and z ahead as built, is with the arm turned a radians
// about the shoulders as the shader turns it (negative: ahead): [y, z].
export function turnArm(a, y, z = 0) {
  const [py, pz] = [y - PIVOTS[1], z];
  return [PIVOTS[1] + py * Math.cos(a) - pz * Math.sin(a), py * Math.sin(a) + pz * Math.cos(a)];
}
// Metres up the handles of a pram, a buggy and a wheelchair; pushing, the arms PUSH radians ahead
// to them.
const HANDLES = 1.02;
const PUSH = Math.acos((PIVOTS[1] - HANDLES) / (PIVOTS[1] - HAND_Y));
const ROW = [0.35, 0.45, 2];
export const WHEEL = 0.33; // metres, a wheelchair's wheels' radius
// Metres a body sits lower than it stands: its legs, turned ahead, on the ground.
const SEAT = 0.81;
const LEAN = 0.45;
// Tossing, sitting: the right arm's radians ahead, swinging either way.
const TOSS_ARM = [1, 0.5];
// Where one sitting tosses from: a man's right hand, its arm furthest ahead (x, y, z as placed).
export const TOSS_HAND = (() => {
  const [y, z] = turnArm(-TOSS_ARM[0] - TOSS_ARM[1], HAND_Y);
  const q = y - PIVOTS[0];
  return [
    -0.28,
    PIVOTS[0] + q * Math.cos(LEAN) + z * Math.sin(LEAN) - SEAT,
    z * Math.cos(LEAN) - q * Math.sin(LEAN),
  ];
})();
// How much longer the arms reach while swimming upright (pose swim), to the bag ahead.
export const REACH_ARMS = 1.4;
// Piping (pose pipe): the piccolo's middle (y, z) under the mouth (src/fasnacht.js); metres up
// where the arms bend (the elbow), the forearms' radians up there, and per metre of forearm metres
// to the right, the left arm's and the right's, onto the piccolo; the arms' radians ahead
// (PIPE_ARM). The bend and PIPE_ARM bring the hands' ends to the piccolo.
export const PICCOLO = [1.57, 0.25];
const ELBOW = 1.17;
const PIPE_ARMS = (() => {
  const [up, fore] = [ELBOW - PIVOTS[1], ELBOW - HAND_Y];
  const [ty, tz] = [PICCOLO[0] - PIVOTS[1], PICCOLO[1]];
  const bend = -Math.acos((up * up + fore * fore - ty * ty - tz * tz) / (2 * up * fore));
  return [ELBOW, bend, 0.73, 0.07];
})();
export const PIPE_ARM = (() => {
  const [up, fore, bend] = [ELBOW - PIVOTS[1], ELBOW - HAND_Y, PIPE_ARMS[1]];
  const hand = Math.atan2(-fore * Math.sin(bend), up - fore * Math.cos(bend));
  return hand - Math.atan2(PICCOLO[1], PICCOLO[0] - PIVOTS[1]);
})();
// Drumming: the arms' radians (as a), at rest and beating either way, and the beat (radians a
// second), the arms in turn.
export const DRUM_ARMS = [-0.9, 0.25, 14];
// The drum major's right arm, raising and lowering the staff in step: radians (as a) at rest and
// either way, by the walk's phase.
export const MAJOR_ARM = [-1.4, 0.8];
// Radians a second of the sitting one's tossing arm, furthest ahead at 1.5708 (+ its phase).
export const TOSS = 1.5;
// Radians one dancing twists either way.
export const TWIST = 0.4;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// A part at [x, y, z] in a colour slot; limb: ±1 a leg, ±2 an arm, ±3 a dog's leg, 4 a wheelchair's
// wheel, 5 an arm in a wheelchair, the sign its side (or for a dog's leg its
// pair, the diagonal ones moving together); shown only with one of these options, if any given.
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
  piece(box(0.24, 0.08, 0.27), "hair", [0, y + 0.02, -0.01], 0, ["hair", "long"]),
  piece(box(0.22, 0.4, 0.08), "hair", [0, y - 0.17, -0.14], 0, ["long"]),
  piece(box(0.24, 0.08, 0.27), "hat", [0, y + 0.02, -0.01], 0, ["cap", "backcap"]),
  piece(box(0.2, 0.02, 0.12), "hat", [0, y - 0.01, 0.17], 0, ["cap"]),
  piece(box(0.2, 0.02, 0.12), "hat", [0, y - 0.01, -0.19], 0, ["backcap"]),
  piece(box(0.25, 0.14, 0.27), "hat", [0, y + 0.03, -0.01], 0, ["beanie"]),
];
// A person's face on a head w metres wide whose front is at z: eyes at y, white with black pupils,
// a smiling mouth below them; over the eyes glasses or sunglasses: thick frames round them,
// meeting between them, or dark lenses over them, both with temples along the head's sides and a
// top bar on to them.
function face(y, z, w) {
  const [front, half] = [z + 0.03, w / 2];
  const both = ["glasses", "shades"];
  return [
    piece(box(0.05, 0.012, 0.01), "black", [0, y - 0.09, z + 0.005]), // mouth
    ...[-1, 1].flatMap((s) => [
      piece(box(0.012, 0.012, 0.01), "black", [s * 0.031, y - 0.08, z + 0.005]), // mouth's corner
      piece(box(0.055, 0.04, 0.02), "white", [s * 0.05, y, z]),
      piece(box(0.028, 0.028, 0.02), "black", [s * 0.05, y, z + 0.01]),
      piece(
        box(half + 0.009, 0.018, 0.01),
        "black",
        [(s * (half + 0.011)) / 2, y + 0.031, front],
        0,
        both,
      ), // top bar
      piece(
        box(0.01, 0.018, 0.14),
        "black",
        [s * (half + 0.005), y + 0.031, front - 0.07],
        0,
        both,
      ), // temple
      piece(box(0.098, 0.018, 0.01), "black", [s * 0.05, y - 0.031, front], 0, ["glasses"]),
      ...[0.01, 0.09].map((x) =>
        piece(box(0.018, 0.08, 0.01), "black", [s * x, y, front], 0, ["glasses"]),
      ),
      piece(box(0.098, 0.08, 0.01), "black", [s * 0.05, y, front], 0, ["shades"]),
    ]),
  ];
}

// Forearm crutches on arms x metres out, their forearms fore wide: one pole from the ground up
// behind the forearm to a cuff open ahead (behind it as deep as the pole, on its sides), a grip
// ahead from the pole just under the hand; and a plaster cast on the right lower leg (and foot), x
// metres out and w wide: with the option "crutches".
const crutches = (arm, fore, leg, w) => [
  piece(box(w + 0.04, 0.42, w + 0.06), "white", [leg, 0.3, 0], 1, ["crutches"]),
  piece(box(w + 0.01, 0.1, 0.3), "white", [leg, 0.05, 0.03], 1, ["crutches"]),
  ...[-1, 1].flatMap((s) => [
    piece(box(0.035, 1.125, 0.035), "grey", [s * arm, 0.5325, -0.08], 2 * s, ["crutches"]), // pole
    piece(box(0.03, 0.03, 0.1125), "black", [s * arm, 0.855, -0.00625], 2 * s, ["crutches"]), // grip
    piece(box(fore + 0.024, 0.05, 0.035), "black", [s * arm, 1.12, -0.08], 2 * s, ["crutches"]),
    ...[-1, 1].map((t) =>
      piece(
        box(0.012, 0.05, 0.09),
        "black",
        [s * arm + t * (fore / 2 + 0.006), 1.12, -0.04],
        2 * s,
        ["crutches"],
      ),
    ), // cuff
  ]),
];

// A pram or buggy with these parts: four small wheels, a frame and a handle behind, HANDLES up.
const stroller = (parts) =>
  mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      ...[-1, 1].map((f) =>
        piece(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 10).rotateZ(Math.PI / 2), "black", [
          s * 0.25,
          0.14,
          f * 0.25,
        ]),
      ),
      piece(box(0.03, 0.03, 0.6), "grey", [s * 0.22, 0.3, 0]),
    ]),
    piece(box(0.46, 0.04, 0.04), "black", [0, HANDLES, -0.38]),
    ...parts,
  ]);

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
    ...face(1.75, 0.12, 0.22),
    ...heads(1.85),
    ...crutches(0.28, 0.1, 0.1, 0.16),
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
    ...face(1.68, 0.11, 0.2),
    ...heads(1.76),
    ...crutches(0.235, 0.085, 0.085, 0.13),
  ]),
  // Sitting in a wheelchair, trousers, a T-shirt, the hands at the wheels' rims; its rear wheels'
  // axle under the shoulders, its handles behind.
  chair: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(
        new THREE.CylinderGeometry(WHEEL, WHEEL, 0.04, 12).rotateZ(Math.PI / 2),
        "black",
        [s * 0.34, PIVOTS[3], 0],
        4,
      ),
      piece(box(0.02, 0.56, 0.04), "grey", [s * 0.365, PIVOTS[3], 0], 4), // spokes
      piece(box(0.02, 0.04, 0.56), "grey", [s * 0.365, PIVOTS[3], 0], 4),
      piece(box(0.04, 0.12, 0.12), "black", [s * 0.21, 0.06, 0.45]), // caster
      piece(box(0.03, 0.45, 0.03), "grey", [s * 0.21, 0.3, 0.38]),
      piece(box(0.03, 0.5, 0.03), "grey", [s * 0.21, 0.78, -0.15]),
      piece(box(0.05, 0.035, 0.14), "black", [s * 0.22, HANDLES, -0.2]), // handle
      piece(box(0.15, 0.16, 0.47), "bottom", [s * 0.1, 0.6, 0.18]), // thigh
      piece(box(0.14, 0.4, 0.15), "bottom", [s * 0.1, 0.4, 0.42]),
      piece(box(0.13, 0.08, 0.24), "shoes", [s * 0.1, 0.155, 0.48]),
      piece(box(0.13, 0.2, 0.15), "top", [s * 0.28, 1.05, 0], 5),
      piece(box(0.1, 0.42, 0.12), "skin", [s * 0.28, 0.74, 0.02], 5),
    ]),
    piece(box(0.44, 0.04, 0.44), "grey", [0, 0.5, 0.1]), // seat
    piece(box(0.42, 0.45, 0.03), "black", [0, 0.8, -0.14]), // back
    piece(box(0.34, 0.03, 0.16), "grey", [0, 0.1, 0.48]), // footrest
    piece(box(0.42, 0.6, 0.24), "top", [0, 0.87, 0]),
    piece(box(0.1, 0.08, 0.1), "skin", [0, 1.22, 0]),
    piece(box(0.22, 0.26, 0.24), "skin", [0, 1.38, 0]),
    ...face(1.41, 0.12, 0.22),
    ...heads(1.51),
  ]),
  // A pram of hat colour, open behind to the one pushing it: the baby lying under its hood ahead,
  // a white blanket over it.
  pram: stroller([
    piece(box(0.42, 0.32, 0.62), "hat", [0, 0.6, 0.02]),
    piece(box(0.42, 0.3, 0.25), "hat", [0, 0.9, 0.21]), // hood
    piece(box(0.36, 0.02, 0.36), "white", [0, 0.77, -0.08]),
    piece(box(0.12, 0.1, 0.1), "skin", [0, 0.8, 0.12]),
    ...[-1, 1].map((s) => piece(box(0.03, 0.27, 0.03), "grey", [s * 0.2, 0.9, -0.36])),
  ]),
  // A buggy of hat colour, its child sitting in it facing ahead under its hood, its feet on a rest.
  buggy: stroller([
    piece(box(0.34, 0.04, 0.3), "hat", [0, 0.45, 0.02]), // seat
    piece(box(0.34, 0.5, 0.04), "hat", [0, 0.7, -0.15]),
    piece(box(0.38, 0.04, 0.34), "hat", [0, 1.08, -0.04]), // hood
    piece(box(0.3, 0.02, 0.1), "grey", [0, 0.27, 0.24]),
    ...[-1, 1].flatMap((s) => [
      piece(box(0.03, 0.74, 0.03), "grey", [s * 0.2, 0.65, -0.36]),
      piece(box(0.08, 0.08, 0.22), "bottom", [s * 0.06, 0.51, 0.08]), // thigh
      piece(box(0.07, 0.2, 0.08), "bottom", [s * 0.06, 0.4, 0.19]),
      piece(box(0.08, 0.05, 0.12), "shoes", [s * 0.06, 0.3, 0.22]),
      piece(box(0.06, 0.22, 0.07), "skin", [s * 0.15, 0.62, -0.02]), // arm
    ]),
    piece(box(0.24, 0.3, 0.15), "top", [0, 0.62, -0.05]),
    piece(box(0.16, 0.17, 0.16), "skin", [0, 0.87, -0.04]),
    piece(box(0.17, 0.05, 0.17), "hair", [0, 0.96, -0.05]),
    ...face(0.88, 0.04, 0.16),
  ]),
  // A football kit: a shirt (top) with sleeves of the socks' colour (hat), shorts (bottom), socks
  // and boots (shoes).
  player: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.12, 0.08, 0.26), "shoes", [s * 0.1, 0.04, 0.03], s),
      piece(box(0.13, 0.42, 0.15), "hat", [s * 0.1, 0.29, 0], s),
      piece(box(0.13, 0.12, 0.15), "skin", [s * 0.1, 0.56, 0], s),
      piece(box(0.16, 0.3, 0.18), "bottom", [s * 0.1, 0.77, 0], s),
      piece(box(0.13, 0.2, 0.15), "hat", [s * 0.28, 1.39, 0], 2 * s),
      piece(box(0.1, 0.42, 0.12), "skin", [s * 0.28, 1.08, 0], 2 * s),
    ]),
    piece(box(0.44, 0.1, 0.25), "bottom", [0, 0.85, 0]),
    piece(box(0.44, 0.62, 0.25), "top", [0, 1.21, 0]),
    piece(box(0.1, 0.08, 0.1), "skin", [0, 1.56, 0]),
    piece(box(0.22, 0.26, 0.24), "skin", [0, 1.72, 0]),
    ...face(1.75, 0.12, 0.22),
    ...heads(1.85),
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
    ...face(1.66, 0.11, 0.2),
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
    ...face(1.71, 0.11, 0.2),
    piece(box(0.22, 0.06, 0.25), "hair", [0, 1.8, -0.01]),
    piece(box(0.22, 0.4, 0.08), "hair", [0, 1.6, -0.1]),
    piece(box(0.06, 0.16, 0.22), "top", [0.31, 0.98, 0]),
  ]),
  // Fur, darker ears, eyes and nose, a collar (top).
  dog: mergeGeometries([
    ...[-1, 1].flatMap((s) => [
      piece(box(0.06, 0.34, 0.06), "skin", [s * 0.07, 0.17, 0.2], 3 * s),
      piece(box(0.06, 0.34, 0.06), "skin", [s * 0.07, 0.17, -0.2], -3 * s),
      piece(box(0.04, 0.08, 0.04), "hair", [s * 0.06, 0.66, 0.31]),
      piece(box(0.03, 0.03, 0.03), "hair", [s * 0.085, 0.59, 0.41]), // eyes
    ]),
    piece(box(0.2, 0.2, 0.55), "skin", [0, 0.42, 0]),
    piece(box(0.17, 0.17, 0.2), "skin", [0, 0.55, 0.34]),
    piece(box(0.09, 0.08, 0.12), "hair", [0, 0.51, 0.48]),
    piece(box(0.21, 0.05, 0.06), "top", [0, 0.5, 0.25]),
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
      vLook = slot > 5.5 ? vec3(slot < 6.5 ? 1.0 : slot < 7.5 ? 0.0 : 0.2)
        : linear(slot < 0.5 ? look.x : slot < 1.5 ? look.y : slot < 2.5 ? look.z
        : slot < 3.5 ? look.w : slot < 4.5 ? more.x : more.y);
      if (piece.z > 0.0 && (int(piece.z) & int(more.z)) == 0) transformed = vec3(0.0);
      if (piece.y != 0.0) {
        float side = sign(piece.y);
        int limb = int(abs(piece.y));
        float pivot = limb == 1 ? ${PIVOTS[0]} : limb == 2 ? ${PIVOTS[1]}
          : limb == 3 ? ${PIVOTS[2]} : limb == 4 ? ${PIVOTS[3]} : ${PIVOTS[4]};
        // Positive turns the limb back.
        int pose = int(more.w + 0.5);
        float t = peopleTime;
        bool dressed = (int(more.z) & ${1 << OPTIONS.indexOf("dress")}) != 0;
        float a = limb == 4 ? phase
          : limb == 5 ? (pose == 1 ? -${ROW[0]} - ${ROW[1]} * sin(phase * ${ROW[2]}.0) : 0.0)
          : pose == 25 ? (limb == 2 ? -${UP_ARM} : 0.0)
          : pose == 24 ? (limb == 2 ? -${STEER[0]} : -0.4)
          : pose == 23 ? (limb == 2 ? -${UP_ARM} : -${RUN_LEG} * sin(phase) * side)
          : pose == 22 ? -(limb == 2 ? ${SHOULDERS[0]} : ${SHOULDERS[1]})
          : pose >= 19 ? (limb == 2 ? (pose == 19 ? -${PUSH}
              : -${CRUTCH[0]} - (pose == 20 ? ${CRUTCH[1]} * sin(phase) : 0.0))
            : pose == 19 ? 0.0 : side > 0.0 ? -${CAST} : pose == 20 ? ${LEG} * sin(phase) : 0.0)
          : dressed && limb == 1 && (pose == 1 || pose == 10 || pose >= 14)
            ? -${DRESS_LEG} * sin(phase) * side
          : pose == 1 ? (limb == 2 ? ${ARM} : -${LEG}) * sin(phase) * side
          : pose == 17 && limb == 2 ? -${UP_ARM} + ${FLAIL} * sin(phase) * side
          : pose == 10 || pose == 17 ? (limb == 2 ? ${RUN_ARM} * sin(phase) * side - ${RUN_FORWARD}
            : -${RUN_LEG} * sin(phase) * side)
          : pose == 11 ? (limb == 2 ? -0.6 : -0.12 * side)
          : pose == 0 && limb == 2 ? ${SWING} * sin(t * 2.0 + phase + side * 1.4) - ${FORWARD}
          : pose == 3 && limb == 2 ? -1.5 + 1.5 * cos(t * 0.6 + phase)
          : pose == 4 && limb == 2 ? -1.6 - 0.8 * sin(t * 4.0 + phase + side * 1.6)
          : pose == 4 ? 0.3 * sin(t * 4.0 + phase) * side
          : pose == 5 ? -1.5708
          : pose == 7 ? (limb == 2 ? -1.1 : -0.4 + 0.3 * sin(phase) * side)
          : pose == 8 ? (limb == 2 ? -1.0 : -1.1 + 0.25 * sin(phase) * side)
          : pose == 9 && limb == 2 ? (side < 0.0 ? -float(${TOSS_ARM[0]}) - ${TOSS_ARM[1]} * sin(t * ${TOSS} + phase) : -0.3)
          : pose == 9 ? -1.5708
          : pose == 12 ? (limb == 2 ? -1.5708 : 0.2 * sin(t * 2.0 + phase) * side)
          : pose == 13 ? (limb == 2 ? mod(t * 2.4 + phase + side * 1.5708, 6.2832)
            : 0.25 * sin(t * 5.0 + phase) * side)
          : pose >= 14 && limb != 2 ? -${LEG} * sin(phase) * side
          : pose == 14 ? -${PIPE_ARM}
          : pose == 15 ? ${DRUM_ARMS[0]} + ${DRUM_ARMS[1]} * sin(t * float(${DRUM_ARMS[2]}) + side * 1.5708)
          : pose == 16 ? (side < 0.0 ? ${MAJOR_ARM[0]} + ${MAJOR_ARM[1]} * sin(phase) : ${ARM} * sin(phase) * side)
          : pose == 18 ? -${PUSH}
          : 0.0;
        if (pose == 14 && limb == 2 && transformed.y < ${PIPE_ARMS[0]}) {
          // Piping: the forearm turned up at the elbow and to the right, onto the piccolo.
          float down = ${PIPE_ARMS[0]} - transformed.y, b = ${PIPE_ARMS[1]};
          transformed.x -= (side > 0.0 ? ${PIPE_ARMS[2]} : ${PIPE_ARMS[3]}) * down;
          vec2 e = vec2(-down, transformed.z);
          transformed.yz = vec2(e.x * cos(b) - e.y * sin(b), e.x * sin(b) + e.y * cos(b))
            + vec2(${PIPE_ARMS[0]}, 0.0);
        }
        vec2 p = transformed.yz - vec2(pivot, 0.0);
        if (pose == 12 && limb == 2) p *= ${REACH_ARMS}; // swimming: reaching far to the bag
        transformed.yz = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a))
          + vec2(pivot, 0.0);
        if (pose == 24 && limb == 2) {
          // Opened out about the shoulder.
          float b = side * ${STEER[1]};
          vec2 joint = vec2(side * 0.2, 0.0);
          vec2 q = transformed.xz - joint;
          transformed.xz = joint + vec2(q.x * cos(b) + q.y * sin(b), q.y * cos(b) - q.x * sin(b));
        }
        if (pose == 6 || pose == 25) {
          // Out to its side in the body's plane, about the shoulder or hip of a slim body (the
          // arms of one cheering raised, so turned the other way).
          float spread = 0.5 - 0.5 * cos(t * 1.5 + phase);
          float b = pose == 25
            ? (limb == 2 ? ${SWAY[0]} * sin(t * ${SWAY[1]} + phase) - side * ${CHEER[0]}
              : side * ${CHEER[1]})
            : side * (limb == 2 ? 0.2 + 2.2 * spread : 0.05 + 0.45 * spread);
          vec2 joint = vec2(side * (limb == 2 ? 0.2 : 0.09), pivot);
          vec2 q = transformed.xy - joint;
          transformed.xy = joint + vec2(q.x * cos(b) - q.y * sin(b), q.x * sin(b) + q.y * cos(b));
        }
        if (pose == 5 || pose == 22 && limb == 1) {
          // Out to its side, about the body's upright middle.
          float b = side * (pose == 22 ? ${SHOULDERS[2]} : 0.55 + 0.35 * sin(t * 1.2 + phase));
          transformed.xz = vec2(
            transformed.x * cos(b) + transformed.z * sin(b),
            transformed.z * cos(b) - transformed.x * sin(b)
          );
        }
      }
      if (int(more.w + 0.5) == 4) {
        float w = ${TWIST} * sin(peopleTime * 1.0 + phase);
        transformed.xz = vec2(
          transformed.x * cos(w) + transformed.z * sin(w),
          transformed.z * cos(w) - transformed.x * sin(w)
        );
        transformed.y += 0.05 * abs(sin(peopleTime * 2.0 + phase));
      }
      if (int(more.w + 0.5) == 10 || int(more.w + 0.5) == 17)
        transformed.y += ${BOUNCE} * abs(sin(phase));
      if (int(more.w + 0.5) == 9) {
        if (abs(piece.y) != 1.0) {
          // All but the legs back about the hips.
          float l = ${LEAN};
          vec2 q = transformed.yz - vec2(${PIVOTS[0]}, 0.0);
          transformed.yz = vec2(q.x * cos(l) + q.y * sin(l), q.y * cos(l) - q.x * sin(l))
            + vec2(${PIVOTS[0]}, 0.0);
        }
        transformed.y -= ${SEAT};
      }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", "varying vec3 vLook;\nvoid main() {")
    .replace("vec4( diffuse, opacity )", "vec4( vLook, opacity )");
};

// The crowds whose figures flee from traffic (dodge).
const fleeing = [];
// Fleeing: running RUN metres per second, at most REACH metres from its place (or, loose, from
// where it is; on a roof, round it ROOF metres out), back after CALM
// seconds calm at its way's end, at BACK metres per second; radians of the run, of the walk per
// metre (STRIDE); standing, it turns SPIN radians per second to face its place.
// Each figure has its own pace (RUN and BACK times 0.6 to 1.4), CALM times 0.4 to 1.6, metres
// beyond a danger (0 to AHEAD more) and radians its way out turns (up to TURN either way), so they
// do not move as one.
const RUN = 7;
const REACH = 15;
const ROOF = 1.5;
const ROUND = 0.5; // times as fast as running, round on a roof
const CALM = 2.5;
const BACK = 1.3;
const STRIDE = [2.6, 4.5];
const AHEAD = 4;
const TURN = 0.6;
const SPIN = 6;
// The loose (flight) go back HOMEWARD times as fast, after a HOMEWARD-th of the wait, but stay
// where they are while danger is within WARY metres more than their room.
const [HOMEWARD, WARY] = [3, 10];
// Radians the loose flee off straight across a danger towards where it goes, each 0.8 to 1.2 times
// this, so they run away from what chases them rather than round it.
const ONWARD = 0.9;
const [WALK, STAND, FLEE, SWIM, LIFT] = ["walk", "stand", "flee", "swim", "lift"].map((pose) =>
  POSES.indexOf(pose),
);
const SWIMMING = new Set(["swim", "crawl"].map((pose) => POSES.indexOf(pose)));
export const SWIM_FLEE = 0.4; // swimming, times as fast as running
const SWIM_BACK = 2; // swimming, times as fast going back

// count of a body (BODIES): { mesh, dress(i, look, pose), place(i, x, y, z, heading, phase, size,
// tilt: radians about its own x after the heading), hide(i), away(i): whether off its place
// (dodge), offset(i) }; a look's head is short hair unless given, its face (OPTIONS: glasses or
// shades) bare, without crutches unless given. Its figures flee from traffic (dodge) unless flee is false; if it is "march", only from
// vehicles, keeping their pose (the marching clique, src/fasnacht.js); if it is "roof", running
// round their places (circling), keeping their height (on a roof, which dodge's ground does not
// know).
export function createCrowd(body, count, flee = true) {
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
  const put = (i, x, y, z, heading, phase, size, tilt) => {
    matrix.makeRotationY(heading).multiply(tilted.makeRotationX(tilt));
    matrix.scale(scale.setScalar(size)).setPosition(x, y, z);
    mesh.setMatrixAt(i, matrix);
    phases.array[i] = phase;
    mesh.instanceMatrix.needsUpdate = phases.needsUpdate = true;
  };
  // Per figure: as placed, x, y, z, heading, phase, size, tilt and its pose; fleeing, how far it
  // is off that place (x, z), its heading, its phase beyond the placed one, the seconds it has
  // been calm (0 while fleeing) and where off that place it goes (x, z); its pace, calm, metres
  // beyond a danger and turn, each 0 to 1.
  const home = new Float32Array(8 * count);
  const off = new Float32Array(7 * count);
  const own = Float32Array.from({ length: 4 * count }, Math.random);
  if (flee)
    fleeing.push({
      count,
      home,
      off,
      own,
      put,
      poses: more,
      march: flee === "march",
      roof: flee === "roof",
    });
  return {
    mesh,
    dress(
      i,
      { skin, hair, top = 0, bottom = 0, shoes = 0, hat = 0, head = "hair", dress, face, crutches },
      pose,
    ) {
      const options = [head, dress && "dress", face, crutches && "crutches"]
        .filter(Boolean)
        .reduce((m, option) => m | (1 << OPTIONS.indexOf(option)), 0);
      look.set([skin, hair, top, bottom], 4 * i);
      more.set([shoes, hat, options, (home[8 * i + 7] = POSES.indexOf(pose))], 4 * i);
      look.needsUpdate = more.needsUpdate = true;
    },
    place(i, x, y, z, heading, phase, size = 1, tilt = 0) {
      home.set([x, y, z, heading, phase, size, tilt], 8 * i);
      put(i, x, y, z, heading, phase, size, tilt);
    },
    // Out of sight, no longer fleeing.
    hide(i) {
      off.fill(0, 7 * i, 7 * i + 7);
      more.array[4 * i + 3] = home[8 * i + 7];
      more.needsUpdate = true;
      this.place(i, 0, -1000, 0, 0, 0);
    },
    away: (i) => off[7 * i] !== 0 || off[7 * i + 1] !== 0,
    // Off its place x, z, its heading, its phase beyond the placed one and seconds calm (dodge).
    offset: (i) => off.subarray(7 * i, 7 * i + 5),
  };
}

// One fleeing dt seconds on, its place at x, y, z (off: at o, metres off it x, z, heading, phase
// beyond the placed one, seconds calm, where off it it goes x, z; own: at f, its pace, calm, clear
// and turn, each 0 to 1), speed times as fast (back times going back), taking up room metres round
// it: in danger
// (danger(x, y, z, reach, march, clear, turn, room, onward): null if none, else its way out
// [x, z] within reach metres, [0, 0] if none, so always for reach 0; march: whether only vehicles
// count; clear: extra metres beyond the danger; turn: radians the way turns off straight across
// it, onward: towards where the danger goes) it runs that way out (within REACH and room metres of
// its place; loose, of where it is, and onward), sought anew once there or when its end is in
// danger too; calm again, it walks back (loose, after a HOMEWARD-th of the wait, HOMEWARD times as
// fast, and not while danger is within WARY); off its place but still, it turns to face it. The
// metres it moved, -1 if it is at its place and calm.
function flight(off, o, own, f, x, y, z, dt, danger, march, speed, back, room = 0, loose = false) {
  const homeward = loose ? HOMEWARD : 1;
  const pace = 0.6 + 0.8 * own[f];
  let [ox, oz, calm, tx, tz] = [off[o], off[o + 1], off[o + 4], off[o + 5], off[o + 6]];
  const inDanger = danger(x + ox, y, z + oz, 0, march, 0, 0, room);
  if (!inDanger && !ox && !oz) return -1;
  const there = tx === ox && tz === oz;
  if (inDanger) {
    if (calm || there || danger(x + tx, y, z + tz, 0, march, 0, 0, room)) {
      const reach = REACH + room - (loose ? 0 : Math.hypot(ox, oz));
      const clear = AHEAD * own[f + 2];
      const turn = loose ? ONWARD * (0.8 + 0.4 * own[f + 3]) : TURN * (2 * own[f + 3] - 1);
      const [ax, az] = danger(x + ox, y, z + oz, reach, march, clear, turn, room, loose);
      [tx, tz] = [ox + ax, oz + az];
    }
    calm = 0;
  } else if (loose && (there || calm) && danger(x + ox, y, z + oz, 0, march, 0, 0, room + WARY)) {
    [calm, tx, tz] = [0, ox, oz]; // out, or on its way back, with danger near: staying there
  } else if (there && (calm += dt) > (CALM * (0.4 + 1.2 * own[f + 1])) / homeward)
    [tx, tz] = [0, 0];
  const [dx, dz] = [tx - ox, tz - oz];
  const left = Math.hypot(dx, dz);
  const step = Math.min(left, (calm ? BACK * homeward * back : RUN * speed) * pace * dt);
  if (step) {
    off[o + 2] = Math.atan2(dx, dz);
    [ox, oz] = step < left ? [ox + (dx / left) * step, oz + (dz / left) * step] : [tx, tz];
  } else if (ox || oz) {
    const a = Math.atan2(-ox, -oz) - off[o + 2];
    const turn = a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    off[o + 2] += Math.sign(turn) * Math.min(Math.abs(turn), SPIN * dt);
  }
  off.set([ox, oz], o);
  off.set([calm, tx, tz], o + 4);
  if (!ox && !oz) off[o + 3] = off[o + 4] = 0;
  else off[o + 3] += step * STRIDE[calm ? 1 : 0];
  return step;
}

// One on a roof dt seconds on, as flight has it (off, own, its place, danger): in danger it runs
// round its place ROOF metres out, ROUND times as fast as running, its own way round (by its
// turn), from where it is (from its place, setting out its own way, by its clear); calm again for
// its wait (CALM, by its calm), it walks back. The metres it moved, -1 if it is at its place and
// calm.
function circling(off, o, own, f, x, y, z, dt, danger) {
  const [ox, oz] = [off[o], off[o + 1]];
  let calm = off[o + 4];
  const inDanger = danger(x + ox, y, z + oz, 0, false, 0, 0, 0);
  if (!inDanger && !ox && !oz) return -1;
  const pace = 0.6 + 0.8 * own[f];
  const out = Math.hypot(ox, oz);
  let [nx, nz] = [ox, oz];
  if (inDanger) {
    calm = 0;
    const run = RUN * ROUND * pace * dt;
    const a =
      (out ? Math.atan2(ox, oz) : 2 * Math.PI * own[f + 2]) +
      (own[f + 3] < 0.5 ? -run : run) / ROOF;
    const r = Math.min(ROOF, out + run);
    [nx, nz] = [r * Math.sin(a), r * Math.cos(a)];
  } else if ((calm += dt) > CALM * (0.4 + 1.2 * own[f + 1])) {
    const back = BACK * pace * dt;
    [nx, nz] = back < out ? [ox - (ox / out) * back, oz - (oz / out) * back] : [0, 0];
  }
  const step = Math.hypot(nx - ox, nz - oz);
  if (step) off[o + 2] = Math.atan2(nx - ox, nz - oz);
  off.set([nx, nz], o);
  off[o + 4] = calm;
  if (!nx && !nz) off[o + 3] = off[o + 4] = 0;
  else off[o + 3] += step * STRIDE[calm ? 1 : 0];
  return step;
}

// count things that flee as the figures do (flight), speed times as fast, from danger (as dodge
// has it), loose (flight): as far as they are chased, waiting less and going back faster. (i, x,
// y, z, dt, room) moves the i-th, its place at x, y, z, taking up room metres round it, dt seconds
// on and gives its state as flight has it (x, z off its place, its heading, ...,
// where off it it goes: x, z at 5, 6), null if at its place.
export function createFlight(count, danger, speed = 1) {
  const off = new Float32Array(7 * count);
  const own = Float32Array.from({ length: 4 * count }, Math.random);
  return (i, x, y, z, dt, room = 0) => {
    const o = 7 * i;
    if (dt && flight(off, o, own, 4 * i, x, y, z, dt, danger, false, speed, speed, room, true) < 0)
      return null;
    return off[o] || off[o + 1] ? off.subarray(o, o + 7) : null;
  };
}

// Moves the figures of all crowds dt seconds on (flight; on a roof, circling), after their own
// moves. Off its place one stands on ground(x, z, y) (on a roof, at its place's height) upright,
// running or walking, else standing (marching ones keep their pose). One swimming runs SWIM_FLEE times as fast, on the water (water(x, z): its surface's
// height there, null on land) or the ground, its arms up: lifting what it holds (swim), else
// flailing; calm, it swims back SWIM_BACK times as fast, keeping its pose, height and tilt, or on
// land walks back.
export function dodge(dt, danger, ground, water) {
  for (const { count, home, off, own, put, poses, march, roof } of fleeing)
    for (let i = 0; i < count; i++) {
      const [h, o] = [8 * i, 7 * i];
      const [x, y, z] = [home[h], home[h + 1], home[h + 2]];
      const swim = SWIMMING.has(home[h + 7]);
      const [speed, homeward] = swim ? [SWIM_FLEE, SWIM_BACK] : [1, 1];
      const step = roof
        ? circling(off, o, own, 4 * i, x, y, z, dt, danger)
        : flight(off, o, own, 4 * i, x, y, z, dt, danger, march, speed, homeward);
      if (step < 0) continue;
      const back = !off[o] && !off[o + 1];
      const [fx, fz, calm] = [x + off[o], z + off[o + 1], off[o + 4]];
      const surface = swim ? water(fx, fz) : null;
      const swimming = calm && surface !== null; // back in the water
      const run = home[h + 7] === SWIM ? LIFT : FLEE;
      const pose =
        back || march || swimming
          ? home[h + 7]
          : !calm && (swim || step)
            ? run
            : step
              ? WALK
              : STAND;
      if (poses.array[4 * i + 3] !== pose) {
        poses.array[4 * i + 3] = pose;
        poses.needsUpdate = true;
      }
      if (back) put(i, ...home.subarray(h, h + 7));
      else {
        const [fy, tilt] = swimming
          ? [y, home[h + 6]]
          : [roof ? y : (surface ?? ground(fx, fz, y)), 0];
        put(i, fx, fy, fz, off[o + 2], home[h + 4] + off[o + 3], home[h + 5], tilt);
      }
    }
}

// People at places ({ x, y, z, heading, pose, tilt }), standing unless another pose (POSES) is
// given; one lying has its place at its feet (were they on the ground) and its head away along the
// heading; one not lying is tilted forward by tilt radians, if given. With these looks in turn,
// fleeing as createCrowd's flee says; a mesh per body.
export function createPeople(places, looks, flee = true) {
  const bodies = Map.groupBy(places.keys(), (k) => looks[k % looks.length].body);
  return [...bodies].map(([body, ks]) => {
    const crowd = createCrowd(body, ks.length, flee);
    ks.forEach((k, i) => {
      const { x, y, z, heading, pose = "stand", tilt = 0 } = places[k];
      crowd.dress(i, looks[k % looks.length], pose);
      if (LYING.has(pose)) crowd.place(i, x, y + LIE, z, heading + Math.PI, 0, 1, -Math.PI / 2);
      else crowd.place(i, x, y, z, heading, k * 2.3, 1, tilt);
    });
    crowd.mesh.computeBoundingSphere();
    crowd.mesh.boundingSphere.radius += REACH; // where they may flee to
    return crowd.mesh;
  });
}
