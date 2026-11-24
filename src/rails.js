// The rails on the tracks of public/ground/rails.bin (tools/map.mjs): two per track, worked out
// by the shader on strips lying on the ground or on a bridge's deck, so they are sharp from any
// distance. Far away, thinner than a pixel, they fade.
import * as THREE from "three";
import { daylight } from "./daylight.js";
import { Packed } from "./pack.js";

const STEP = 2; // metres between a strip's points at most, so it follows the ground's grid
const LIFT = 0.04; // metres above the ground
// Per kind (tram, railway): metres from a track's middle to a rail's and to the strip's edge.
const GAUGE = [0.5, 0.7175];
const EDGE = [0.75, 0.95];
const HEAD = 0.12; // metres a rail is wide, wider than a real one, to show from further

// buffer: the file; the terrain's x0, z0 and chunk; ground(x, z): the terrain's height as its
// mesh has it; deck(x, z): the height of the highest bridge deck there, -Infinity if none.
// Gives a group of one mesh per terrain tile ("column_row") with the tracks starting on it, and
// cut(deck): takes the rails off a bridge's deck (deckOf in src/main.js) for good.
export function createRails(buffer, { x0, z0, chunk }, ground, deck) {
  const packed = new Packed(new Uint8Array(buffer));
  // Per tile: position; track: per vertex the metres across from the track's middle and its
  // kind; index.
  const tiles = new Map();
  let [x, y] = [0, 0];
  for (let left = packed.number(); left > 0; left--) {
    const flags = packed.number();
    const kind = flags >> 1;
    const points = [];
    for (let n = packed.number(); n > 0; n--) {
      x += packed.signed();
      y += packed.signed();
      points.push([x0 + x / 10, z0 + y / 10]);
    }
    // The track's line with points at most STEP apart.
    const line = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const [[ax, az], [bx, bz]] = [points[i - 1], points[i]];
      const parts = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
      for (let k = 1; k <= parts; k++)
        line.push([ax + ((bx - ax) * k) / parts, az + ((bz - az) * k) / parts]);
    }
    const name = `${Math.floor((points[0][0] - x0) / chunk)}_${Math.floor((points[0][1] - z0) / chunk)}`;
    if (!tiles.has(name)) tiles.set(name, { position: [], track: [], index: [] });
    const { position, track, index } = tiles.get(name);
    line.forEach(([px, pz], i) => {
      const [ax, az] = line[Math.max(i - 1, 0)];
      const [bx, bz] = line[Math.min(i + 1, line.length - 1)];
      const length = Math.hypot(bx - ax, bz - az) || 1;
      for (const side of [-1, 1]) {
        const vx = px - ((bz - az) / length) * EDGE[kind] * side;
        const vz = pz + ((bx - ax) / length) * EDGE[kind] * side;
        const height = Math.max(ground(vx, vz), flags & 1 ? deck(vx, vz) : -Infinity);
        position.push(vx, height + LIFT, vz);
        track.push(EDGE[kind] * side, kind);
      }
      const v = position.length / 3;
      if (i) index.push(v - 4, v - 3, v - 2, v - 3, v - 1, v - 2);
    });
  }
  // All colours are linear.
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true, // in front of the ground it lies on
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { daylight },
    vertexShader: /* glsl */ `
      attribute vec2 track;
      varying vec2 vTrack;
      void main() {
        vTrack = track;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vTrack;
      uniform float daylight;
      void main() {
        float pixel = fwidth(vTrack.x); // metres a pixel spans across the track
        // The share of the pixel a rail covers.
        float from = abs(vTrack.x) - (vTrack.y > 0.5 ? ${GAUGE[1]} : ${GAUGE[0]});
        float alpha = clamp((min(${HEAD / 2}, from + 0.5 * pixel) - max(-${HEAD / 2}, from - 0.5 * pixel)) / pixel, 0.0, 1.0)
          * (1.0 - smoothstep(0.8, 1.6, pixel));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vec3(0.2, 0.2, 0.21) * daylight, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const rails = new THREE.Group();
  for (const [name, { position, track, index }] of tiles) {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry()
        .setAttribute("position", new THREE.Float32BufferAttribute(position, 3))
        .setAttribute("track", new THREE.Float32BufferAttribute(track, 2))
        .setIndex(index),
      material,
    );
    mesh.name = name;
    rails.add(mesh);
  }
  // The strips' quads with a corner on the deck shrink to nothing.
  rails.cut = (deck) => {
    for (const { geometry } of rails.children) {
      const { position } = geometry.attributes;
      const index = geometry.index;
      for (let q = 0; q < index.count; q += 6) {
        const corners = [index.getX(q), index.getX(q + 1), index.getX(q + 2), index.getX(q + 4)];
        if (
          !corners.some((v) =>
            deck.covers(position.getX(v), position.getY(v) - LIFT, position.getZ(v)),
          )
        )
          continue;
        for (let i = q; i < q + 6; i++) index.setX(i, corners[0]);
        index.needsUpdate = true;
      }
    }
  };
  return rails;
}
