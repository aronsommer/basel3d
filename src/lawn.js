// A word mown into a lawn, seen from above: each letter a mower's wobbly lanes, drawn as by a
// child (tilted, sized and shifted a little each), a lighter green over the ground.
import * as THREE from "three";

const MOWER = 1.6; // metres wide, a lane
const [WIDTH, HEIGHT] = [1024, 448]; // pixels of the drawing; its height across, to scale
// The letters' lanes, each through points [x, y] in a box 1 wide and high, y down.
const LETTERS = {
  P: [
    [
      [0, 1],
      [0, 0],
      [0.6, 0],
      [0.9, 0.13],
      [0.95, 0.28],
      [0.83, 0.43],
      [0.5, 0.52],
      [0, 0.52],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 0.65],
      [0.12, 0.9],
      [0.5, 1],
      [0.88, 0.9],
      [1, 0.65],
      [1, 0],
    ],
  ],
  M: [
    [
      [0, 1],
      [0.05, 0],
      [0.5, 0.6],
      [0.95, 0],
      [1, 1],
    ],
  ],
  A: [
    [
      [0.15, 1],
      [0.65, 0],
      [1.15, 1],
    ],
    [
      [0.37, 0.62],
      [0.95, 0.6],
    ],
  ],
};

// word (of LETTERS) written from one point to the other ([x, z] each), reading along, its top on
// the left seen from above; on the terrain (its x0, z0, cell, nx, nz and heights, row by row from
// north). A mesh.
export function createLawn(word, [from, to], { x0, z0, cell, nx, nz }, heights) {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dz);
  const across = (length * HEIGHT) / WIDTH;
  let seed = 7; // the same wobbles each time
  const random = (a, b) => a + ((seed = (seed * 16807) % 2147483647) / 2147483647) * (b - a);

  const canvas = Object.assign(document.createElement("canvas"), { width: WIDTH, height: HEIGHT });
  const brush = canvas.getContext("2d");
  brush.lineCap = brush.lineJoin = "round";
  brush.strokeStyle = "#fff";
  const box = WIDTH / word.length; // each letter's
  const lanes = [...word].flatMap((letter, k) => {
    const [size, tilt] = [random(0.85, 1.08), random(-0.12, 0.12)];
    const [w, h] = [0.68 * box * size, 0.67 * HEIGHT * size];
    const [cx, cy] = [(k + 0.5 + random(-0.05, 0.05)) * box, HEIGHT / 2 + random(-0.06, 0.06) * h];
    return LETTERS[letter].map((lane) =>
      lane.map(([x, y]) => {
        const [u, v] = [(x + random(-0.04, 0.04) - 0.5) * w, (y + random(-0.04, 0.04) - 0.5) * h];
        return [
          cx + u * Math.cos(tilt) - v * Math.sin(tilt),
          cy + u * Math.sin(tilt) + v * Math.cos(tilt),
        ];
      }),
    );
  });
  // Each lane bent smoothly through its points' midpoints.
  const draw = (width) => {
    brush.lineWidth = width;
    for (const lane of lanes) {
      brush.beginPath();
      brush.moveTo(...lane[0]);
      for (let i = 1; i < lane.length - 1; i++)
        brush.quadraticCurveTo(
          ...lane[i],
          (lane[i][0] + lane[i + 1][0]) / 2,
          (lane[i][1] + lane[i + 1][1]) / 2,
        );
      brush.lineTo(...lane.at(-1));
      brush.stroke();
    }
  };
  const lane = (MOWER * WIDTH) / length;
  draw(lane);
  // Fainter down the middle, as mown there and back, and speckled as grass.
  brush.globalCompositeOperation = "destination-out";
  brush.strokeStyle = "rgba(0, 0, 0, 0.3)";
  draw(0.4 * lane);
  for (let i = 0; i < 6000; i++) {
    brush.fillStyle = `rgba(0, 0, 0, ${random(0.2, 0.6)})`;
    brush.fillRect(random(0, WIDTH), random(0, HEIGHT), random(1, 3), random(1, 3));
  }
  // Its edges clear, as the texture repeats them beyond.
  const EDGE = 2; // pixels
  brush.clearRect(0, 0, WIDTH, EDGE);
  brush.clearRect(0, HEIGHT - EDGE, WIDTH, EDGE);
  brush.clearRect(0, 0, EDGE, HEIGHT);
  brush.clearRect(WIDTH - EDGE, 0, EDGE, HEIGHT);

  // The terrain's own cells under it, so it lies exactly on the ground: their corners row by row
  // from north, each cell's two triangles as in the terrain's mesh, each corner where it is on the
  // drawing.
  const [ax, az] = [dx / length, dz / length]; // along; the top is towards az, -ax
  const [mx, mz] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const reach = Math.hypot(length, across) / 2;
  const span = (m, origin, n) => [
    Math.max(0, Math.floor((m - reach - origin) / cell)),
    Math.min(n - 1, Math.ceil((m + reach - origin) / cell)),
  ];
  const [[c0, c1], [r0, r1]] = [span(mx, x0, nx), span(mz, z0, nz)];
  const [position, uv, index] = [[], [], []];
  const cols = c1 - c0 + 1;
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) {
      const [x, z] = [x0 + col * cell, z0 + row * cell];
      position.push(x, heights[row * nx + col], z);
      const [rx, rz] = [x - mx, z - mz];
      uv.push(0.5 + (rx * ax + rz * az) / length, 0.5 + (rx * az - rz * ax) / across);
      if (row > r0 && col > c0) {
        const b = (row - r0) * cols + col - c0; // south-east
        index.push(b - cols - 1, b - 1, b - cols, b - 1, b, b - cols);
      }
    }
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(position, 3))
    .setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    .setIndex(index);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    color: 0xe4f2b0,
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true, // in front of the ground it lies on
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return new THREE.Mesh(geometry, material);
}
