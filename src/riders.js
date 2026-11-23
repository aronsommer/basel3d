import * as THREE from "three";
import { HIGHLIGHT } from "./highlight.js";

// Riding along on single objects (ships, planes, the helicopter, the sea monster, the UFO, the
// police cars, the motorcycles), each { object, materials, eye, ahead } (points in the object's own frame): the
// camera at eye, looking at ahead with the horizon level; under the mouse the materials show
// HIGHLIGHT.
export function riders(list) {
  const colors = list.map(({ materials }) => materials.map((m) => m.color.clone()));
  const ahead = new THREE.Vector3();
  let highlighted = -1;
  return {
    objects: list.map(({ object }) => object),
    vehicleOf: (hit) => list.findIndex(({ object }) => object.getObjectById(hit.object.id)),
    cab: (v, view) => {
      const { object } = list[v];
      object.updateWorldMatrix(true, false);
      view.position.fromArray(list[v].eye).applyMatrix4(object.matrixWorld);
      view.lookAt(ahead.fromArray(list[v].ahead).applyMatrix4(object.matrixWorld));
    },
    highlight: (v) => {
      if (v === highlighted) return;
      for (const i of [highlighted, v])
        list[i]?.materials.forEach((m, k) => {
          m.color.copy(i === v ? HIGHLIGHT : colors[i][k]);
          m.vertexColors = i !== v; // all have vertex colours
          m.needsUpdate = true;
        });
      highlighted = v;
    },
  };
}
