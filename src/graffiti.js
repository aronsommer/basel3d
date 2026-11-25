// Graffiti (pieceOf) in Cherry Bomb One (public/CherryBombOne.woff2, its Latin letters) or Rocker
// (public/Rocker.woff2), black and white (paint), or in Honk (public/Honk.woff2), or all in one
// colour (plainOf), in Lacquer (public/Lacquer.woff2) or Crafty Girls (public/CraftyGirls.woff2)
// too: small tags and big pieces on walls, roofs, bridges and the ground, each where
// src/graffiti-data.js says (createGraffiti); and whole cars and whole trams (wholeCar, WHOLE_CARS,
// WHOLE_TRAMS).
import * as THREE from "three";
import { fromWGS84 } from "./geo.js";
import PLACED from "./graffiti-data.js";

const FCB = [0xd51f2a, 0x1d3fbf]; // red over blue: Rotblau, red first
// Per kind: px of its letters when drawn.
const KINDS = { tag: 96, piece: 200 };
const OFF = 0.02; // metres a graffito stands off what it lies on
// Per px of the letters: the black outline's width (it joins them, fills their holes), the white
// cut line's around it, how far the white face sits up left of its black shade, and how wide a
// gap or bay of the black may be at most to be filled black too (closing it); and the gap between
// words, which stay apart.
const [OUTLINE, CUT, SHADE, FILL, GAP] = [0.22, 0.03, 0.04, 0.2, 0.15];
const [WHITE, BLACK] = [
  [244, 243, 238],
  [21, 21, 21],
];
// A slab behind (back), per px of the letters: how far it reaches beyond their outline and how
// round it is (the widest gap or bay it fills); and how far its colours' border falls per px to
// the right.
const SLAB = { reach: 0.35, round: 0.6, fall: 0.12 };
const cover = (d) => Math.min(Math.max(d + 0.5, 0), 1); // of a pixel d px inside an edge

