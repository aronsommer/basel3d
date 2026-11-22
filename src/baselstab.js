// The Baselstab, the black crozier of Basel's coat of arms, for flags, shields and the like:
// simplified from an SVG drawing of the canton's arms ("CHE Basel-Stadt COA.svg"), its curves made
// straight within 0.6 % of its height.
import * as THREE from "three";

// Its outlines as [x, y] points, its height 1: y from its foot's points (0) to the top of its hook
// (1), x from its middle, the hook curling to the left (-x) as on the arms.
export const BASELSTAB = [
  [
    [-0.189, 0.82],
    [-0.162, 0.798],
    [-0.153, 0.757],
    [-0.165, 0.717],
    [-0.192, 0.688],
    [-0.225, 0.676],
    [-0.268, 0.676],
    [-0.315, 0.69],
    [-0.347, 0.715],
    [-0.372, 0.755],
    [-0.38, 0.83],
    [-0.356, 0.906],
    [-0.32, 0.949],
    [-0.258, 0.984],
    [-0.164, 1],
    [-0.102, 0.993],
    [-0.029, 0.963],
    [0.022, 0.924],
    [0.071, 0.856],
    [0.106, 0.759],
    [0.118, 0.657],
    [-0.113, 0.657],
    [-0.105, 0.766],
    [-0.119, 0.808],
    [-0.152, 0.843],
    [-0.191, 0.855],
    [-0.239, 0.848],
    [-0.261, 0.828],
    [-0.271, 0.802],
    [-0.269, 0.777],
    [-0.255, 0.759],
    [-0.237, 0.757],
    [-0.224, 0.766],
    [-0.228, 0.784],
    [-0.248, 0.781],
    [-0.238, 0.812],
    [-0.217, 0.822],
  ], // hook
  [
    [-0.144, 0.643],
    [-0.162, 0.626],
    [-0.145, 0.609],
    [0.147, 0.609],
    [0.164, 0.626],
    [0.146, 0.643],
  ], // bands, the top one
  [
    [-0.179, 0.593],
    [-0.206, 0.573],
    [-0.204, 0.554],
    [-0.188, 0.541],
    [0.183, 0.54],
    [0.204, 0.548],
    [0.21, 0.566],
    [0.203, 0.585],
    [0.183, 0.593],
  ],
  [
    [-0.158, 0.524],
    [-0.176, 0.507],
    [-0.159, 0.49],
    [0.166, 0.49],
    [0.183, 0.507],
    [0.165, 0.524],
  ],
  [
    [-0.145, 0.475],
    [0.146, 0.475],
    [0.229, 0],
    [0.091, 0.109],
    [0, 0],
    [-0.09, 0.109],
    [-0.229, 0.001],
  ], // foot
];

// As a flat geometry high metres high, facing +z (seen from there as on the arms), standing on
// y = 0 and centred on x = 0.
export const baselstab = (high) =>
  new THREE.ShapeGeometry(
    BASELSTAB.map((points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))),
  ).scale(high, high, 1);
