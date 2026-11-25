// Graffiti (pieceOf) in Cherry Bomb One (public/CherryBombOne.woff2, its Latin letters) or Rocker
// (public/Rocker.woff2), black and white (paint), or in Honk (public/Honk.woff2): on walls, roofs
// and bridges in GRAFFITI, small tags and big pieces, each where it says; and whole cars and whole
// trams (wholeCar, WHOLE_CARS, WHOLE_TRAMS).
import * as THREE from "three";
import { fromWGS84 } from "./geo.js";

// Every graffito, each { where, kind, from, to, text, back, roof, deep, flip } and any of a whole
// car piece's look (pieceOf). To add one: in the viewer press C over each end of where it goes, on
// the wall or roof (C copies the point: lat, lon, metres above sea), and give where (words, to know
// it by), its kind (KINDS: a tag or piece), its text (any Latin letters) and, for a slab behind it,
// back (two colours, 0xrrggbb, the one above the other: FCB). Its text runs along the way from one
// point to the other, at most as wide as that; before the wall there, its middle at the points'
// height but at least its kind's raise in metres above the ground and at most up to TOP metres
// below the wall's top, out before every wall behind it (AHEAD); or with roof on the roof (or
// bridge) there, read from down its slope (on a flat one from left at from to right at to), in the
// slope's middle, at most up to EDGE metres from its ends; with deep too (metres), level and from
// left to right instead, in the band that wide along the way, from and to the middles of its ends,
// OFF above its highest roof (for a rippled one); with flip, turned round. One that finds no wall
// or roof there is left out, with a warning in the console.
const FCB = [0xd51f2a, 0x1d3fbf]; // red over blue: Rotblau, red first
const GRAFFITI = [
  {
    where: "An 82 m tower's side, south-west of Basel SBB's station building",
    kind: "piece",
    from: [47.546187, 7.58733, 298.2],
    to: [47.546345, 7.586954, 298.1],
    text: "FCB",
    back: FCB,
  },
  {
    where: "A row of 14 m high houses, about 650 m south-east of Basel SBB's station building",
    kind: "piece",
    from: [47.544213, 7.596809, 286.5],
    to: [47.544376, 7.59629, 287.2],
    text: "FCB 1893",
    back: FCB,
  },
  {
    where: "A 23 m long house wall about 140 m north-east of the Marktplatz",
    kind: "piece",
    from: [47.558755, 7.589476, 262.2],
    to: [47.558865, 7.589347, 263.2],
    text: "FCB",
    back: FCB,
  },
  {
    where: "The Kaserne's roof to the Rhine, in postcode 4058, about 50 m from 4057's border",
    kind: "piece",
    roof: true,
    from: [47.562975, 7.588992],
    to: [47.562439, 7.589382],
    text: "4057 FTP 4058",
  },
  {
    where: "A 205 m long roof about 2.8 km north of the Marktplatz",
    kind: "piece",
    roof: true,
    from: [47.583233, 7.589103],
    to: [47.582569, 7.591653],
    deep: 31,
    text: "GANGSTERZZZ",
  },
  {
    where: "A 215 m long bridge's top, about 3.2 km north-north-east of the Marktplatz",
    kind: "piece",
    roof: true,
    from: [47.584181, 7.60188],
    to: [47.586023, 7.602109],
    flip: true,
    text: "JESTES PIEKNA I ZAWSZE MASZ RACJE",
  },
];
// Per kind: metres above the ground on a wall, and px of its letters when drawn.
const KINDS = { tag: { raise: 0.3, size: 96 }, piece: { raise: 0.8, size: 200 } };
// Metres: TOP, EDGE and AHEAD as said, OFF off the wall or roof.
const [TOP, EDGE, AHEAD, OFF] = [2, 0.5, 3, 0.02];
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
// Whole cars on trams and trains (which: src/main.js), per kind: on each side (right and left of
// its way) a piece over a car's body, each vehicle wearing all of its kind's, one per car from its
// last, its own (in turn) first; or a tram a whole tram (WHOLE_TRAMS) instead. Each in Honk's
// palette honk (HONK, with face its letters' face all that colour, with ink their shadow and
// lines) or, without, as the graffiti in font (a family, Cherry Bomb One if none) with face as
// sheetOf's (or faces, one per word, or letters, one per letter in turn); with rim framed inside
// (framed); with cut false without the white cut line; with outline round it (a colour or a list
// of them, outlined; with splash false not splashed out, with splash a text splashed as that, with
// short its splashes that share as long) and back on it (two colours). With fill it is as big as
// it fits (wholeCar). A side may be left bare.
export const WHOLE_CARS = {
  // From the last car on, fonts so that no two next to each other (round again too) and no car's
  // two sides are in the same: right Honk, Cherry, Honk, Rocker, Cherry; left Cherry, Honk,
  // Cherry, Honk, Rocker.
  train: [
    {
      right: { text: "GANGSTER", honk: 0, rim: "upLeft", outline: 0x00e640 },
      // Poison green in magenta, its complement.
      left: {
        text: "SEXY BASEL",
        faces: [
          [0xffd23a, 0xffa800, 0xe07000],
          [0xb6f22e, 0x6fd62a, 0x1e9e3a],
        ],
        rim: "upLeft",
        outline: 0xff00ff,
        splash: "BASEL", // as it had when it said only that
      },
    },
    {
      right: { text: "FC BASEL 1893", back: FCB }, // as on the trams
      // FCB blue in FCB red.
      left: { text: "SCHEISS ZÜRI", honk: 7, face: 0x1d3fbf, rim: true, outline: 0xd51f2a },
    },
    {
      right: { text: "BASILISK", honk: 7, face: 0x3cc84e, rim: "upLeft", outline: 0xff8c00 },
      // Confetti: each letter the next colour round.
      left: {
        text: "HUERESOHN",
        letters: [
          0xffd400, 0xff9f1a, 0xff5a3c, 0xff3da8, 0xc04bff, 0x6a6bff, 0x2fa8ff, 0x18d4c0, 0x5be36a,
        ],
        rim: true,
        outline: 0xff00ff,
      },
    },
    {
      // Chrome (silver above a sharp dark horizon, lighter below, so its white rim shows) in blood,
      // splashed as BASEL but shorter.
      right: {
        text: "KILLER BEBBI",
        font: "Rocker",
        face: [0xc4c9cf, 0xb2b8bf, 0x9aa1a9, 0x2b3036, 0x484e56, 0x8a919a, 0xd0d4d9],
        rim: "upLeft",
        outline: 0xb0000f,
        splash: "BASEL",
        short: 0.6,
      },
      left: { text: "CRAZY CREW", honk: 7, outline: 0xe01020 },
    },
    {
      // Basel in Polish.
      right: {
        text: "BAZYLEA ONE",
        fill: true,
        cut: false,
        outline: [0xffd000, 0xe01020],
        splash: false,
      },
      left: { text: "GANGSTER", font: "Rocker", outline: 0x8a2be2 },
    },
  ],
  tram: [
    // From the last car on fonts as on the trains: right Honk, Cherry, Rocker, Cherry; left
    // Cherry, Rocker, Honk, Rocker.
    {
      // As GANGSTER on the trains.
      right: { text: "HÖSCH", honk: 0, rim: "upLeft", outline: 0x00e640 },
      // Striped as the pride flag.
      left: {
        text: "LOVE",
        face: { stripes: [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x24408e, 0x732982] },
        rim: true,
        outline: 0xe01020,
      },
    },
    {
      right: { text: "4057", outline: 0xff00ff }, // Kleinbasel's postcodes, this and 4058
      left: {
        text: "RHY",
        font: "Rocker",
        face: [0xc4c9cf, 0x9aa1a9, 0x2b3036, 0x8a919a, 0xd0d4d9],
        rim: "upLeft",
        outline: 0x1a5cff,
      },
    },
    {
      right: {
        text: "ZOLLI",
        font: "Rocker",
        face: [0xb6f22e, 0x6fd62a, 0x1e9e3a], // poison green, as in SEXY BASEL
        rim: "upLeft",
        outline: 0xe01020,
      },
      left: { text: "4058", honk: 1, ink: 0x000000, rim: "upLeft", outline: 0xff2d95 },
    },
    {
      // Lipstick: cherry red to pink, in indigo (not cyan, the colour of what is picked).
      right: {
        text: "SEXY",
        face: [0xd0002a, 0xff2d6f, 0xff7ab8],
        rim: "upLeft",
        outline: 0x3a1fd1,
      },
      left: { text: "ACAB", font: "Rocker", outline: 0xc000ff },
    },
  ],
};
// Whole trams: per side a piece over all of a tram's cars, as WHOLE_CARS's, its text a word a car
// if it has as many, else its letters shared out among them; read from the front on the right.
export const WHOLE_TRAMS = [
  // The FCB's song, a line a side, in the FCB's colours.
  {
    right: { text: "ROT ISCH UNSERI LIEBI", back: FCB },
    left: { text: "BLAU DIE EWIGI TREUI", back: FCB },
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
// letters, ink, rim and cut as WHOLE_CARS says, outlined (outline, splash, short); and in px how
// far the dots of its umlauts stand above its letters (over), and those of its font's (lift).
function pieceOf(
  { text, font, honk, face, faces, letters, ink, rim, cut, outline, splash, short },
  size,
  slab,
) {
  let art =
    honk === undefined
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

// Adds the font with this name from its file's bytes, for drawing.
export const addFont = async (name, bytes) =>
  document.fonts.add(await new FontFace(name, bytes).load());

// structures: src/buildings.js; ground(x, z, y): the height walked on there, from near y; roofAt({
// x, z }): the topmost roof or bridge there, { number, y }, if any. Resolves to { meshes, marks:
// per graffito [its building or bridge, a function hiding it] }, each painted in a task of its own.
export async function createGraffiti(structures, ground, roofAt) {
  const [meshes, marks] = [[], []];
  const matrix = new THREE.Matrix4();
  for (const { where, kind, from, to, roof, deep, flip = false, back, ...look } of GRAFFITI) {
    const missing = (what) => console.warn(`Graffito "${look.text}" (${where}): no ${what} there`);
    const [[fx, fz], [tx, tz]] = [fromWGS84(...from), fromWGS84(...to)];
    const length = Math.hypot(tx - fx, tz - fz);
    const [mx, mz] = [(fx + tx) / 2, (fz + tz) / 2];
    await new Promise((go) => setTimeout(go));
    const sheet = pieceOf(look, KINDS[kind].size, back).art;
    const aspect = sheet.width / sheet.height;
    const mesh = new THREE.Mesh(plane(), material(sheet));
    if (roof) {
      const over = roofAt({ x: mx, z: mz });
      if (!over) {
        missing("roof");
        continue;
      }
      // Its plane at the middle: n down it, s metres up per metre that way, and a metres up per
      // metre along from → to (u), its height y there, and how far it goes down and up it; with
      // deep, level at the highest roof in the band.
      const top = (x, z) => structures.top(x, z, Infinity, -Infinity, true);
      const [ux, uz] = [(tx - fx) / length, (tz - fz) / length];
      let [nx, nz] = [uz, -ux];
      let [s, a, y, down, up] = [0, 0, over.y, deep / 2, deep / 2];
      if (deep) {
        y = -Infinity;
        for (let i = 0; i <= length; i += 2)
          for (let j = -deep / 2; j <= deep / 2; j += 0.25)
            y = Math.max(y, top(fx + ux * i + nx * j, fz + uz * i + nz * j));
      } else {
        s = (top(mx - nx, mz - nz) - top(mx + nx, mz + nz)) / 2;
        if (s < 0) [nx, nz, s] = [-nx, -nz, -s];
        a = (top(mx + ux, mz + uz) - top(mx - ux, mz - uz)) / 2;
        // Metres the slope goes on from the middle, down it (k = 1) or up (-1): where the roof
        // stays within 0.2 m of its plane, tried every 0.25 m.
        const reach = (k) => {
          let d = 0;
          const off = (d) => top(mx + k * nx * d, mz + k * nz * d) - (over.y - k * s * d);
          while (d < 50 && Math.abs(off(d + 0.25)) < 0.2) d += 0.25;
          return d;
        };
        [down, up] = [reach(1), reach(-1)];
      }
      // Its axes in the plane: right along u, upward up the slope; and out of the plane.
      const slope = new THREE.Vector3(nx, -s, nz); // down it per metre seen from above
      const right = new THREE.Vector3(ux, a, uz).normalize();
      const out = new THREE.Vector3().crossVectors(right, slope).normalize();
      if (out.y < 0) out.negate();
      const upward = new THREE.Vector3().crossVectors(out, right);
      // Read from down the slope; on one flat to 1 cm per metre, from from's side; with flip from
      // the other side.
      if (upward.y < -0.01 !== flip) [right, upward].forEach((v) => v.negate());
      const width = Math.min(length, ((down + up) * Math.hypot(1, s) - 2 * EDGE) * aspect);
      // Its bottom's middle: half its height down the slope from the slope's middle, OFF out.
      mesh.position
        .set(mx, y, mz)
        .addScaledVector(slope, (down - up) / 2)
        .addScaledVector(upward, -width / aspect / 2)
        .addScaledVector(out, OFF);
      mesh.quaternion.setFromRotationMatrix(matrix.makeBasis(right, upward, out));
      mesh.scale.set(width, width / aspect, 1);
      meshes.push(mesh);
      marks.push([over.number, () => (mesh.visible = false)]);
      continue;
    }
    // The wall: the longest within 2 m of the middle along the way from → to.
    let wall = null;
    for (const [number, walls] of structures.walls(mx, mz, 2))
      for (let i = 0; i < walls.length; i += 6) {
        const [ax, az, bx, bz, , top] = walls.slice(i, i + 6);
        const l = Math.hypot(bx - ax, bz - az);
        const [ux, uz] = [(bx - ax) / l, (bz - az) / l];
        if (Math.abs(ux * (tx - fx) + uz * (tz - fz)) < 0.98 * length) continue;
        if (Math.abs((mx - ax) * uz - (mz - az) * ux) > 2 || l <= (wall?.l ?? 0)) continue;
        const along = (mx - ax) * ux + (mz - az) * uz;
        wall = { number, l, top, ux, uz, x: ax + ux * along, z: az + uz * along };
      }
    if (!wall) {
      missing("wall");
      continue;
    }
    // Out of it: the side with no roof over it.
    let [nx, nz] = [wall.uz, -wall.ux];
    if (structures.top(wall.x + nx, wall.z + nz, Infinity) > -Infinity) [nx, nz] = [-nx, -nz];
    // The ground at the wall and 1 m before it (the terrain may rise to the wall), the highest
    // along the whole way from → to, every metre.
    const steps = Math.ceil(length);
    let y = -Infinity;
    for (let k = 0; k <= steps; k++)
      for (const out of [0, 1]) {
        const t = (k / steps - 0.5) * length;
        const [x, z] = [wall.x + wall.ux * t + nx * out, wall.z + wall.uz * t + nz * out];
        y = Math.max(y, ground(x, z, Infinity));
      }
    // As high as fits between the ground and the top, its middle at the points' height if it may
    // (metres above sea less 250 m: the scene's y, src/geo.js), else as low as it may.
    const [low, high] = [y + KINDS[kind].raise, wall.top - TOP];
    const tall = Math.min(length / aspect, high - low);
    if (tall <= 0) {
      missing("room on the wall");
      continue;
    }
    const middle = from.length > 2 ? (from[2] + to[2]) / 2 - 250 : -Infinity;
    const bottom = Math.min(Math.max(middle - tall / 2, low), high - tall);
    // Before every wall reaching into its area from behind it up to AHEAD metres out, corners
    // too, so none hides any of it: as far out as the furthest.
    const half = (tall * aspect) / 2;
    let front = 0;
    for (const [, walls] of structures.walls(wall.x, wall.z, half + AHEAD))
      for (let i = 0; i < walls.length; i += 6) {
        const [ax, az, bx, bz, lo, hi] = walls.slice(i, i + 6);
        if (hi <= bottom || lo >= bottom + tall) continue;
        // Its ends: how far along the wall from the middle, and how far out.
        const [a, b] = [
          [ax, az],
          [bx, bz],
        ].map(([x, z]) => [
          (x - wall.x) * wall.ux + (z - wall.z) * wall.uz,
          (x - wall.x) * nx + (z - wall.z) * nz,
        ]);
        const [t0, t1] = [
          Math.max(Math.min(a[0], b[0]), -half),
          Math.min(Math.max(a[0], b[0]), half),
        ];
        if (t0 > t1) continue;
        // How far out it is at t along, as straight between its ends.
        const at = (t) =>
          a[0] === b[0]
            ? Math.max(a[1], b[1])
            : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
        const out = Math.max(at(t0), at(t1));
        if (out <= AHEAD) front = Math.max(front, out);
      }
    mesh.scale.set(tall * aspect, tall, 1);
    mesh.rotation.y = Math.atan2(nx, nz);
    mesh.position.set(wall.x + nx * (front + OFF), bottom, wall.z + nz * (front + OFF));
    meshes.push(mesh);
    marks.push([wall.number, () => (mesh.visible = false)]);
  }
  return { meshes, marks };
}
