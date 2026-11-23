// Room for those on foot and on wheels (src/walkers.js, src/swimmers.js, src/runners.js), so none
// moves into another: each body a circle { x, z, radius, group, gone } (gone: not in the way, as
// in the water; x not finite: nowhere); a step bringing one nearer to one of another group while
// within their radii together is blocked, a step away never. One blocked PATIENCE seconds on end
// squeezes past (its mover no longer asks) until it is free, so none waits for ever.
export const PATIENCE = 3;
const CELL = 2; // metres, more than any two radii together and a frame's step
const none = [];

export function createSpace() {
  const lists = [];
  const grid = new Map(); // cell → the bodies in it
  const key = (x, z) => Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
  return {
    // Adds a list of bodies, read anew each update.
    add: (list) => lists.push(list),
    // Notes where each is, once a frame before any moves.
    update() {
      for (const cell of grid.values()) cell.length = 0;
      for (const list of lists)
        for (const b of list) {
          if (b.gone || !Number.isFinite(b.x)) continue;
          const k = key(b.x, b.z);
          (grid.get(k) ?? grid.set(k, []).get(k)).push(b);
        }
    },
    // Calls visit(body) for each body noted within at least reach metres of x, z.
    each(x, z, reach, visit) {
      const [k, n] = [key(x, z), Math.ceil(reach / CELL)];
      for (let i = -n; i <= n; i++)
        for (let j = -n; j <= n; j++) for (const b of grid.get(k + i * 65536 + j) ?? none) visit(b);
    },
    // Whether one of group, radius metres round, moving from x, z to nx, nz is blocked.
    blocked(group, radius, x, z, nx, nz) {
      const k = key(nx, nz);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const b of grid.get(k + i * 65536 + j) ?? none) {
            if (b.group === group) continue;
            const near = (b.x - nx) ** 2 + (b.z - nz) ** 2;
            if (near < (radius + b.radius) ** 2 && near < (b.x - x) ** 2 + (b.z - z) ** 2)
              return true;
          }
      return false;
    },
  };
}
