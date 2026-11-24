import * as THREE from "three";
import { daylight, night } from "./daylight.js";

const ZENITH = 0x4296e1; // a softer take on the Rhine's light blue (waterLight in src/main.js)

// The sky: from horizon up to ZENITH, by day with a glow round the sun (a unit vector towards it)
// and slowly drifting fair-weather clouds, as bright as the day (src/daylight.js), at night with
// stars; below the horizon mirrored, so the world floats in it. A triangle over the whole screen at the
// far end of the view, drawn after all that is opaque, so only where sky is seen.
export function createSky(horizon, sun) {
  const time = { value: 0 };
  const sky = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    ),
    new THREE.ShaderMaterial({
      uniforms: {
        horizon: { value: new THREE.Color(horizon) },
        zenith: { value: new THREE.Color(ZENITH) },
        sun: { value: sun },
        time,
        night,
        daylight,
      },
      vertexShader: /* glsl */ `
        varying vec3 direction;
        void main() {
          vec4 view = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
          direction = view.xyz / view.w * mat3(viewMatrix); // to world space
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 horizon, zenith, sun;
        uniform float time, night, daylight;
        varying vec3 direction;
        float hash(vec2 p) {
          vec3 q = fract(p.xyx * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f *= f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
        }
        void main() {
          vec3 d = normalize(direction);
          bool below = d.y < 0.0; // beyond the world's edge
          float s = below ? 0.0 : max(dot(d, sun), 0.0); // the sun's glow only above the horizon
          d.y = abs(d.y); // below it the sky mirrored, its stars and clouds shifted, so others
          vec2 shift = below ? vec2(37.0, 91.0) : vec2(0.0);
          vec3 c = mix(horizon, zenith, 1.0 - exp(-d.y * 10.0));
          c += vec3(1.0, 0.78, 0.5) * (pow(s, 8.0) * 0.18 + pow(s, 400.0) * 0.8) * smoothstep(0.0, 0.1, d.y)
            * smoothstep(-0.1, 0.05, sun.y) * (1.0 - night);
          c += step(0.9975, hash(floor(d.xz / (d.y + 0.25) * 180.0) + shift)) * night * smoothstep(0.0, 0.08, d.y);
          vec2 p = d.xz / (d.y + 0.1) * 2.5 + time * vec2(0.012, 0.007) + shift;
          float n = 0.5 * noise(p) + 0.25 * noise(p * 2.03) + 0.125 * noise(p * 4.01) + 0.0625 * noise(p * 8.05);
          float cover = smoothstep(0.52, 0.72, n) * smoothstep(0.0, 0.08, d.y) * (1.0 - night); // none at night
          c = mix(c, mix(vec3(0.86, 0.9, 0.95), vec3(1.0), smoothstep(0.52, 0.85, n)) * daylight, cover * 0.9);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = 1e9; // after all else that is opaque
  sky.onBeforeRender = () => (time.value = performance.now() / 1000);
  return sky;
}
