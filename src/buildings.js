// Buildings and bridges as single objects, by number: which one is at a screen point, and showing
// one in HIGHLIGHT. What is done with them is up to the caller.
import * as THREE from "three";
import { highlightShader } from "./highlight.js";

// buildings, bridges: the loaded models, with Lambert materials; hiders: models that hide them
// (the terrain).
export function createBuildings(buildings, bridges, hiders, renderer, camera) {
  // Each vertex has its building's or bridge's number (_building, tools/buildings.mjs and
  // bridges.mjs); the bridges' are moved after the buildings', so each number is one of them.
  let count = 0;
  buildings.traverse((o) => {
    if (!o.isMesh) return;
    const number = o.geometry.attributes._building;
    for (let i = 0; i < number.count; i++) count = Math.max(count, number.getX(i) + 1);
  });
  bridges.traverse((o) => {
    if (!o.isMesh) return;
    const number = o.geometry.attributes._building;
    for (let i = 0; i < number.count; i++) number.setX(i, number.getX(i) + count);
  });

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
  };
}
