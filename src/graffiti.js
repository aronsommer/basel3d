// Graffiti in Cherry Bomb One (public/CherryBombOne.woff2, its Latin letters), Rocker
// (public/Rocker.woff2), Honk (public/Honk.woff2), Lacquer (public/Lacquer.woff2) or Crafty Girls
// (public/CraftyGirls.woff2), painted off the page's thread (startPainter, src/painter.js): small
// tags and big pieces on walls, roofs, bridges and the ground, each where src/graffiti-data.js says
// (createGraffiti); and whole cars and whole trams (wholeCar, WHOLE_CARS, WHOLE_TRAMS).
import * as THREE from "three";
import { fromWGS84 } from "./geo.js";
import PLACED from "./graffiti-data.js";

const FCB = [0xd51f2a, 0x1d3fbf]; // red over blue: Rotblau, red first
// Per kind: px of its letters when drawn.
const KINDS = { tag: 96, piece: 200 };
const OFF = 0.02; // metres a graffito stands off what it lies on
// Every graffito's style, numbered from 1 in this order (its style), each { kind (KINDS), look }: a
// look (drawn by src/painter.js) in Honk's palette honk (HONK, with face its letters' face all that
// colour, with ink their shadow and lines) or, without, in font (a family, Cherry Bomb One if none)
// with face as sheetOf's (or faces, one per word, or letters, one per letter in turn), or with
// plain all in that colour (plainOf, thick); with rim framed inside (framed); with cut false
// without the white cut line; with outline round it (a colour or a list of them, outlined; with
// splash false not splashed out, with splash a text splashed as that, with short its splashes that
// share as long) and back behind it (two colours: on a car's side all over it, elsewhere a slab);
// with fill on a car as big as it fits (carSide). New ones go at the end, and none is moved or
// taken out, so a number always means the same style, on the cars and in src/graffiti-data.js
// alike.
export const STYLES = [
  // 1, 2: tags.
  { kind: "tag", look: { font: "Crafty Girls", plain: 0x151515, thick: 0.03 } },
  { kind: "tag", look: { font: "Lacquer", plain: 0x151515 } },
  // 3: a plain piece.
  { kind: "piece", look: {} },
  // 4 to 13: the trains' first.
  { kind: "piece", look: { honk: 0, rim: "upLeft", outline: 0x00e640 } },
  // Poison green in magenta, its complement.
  {
    kind: "piece",
    look: {
      faces: [
        [0xffd23a, 0xffa800, 0xe07000],
        [0xb6f22e, 0x6fd62a, 0x1e9e3a],
      ],
      rim: "upLeft",
      outline: 0xff00ff,
      splash: "BASEL", // its splashes shaped as for this text, whatever it says
    },
  },
  { kind: "piece", look: { back: FCB } }, // on the FCB's colours
  // FCB blue in FCB red.
  { kind: "piece", look: { honk: 7, face: 0x1d3fbf, rim: true, outline: 0xd51f2a } },
  { kind: "piece", look: { honk: 7, face: 0x3cc84e, rim: "upLeft", outline: 0xff8c00 } },
  // Confetti: each letter the next colour round.
  {
    kind: "piece",
    look: {
      letters: [
        0xffd400, 0xff9f1a, 0xff5a3c, 0xff3da8, 0xc04bff, 0x6a6bff, 0x2fa8ff, 0x18d4c0, 0x5be36a,
      ],
      rim: true,
      outline: 0xff00ff,
    },
  },
  // Chrome (silver above a sharp dark horizon, lighter below, so its white rim shows) in blood,
  // splashed as 5 but shorter.
  {
    kind: "piece",
    look: {
      font: "Rocker",
      face: [0xc4c9cf, 0xb2b8bf, 0x9aa1a9, 0x2b3036, 0x484e56, 0x8a919a, 0xd0d4d9],
      rim: "upLeft",
      outline: 0xb0000f,
      splash: "BASEL",
      short: 0.6,
    },
  },
  { kind: "piece", look: { honk: 7, outline: 0xe01020 } },
  {
    kind: "piece",
    look: { fill: true, cut: false, outline: [0xffd000, 0xe01020], splash: false },
  },
  { kind: "piece", look: { font: "Rocker", outline: 0x8a2be2 } },
  // 14 to 21: the trams' first.
  { kind: "piece", look: { honk: 0, rim: "upLeft", outline: 0x00e640 } }, // as 4
  // Striped as the pride flag.
  {
    kind: "piece",
    look: {
      face: { stripes: [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x24408e, 0x732982] },
      rim: true,
      outline: 0xe01020,
    },
  },
  { kind: "piece", look: { outline: 0xff00ff } },
  {
    kind: "piece",
    look: {
      font: "Rocker",
      face: [0xc4c9cf, 0x9aa1a9, 0x2b3036, 0x8a919a, 0xd0d4d9],
      rim: "upLeft",
      outline: 0x1a5cff,
    },
  },
  {
    kind: "piece",
    look: {
      font: "Rocker",
      face: [0xb6f22e, 0x6fd62a, 0x1e9e3a], // poison green, as in 5
      rim: "upLeft",
      outline: 0xe01020,
    },
  },
  { kind: "piece", look: { honk: 1, ink: 0x000000, rim: "upLeft", outline: 0xff2d95 } },
  // Lipstick: cherry red to pink, in indigo (not cyan, the colour of what is picked).
  {
    kind: "piece",
    look: { face: [0xd0002a, 0xff2d6f, 0xff7ab8], rim: "upLeft", outline: 0x3a1fd1 },
  },
  { kind: "piece", look: { font: "Rocker", outline: 0xc000ff } },
];
// A graffito's [kind, look]: its style's (STYLES), with its own fields (own) over the look's.
export function styled(style, own) {
  const { kind, look } = STYLES[style - 1];
  return [kind, { ...look, ...own }];
}
// Whole cars on trams and trains (which: src/main.js), per kind: on each side (right and left of
// its way) a piece over a car's body, { style (its number in STYLES), text }, each vehicle wearing
// all of its kind's, one per car from its last, its own (in turn) first; or a tram a whole tram
// (WHOLE_TRAMS) instead. A side may be left bare.
export const WHOLE_CARS = {
  // From the last car on, fonts so that no two next to each other (round again too) and no car's
  // two sides are in the same: right Honk, Cherry, Honk, Rocker, Cherry; left Cherry, Honk,
  // Cherry, Honk, Rocker.
  train: [
    { right: { style: 4, text: "GANGSTER" }, left: { style: 5, text: "SEXY BASEL" } },
    { right: { style: 6, text: "FC BASEL 1893" }, left: { style: 7, text: "SCHEISS ZÜRI" } },
    { right: { style: 8, text: "BASILISK" }, left: { style: 9, text: "HUERESOHN" } },
    { right: { style: 10, text: "KILLER BEBBI" }, left: { style: 11, text: "CRAZY CREW" } },
    // Basel in Polish.
    { right: { style: 12, text: "BAZYLEA ONE" }, left: { style: 13, text: "YO DIGGE" } },
  ],
  tram: [
    // From the last car on fonts as on the trains: right Honk, Cherry, Rocker, Cherry; left
    // Cherry, Rocker, Honk, Rocker.
    { right: { style: 14, text: "HÖSCH" }, left: { style: 15, text: "LOVE" } },
    // Kleinbasel's postcodes, 4057 and 4058.
    { right: { style: 16, text: "4057" }, left: { style: 17, text: "RHY" } },
    { right: { style: 18, text: "ZOLLI" }, left: { style: 19, text: "4058" } },
    { right: { style: 20, text: "SEXY" }, left: { style: 21, text: "ACAB" } },
  ],
};
// Whole trams: per side a piece over all of a tram's cars, as WHOLE_CARS's, its text a word a car
// if it has as many, else its letters shared out among them; read from the front on the right.
export const WHOLE_TRAMS = [
  // The FCB's song, a line a side, in the FCB's colours.
  {
    right: { style: 6, text: "ROT ISCH UNSERI LIEBI" },
    left: { style: 6, text: "BLAU DIE EWIGI TREUI" },
  },
];
// The painter (src/painter-worker.js, startPainter), asked by message: its answers by their id.
let painter = null;
const [asked, answers] = [{ last: 0 }, new Map()];
// Starts painting in worker (src/painter-worker.js) with these fonts: [[family, bytes], …].
export function startPainter(worker, fonts) {
  painter = worker;
  worker.onmessage = ({ data }) => {
    answers.get(data.id)(data);
    answers.delete(data.id);
  };
  worker.postMessage(
    { fonts },
    fonts.map(([, bytes]) => bytes),
  );
}
// Resolves to the painter's answer to message: { image, scale }.
const ask = (message) =>
  new Promise((answer) => {
    const id = ++asked.last;
    answers.set(id, answer);
    painter.postMessage({ id, ...message });
  });
