// The map as textures of the terrain's tiles, drawn by src/ground-worker.js: each tile with as
// many pixels as its distance from the camera needs, the nearest first, redrawn as the camera
// moves.
import * as THREE from "three";

const SIZES = [256, 512, 1024, 2048]; // pixels across a tile; phones and tablets stop at 1024
const SHARE = 0.5; // of the pixels a tile's nearest part takes on the screen, across
const KEEP = 1.4; // a tile is drawn coarser again only this many times further away

// files: { map, soft, city } (src/groundmap.js; map and soft are handed over); the terrain's
// x0, z0, chunk, cell, nx, nz; script: the worker's address.
// Gives { tiles, decks: the textures by tile name ("column_row"; decks only where there are
// some), ready: a promise until every tile is drawn, changed: set it to be called with a tile's
// name when its textures were replaced, update, hide, show }.
export function createGround(files, { x0, z0, chunk, cell, nx, nz }, renderer, script) {
  const worker = new Worker(script, { type: "module" });
  worker.postMessage({ files, origin: [x0, z0] }, [files.map, files.soft]);
  const finest = matchMedia("(pointer: coarse)").matches ? 2 : 3;

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
  // Asks the worker for the next tile: first those not drawn yet, then those to draw finer, then
  // those to draw coarser; of each the nearest.
  function next() {
    if (busy || !shown) return;
    let [best, rank, size] = [null, Infinity, 0];
    for (const tile of states) {
      const group =
        tile.level < 0 ? 0 : tile.level < tile.want ? 1 : tile.level > tile.keep ? 2 : 3;
      if (group === 3 || group * 1e9 + tile.distance >= rank) continue;
      [best, rank, size] = [tile, group * 1e9 + tile.distance, group ? tile.want : 0];
    }
    if (!best) return;
    busy = true;
    worker.postMessage({ column: best.column, row: best.row, px: SIZES[size] });
  }
  worker.onmessage = ({ data }) => {
    busy = false;
    const tile = states.find((t) => t.column === data.column && t.row === data.row);
    if (!shown) {
      data.ground.close();
      data.deck?.close();
      return;
    }
    const old = [ground.tiles.get(tile.name), ground.decks.get(tile.name)];
    ground.tiles.set(tile.name, texture(data.ground));
    if (data.deck) ground.decks.set(tile.name, texture(data.deck));
    tile.level = SIZES.indexOf(data.px);
    ground.changed?.(tile.name);
    old.forEach(drop);
    if (states.every((t) => t.level >= 0)) drawn();
    next();
  };

  // distance(name): metres from the camera to a tile; focal: the pixels a metre takes on the
  // screen a metre away.
  ground.update = (distance, focal) => {
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
    }
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
  };
  ground.show = () => {
    shown = true;
    ground.ready = new Promise((resolve) => (drawn = resolve));
    next();
  };
  ground.show();
  return ground;
}
