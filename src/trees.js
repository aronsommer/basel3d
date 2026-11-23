import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Trees as instanced low-poly models (1 unit tall) with varied size and colour, one mesh per
// terrain chunk so they are frustum-culled. Near the camera a chunk gets a trunk and an
// icosahedron crown, further away only an octahedron crown, far away a three-sided cone and
// fewer of them.
// The single trees (positions: east, south) and those on the photo's crowns (canopy: east, south,
// height in dm; tools/trees.mjs, map.mjs), positions in 1/8 m (TREE_GRID in tools/area.mjs) from
// the area's north-west corner; each a little different in size, shape and green.
export function createTrees(positions, canopy, terrainInfo, heightAt) {
  const colored = (geometry, color) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute("uv");
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.04, 0.06, 0.5, 5, 1, true);
  trunk.translate(0, 0.25, 0);
  const CROWN = 0.33; // radius of a crown 1 unit wide
  const crown = new THREE.IcosahedronGeometry(CROWN);
  crown.translate(0, 0.67, 0);
  const simpleCrown = new THREE.OctahedronGeometry(CROWN);
  simpleCrown.translate(0, 0.67, 0);
  const near = mergeGeometries([colored(trunk, 0x6b5a45), colored(crown, 0x5d7f3e)]);
  const middle = colored(simpleCrown, 0x5d7f3e);
  const cone = new THREE.ConeGeometry(CROWN, 0.66, 3, 1, true); // 3 triangles
  cone.translate(0, 0.67, 0);
  const far = colored(cone, 0x5d7f3e);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // Per tree x, z and height in m (0: chosen below); tree indices per chunk.
  const { x0, z0, chunk } = terrainInfo;
  const single = positions.length / 2;
  const trees = new Float32Array(single * 3 + canopy.length);
  for (let i = 0; i < single; i++)
    trees.set([x0 + positions[2 * i] / 8, z0 + positions[2 * i + 1] / 8], 3 * i);
  for (let i = 0; i < canopy.length; i += 3)
    trees.set([x0 + canopy[i] / 8, z0 + canopy[i + 1] / 8, canopy[i + 2] / 10], single * 3 + i);
  const chunks = new Map();
  for (let i = 0; i < trees.length / 3; i++) {
    const ix = Math.floor((trees[3 * i] - x0) / chunk);
    const iz = Math.floor((trees[3 * i + 1] - z0) / chunk);
    const key = `${ix}_${iz}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(i);
  }
  // A tree: where it stands, its height and width (metres) and random(k), all stable per tree.
  const treeAt = (i) => {
    const [x, z] = [trees[3 * i], trees[3 * i + 1]];
    const random = (k) => (Math.abs(Math.sin(x * 12.9898 + z * 78.233 + k * 3.7)) * 43758.5453) % 1;
    const height = trees[3 * i + 2] || 8 + random(0) * 10;
    return { x, z, random, height, width: height * (0.8 + 0.45 * random(1)) };
  };
  // Whether no tree's crown reaches within r metres of x, z.
  const clear = (x, z, r) => {
    const keys = new Set();
    for (const dx of [-r, r])
      for (const dz of [-r, r])
        keys.add(`${Math.floor((x + dx - x0) / chunk)}_${Math.floor((z + dz - z0) / chunk)}`);
    return [...keys].every((key) =>
      (chunks.get(key) ?? []).every((i) => {
        const tree = treeAt(i);
        return Math.hypot(tree.x - x, tree.z - z) >= r + CROWN * tree.width;
      }),
    );
  };

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const meshes = [...chunks.values()].map((indices) => {
    // In random order, so drawing only the first ones (updateTrees) thins them out evenly.
    for (let k = indices.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [indices[k], indices[j]] = [indices[j], indices[k]];
    }
    // Bounds are computed once, from the larger near model.
    const mesh = new THREE.InstancedMesh(near, material, indices.length);
    indices.forEach((i, n) => {
      // Stable per tree: brightness, hue (yellow to blue green), width against height.
      const { x, z, random, height, width } = treeAt(i);
      const hue = random(2) * 2 - 1;
      const light = 0.75 + random(0) * 0.25;
      rotation.setFromAxisAngle(up, random(0) * 2 * Math.PI);
      matrix.compose(position.set(x, heightAt(x, z), z), rotation, scale.set(width, height, width));
      mesh.setMatrixAt(n, matrix);
      mesh.setColorAt(n, tint.setRGB(light * (1 + 0.14 * hue), light, light * (1 - 0.22 * hue)));
    });
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  });
  return { meshes, near, middle, far, clear };
}