// A material showing a painted image (upside down: flipY false), near the walls without fighting
// them.
function material(image) {
  const map = new THREE.Texture(image);
  map.flipY = false;
  map.needsUpdate = true;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshLambertMaterial({
    map,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}
const plane = () => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // its bottom's middle at 0

// A surface's facing (compass degrees towards where its reader stands, 0 north) and lean (degrees
// its face looks up: 0 a wall, 90 flat) as unit vectors: out of it (n) and up along it (up), so
// on a wall straight up, on a slope up it, on a flat one away from its reader. x east, z south.
export function surface(facing, lean) {
  const [h, l] = [facing, lean].map(THREE.MathUtils.degToRad);
  const [dx, dz] = [Math.sin(h), -Math.cos(h)];
  return {
    n: new THREE.Vector3(Math.cos(l) * dx, Math.sin(l), Math.cos(l) * dz),
    up: new THREE.Vector3(-Math.sin(l) * dx, Math.cos(l), -Math.sin(l) * dz),
  };
}
// The other way round, for one lying facing n, its top towards up turned tilt degrees to the left:
// facing and lean of its surface (as above), and tilt from that surface's up to its top.
export function orientationOf(n, up, tilt) {
  const deg = THREE.MathUtils.radToDeg;
  const flat = Math.hypot(n.x, n.z) < 1e-6;
  const [dx, dz] = flat ? [-up.x, -up.z] : [n.x, n.z];
  const facing = (deg(Math.atan2(dx, -dz)) + 360) % 360;
  const lean = deg(Math.atan2(n.y, Math.hypot(n.x, n.z)));
  const base = surface(facing, lean).up;
  const turn = Math.atan2(new THREE.Vector3().crossVectors(base, up).dot(n), base.dot(up));
  return { facing, lean, tilt: tilt + deg(turn) };
}
// Lays a graffito's mesh (aspect: its sheet's width to height) on a surface, OFF out of it: its
// middle at at, facing n, its top towards up (unit vectors square to each other), width metres wide,
// turned tilt degrees to the left (kept in its userData).
const [basis, turn, top] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3()];
const Z = new THREE.Vector3(0, 0, 1);
export function lay(mesh, aspect, at, n, up, width, tilt = 0) {
  mesh.userData.tilt = tilt;
  basis.makeBasis(top.crossVectors(up, n), up, n);
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.quaternion.multiply(turn.setFromAxisAngle(Z, THREE.MathUtils.degToRad(tilt)));
  mesh.scale.set(width, width / aspect, 1);
  top.set(0, 1, 0).applyQuaternion(mesh.quaternion);
  mesh.position
    .copy(at)
    .addScaledVector(n, OFF)
    .addScaledVector(top, -width / aspect / 2);
}
// Resolves to a graffito's mesh: a plane with look painted on it (paintOn).
export async function graffitoMesh(kind, look) {
  const mesh = new THREE.Mesh(plane());
  await paintOn(mesh, kind, look);
  return mesh;
}
// Resolves to an ImageBitmap of a graffito's look of kind (KINDS), its letters size px (as its
// kind's if none), the right way up (for a canvas, not a texture).
export const artOf = async (kind, look, size = KINDS[kind]) =>
  (await ask({ art: [look, size], flip: false })).image;
// Paints a graffito's look of kind on its mesh anew, freeing what was there, and keeps its
// image's width to height in its userData (aspect).
export async function paintOn(mesh, kind, look) {
  const { image } = await ask({ art: [look, KINDS[kind]] });
  mesh.material.map?.dispose();
  mesh.material.dispose();
  mesh.material = material(image);
  // Graffiti hide one another by their order (renderOrder) alone, not by how far each is: two on a
  // wall, as far off it, would else flicker.
  mesh.material.depthWrite = false;
  mesh.userData.aspect = image.width / image.height;
}
// Resolves to [the material of a whole car's side (src/painter.js, carSide), the scale its piece is
// drawn at].
export async function wholeCar(look, width, height, most = Infinity) {
  const { image, scale } = await ask({ car: [look, width, height, most] });
  return [material(image), scale];
}
// Where a graffito's mesh lies, as lay takes it: { at, n, up, width, tilt }.
export function placeOf(mesh) {
  const { aspect, tilt } = mesh.userData;
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  const tilted = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
  const width = mesh.scale.x;
  const at = mesh.position.clone().addScaledVector(tilted, width / aspect / 2);
  at.addScaledVector(n, -OFF);
  const up = tilted.applyAxisAngle(n, -THREE.MathUtils.degToRad(tilt));
  return { at, n, up, width, tilt };
}

// A graffito's middle (location: its entry's) in the scene.
function middleOf(location) {
  const [x, z] = fromWGS84(location[0], location[1]);
  return new THREE.Vector3(x, location[2] - 250, z);
}
// Per graffito the building or bridge it lies on, as structures.hit finds it from just before its
// middle to 4 m behind (it may stand before a bay of its wall); -1 if none. Before any is hidden.
export const homesOf = (structures) =>
  PLACED.map(({ location, facing, lean }) => {
    const at = middleOf(location);
    const { n } = surface(facing, lean);
    return structures.hit(at.clone().addScaledVector(n, 0.1), at.addScaledVector(n, -4));
  });
// homes: homesOf's. Resolves to { meshes, marks: per graffito on a building or bridge [its number,
// a function hiding it] }, all painted at once by the painter, each mesh's userData { graffito: its
// entry in src/graffiti-data.js, aspect, tilt } (lay).
export async function createGraffiti(homes) {
  const [meshes, marks] = [[], []];
  const painted = await Promise.all(
    PLACED.map(({ style, location, facing, lean, width, tilt, ...own }) =>
      graffitoMesh(...styled(style, own)),
    ),
  );
  for (const [k, graffito] of PLACED.entries()) {
    const { location, facing, lean, width, tilt } = graffito;
    const mesh = painted[k];
    mesh.userData.graffito = graffito;
    mesh.renderOrder = meshes.length + 1; // a later one over an earlier one (paintOn)
    const { n, up } = surface(facing, lean);
    lay(mesh, mesh.userData.aspect, middleOf(location), n, up, width, tilt);
    meshes.push(mesh);
    if (homes[k] >= 0) marks.push([homes[k], () => (mesh.visible = false)]);
  }
  return { meshes, marks };
}
