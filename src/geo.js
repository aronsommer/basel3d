// Scene units are metres: x = east, z = south, y = altitude − 250 m; origin at LV95 E 2611000 / N 1267400.
export const LV95 = [2611000, 1267400]; // E, N of the scene's origin

// WGS84 <-> scene x, z with swisstopo's approximate formulas for LV95 (about 1 m). The two are not
// each other's inverse (about 1 m apart), so fromWGS84 corrects its result twice to undo toWGS84
// (to a few cm), so a copied point comes back where it was.
export function fromWGS84(lat, lon) {
  const formula = (lat, lon) => {
    const p = (lat * 3600 - 169028.66) / 10000;
    const l = (lon * 3600 - 26782.5) / 10000;
    const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
    const n =
      1200147.07 +
      308807.95 * p +
      3745.25 * l * l +
      76.63 * p * p -
      194.56 * l * l * p +
      119.79 * p ** 3;
    return [e - LV95[0], LV95[1] - n];
  };
  const [x0, z0] = formula(lat, lon);
  let [x, z] = [x0, z0];
  for (let k = 0; k < 2; k++) {
    const [x1, z1] = formula(...toWGS84(x, z));
    [x, z] = [x + x0 - x1, z + z0 - z1];
  }
  return [x, z];
}

export function toWGS84(x, z) {
  const y = (x + LV95[0] - 2600000) / 1e6;
  const v = (LV95[1] - z - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * v + 0.1306 * y * v * v - 0.0436 * y ** 3;
  const lat =
    16.9023892 +
    3.238272 * v -
    0.270978 * y * y -
    0.002528 * v * v -
    0.0447 * y * y * v -
    0.014 * v ** 3;
  return [(lat * 100) / 36, (lon * 100) / 36];
}
