// The map as textures, drawn by src/ground-worker.js: one per tile of the terrain, with as many
// pixels as its distance from the camera needs, and finer squares round the point the camera
// looks at, each inside the next, which the terrain's shader lays over the tiles. All are drawn
// anew as the camera moves, the nearest first; finer only while they may be in view.
import * as THREE from "three";

const SIZES = [256, 512, 1024, 2048]; // pixels across a tile; phones and tablets stop at 1024
const SHARE = 0.5; // of the pixels a tile's nearest part takes on the screen, across
const KEEP = 1.4; // a tile is drawn coarser again only this many times further away
// Metres across the squares: three in a row, from the first up close, else from the second.
const SQUARES = [64, 128, 256, 512];
const SETTLE = [300, 150, 0]; // ms a square must stay wanted before it is drawn, the finest first

// files: { map, soft, city } (src/groundmap.js; map and soft are handed over); the terrain's
// x0, z0, chunk, cell, nx, nz; script: the worker's address; squares: { maps, rects, deckMaps,
// deckRects }, three uniforms each for the squares' textures and where they lie (x, z of the
// north-west corner, metres across, 1 if shown), the finest first, and the same for the decks.
// Gives { tiles, decks: the textures by tile name ("column_row"; decks only where there are
// some), ready: a promise until every tile is drawn, changed: set it to be called with a tile's
// name when its textures were replaced, update, hide, show }.
export function createGround(files, { x0, z0, chunk, cell, nx, nz }, renderer, script, squares) {
  const worker = new Worker(script, { type: "module" });
  worker.postMessage({ files, origin: [x0, z0] }, [files.map, files.soft]);
  const coarse = matchMedia("(pointer: coarse)").matches;
  const finest = coarse ? 2 : 3;

  // Shown until a tile is drawn, which ready waits for.
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  blank.needsUpdate = true;
  const ground = { tiles: new Map(), decks: new Map(), changed: null, ready: null };
  // Per tile: level: the index in SIZES it is drawn with (-1: not yet), want: the one it needs,
  // keep: the one it would need KEEP times nearer.
  const states = [];
  for (let row = 0; row < ((nz - 1) * cell) / chunk; row++)
    for (let column = 0; column < ((nx - 1) * cell) / chunk; column++) {
      const name = `${column}_${row}`;
      states.push({ name, column, row, level: -1, want: 0, keep: 0, distance: 0 });
      ground.tiles.set(name, blank);
    }
  // Per square: want: { x, z, extent } it should show, since when (ms); shown, asked: what it
  // shows and what the worker draws for it, as "extent,x,z".
  const around = squares.maps.map(() => ({ want: null, since: 0, shown: "", asked: "" }));
  const named = ({ x, z, extent }) => `${extent},${x},${z}`;
  let shown = true;
  let busy = false; // waiting for the worker
  let drawn = null; // resolves ready

  // An ImageBitmap as a texture; the bitmap is given up once it is on the graphics card.
  const texture = (bitmap) => {
    const t = new THREE.Texture(bitmap);
    t.flipY = false; // drawn south up
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.onUpdate = () => bitmap.close();
    t.needsUpdate = true;
    return t;
  };
  const drop = (t) => {
    if (!t || t === blank) return;
    t.dispose();
    t.image.close();
  };
  // Asks the worker for the next: first the tiles not drawn yet, then the squares (the widest
  // first), then the tiles to draw finer, then those to draw coarser; of tiles the nearest.
  function next() {
    if (busy || !shown) return;
    let [best, rank, size] = [null, Infinity, 0];
    for (const tile of states) {
      const group =
        tile.level < 0 ? 0 : tile.level < tile.want ? 1 : tile.level > tile.keep ? 2 : 3;
      if (group === 3 || group * 1e9 + tile.distance >= rank) continue;
      [best, rank, size] = [tile, group * 1e9 + tile.distance, group ? tile.want : 0];
    }
    const ask = (id, x, z, extent, px) => {
      busy = true;
      worker.postMessage({ id, x: x - x0, y: z - z0, extent, px });
    };
    if (!best || best.level >= 0)
      for (let i = around.length - 1; i >= 0; i--) {
        const square = around[i];
        if (!square.want || named(square.want) === square.shown) continue;
        if (performance.now() - square.since < SETTLE[i]) continue;
        square.asked = named(square.want);
        const { x, z, extent } = square.want;
        return ask(`s${i}`, x, z, extent, coarse ? 1024 : 2048);
      }
    if (best)
      ask(
        `t${states.indexOf(best)}`,
        x0 + best.column * chunk,
        z0 + best.row * chunk,
        chunk,
        SIZES[size],
      );
  }
  worker.onmessage = ({ data }) => {
    busy = false;
    const number = Number(data.id.slice(1));
    if (!shown) {
      data.ground.close();
      data.deck?.close();
    } else if (data.id[0] === "s") {
      const [extent, x, z] = around[number].asked.split(",").map(Number);
      drop(squares.maps[number].value);
      drop(squares.deckMaps[number].value);
      squares.maps[number].value = texture(data.ground);
      squares.rects[number].value.set(x, z, extent, 1);
      squares.deckMaps[number].value = data.deck && texture(data.deck);
      squares.deckRects[number].value.set(x, z, extent, data.deck ? 1 : 0);
      around[number].shown = around[number].asked;
    } else {
      const tile = states[number];
      const old = [ground.tiles.get(tile.name), ground.decks.get(tile.name)];
      ground.tiles.set(tile.name, texture(data.ground));
      if (data.deck) ground.decks.set(tile.name, texture(data.deck));
      tile.level = SIZES.indexOf(data.ground.width);
      ground.changed?.(tile.name);
      old.forEach(drop);
      if (states.every((t) => t.level >= 0)) drawn();
    }
    next();
  };

  // distance(name): metres from the camera to a tile; inView(name): whether it may be in view;
  // focal: the pixels a metre takes on the screen a metre away; focus: the point looked at,
  // range: metres from the camera to it; seen(x, z, extent): whether a square may be in view.
  ground.update = (distance, inView, focal, focus, range, seen) => {
    const level = (metres) => {
      const px = (SHARE * chunk * focal) / Math.max(metres, 1);
      let l = 0;
      while (l < finest && SIZES[l] < px) l++;
      return l;
    };
    for (const tile of states) {
      tile.distance = distance(tile.name);
      tile.want = level(tile.distance);
      tile.keep = level(tile.distance / KEEP);
      // Out of view, it is not drawn finer than it is.
      if (!inView(tile.name)) tile.want = Math.min(tile.want, Math.max(tile.level, 0));
    }
    // Squares while a pixel at the focus spans less than a tile's finest (about half a metre),
    // each on a grid of a quarter of its width.
    if (range / focal < 0.45)
      around.forEach((square, i) => {
        const extent = SQUARES[i + (range > 45 ? 1 : 0)];
        const grid = (v) => Math.round((v - extent / 2) / (extent / 4)) * (extent / 4);
        const want = { x: grid(focus.x), z: grid(focus.z), extent };
        if (!seen(want.x, want.z, extent)) return void (square.want = null); // keeps what it shows
        if (square.want && named(want) === named(square.want)) return;
        square.want = want;
        square.since = performance.now();
      });
    next();
  };
  // Gives up all textures (the map is not shown), and draws them again: ready is new.
  ground.hide = () => {
    shown = false;
    for (const tile of states) {
      drop(ground.tiles.get(tile.name));
      drop(ground.decks.get(tile.name));
      ground.tiles.set(tile.name, blank);
      tile.level = -1;
    }
    ground.decks.clear();
    around.forEach((square, i) => {
      drop(squares.maps[i].value);
      drop(squares.deckMaps[i].value);
      squares.maps[i].value = squares.deckMaps[i].value = null;
      squares.rects[i].value.w = squares.deckRects[i].value.w = 0;
      Object.assign(square, { want: null, shown: "" });
    });
  };
  ground.show = () => {
    shown = true;
    ground.ready = new Promise((resolve) => (drawn = resolve));
    next();
  };
  ground.show();
  return ground;
}
