// The Novartis Pavillon's media facade (iart, 2022): a ring of diamond-shaped, semi-transparent
// solar modules on a grid of tubes, an LED in each, over the upper floor, the outer roof slope and
// the flat top, above a glazed ground floor. Here it plays light shows one after another, all around the ring.
// Found by its place, so it needs nothing in basel.glb. All colours are linear.
const SETTINGS = {
  centre: "vec2(-148.9, -1595.8)", // scene x, z of the ring's middle (LV95 E 2610851 / N 1268996)
  radius: "24.0", // metres from the middle that belong to it; no other building within 30 m
  rim: "15.0", // metres from the middle where the outer roof slope meets the flat top
  groundFloor: "6.5", // scene y of the glazed ground floor's top
  top: "21.0", // scene y above which its flat roof is the ring's top
  columns: "180.0", // diamonds around the ring; even, so they close up
  row: "0.74", // metres between rows of diamonds
  show: "10.0", // seconds per show
};

export const pavilionTime = { value: 0 }; // seconds

const HELPERS = `
uniform float pavilionTime;
varying vec3 vPavilion;
float pavilionHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 pavilionRainbow(float t) {
  vec3 c = 0.5 + 0.5 * cos(6.2832 * (t + vec3(0.0, 0.33, 0.67)));
  return c * c;
}
// The LED colour of show s at angle a (radians), h metres up the facade, in column c, at
// time t. Periodic in a, so seamless around the ring.
vec3 pavilionShow(int s, float a, float h, float c, float t) {
  if (s == 0) {
    // Plasma: colour waves drifting around and up.
    float f = sin(3.0 * a + t * 0.9) + sin(h * 0.5 - t * 1.4) + sin(5.0 * a - h * 0.35 + t * 0.6)
      + sin(2.0 * a + h * 0.25 - t * 0.8);
    return pavilionRainbow(f * 0.18 + t * 0.06) * 1.2;
  }
  if (s == 1) {
    // Rainbow spirals turning around the ring.
    float f = sin(6.0 * a + h * 0.8 - t * 3.0);
    return pavilionRainbow(a / 6.2832 * 3.0 + h * 0.03 - t * 0.15) * smoothstep(0.1, 0.8, f) * 1.4;
  }
  if (s == 2) {
    // Heartbeat: red pulses rising, throbbing.
    float ring = smoothstep(0.7, 1.0, fract(h * 0.1 - t * 1.2));
    float beat = pow(1.0 - fract(t * 1.2), 3.0);
    return mix(vec3(0.5, 0.0, 0.05), vec3(1.0, 0.35, 0.55), ring) * (0.2 + 0.8 * ring)
      * (0.4 + 0.6 * beat) * 1.4;
  }
  // Rain: lights falling down each column with cyan trails, white sparkles.
  float speed = 4.0 + 6.0 * pavilionHash(vec2(c, 1.0));
  float d = mod(h - 22.0 + mod(t * speed + 30.0 * pavilionHash(vec2(c, 2.0)), 22.0), 22.0);
  float spark = step(0.995, pavilionHash(vec2(c, floor(h / ${SETTINGS.row}) + floor(t * 12.0))));
  return mix(vec3(0.0, 0.6, 1.0), vec3(1.0), step(d, 0.8)) * exp(-d * 0.25) * 1.3 + spark;
}
`;

// After the normal. Uses vHighlight (src/highlight.js), which the building materials have.
const PAVILION = `
{
  vec2 off = vPavilion.xz - ${SETTINGS.centre};
  float r = length(off);
  if (r < ${SETTINGS.radius} && vHighlight < 0.5) {
    vec3 n = inverseTransformDirection(normal, viewMatrix);
    float mpp = length(fwidth(vPavilion)); // metres per pixel
    float aa = mpp * 0.7;
    float a = atan(off.y, off.x);
    // Facing outwards (the flat normal faces the camera, so a seen face's outer side) or the top.
    bool outwards = dot(n.xz, off) > 0.3 * r;
    bool top = abs(n.y) > 0.9 && vPavilion.y > ${SETTINGS.top};
    if (vPavilion.y > ${SETTINGS.groundFloor} && (outwards || top)) {
      // Metres up the facade from the ground floor, then inwards across the top.
      float s = vPavilion.y - ${SETTINGS.groundFloor} + max(0.0, ${SETTINGS.rim} - r);
      // A grid turned by 45° makes the diamonds; g in columns and rows, p within a diamond.
      vec2 g = vec2((a / 6.2832 + 0.5) * ${SETTINGS.columns}, s / ${SETTINGS.row});
      vec2 cell = floor(vec2(g.x + g.y, g.x - g.y)) + 0.5;
      vec2 p = vec2(g.x + g.y, g.x - g.y) - cell;
      // Each diamond in its LED's colour; too small to see, the colours run smoothly instead.
      vec2 at = mpp > ${SETTINGS.row} * 0.6 ? g : vec2(cell.x + cell.y, cell.x - cell.y) * 0.5;
      float t = pavilionTime, k = fract(t / ${SETTINGS.show}), i = floor(t / ${SETTINGS.show});
      float la = (at.x / ${SETTINGS.columns} - 0.5) * 6.2832, h = at.y * ${SETTINGS.row};
      float c = mod(floor(at.x), ${SETTINGS.columns});
      vec3 led = mix(pavilionShow(int(mod(i, 4.0)), la, h, c, t),
        pavilionShow(int(mod(i + 1.0, 4.0)), la, h, c, t), smoothstep(0.92, 1.0, k));
      led += exp(-k * ${SETTINGS.show} * 5.0) * 0.8; // a white flash as each show begins
      // unit: metres per unit of p, a diamond's side; tubes 6 cm thick along its edges.
      float unit = ${SETTINGS.row} * 0.71, detail = 1.0 - smoothstep(0.1, 0.35, mpp);
      float tube = 1.0 - smoothstep(0.03 - aa, 0.03 + aa, (0.5 - max(abs(p.x), abs(p.y))) * unit);
      float glow = 0.3 + 1.2 * exp(-length(p) * unit * 9.0); // the LED, its light through the module
      diffuseColor.rgb = mix(vec3(0.06, 0.07, 0.09), vec3(0.45, 0.46, 0.48), tube * detail);
      totalEmissiveRadiance += led * mix(0.5, glow, detail) * (1.0 - tube * detail) * 2.0;
    } else if (abs(n.y) < 0.3) {
      // Glass between mullions every 1.6 m.
      float m = 0.8 - abs(fract(a * r / 1.6) - 0.5) * 1.6;
      float mullion = (1.0 - smoothstep(0.04 - aa, 0.04 + aa, m)) * (1.0 - smoothstep(0.04, 0.15, mpp));
      diffuseColor.rgb = mix(vec3(0.10, 0.13, 0.17), vec3(0.18, 0.19, 0.20), mullion);
    }
  }
}
`;

// Adds the media facade to a Lambert shader (onBeforeCompile).
export function pavilionShader(shader) {
  shader.uniforms.pavilionTime = pavilionTime;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vPavilion;")
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPavilion = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${HELPERS}`)
    .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${PAVILION}`);
}
