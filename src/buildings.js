// Buildings and bridges as single objects, by number: which one is at a screen point or in the way
// of a line, showing one in HIGHLIGHT, their triangles, and hiding them. What is done with them is
// up to the caller.
import * as THREE from "three";
import { highlightShader } from "./highlight.js";

// buildings, bridges: the loaded models, with Lambert materials; hiders: models that hide them
// (the terrain).
export function createBuildings(buildings, bridges, hiders, renderer, camera) {
  // Each vertex has its building's or bridge's number (_building, tools/buildings.mjs and
  // bridges.mjs); the bridges' are moved after the buildings', so each number is one of them.
  const meshesOf = []; // per number, the meshes with its vertices
  const register = (o, offset) => {
    if (!o.isMesh) return;
    const number = o.geometry.attributes._building;
    for (let i = 0; i < number.count; i++) {
      const n = number.getX(i) + offset;
      if (offset) number.setX(i, n);
      const meshes = (meshesOf[n] ??= []);
      if (meshes.at(-1) !== o) meshes.push(o);
    }
  };
  buildings.traverse((o) => register(o, 0));
  const count = meshesOf.length; // of buildings
  bridges.traverse((o) => register(o, count));
  const bridgeNumbers = [...meshesOf.keys()].filter((n) => n >= count && meshesOf[n]);
  // How many buildings and bridges there are: the numbers found in the models.
  const total = {
    buildings: meshesOf.slice(0, count).filter(Boolean).length,
    bridges: bridgeNumbers.length,
  };
  // The meshes with vertices of these numbers.
  const meshesWith = (numbers) => new Set([...numbers].flatMap((n) => meshesOf[n] ?? []));

  // Per number its bounding box in scene coordinates (min x, y, z, max x, y, z), and per
  // GRID-metre square of the ground ("column,row") the numbers whose boxes reach into it; worked
  // out on the first hit(), not while loading.
  const GRID = 100;
  let boxes = null;
  const cells = new Map();
  const cellRange = (from, to) => [Math.floor(from / GRID), Math.floor(to / GRID)];
  function measure() {
    boxes = new Float32Array(meshesOf.length * 6);
    for (let i = 0; i < boxes.length; i++) boxes[i] = i % 6 < 3 ? Infinity : -Infinity;
    const vertex = new THREE.Vector3();
    for (const model of [buildings, bridges])
      model.traverse((o) => {
        if (!o.isMesh) return;
        const { position, _building: number } = o.geometry.attributes;
        o.updateWorldMatrix(true, false);
        for (let i = 0; i < number.count; i++) {
          const n = number.getX(i);
          vertex.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
          for (let d = 0; d < 3; d++) {
            boxes[6 * n + d] = Math.min(boxes[6 * n + d], vertex.getComponent(d));
            boxes[6 * n + 3 + d] = Math.max(boxes[6 * n + 3 + d], vertex.getComponent(d));
          }
        }
      });
    for (let n = 0; n < meshesOf.length; n++) {
      const [x0, x1] = cellRange(boxes[6 * n], boxes[6 * n + 3]);
      const [z0, z1] = cellRange(boxes[6 * n + 2], boxes[6 * n + 5]);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(n);
        }
    }
  }
  // Where (0 to 1) the segment from → to enters the box of number n; Infinity if it misses it.
  const enter = (from, to, n) => {
    let [t0, t1] = [0, 1];
    for (let d = 0; d < 3; d++) {
      const a = from.getComponent(d);
      const delta = to.getComponent(d) - a;
      const [low, high] = [boxes[6 * n + d], boxes[6 * n + 3 + d]];
      if (delta === 0) {
        if (a < low || a > high) return Infinity;
        continue;
      }
      const [u, w] = [(low - a) / delta, (high - a) / delta];
      t0 = Math.max(t0, Math.min(u, w));
      t1 = Math.min(t1, Math.max(u, w));
      if (t0 > t1) return Infinity;
    }
    return t0;
  };

  // Per mesh, per number, { walls, roofs }: its steep triangles as [x0, z0, x1, z1, bottom, top]
  // each (the two of its corners furthest apart seen from above and its height range), and those
  // not upright as their corners [x, y, z, x, y, z, x, y, z] each (some steep ones are both).
  // Made when first needed; hide() forgets those it hides, which are not looked up again.
  const surfaces = new Map(); // mesh → Map(number → { walls, roofs })
  const side = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  function surfacesOf(mesh) {
    if (surfaces.has(mesh)) return surfaces.get(mesh);
    const found = new Map();
    const { index, attributes } = mesh.geometry;
    const { position, _building } = attributes;
    const at = (i) => (index ? index.getX(i) : i);
    const corners = [...Array(3)].map(() => new THREE.Vector3());
    const normal = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    for (let t = 0; t < (index ?? position).count; t += 3) {
      corners.forEach((c, k) =>
        c.fromBufferAttribute(position, at(t + k)).applyMatrix4(mesh.matrixWorld),
      );
      const [a, b, c] = corners;
      const n = _building.getX(at(t));
      if (!found.has(n)) found.set(n, { walls: [], roofs: [] });
      const { walls, roofs } = found.get(n);
      const up = Math.abs(THREE.Triangle.getNormal(a, b, c, normal).y);
      if (up > 0.3) roofs.push(...a, ...b, ...c);
      if (up > 0.7) continue; // flat
      const [p, q] = [
        [a, b],
        [b, c],
        [c, a],
      ].reduce((far, pair) =>
        Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z) >
        Math.hypot(far[0].x - far[1].x, far[0].z - far[1].z)
          ? pair
          : far,
      );
      walls.push(p.x, p.z, q.x, q.z, Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y));
    }
    surfaces.set(mesh, found);
    return found;
  }

  // The one shown in HIGHLIGHT (its number; -1 for none).
  const highlighted = { value: -1 };
  const highlightNumber = (shader) => {
    shader.uniforms.highlighted = highlighted;
    highlightShader(
      shader,
      "_building == highlighted",
      "attribute float _building;\nuniform float highlighted;",
    );
  };
  for (const model of [buildings, bridges])
    model.traverse((o) => {
      if (o.isMesh) o.material.onBeforeCompile = highlightNumber;
    });

  // Which one is at a screen point: they are drawn into one pixel with their number + 1 as colour
  // (0: none), the hiders only hiding what is behind them. Faster than a raycast through millions
  // of triangles, so it can follow the mouse.
  const pickScene = new THREE.Scene();
  const pickTarget = new THREE.WebGLRenderTarget(1, 1);
  const pickPixel = new Uint8Array(4);
  const numberMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float _building;
      varying float vNumber;
      void main() {
        vNumber = _building + 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vNumber;
      void main() {
        float n = floor(vNumber + 0.5);
        gl_FragColor = vec4(floor(n / 256.0), mod(n, 256.0), 0.0, 255.0) / 255.0;
      }`,
  });
  const hideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  for (const [model, material] of [
    [buildings, numberMaterial],
    [bridges, numberMaterial],
    ...hiders.map((model) => [model, hideMaterial]),
  ])
    model.traverse((o) => {
      if (!o.isMesh) return;
      const copy = new THREE.Mesh(o.geometry, material); // shares the geometry
      o.updateWorldMatrix(true, false);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(o.matrixWorld);
      pickScene.add(copy);
    });

  return {
    // The number of the building or bridge at a screen point (px), or -1.
    at(clientX, clientY) {
      camera.setViewOffset(innerWidth, innerHeight, clientX, clientY, 1, 1);
      renderer.setRenderTarget(pickTarget);
      renderer.render(pickScene, camera);
      renderer.setRenderTarget(null);
      camera.clearViewOffset();
      renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
      return pickPixel[0] * 256 + pickPixel[1] - 1;
    },
    // Shows the one with this number in HIGHLIGHT; -1: none.
    highlight(number) {
      highlighted.value = number;
    },
    total,
    bridgeNumbers,
    isBridge: (number) => number >= count,
    // The number of the building or bridge whose bounding box the segment from → to (scene points,
    // short against GRID) enters first, or -1; hidden ones are left out.
    hit(from, to) {
      if (!boxes) measure();
      let [best, first] = [-1, Infinity];
      const [x0, x1] = cellRange(Math.min(from.x, to.x), Math.max(from.x, to.x));
      const [z0, z1] = cellRange(Math.min(from.z, to.z), Math.max(from.z, to.z));
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (const n of cells.get(`${x},${z}`) ?? []) {
            if (!meshesOf[n].length) continue;
            const t = enter(from, to, n);
            if (t < first) [best, first] = [n, t];
          }
      return best;
    },
    // Whether a wall of a building (or with bridges, of a bridge too) crosses the level segment
    // from → to (short against GRID) at the height of from; hidden ones are left out.
    wall(from, to, bridges = false) {
      if (!boxes) measure();
      const [x0, x1] = cellRange(Math.min(from.x, to.x), Math.max(from.x, to.x));
      const [z0, z1] = cellRange(Math.min(from.z, to.z), Math.max(from.z, to.z));
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++)
          for (const n of cells.get(`${x},${z}`) ?? []) {
            if ((n >= count && !bridges) || !meshesOf[n].length || enter(from, to, n) === Infinity)
              continue;
            for (const mesh of meshesOf[n]) {
              const list = surfacesOf(mesh).get(n)?.walls ?? [];
              for (let i = 0; i < list.length; i += 6) {
                const [ax, az, bx, bz] = [list[i], list[i + 1], list[i + 2], list[i + 3]];
                if (
                  list[i + 4] < from.y &&
                  from.y < list[i + 5] &&
                  side(ax, az, bx, bz, from.x, from.z) * side(ax, az, bx, bz, to.x, to.z) < 0 &&
                  side(from.x, from.z, to.x, to.z, ax, az) *
                    side(from.x, from.z, to.x, to.z, bx, bz) <
                    0
                )
                  return true;
              }
            }
          }
      return false;
    },
    // The height of the highest roof (or other face not upright) of a building (not a bridge) at
    // the point x, z, at most y; -Infinity if none. Hidden ones are left out, and those not
    // reaching above `above`, unlooked at.
    top(x, z, y, above = -Infinity) {
      if (!boxes) measure();
      let best = -Infinity;
      const [column] = cellRange(x, x);
      const [row] = cellRange(z, z);
      for (const n of cells.get(`${column},${row}`) ?? []) {
        if (n >= count || !meshesOf[n].length) continue;
        const b = 6 * n;
        if (x < boxes[b] || x > boxes[b + 3] || z < boxes[b + 2] || z > boxes[b + 5]) continue;
        if (boxes[b + 4] <= above) continue;
        for (const mesh of meshesOf[n]) {
          const list = surfacesOf(mesh).get(n)?.roofs ?? [];
          for (let i = 0; i < list.length; i += 9) {
            const [ax, az, bx, bz, cx, cz] = [
              list[i],
              list[i + 2],
              list[i + 3],
              list[i + 5],
              list[i + 6],
              list[i + 8],
            ];
            const [ay, by, cy] = [list[i + 1], list[i + 4], list[i + 7]];
            const d1 = side(ax, az, bx, bz, x, z);
            const d2 = side(bx, bz, cx, cz, x, z);
            const d3 = side(cx, cz, ax, az, x, z);
            const sum = d1 + d2 + d3;
            if (sum === 0 || ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)))
              continue;
            const h = (ay * d2 + by * d3 + cy * d1) / sum; // barycentric
            if (h <= y && h > best) best = h;
          }
        }
      }
      return best;
    },
    // The triangles of those with these numbers, but hidden ones, in scene coordinates: a Map from
    // each number to [{ color, positions, vertices }] per mesh, nine numbers per triangle and the
    // mesh's vertex number of each corner. Each mesh is gone through once, however many numbers it
    // has.
    triangles(numbers) {
      const wanted = new Set(numbers);
      const found = new Map();
      const vertex = new THREE.Vector3();
      for (const mesh of meshesWith(wanted)) {
        const { index, attributes } = mesh.geometry;
        const { position, _building, color } = attributes;
        const at = (i) => (index ? index.getX(i) : i);
        const lists = new Map(); // number → its positions in this mesh
        mesh.updateWorldMatrix(true, false);
        for (let t = 0; t < (index ?? position).count; t += 3) {
          const n = _building.getX(at(t));
          if (!wanted.has(n)) continue;
          if (!lists.has(n))
            lists.set(n, {
              color: color
                ? new THREE.Color().fromBufferAttribute(color, at(t))
                : [mesh.material].flat()[0].color, // the bridges have one per ground tile
              positions: [],
              vertices: [],
            });
          const { positions, vertices } = lists.get(n);
          for (let k = 0; k < 3; k++) {
            positions.push(
              ...vertex.fromBufferAttribute(position, at(t + k)).applyMatrix4(mesh.matrixWorld),
            );
            vertices.push(at(t + k));
          }
        }
        for (const [n, part] of lists) {
          if (!found.has(n)) found.set(n, []);
          found.get(n).push(part);
        }
      }
      return found;
    },
    // The number of the building (not a bridge) with the widest bounding box whose middle is within
    // reach of x, z; -1 if none.
    widest(x, z, reach) {
      if (!boxes) measure();
      let [best, wide] = [-1, 0];
      for (let n = 0; n < count; n++) {
        const b = 6 * n;
        if (!meshesOf[n]?.length) continue;
        const [mx, mz] = [(boxes[b] + boxes[b + 3]) / 2, (boxes[b + 2] + boxes[b + 5]) / 2];
        const width = Math.max(boxes[b + 3] - boxes[b], boxes[b + 5] - boxes[b + 2]);
        if (Math.hypot(mx - x, mz - z) <= reach && width > wide) [best, wide] = [n, width];
      }
      return best;
    },
    // The numbers of the buildings (not bridges) whose bounding box's middle (x, z) passes test.
    within(test) {
      if (!boxes) measure();
      const found = [];
      for (let n = 0; n < count; n++) {
        const b = 6 * n;
        if (
          meshesOf[n]?.length &&
          test((boxes[b] + boxes[b + 3]) / 2, (boxes[b + 2] + boxes[b + 5]) / 2)
        )
          found.push(n);
      }
      return found;
    },
    // Colours the one with this number: its roofs and walls (0xrrggbb each, by the materials'
    // names; one left out keeps its colours), and gives its walls this facade (the alpha as a byte:
    // style, flags and seed, src/facade.js; left out, they keep theirs).
    paint(number, { roof, wall, facade }) {
      const colour = new THREE.Color();
      for (const mesh of meshesOf[number] ?? []) {
        const { color, _building } = mesh.geometry.attributes;
        const isRoof = mesh.material.name === "roof";
        const wanted = isRoof ? roof : wall;
        const restyle = !isRoof && facade !== undefined;
        if (wanted === undefined && !restyle) continue;
        if (wanted !== undefined) colour.set(wanted);
        for (let i = 0; i < color.count; i++) {
          if (_building.getX(i) !== number) continue;
          if (wanted !== undefined) color.setXYZ(i, colour.r, colour.g, colour.b);
          if (restyle) color.setW(i, facade / 255);
        }
        color.needsUpdate = true;
      }
    },
    // Hides those with these numbers for good, also from at(), hit(), wall() and raycasts: the
    // vertices of each collapse into one point. Each mesh is gone through once.
    hide(numbers) {
      const wanted = new Set(numbers);
      for (const mesh of meshesWith(wanted)) {
        for (const n of wanted) surfaces.get(mesh)?.delete(n);
        const { position, _building } = mesh.geometry.attributes;
        const first = new Map(); // number → its first vertex in this mesh
        for (let i = 0; i < position.count; i++) {
          const n = _building.getX(i);
          if (!wanted.has(n)) continue;
          const f = first.get(n);
          if (f === undefined) first.set(n, i);
          else position.setXYZ(i, position.getX(f), position.getY(f), position.getZ(f));
        }
        position.needsUpdate = true;
      }
      for (const n of wanted) if (meshesOf[n]) meshesOf[n] = [];
    },
  };
}
