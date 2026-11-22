// Wall clocks as the SBB's: a plain white dial with black bars, black hands, a red second hand
// with a disc at its end that goes round in 58.5 s and waits at 12 until the minute hand jumps
// on. All of them one mesh; the shader turns the hands after clockTime.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const clockTime = { value: 0 }; // seconds since local midnight

// Drawn here, so nothing is loaded: the dial in the top 256 × 256 pixels, below it black, red and
// a red disc, 32 pixels each.
const SIZE = 256;
const STRIP = 32;
const TEXTURE = (() => {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: SIZE,
    height: SIZE + STRIP,
  });
  const brush = canvas.getContext("2d");
  const c = SIZE / 2;
  brush.fillStyle = "#fff";
  brush.beginPath();
  brush.arc(c, c, c - 1, 0, 2 * Math.PI);
  brush.fill();
  brush.fillStyle = "#000";
  for (let i = 0; i < 60; i++) {
    brush.setTransform(1, 0, 0, 1, c, c);
    brush.rotate((i * Math.PI) / 30);
    // Hours: bars over the outer quarter of the ring; minutes: short thin ones, out as far.
    if (i % 5 === 0) brush.fillRect(-4, -112, 8, 27);
    else brush.fillRect(-1.5, -112, 3, 8);
  }
  brush.setTransform(1, 0, 0, 1, 0, 0);
  brush.fillRect(0, SIZE, STRIP, STRIP);
  brush.fillStyle = "#eb0000";
  brush.fillRect(STRIP, SIZE, STRIP, STRIP);
  brush.beginPath();
  brush.arc(2.5 * STRIP, SIZE + STRIP / 2, STRIP / 2 - 1, 0, 2 * Math.PI);
  brush.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
})();
const v = (y) => 1 - y / (SIZE + STRIP); // of a canvas row

// A clock 1 m in radius facing +z: the dial, then the hour, minute and second hands, each a little
// further out, pointing to 12; hand: −1 the dial, else which hand (0 hour, 1 minute, 2 second).
const CLOCK = (() => {
  // A plane from x0 to x1 and y0 to y1 at z, showing the canvas from u0 to u1 and row r0 to r1.
  const plane = (x0, x1, y0, y1, z, [u0, u1, r0, r1], hand) => {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v(r1) + uv.getY(i) * (v(r0) - v(r1)));
    g.setAttribute("hand", new THREE.Float32BufferAttribute(Array(uv.count).fill(hand), 1));
    return g;
  };
  const block = (k) => [(k + 0.5) / 8, (k + 0.5) / 8, SIZE + STRIP / 2, SIZE + STRIP / 2];
  const [BLACK, RED, DISC] = [block(0), block(1), [0.25, 0.375, SIZE, SIZE + STRIP]];
  return mergeGeometries([
    plane(-1, 1, -1, 1, 0, [0, 1, 0, SIZE], -1),
    plane(-0.047, 0.047, -0.2, 0.59, 0.04, BLACK, 0),
    plane(-0.034, 0.034, -0.21, 0.81, 0.08, BLACK, 1),
    plane(-0.011, 0.011, -0.29, 0.57, 0.12, RED, 2),
    plane(-0.093, 0.093, 0.477, 0.663, 0.12, DISC, 2),
  ]);
})();

// clocks: [{ x, y, z (the dial's middle), heading (radians; 0 faces +z), radius (metres) }].
export function createClocks(clocks) {
  // Pulled forward as src/station.js does its pictures, so a clock stays before the wall's.
  const material = new THREE.MeshLambertMaterial({
    map: TEXTURE,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.clockTime = clockTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float clockTime;\nattribute float hand;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        if (hand >= 0.0) {
          float minutes = floor(clockTime / 60.0);
          float turns = hand < 0.5 ? minutes / 720.0 : hand < 1.5 ? minutes / 60.0
            : min(mod(clockTime, 60.0) / 58.5, 1.0);
          float a = -6.2831853 * turns; // clockwise
          transformed.xy = mat2(cos(a), sin(a), -sin(a), cos(a)) * transformed.xy;
        }`,
      );
  };
  const mesh = new THREE.InstancedMesh(CLOCK, material, clocks.length);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  clocks.forEach(({ x, y, z, heading, radius }, i) =>
    mesh.setMatrixAt(
      i,
      matrix.compose(
        new THREE.Vector3(x, y, z),
        turn.setFromAxisAngle(up, heading),
        new THREE.Vector3(radius, radius, radius),
      ),
    ),
  );
  mesh.computeBoundingSphere();
  return mesh;
}