// Per cell of a w × h grid, its distance in cells to the nearest one where is(i) holds (exact,
// Felzenszwalb and Huttenlocher's way; about 1e10 if none).
function distances(w, h, is) {
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = is(i) ? 0 : 1e20;
  const n = Math.max(w, h);
  const [f, v, z] = [new Float64Array(n), new Int32Array(n), new Float64Array(n + 1)];
  // Squared distances along one row or column: len cells from start, step apart.
  const pass = (start, step, len) => {
    for (let q = 0; q < len; q++) f[q] = d[start + q * step];
    let k = 0;
    [v[0], z[0], z[1]] = [0, -Infinity, Infinity];
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k]))) <= z[k]) k--;
      [v[++k], z[k], z[k + 1]] = [q, s, Infinity];
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[start + q * step] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) pass(x, w, h);
  for (let y = 0; y < h; y++) pass(y * w, 1, w);
  for (let i = 0; i < w * h; i++) d[i] = Math.sqrt(d[i]);
  return d;
}
// A word at size px on a canvas of its own: its letters, outlined black (closed), in a white cut
// line (but with cut false), then the letters black and their white face up left of it (or face: a
// colour, or colours from the top of an H down to the baseline, or { stripes: colours } as many
// even stripes so, or per letter as face(k) says; with rim framed: framed), in font (a family);
// with the baseline's height.
function sheetOf(text, size, font, face, rim, cut = true) {
  font = `${size}px "${font}"`;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d", { willReadFrequently: true });
  c.font = font;
  const m = c.measureText(text);
  // Room for the outline grown by FILL, so it closes as if nothing were beyond the canvas.
  const [grown, pad] = [(OUTLINE / 2 + FILL) * size, Math.ceil((OUTLINE / 2 + FILL) * size) + 2];
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * pad;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * pad;
  const [x, y] = [pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent];
  [canvas.width, canvas.height] = [w, h];
  c.font = font;
  c.fillText(text, x, y);
  const letters = c.getImageData(0, 0, w, h).data;
  // The outline grown by FILL, then shrunk by it: how far each pixel is inside the grown one.
  const near = distances(w, h, (i) => letters[4 * i + 3] >= 128);
  const inside = distances(w, h, (i) => near[i] > grown);
  const image = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const black = cover(inside[i] - FILL * size);
    for (let k = 0; k < 3; k++) image.data[4 * i + k] = WHITE[k] + (BLACK[k] - WHITE[k]) * black;
    image.data[4 * i + 3] = 255 * cover(inside[i] - (FILL - (cut ? CUT : 0)) * size);
  }
  c.putImageData(image, 0, 0);
  c.fillStyle = `rgb(${BLACK})`;
  c.fillText(text, x, y);
  const [fx, fy] = [x - SHADE * size, y - SHADE * size];
  const fillOf = (face) => {
    if (face === undefined) return `rgb(${WHITE})`;
    const top = fy - c.measureText("H").actualBoundingBoxAscent;
    const gradient = c.createLinearGradient(0, top, 0, fy);
    if (face.stripes) {
      const n = face.stripes.length;
      face.stripes.forEach((rgb, i) => {
        gradient.addColorStop(i / n, hex(rgb));
        gradient.addColorStop((i + 1) / n, hex(rgb));
      });
      return gradient;
    }
    const colours = [face].flat();
    colours.forEach((rgb, i) =>
      gradient.addColorStop(i / Math.max(colours.length - 1, 1), hex(rgb)),
    );
    return gradient;
  };
  // With face a function, the k-th letter's face is face(k): the word filled so, but only from
  // where the letter starts to where the next does.
  const [chars, each] = [[...text], typeof face === "function"];
  for (let k = 0; k < (each ? chars.length : 1); k++) {
    c.save();
    if (each) {
      const [a, b] = [k, k + 1].map((n) => fx + c.measureText(chars.slice(0, n).join("")).width);
      c.beginPath();
      c.rect(k ? a : 0, 0, (k < chars.length - 1 ? b : w) - (k ? a : 0), h);
      c.clip();
    }
    c.fillStyle = fillOf(each ? face(k) : face);
    c.fillText(text, fx, fy);
    c.restore();
  }
  if (rim) {
    const faces = alphaOf(w, h, font, text, fx, fy);
    framed(c, (i) => faces[i] >= 128, size, rim);
  }
  // Without the room for growing, but the cut line.
  const margin = Math.floor((FILL - CUT) * size) - 1;
  const out = document.createElement("canvas");
  [out.width, out.height] = [w - 2 * margin, h - 2 * margin];
  out.getContext("2d").drawImage(canvas, -margin, -margin);
  return { sheet: out, baseline: Math.round(y) - margin };
}
// A canvas with text at size px in font (a family), its words each on its own (sheetOf, in face or
// its own of faces, or each letter in the next of letters; rim and cut), GAP apart, on one
// baseline; with back, on its slab (slab).
function paint(text, size, back, font = "Cherry Bomb One", face, rim, cut, faces = [], letters) {
  let first = 0; // the first letter of the word's place in text, spaces aside
  const words = text.split(" ").map((w, i) => {
    const from = first;
    first += [...w].length;
    const own = letters ? (k) => letters[(from + k) % letters.length] : (faces[i] ?? face);
    return sheetOf(w, size, font, own, rim, cut);
  });
  const above = Math.max(...words.map(({ baseline }) => baseline));
  const below = Math.max(...words.map(({ sheet, baseline }) => sheet.height - baseline));
  const gap = Math.round(GAP * size);
  const canvas = document.createElement("canvas");
  canvas.width = words.reduce((sum, { sheet }) => sum + sheet.width + gap, -gap);
  canvas.height = above + below;
  let x = 0;
  for (const { sheet, baseline } of words) {
    canvas.getContext("2d").drawImage(sheet, x, above - baseline);
    x += sheet.width + gap;
  }
  return back ? slab(canvas, size, back) : canvas;
}
// A canvas with what is on this one (letters size px) on a slab (SLAB) behind it all: the colour
// top above a border falling to the right through its middle, bottom below.
function slab(canvas, size, [top, bottom]) {
  const { reach, round, fall } = SLAB;
  const pad = Math.ceil((reach + round) * size) + 2; // room to grow by both, as in sheetOf
  const [w, h] = [canvas.width + 2 * pad, canvas.height + 2 * pad];
  const out = document.createElement("canvas");
  [out.width, out.height] = [w, h];
  const c = out.getContext("2d");
  c.drawImage(canvas, pad, pad);
  const shown = c.getImageData(0, 0, w, h).data;
  // What is shown grown by reach and round, then shrunk by round: how far inside each pixel is.
  const near = distances(w, h, (i) => shown[4 * i + 3] >= 128);
  const inside = distances(w, h, (i) => near[i] > (reach + round) * size);
  const [upper, lower] = [top, bottom].map((rgb) => [rgb >> 16, (rgb >> 8) & 255, rgb & 255]);
  const image = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [x, y] = [i % w, Math.floor(i / w)];
    const below = cover(y - h / 2 - fall * (x - w / 2));
    for (let k = 0; k < 3; k++) image.data[4 * i + k] = upper[k] + (lower[k] - upper[k]) * below;
    image.data[4 * i + 3] = 255 * cover(inside[i] - round * size);
  }
  c.putImageData(image, 0, 0);
  c.drawImage(canvas, pad, pad);
  // Without the room for rounding.
  const margin = Math.floor(round * size) - 1;
  const cut = document.createElement("canvas");
  [cut.width, cut.height] = [w - 2 * margin, h - 2 * margin];
  cut.getContext("2d").drawImage(out, -margin, -margin);
  return cut;
}
// Every graffito's style, numbered from 1 in this order (its style), each { kind (KINDS), look }: a
// look in Honk's palette honk (HONK, with face its letters' face all that colour, with ink their
// shadow and lines) or, without, in font (a family, Cherry Bomb One if none) with face as sheetOf's
// (or faces, one per word, or letters, one per letter in turn), or with plain all in that colour
// (plainOf, thick); with rim framed inside (framed); with cut false without the white cut line;
// with outline round it (a colour or a list of them, outlined; with splash false not splashed out,
// with splash a text splashed as that, with short its splashes that share as long) and back behind
// it (two colours: on a car's side all over it, elsewhere a slab); with fill on a car as big as it
// fits (wholeCar). New ones go at the end, and none is moved or taken out, so a number always
// means the same style, on the cars and in src/graffiti-data.js alike.
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
// Honk's palettes (its CPAL), each: its shadow's and lines' colours (from the baseline up to half a
// size above it), then its face's (from the top down to the baseline).
const HONK = [
  [0x000000, 0x000000, 0xffffb2, 0xffff78, 0xffc753, 0xff755f, 0xff3caf, 0xff46af],
  [0x000000, 0x0000ff, 0xb200ff, 0x7823f5, 0x0ab4ff, 0x0dfca2, 0xb4fd52, 0xffff00],
  [0xffff00, 0xffff00, 0xc8c8c8, 0x000000, 0xc8c8c8, 0x000000, 0xc8c8c8, 0x000000],
  [0x00ff00, 0x00ffff, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000],
  [0x010101, 0x5c5b9c, 0xffffff, 0xffffff, 0xffcff5, 0xd9d2ff, 0xa7b5ea, 0x99b1e4],
  [0x000000, 0x433f99, 0x86528f, 0xb17c9b, 0xe6bca7, 0xf8e5b6, 0xe0a15c, 0xbd7640],
  [0x000040, 0x000000, 0xee1e2c, 0xff7f00, 0xffca00, 0x37db52, 0x00a7dd, 0xad60e0],
  [0x000000, 0x000000, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff],
];
const hex = (rgb) => `#${rgb.toString(16).padStart(6, "0")}`;
// Text in Honk's layers (honkArt): as it is, at U+E000 more, at U+E100 more.
const layered = (text) =>
  [0, 0xe000, 0xe100].map((more) =>
    String.fromCharCode(...[...text].map((ch) => ch.charCodeAt(0) + more)),
  );
