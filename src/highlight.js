import * as THREE from "three";

// The colour of what can be clicked, under the mouse.
export const HIGHLIGHT = new THREE.Color(0x00ffff);

// Makes a Lambert shader show colour (HIGHLIGHT unless given) instead of all colours (vertex and
// instance ones too), still shaded, where the vertex shader condition `when` holds; `declare`
// declares what it uses.
export function highlightShader(shader, when, declare, colour = HIGHLIGHT) {
  shader.uniforms.highlightColor = { value: colour };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${declare}\nvarying float vHighlight;`)
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvHighlight = ${when} ? 1.0 : 0.0;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 highlightColor;\nvarying float vHighlight;",
    )
    .replace(
      "#include <color_fragment>",
      "#include <color_fragment>\nif (vHighlight > 0.5) diffuseColor.rgb = highlightColor;",
    );
}
