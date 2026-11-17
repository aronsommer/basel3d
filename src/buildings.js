// Buildings and bridges as single objects, by number: which one is at a screen point, showing one
// in HIGHLIGHT, its triangles, and hiding it. What is done with them is up to the caller.
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
    isBridge: (number) => number >= count,
    // The triangles of the one with this number in scene coordinates, per mesh: [{ material,
    // positions }], nine numbers per triangle. None once hidden.
    triangles(number) {
      const vertex = new THREE.Vector3();
      return (meshesOf[number] ?? []).map((mesh) => {
        const { index, attributes } = mesh.geometry;
        const { position, _building } = attributes;
        const at = (i) => (index ? index.getX(i) : i);
        const positions = [];
        mesh.updateWorldMatrix(true, false);
        for (let t = 0; t < (index ?? position).count; t += 3) {
          if (_building.getX(at(t)) !== number) continue;
          for (let k = 0; k < 3; k++)
            positions.push(
              ...vertex.fromBufferAttribute(position, at(t + k)).applyMatrix4(mesh.matrixWorld),
            );
        }
        return { material: mesh.material, positions };
      });
    },
    // Hides the one with this number for good, also from at() and raycasts: its vertices collapse
    // into one point.
    hide(number) {
      for (const mesh of meshesOf[number] ?? []) {
        const { position, _building } = mesh.geometry.attributes;
        let first = -1;
        for (let i = 0; i < position.count; i++) {
          if (_building.getX(i) !== number) continue;
          if (first < 0) first = i;
          else position.setXYZ(i, position.getX(first), position.getY(first), position.getZ(first));
        }
        position.needsUpdate = true;
      }
      meshesOf[number] = [];
    },
  };
}