// A canvas just round text (capitals, digits, signs, Ä, Ö, Ü) in Honk at size px in palette (HONK),
// with face its face all that colour, with ink its shadow and lines all that one, with rim framed
// inside in white (as wide as the cut line, CUT) wherever it meets black (with rim "upLeft" only
// where that is above or left of it): its file holds Honk's colour layers as plain letters, the
// shadow at each character, the face at U+E000 more, the lines over it at U+E100 more; each filled
// with its gradient.
function honkArt(text, size, palette, face, ink, rim) {
  const layers = layered(text);
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d", { willReadFrequently: true });
  const font = `${size}px Honk`;
  c.font = font;
  const boxes = layers.map((layer) => c.measureText(layer));
  const [left, right, up, down] = ["Left", "Right", "Ascent", "Descent"].map((side) =>
    Math.ceil(Math.max(...boxes.map((box) => box[`actualBoundingBox${side}`]))),
  );
  [canvas.width, canvas.height] = [left + right, up + down];
  c.font = font;
  const colours = HONK[palette].map((rgb, i) => (i < 2 ? (ink ?? rgb) : (face ?? rgb)));
  [
    [0, 1],
    [7, 6, 5, 4, 3, 2],
    [0, 1],
  ].forEach((stops, k) => {
    const gradient = c.createLinearGradient(0, up, 0, up - size / 2);
    stops.forEach((s, i) => gradient.addColorStop(i / (stops.length - 1), hex(colours[s])));
    c.fillStyle = gradient;
    c.fillText(layers[k], left, up);
  });
  if (!rim) return canvas;
  // Where the face shows: no line over it.
  const [w, h] = [canvas.width, canvas.height];
  const [faces, lines] = [1, 2].map((k) => alphaOf(w, h, font, layers[k], left, up));
  const shows = (i) => faces[i] >= 128 && lines[i] < 128;
  framed(c, shows, size, rim);
  return canvas;
}
// Per px of a w × h canvas, how much text in font (CSS) at x, y covers it, 0 to 255.
function alphaOf(w, h, font, text, x, y) {
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  [c.canvas.width, c.canvas.height] = [w, h];
  c.font = font;
  c.fillText(text, x, y);
  const data = c.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[4 * i + 3];
  return alpha;
}
// Frames inside in white, as wide as the cut line (CUT), the face of letters size px on c where
// shows(i) (per px) holds, wherever it meets what does not: with rim "upLeft" only where that is
// above or left of it, its strokes' ends round.
function framed(c, shows, size, rim) {
  const [w, h] = [c.canvas.width, c.canvas.height];
  const near = distances(w, h, (i) => !shows(i));
  const whites = new Float32Array(w * h); // how white each px is
  for (let i = 0; i < w * h; i++) {
    if (!shows(i)) continue;
    whites[i] = cover(CUT * size - near[i]);
    // With rim "upLeft", only where black is above or left of it: the way away from it (where the
    // distance grows, over 3 px each way, so the steps of slanted edges do not matter) down or
    // right, fading in from 0.2 to 0.5 of it; not on a ridge, where it hardly grows.
    if (rim === "upLeft") {
      const [gx, gy] = [near[i + 3] - near[i - 3], near[i + 3 * w] - near[i - 3 * w]];
      const way = Math.max(gx, gy) / Math.max(Math.hypot(gx, gy), 6);
      whites[i] *= Math.min(Math.max((way - 0.2) / 0.3, 0), 1);
    }
  }
  if (rim === "upLeft") {
    // Its strokes' ends round: each shrunk to its middle, then grown back about as wide.
    const half = 0.45 * CUT * size;
    const inside = distances(w, h, (i) => whites[i] < 0.5);
    const middle = distances(w, h, (i) => inside[i] > half);
    for (let i = 0; i < w * h; i++) whites[i] = shows(i) ? cover(half - middle[i]) : 0;
  }
  const image = c.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++)
    for (let k = 0; k < 3; k++)
      image.data[4 * i + k] += (WHITE[k] - image.data[4 * i + k]) * whites[i];
  c.putImageData(image, 0, 0);
}
// A canvas with what is on this one in a band width px wide of colour rgb ([r, g, b]), filling gaps
// up to 2 × close px wide, across px more room left and right of it and up px above and below;
// then splash(c, edge, top) may paint more in that colour under it, put top px down: edge(y, d)
// is the band's outermost px in row y on the left (d = -1) or right (1).
function band(canvas, width, rgb, across = 0, splash, close = 0, up = 0) {
  const [padX, padY] = [across, up].map((more) => Math.ceil(width + close + more) + 1);
  const [w, h] = [canvas.width + 2 * padX, canvas.height + 2 * padY];
  const out = document.createElement("canvas");
  [out.width, out.height] = [w, h];
  const c = out.getContext("2d", { willReadFrequently: true });
  c.drawImage(canvas, padX, padY);
  const shown = c.getImageData(0, 0, w, h).data;
  const near = distances(w, h, (i) => shown[4 * i + 3] >= 128);
  // Grown by close more, then shrunk by it: how far inside the band each px is.
  const inside = close ? distances(w, h, (i) => near[i] > width + close) : null;
  const image = c.createImageData(w, h);
  const data = image.data;
  for (let i = 0; i < w * h; i++) {
    [data[4 * i], data[4 * i + 1], data[4 * i + 2]] = rgb;
    data[4 * i + 3] = 255 * cover(close ? inside[i] - close : width - near[i]);
  }
  c.putImageData(image, 0, 0);
  c.fillStyle = `rgb(${rgb})`;
  const edge = (y, d) => {
    const row = Math.min(Math.max(Math.round(y), 0), h - 1) * w;
    let x = d < 0 ? 0 : w - 1;
    while (x >= 0 && x < w && data[4 * (row + x) + 3] < 128) x -= d;
    return x;
  };
  splash?.(c, edge, padY);
  c.drawImage(canvas, padX, padY);
  return trim(out);
}
// The canvas cut down to what is shown on it.
function trim(canvas) {
  const [w, h] = [canvas.width, canvas.height];
  const alpha = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let i = 0; i < w * h; i++)
    if (alpha[4 * i + 3]) {
      const [x, y] = [i % w, Math.floor(i / w)];
      [x0, y0, x1, y1] = [
        Math.min(x0, x),
        Math.min(y0, y),
        Math.max(x1, x + 1),
        Math.max(y1, y + 1),
      ];
    }
  const out = document.createElement("canvas");
  [out.width, out.height] = [x1 - x0, y1 - y0];
  out.getContext("2d").drawImage(canvas, -x0, -y0);
  return out;
}
// Px of an outline's band (of each, if more), and of the gaps it joins, per px of the letters.
const [LINE, THIN, JOIN] = [0.08, 0.045, 0.2];
// What an outline splashes out sideways at each end, per px high of the letters' canvas: how far
// up and down from its middle its flush end reaches, how far that stands out, how long the
// tongues growing from it are (shares of reach, in turn from a random one), how wide they start and
// end, how far they reach at most, fan out and bend at most.
const SPLASH = {
  high: 0.38,
  wall: 0.04,
  lengths: [1, 0.5, 0.8, 0.3],
  start: 0.27,
  end: 0.17,
  reach: 0.55,
  fan: 0.6,
  bend: 0.06,
};
// Where the random numbers of an outline's splashes start for a text (1 up to 2^31 - 2): so the
// same for the same text, at any size.
const seedOf = (text) =>
  ([...text].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 2147483647, 7) % 2147483646) + 1;
