// Facades drawn onto the walls by the shader (windows, shopfronts, balconies, ledges), in the style
// of each building (the alpha of its wall colour, tools/buildings.mjs): bits 0–2 the style, 3 shop
// windows on the ground floor, 4 balconies, 5–7 a seed. A grid of bays in metres runs along each
// wall, whole storeys fill its height (_wall: its bottom and top, its building's foot). Far away,
// where they would flicker, a wall takes their average colour.
// All colours are linear; none is black.
const SETTINGS = {
  cell: "vec2(3.1, 3.3)", // metres of a bay and a storey
  churchCell: "vec2(3.1, 4.6)",
  glass: "vec3(0.16, 0.19, 0.23)",
  frame: "vec3(0.72, 0.70, 0.64)",
  dark: "vec3(0.12, 0.125, 0.13)", // frames of modern windows, shopfronts
};

// GLSL helpers: a box's signed distance; 1 inside a distance below 0, smoothed over aa; a hash.
const HELPERS = `
varying vec3 vFacade;
varying vec3 vNearby;
varying vec3 vWall;
float facadeBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return max(d.x, d.y); }
float facadeFill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
float facadeHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;

const FACADE = `
{
  int bits = int(vColor.a * 255.0 + 0.5);
  diffuseColor.a = opacity; // the alpha held the style
  int style = bits & 7;
  float seed = float(bits >> 5) / 8.0 + 0.0625;
  // The wall's normal from the position relative to the camera: small numbers, so it does not
  // jitter from pixel to pixel, which far from the origin would shift the windows.
  vec3 n = normalize(cross(dFdx(vNearby), dFdy(vNearby)));
  float high = vWall.y - vWall.x; // the wall's height; its storeys fill it, none below 2.2 m
  if (abs(n.y) < 0.3 && high > 2.2 && vFacade.y > vWall.x) {
    vec2 along = normalize(vec2(-n.z, n.x));
    vec2 q = vec2(dot(vFacade.xz, along), vFacade.y - vWall.x);
    vec2 cs = style == 4 ? ${SETTINGS.churchCell} : ${SETTINGS.cell};
    cs.y = high / max(1.0, floor(high / cs.y + 0.5));
    vec2 id = floor(q / cs);
    vec2 p = (fract(q / cs) - 0.5) * cs; // metres from the cell's middle
    float mpp = max(fwidth(q.x), fwidth(q.y)); // metres per pixel
    float aa = mpp * 0.7;
    float far = smoothstep(0.7, 1.6, mpp); // 1: too far to resolve the windows
    float near = 1.0 - smoothstep(0.22, 0.85, mpp);
    float fine = 1.0 - smoothstep(0.04, 0.15, mpp); // thin lines fade before they would flicker
    float gf = step(id.y, 0.5) * step(vWall.x, vWall.z + 1.0); // on the ground floor
    float wid = facadeHash(vec3(id, seed * 97.0)); // per window, steady
    float h2 = fract(seed * 13.71 + 0.31), h3 = fract(seed * 29.37 + 0.17);
    vec3 wall = diffuseColor.rgb, col = wall, glassColour = ${SETTINGS.glass};
    float glass = 0.0;
    if (far < 1.0) {
    if (style == 0 || style == 5) {
      // Old town (5: the town hall): tall windows in stone surrounds, shutters, doors, shops.
      bool townHall = style == 5;
      vec2 wc = vec2(0.0, 0.10), wh = vec2(min(0.52, cs.x * 0.5 - 0.42), 0.80);
      vec3 stone = townHall ? vec3(0.62, 0.50, 0.36)
        : h2 < 0.35 ? vec3(0.42, 0.17, 0.12) : h2 < 0.78 ? vec3(0.50, 0.48, 0.44) : wall * 1.18;
      vec3 shut = h3 < 0.3 ? vec3(0.07, 0.16, 0.09) : h3 < 0.5 ? vec3(0.26, 0.05, 0.04)
        : h3 < 0.65 ? vec3(0.10, 0.16, 0.24) : h3 < 0.8 ? vec3(0.17, 0.10, 0.06) : vec3(0.28, 0.33, 0.28);
      float hasShut = townHall || fract(seed * 7.13 + 0.5) > 0.62 ? 0.0 : 1.0;
      col = mix(col, wall * 1.14, facadeFill(abs(p.y + cs.y * 0.5) - 0.07, aa) * step(0.5, h2) * (1.0 - gf) * fine);
      if (gf > 0.5 && (bits & 8) != 0) {
        float ds = facadeBox(p - vec2(0.0, -0.32), vec2(cs.x * 0.5 - 0.26, 1.12));
        glass = facadeFill(ds + 0.06, aa);
        col = mix(col, ${SETTINGS.dark}, facadeFill(ds, aa) - glass);
        vec3 signColour = h3 < 0.25 ? vec3(0.30, 0.05, 0.04) : h3 < 0.5 ? vec3(0.05, 0.12, 0.2)
          : h3 < 0.75 ? vec3(0.12) : vec3(0.42, 0.34, 0.16);
        col = mix(col, signColour, facadeFill(facadeBox(p - vec2(0.0, 1.16), vec2(cs.x * 0.5 - 0.12, 0.2)), aa));
        glassColour = vec3(0.30, 0.26, 0.20);
      } else if (gf * step(fract(wid * 3.7), 0.34) > 0.5) {
        float dd = facadeBox(p - vec2(0.0, -0.5 * cs.y + 1.12), vec2(0.56, 1.12));
        col = mix(col, stone, facadeFill(dd - 0.13, aa) - facadeFill(dd, aa));
        col = mix(col, shut * 0.8 + 0.04, facadeFill(dd, aa));
      } else {
        float d = facadeBox(p - wc, wh);
        float gm = facadeFill(d + 0.07, aa), fm = (facadeFill(d, aa) - gm) * fine;
        float sm = facadeFill(d - 0.13, aa) - facadeFill(d, aa);
        float sl = facadeFill(facadeBox(p - vec2(0.0, wc.y - wh.y - 0.11), vec2(wh.x + 0.17, 0.055)), aa) * fine;
        float shm = facadeFill(facadeBox(vec2(abs(p.x) - wh.x - 0.31, p.y - wc.y), vec2(0.26, wh.y)), aa) * hasShut;
        float mu = facadeFill(min(abs(p.x), abs(p.y - wc.y - 0.28)) - 0.028, aa) * fine;
        col = mix(col, stone, sm * (townHall ? 1.0 : step(0.2, h2)));
        col = mix(col, shut * (0.8 + 0.25 * step(0.5, fract(p.y * 8.0)) * near), shm);
        col = mix(col, stone * 1.1, sl);
        col = mix(col, ${SETTINGS.frame}, fm);
        glass = gm * (1.0 - mu * 0.85);
        col = mix(col, ${SETTINGS.frame}, gm * mu);
      }
      col *= mix(0.74, 1.0, smoothstep(0.5, 0.72, vFacade.y - vWall.z)); // plinth
    } else if (style == 1) {
      // Modern: wide windows with dark frames, a ledge per storey, some balconies and shops.
      vec2 wc = vec2(0.0, 0.06), wh = vec2(min(1.02, cs.x * 0.5 - 0.34), 0.80);
      float d = facadeBox(p - wc, wh), gm = facadeFill(d + 0.05, aa);
      col = mix(col, wall * 1.1, facadeFill(abs(p.y + cs.y * 0.5) - 0.11, aa) * fine);
      col = mix(col, ${SETTINGS.dark}, (facadeFill(d, aa) - gm) * fine);
      glass = gm * mix(1.0, smoothstep(0.02 - aa, 0.02 + aa, abs(p.x)), fine);
      if ((bits & 16) != 0 && mod(id.x + floor(h2 * 2.0), 2.0) < 0.5 && gf < 0.5) {
        float by = p.y + cs.y * 0.5;
        float rl = facadeFill(by - 1.05, aa) * facadeFill(abs(p.x) - wh.x - 0.35, aa);
        vec3 rail = mix(wall * 0.55, vec3(0.6), step(0.5, h3)) * (0.82 + 0.18 * step(0.5, fract(p.x * 6.0)) * near);
        col = mix(col, rail, rl * 0.92);
        glass *= 1.0 - rl;
      }
      if (gf > 0.5 && (bits & 8) != 0) {
        float ds = facadeBox(p - vec2(0.0, -0.2), vec2(cs.x * 0.5 - 0.12, 1.25));
        glass = facadeFill(ds + 0.05, aa);
        col = mix(wall * 0.5, ${SETTINGS.dark}, facadeFill(ds, aa) - glass);
        glassColour = vec3(0.30, 0.26, 0.20);
      }
      col *= mix(0.78, 1.0, smoothstep(0.3, 0.5, vFacade.y - vWall.z));
    } else if (style == 2) {
      // Offices: a band of glass per storey, mullions at the bays, lines between the bands.
      float gm = facadeFill(abs(p.y - 0.14) - 0.80, aa);
      float mu = facadeFill(cs.x * 0.5 - abs(p.x) - 0.045, aa) * fine;
      col = mix(wall, wall * 0.8, facadeFill(abs(abs(p.y - 0.14) - 0.95) - 0.03, aa) * fine);
      glass = gm * (1.0 - mu);
      col = mix(col, vec3(0.18, 0.19, 0.20), gm * mu);
      glassColour *= mix(vec3(1.0), wall * 1.3, 0.25);
    } else if (style == 3) {
      // Glass towers: a curtain wall of panes between mullions and floor lines.
      float mv = facadeFill(min(cs.x * 0.5 - abs(p.x), abs(p.x) + step(cs.x, 2.2) * 9.0) - 0.04, aa) * fine;
      float mh = facadeFill(cs.y * 0.5 - abs(p.y) - 0.05, aa) * fine;
      glass = 1.0 - max(mv, mh);
      col = mix(wall * 0.8, wall * 0.55, max(mv, mh));
      glassColour = mix(${SETTINGS.glass}, wall * 1.6, 0.5);
    } else if (style == 4) {
      // Churches and gates: tall pointed-arch windows in light surrounds.
      vec2 c = p - vec2(0.0, -0.05);
      float hw = min(0.5, cs.x * 0.5 - 0.7), hh = cs.y * 0.5 - 0.55, ya = hh - hw * 1.6;
      float da = max(length(c - vec2(hw, ya)), length(c - vec2(-hw, ya))) - 2.0 * hw;
      float dl = c.y < ya ? max(abs(c.x) - hw, -c.y - hh) : da;
      float gm = facadeFill(dl + 0.07, aa);
      col = mix(col, wall * 1.25, (facadeFill(dl - 0.1, aa) - facadeFill(dl, aa)) * fine);
      col = mix(col, wall * 0.5, facadeFill(dl, aa) - gm);
      glass = gm * mix(1.0, smoothstep(0.035 - aa, 0.035 + aa, abs(c.x)), fine);
      glassColour = mix(vec3(0.10, 0.12, 0.18), vec3(0.18, 0.08, 0.08), step(0.5, wid));
    } else {
      // Halls: panel joints, a ledge per storey, a few gates at street level.
      col = wall * (1.0 - 0.22 * fine * facadeFill(cs.x * 0.5 - abs(p.x) - 0.03, aa));
      col = mix(col, wall * 1.12, facadeFill(abs(p.y + cs.y * 0.5) - 0.1, aa) * fine);
      float gate = gf * step(fract(wid * 3.7), 0.22)
        * facadeFill(facadeBox(p - vec2(0.0, -cs.y * 0.5 + 1.5), vec2(min(1.4, cs.x * 0.5 - 0.3), 1.5)), aa);
      col = mix(col, wall * 0.4 * (0.8 + 0.2 * step(0.5, fract(p.y * 3.0))), gate);
    }
    col = mix(col, glassColour * (0.85 + 0.3 * wid), glass);
    }
    // Too far to resolve the windows: the facade's average.
    float share = style == 3 ? 0.75 : style == 2 ? 0.42 : style == 4 || style == 7 ? 0.0 : 0.2;
    diffuseColor.rgb = mix(col, mix(wall, ${SETTINGS.glass}, share * 0.6), far);
  }
}
`;

// Adds the facades to a Lambert shader with vertex colours (onBeforeCompile).
export function facadeShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec4 _wall;\nvarying vec3 vFacade;\nvarying vec3 vNearby;\nvarying vec3 vWall;",
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vFacade = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vNearby = vFacade - cameraPosition;
      vWall = _wall.xyz - 100.0; // the wall's bottom and top, the building's foot`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${HELPERS}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\n${FACADE}`);
}
