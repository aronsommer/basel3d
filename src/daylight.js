// Day or night, switched (set) and eased over FADE seconds: the sun's light (none at night) and the sky
// light, the sky's and water's colours. The night is a mild dusk, blue, with stars, lit
// windows and lamps; by day all is as it was before there were nights.
import * as THREE from "three";

const FADE = 1.5; // seconds
// 0 by day, 1 at night: lit windows (src/facade.js), the sky's stars (src/sky.js), lamps.
export const night = { value: 0 };
// How bright what no light shines on is (the rails, the clouds), 1 by day.
export const daylight = { value: 1 };

// Day and night: the light's colour, strength and direction (towards it); the sky light's colours
// from above and below and its strength; the sky's colours at the horizon and
// overhead; daylight. The day's are those of old.
const DAY = {
  light: [0xffdfb4, 2.7, [-1, 1, 1]],
  sky: [0xe2eaf2, 0xbaa88c, 2],
  heaven: [0xbcdcf2, 0x4296e1],
  daylight: 1,
};
const NIGHT = {
  light: [0xb4c2ff, 0, [0.6, 1, -0.4]], // none: lit alike from every side
  sky: [0x8492bc, 0x5a5870, 2],
  heaven: [0x4a5a8c, 0x16244e],
  daylight: 0.6,
};

// sun, hemisphere: the lights; sky: its mesh (src/sky.js); water: the terrain's
// water colours (its uniforms waterDark and waterLight); dim: unlit materials with a colour,
// darkened with daylight; on: night from the start. { set(on): to night or day, update(dt) }.
export function createDaylight({ sun, hemisphere, sky, water, dim = [], on = false }) {
  const dimmed = [water.waterDark.value, water.waterLight.value, ...dim.map((m) => m.color)].map(
    (colour) => [colour, colour.clone()],
  );
  const [a, b] = [new THREE.Color(), new THREE.Color()];
  const [dayWay, nightWay] = [DAY, NIGHT].map(({ light }) => new THREE.Vector3(...light[2]));
  const mix = (day, dark, out) => out.copy(a.set(day)).lerp(b.set(dark), night.value);
  const number = (day, dark) => day + (dark - day) * night.value;
  let target = (night.value = on ? 1 : 0);
  function apply() {
    mix(DAY.light[0], NIGHT.light[0], sun.color);
    sun.intensity = number(DAY.light[1], NIGHT.light[1]);
    sun.position.copy(dayWay).lerp(nightWay, night.value).normalize();
    mix(DAY.sky[0], NIGHT.sky[0], hemisphere.color);
    mix(DAY.sky[1], NIGHT.sky[1], hemisphere.groundColor);
    hemisphere.intensity = number(DAY.sky[2], NIGHT.sky[2]);
    const { uniforms } = sky.material;
    mix(DAY.heaven[0], NIGHT.heaven[0], uniforms.horizon.value);
    mix(DAY.heaven[1], NIGHT.heaven[1], uniforms.zenith.value);
    uniforms.sun.value.copy(sun.position);
    daylight.value = number(DAY.daylight, NIGHT.daylight);
    for (const [colour, day] of dimmed) colour.copy(day).multiplyScalar(daylight.value);
  }
  apply();
  return {
    set(on) {
      target = on ? 1 : 0;
    },
    update(dt) {
      if (night.value === target) return;
      night.value += THREE.MathUtils.clamp(target - night.value, -dt / FADE, dt / FADE);
      apply();
    },
  };
}