// A canvas with what is on this one (letters size px) in a band of colour rgb (0xrrggbb, LINE; or
// bands of a list of them, inside out), joined over gaps up to JOIN px per px of the letters wide,
// unless splash is false splashed out at both ends (SPLASH) as seed (seedOf) says (the dots of
// umlauts over px above them aside): each end made flush, and from it tongues fanning out, bent,
// narrowing to round tips.
function outlined(canvas, size, rgb, over, splash, seed, short = 1) {
  const { high, wall, lengths, start, end, fan, bend } = SPLASH;
  const reach = SPLASH.reach * short;
  // With more colours (rgb a list), a THIN band of each round the one before.
  const colours = [rgb].flat().map((rgb) => [rgb >> 16, (rgb >> 8) & 255, rgb & 255]);
  const width = (colours.length > 1 ? THIN : LINE) * size;
  for (const inner of colours.slice(0, -1))
    canvas = band(canvas, width, inner, 0, undefined, (JOIN * size) / 2);
  canvas = trim(canvas);
  const h = canvas.height - over; // its letters', without the dots over px above them
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const dot = (c, x, y, r) => {
    c.beginPath();
    c.arc(x, y, r, 0, 2 * Math.PI);
    c.fill();
  };
  const splashed = (c, edge, top) => {
    const y = top + over + h / 2;
    const rows = Array.from({ length: 21 }, (_, k) => y + (k / 20 - 0.5) * 2 * high * h);
    for (const d of [-1, 1]) {
      // Flush: from each row's edge out to beyond the outermost one.
      const x = (d < 0 ? Math.min : Math.max)(...rows.map((r) => edge(r, d)));
      c.beginPath();
      for (const r of rows) c.lineTo(edge(r, d) - d * 0.02 * h, r);
      c.lineTo(x + d * wall * h, rows.at(-1));
      c.lineTo(x + d * wall * h, rows[0]);
      c.fill();
      const [n, first] = [lengths.length, Math.floor(random() * lengths.length)];
      for (let f = 0; f < n; f++) {
        const t = f / (n - 1) - 0.5; // -0.5 up to 0.5
        const angle = t * fan + (random() - 0.5) * 0.2;
        const [dx, dy] = [d * Math.cos(angle), Math.sin(angle)];
        const length = lengths[(f + first) % n] * (0.9 + 0.2 * random()) * reach * h;
        const off = (random() - 0.5) * 2 * bend * h;
        // A curve from the flush end through near its middle (bent off) to its tip, of dots ever
        // smaller.
        const by = y + t * (2 * high - start) * h;
        const [mx, my] = [x + (dx * length) / 2 - dy * off, by + (dy * length) / 2 + dx * off];
        const [tx, ty] = [x + dx * length, by + dy * length];
        for (let k = 0; k <= 24; k++) {
          const u = k / 24;
          const [p, q, r] = [(1 - u) ** 2, 2 * (1 - u) * u, u * u];
          dot(
            c,
            p * x + q * mx + r * tx,
            p * by + q * my + r * ty,
            (((1 - u) * start + u * end) * h) / 2,
          );
        }
      }
    }
  };
  // Room for the tongues: their length beside it, and above and below how far they spread beyond.
  const across = splash ? (1.1 * reach + start) * h : 0;
  const spread = high + bend / 2 + Math.sin(fan / 2 + 0.1) * 1.1 * reach; // from the middle
  const up = splash ? Math.max(0, (spread - 0.5) * h) : 0;
  const last = colours.at(-1);
  return band(canvas, width, last, across, splash ? splashed : undefined, (JOIN * size) / 2, up);
}
// Px high of a whole car's side, and of its margin round the letters in Honk and in the other font.
const [CAR, MARGIN, CHERRY_MARGIN] = [160, 5, 3];
const PAINT = 120; // px of a whole car's letters when painted: about as big as they end up
// Of a car's length, kept free at each end: in curves its neighbour's covers it.
const END = 0.028;
// A canvas with a piece in look at size px (with slab, back as a slab behind it: slab), in Honk's
// palette honk or else as the graffiti in font (Cherry Bomb One if none), with face, faces,
// letters, ink, rim and cut as WHOLE_CARS says, or with plain all that colour (plainOf, thick),
// outlined (outline, splash, short); and in px how far the dots of its umlauts stand above its
// letters (over), and those of its font's (lift).
function pieceOf(
  { text, font, honk, plain, thick, face, faces, letters, ink, rim, cut, outline, splash, short },
  size,
  slab,
) {
  let art =
    plain !== undefined
      ? plainOf(text, size, font, plain, thick)
      : honk === undefined
        ? paint(text, size, slab, font, face, rim, cut, faces, letters)
        : honkArt(text, size, honk, face, ink, rim);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `${size}px "${honk === undefined ? (font ?? "Cherry Bomb One") : "Honk"}"`;
  const ascent = (text) =>
    Math.max(
      ...(honk === undefined ? [text] : layered(text)).map(
        (layer) => measure.measureText(layer).actualBoundingBoxAscent,
      ),
    );
  const over = ascent(text) - ascent(text.normalize("NFD").replace(/\p{M}/gu, ""));
  const lift = ascent("ÄÖÜ") - ascent("AOU");
  // Honk's in a white cut line first, as the other font's are (unless cut is false).
  if (outline !== undefined)
    art = outlined(
      honk === undefined || cut === false ? art : band(art, CUT * size, WHITE),
      size,
      outline,
      over,
      splash !== false,
      // With splash a text, splashed as that is.
      seedOf(typeof splash === "string" ? splash : text),
      short,
    );
  return { art, over, lift };
}
// A canvas with text at size px in font (a family, Cherry Bomb One if none), its letters all in
// colour (0xrrggbb), with thick thickened by that much of size all round, nothing round them; each
// line of it (\n) size px below the one before, all in the middle.
function plainOf(text, size, font = "Cherry Bomb One", colour, thick = 0) {
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d");
  const lines = text.split("\n");
  c.font = `${size}px "${font}"`;
  const m = lines.map((line) => c.measureText(line));
  const widths = m.map((l) => l.actualBoundingBoxLeft + l.actualBoundingBoxRight);
  const [grown, wide] = [thick * size, Math.max(...widths)];
  const pad = Math.ceil(grown) + 1;
  const top = m[0].actualBoundingBoxAscent;
  canvas.width = Math.ceil(wide) + 2 * pad;
  canvas.height =
    Math.ceil(top + (lines.length - 1) * size + m.at(-1).actualBoundingBoxDescent) + 2 * pad;
  c.font = `${size}px "${font}"`;
  const ink = hex(colour);
  Object.assign(c, { fillStyle: ink, strokeStyle: ink, lineWidth: 2 * grown, lineJoin: "round" });
  lines.forEach((line, k) => {
    const [x, y] = [
      pad + (wide - widths[k]) / 2 + m[k].actualBoundingBoxLeft,
      pad + top + k * size,
    ];
    c.fillText(line, x, y);
    if (thick) c.strokeText(line, x, y);
  });
  return canvas;
}
// A whole car's side (WHOLE_CARS), width by height metres: with back, its top colour above a
// border falling to the right through the middle, its bottom one below; over it its piece
// (pieceOf) as big as fits, but drawn at most at scale most. Returns [its material, the scale
// drawn at].
export function wholeCar(look, width, height, most = Infinity) {
  const { honk, fill, back } = look;
  const canvas = document.createElement("canvas");
  const [w, h] = [Math.round((CAR * width) / height), CAR];
  [canvas.width, canvas.height] = [w, h];
  const c = canvas.getContext("2d");
  if (back) {
    c.fillStyle = hex(back[0]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = hex(back[1]);
    c.beginPath();
    c.moveTo(0, 0.4 * h);
    c.lineTo(w, 0.6 * h);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.fill();
  }
  const { art, over, lift } = pieceOf(look, PAINT);
  const margin = honk === undefined ? CHERRY_MARGIN : MARGIN;
  // Its letters as high on every car of a size, room for umlauts' dots kept (for them or not; with
  // fill only for its own, as big as it fits), as wide as fits; all of it in the middle.
  const high = art.height - over + (fill ? over : lift);
  const ends = margin + END * w;
  const scale = Math.min((w - 2 * ends) / art.width, (h - 2 * margin) / high, most);
  const [aw, ah] = [art.width * scale, art.height * scale];
  c.drawImage(art, (w - aw) / 2, (h - ah) / 2, aw, ah);
  return [material(canvas), scale];
}
// A material showing a canvas, near the walls without fighting them.
function material(canvas) {
  const map = new THREE.CanvasTexture(canvas);
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
// A graffito's mesh: a plane with look painted on it (paintOn).
export function graffitoMesh(kind, look) {
  const mesh = new THREE.Mesh(plane());
  paintOn(mesh, kind, look);
  return mesh;
}
// A canvas with a graffito's look (pieceOf; with back, a slab behind it) of kind (KINDS), its
// letters size px (as its kind's if none).
export const artOf = (kind, { back, ...look }, size = KINDS[kind]) => pieceOf(look, size, back).art;
// Paints a graffito's look of kind on its mesh anew (artOf), freeing what was there, and keeps its
// sheet's width to height in its userData (aspect).
export function paintOn(mesh, kind, look) {
  const sheet = artOf(kind, look);
  mesh.material.map?.dispose();
  mesh.material.dispose();
  mesh.material = material(sheet);
  mesh.userData.aspect = sheet.width / sheet.height;
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

// Adds the font with this name from its file's bytes, for drawing.
export const addFont = async (name, bytes) =>
  document.fonts.add(await new FontFace(name, bytes).load());

// roofAt({ x, z }): the topmost roof or bridge there, { number, y }, if any. Resolves to { meshes,
// marks: per graffito on a building or bridge [its number, a function hiding it] }, each painted in
// a task of its own, each mesh's userData { graffito: its entry in src/graffiti-data.js, aspect,
// tilt } (lay).
export async function createGraffiti(roofAt) {
  const [meshes, marks] = [[], []];
  for (const graffito of PLACED) {
    const { style, location, facing, lean, width, tilt, ...own } = graffito;
    await new Promise((go) => setTimeout(go));
    const mesh = graffitoMesh(...styled(style, own));
    mesh.userData.graffito = graffito;
    const [x, z] = fromWGS84(location[0], location[1]);
    const { n, up } = surface(facing, lean);
    lay(mesh, mesh.userData.aspect, new THREE.Vector3(x, location[2] - 250, z), n, up, width, tilt);
    meshes.push(mesh);
    // Its building or bridge: the roof behind its middle, looked for up to 4 m back (it may stand
    // before a bay of its wall).
    let behind = null;
    for (let d = 0.3; !behind && d < 4; d += 0.5)
      behind = roofAt({ x: x - n.x * d, z: z - n.z * d });
    if (behind) marks.push([behind.number, () => (mesh.visible = false)]);
  }
  return { meshes, marks };
}
