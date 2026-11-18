// Building low-poly models from parts with vertex colours, to merge with mergeGeometries.
import * as THREE from "three";

// A part at [x, y, z], coloured by a colour or by a function of its own (untranslated) y and z;
// without normals and uvs (flat shading makes them).
export function part(geometry, color, [x, y, z]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const position = g.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++)
    c.set(typeof color === "function" ? color(position.getY(i), position.getZ(i)) : color).toArray(
      colors,
      3 * i,
    );
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g.translate(x, y, z);
}

// A sprite material that adds a soft round glow of this colour onto what is behind it, drawn here,
// so nothing is loaded.
export function glow(color) {
  const canvas = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const brush = canvas.getContext("2d");
  const gradient = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.6)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  brush.fillStyle = gradient;
  brush.fillRect(0, 0, 64, 64);
  return new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    color,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// A side profile ([z, y] points) extruded across, width wide, centred on x = 0.
export const profile = (points, width) =>
  new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y))), {
    depth: width,
    bevelEnabled: false,
  })
    .rotateY(-Math.PI / 2)
    .translate(width / 2, 0, 0);
