// The area shared by all converters: the city of Basel in LV95 (EPSG:2056), 8 x 8 km.
import { fileURLToPath } from "node:url";

export const E_MIN = 2607000;
export const E_MAX = 2615000;
export const N_MIN = 1263400;
export const N_MAX = 1271400;
export const BBOX_WGS84 = "7.53,47.52,7.64,47.60"; // contains the area, for STAC queries
export const Y0 = 250; // metres above sea level at scene y = 0
export const CHUNK = 1000; // metres per mesh tile, so three.js can frustum-cull

// Scene axes: x = east, y = up, z = south; origin at the centre of the area.
export const toX = (e) => e - (E_MIN + E_MAX) / 2;
export const toZ = (n) => (N_MIN + N_MAX) / 2 - n;

export const DATA = fileURLToPath(new URL("../data/", import.meta.url));
export const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
