// Paints graffiti onto canvases (OffscreenCanvas, so also off the page's thread: src/painter-
// worker.js) in Cherry Bomb One, Rocker, Honk, Lacquer and Crafty Girls (src/graffiti.js says which
// file each is): a look (src/graffiti.js, STYLES) as a piece (pieceOf) and a whole car's side
// (carSide). No three.js here.
const sheet = () => new OffscreenCanvas(300, 150); // a canvas, sized later

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
  // Squared distances along one row or column: len cells from start, step apart (its loops make
  // no arrays: they run for every pixel).
  const pass = (start, step, len) => {
    for (let q = 0; q < len; q++) f[q] = d[start + q * step];
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      while ((s = (f[q] + q * q - f[v[k]] - v[k] * v[k]) / (2 * (q - v[k]))) <= z[k]) k--;
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const r = q - v[k];
      d[start + q * step] = r * r + f[v[k]];
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
  const canvas = sheet();
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
  const out = sheet();
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
  const canvas = sheet();
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
  const out = sheet();
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
    const x = i % w;
    const below = cover((i - x) / w - h / 2 - fall * (x - w / 2));
    for (let k = 0; k < 3; k++) image.data[4 * i + k] = upper[k] + (lower[k] - upper[k]) * below;
    image.data[4 * i + 3] = 255 * cover(inside[i] - round * size);
  }
  c.putImageData(image, 0, 0);
  c.drawImage(canvas, pad, pad);
  // Without the room for rounding.
  const margin = Math.floor(round * size) - 1;
  const cut = sheet();
  [cut.width, cut.height] = [w - 2 * margin, h - 2 * margin];
  cut.getContext("2d").drawImage(out, -margin, -margin);
  return cut;
}
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
  const canvas = sheet();
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
  const c = sheet().getContext("2d", { willReadFrequently: true });
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
  const out = sheet();
  [out.width, out.height] = [w, h];
  const c = out.getContext("2d", { willReadFrequently: true });
  c.drawImage(canvas, padX, padY);
  const shown = c.getImageData(0, 0, w, h).data;
  const near = distances(w, h, (i) => shown[4 * i + 3] >= 128);
  // Grown by close more, then shrunk by it: how far inside the band each px is.
  const inside = close ? distances(w, h, (i) => near[i] > width + close) : null;
  const image = c.createImageData(w, h);
  const data = image.data;
  const [r, g, b] = rgb;
  for (let i = 0; i < w * h; i++) {
    data[4 * i] = r;
    data[4 * i + 1] = g;
    data[4 * i + 2] = b;
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
// The canvas cut down to what is shown on it: its empty rows from the top and bottom and then its
// empty columns from the sides looked for, so only the empty margin is gone through.
function trim(canvas) {
  const [w, h] = [canvas.width, canvas.height];
  const alpha = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const shown = (x, y) => alpha[4 * (y * w + x) + 3] !== 0;
  const row = (y) => {
    for (let x = 0; x < w; x++) if (shown(x, y)) return true;
    return false;
  };
  let [y0, y1] = [0, h];
  while (y0 < h && !row(y0)) y0++;
  while (y1 > y0 && !row(y1 - 1)) y1--;
  const column = (x) => {
    for (let y = y0; y < y1; y++) if (shown(x, y)) return true;
    return false;
  };
  let [x0, x1] = [0, w];
  while (x0 < w && !column(x0)) x0++;
  while (x1 > x0 && !column(x1 - 1)) x1--;
  const out = sheet();
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
// letters, ink, rim and cut as src/graffiti.js's STYLES says, or with plain all that colour
// (plainOf, thick), outlined (outline, splash, short); and in px how far the dots of its umlauts
// stand above its letters (over), and those of its font's (lift).
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
  const measure = sheet().getContext("2d");
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
  const canvas = sheet();
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
// A canvas with look at size px (pieceOf; with back, a slab behind it).
export const art = ({ back, ...look }, size) => pieceOf(look, size, back).art;
// A whole car's side (src/graffiti.js, WHOLE_CARS), width by height metres: with back, its top
// colour above a border falling to the right through the middle, its bottom one below; over it its
// piece (pieceOf) as big as fits, but drawn at most at scale most. Returns [its canvas, the scale
// drawn at].
export function carSide(look, width, height, most = Infinity) {
  const { honk, fill, back } = look;
  const canvas = sheet();
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
  return [canvas, scale];
}
