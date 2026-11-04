// WebGL2 plumbing for the dot globe — the shaders, program linking, the
// rotation matrix, and the perspective projection — split out of globe.js
// so the renderer reads as one screenful of logic.
//
// Point kinds: 0 = land dot, 1 = the station on air (a little sun the
// scope locks onto), 2 = a known station's pin. Sizes and gains track
// roamdial's Points shaders; softness comes from the bloom pass.

export const VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in float aKind;
in vec3 aColor;
in float aDen;
uniform mat4 uProj;
uniform mat3 uRot;
uniform float uPixelRatio;
uniform float uTime;
uniform float uEye;
uniform float uPinScale;
uniform float uLevel;
uniform float uBass;
uniform float uFanMix;
out float vFacing;
out float vKind;
out float vPulse;
out float vDen;
out float vSeed;
out vec3 vColor;
void main() {
  vec3 rotated = uRot * aPos;
  gl_Position = uProj * vec4(rotated.xy, rotated.z - uEye, 1.0);
  vFacing = normalize(rotated).z;
  vKind = aKind;
  vColor = aColor;
  vDen = aDen;
  vPulse = 1.0;
  vSeed = fract(sin(dot(aPos.xy + aPos.z, vec2(12.9898, 78.233))) * 43758.5453);
  float depth = max(uEye - rotated.z, 0.1);
  float atten = 6.0 / depth;
  float size = 1.2 * uPixelRatio * atten;
  if (aKind > 0.5 && aKind < 1.5) {
    size = min((9.0 + uLevel * 10.0) * uPixelRatio, 46.0 * uPixelRatio) *
      (0.97 + 0.03 * sin(uTime * 2.4));
  } else if (aKind > 1.5) {
    // Sprite stays a bit larger than the core so the halo can still read.
    float zoomOut = smoothstep(3.55, 5.2, uEye);
    float pin = mix(0.95 + 1.25 * aDen, 0.7 + 0.85 * aDen, zoomOut);
    float falloff = mix(atten, atten * 0.62, zoomOut);
    size = clamp(
      pin * uPixelRatio * falloff * uPinScale * 1.08 *
        (1.0 + uLevel * 0.7),
      1.9 * uPixelRatio,
      46.0 * uPixelRatio
    );
    // Carpet pins shrink while the city fan is open so they don't compete.
    if (aKind < 2.5) size *= mix(1.0, 0.7, uFanMix);
    vPulse = 1.0;
  }
  gl_PointSize = max(size, 1.9 * uPixelRatio);
}`;

export const FRAG = `#version 300 es
precision highp float;
in float vFacing;
in float vKind;
in float vPulse;
in float vDen;
in float vSeed;
in vec3 vColor;
uniform vec3 uColor;
uniform vec3 uStationColor;
uniform float uHasStation;
uniform float uRimBoost;
uniform float uLevel;
uniform float uBass;
uniform float uTime;
uniform float uEye;
uniform float uFanMix;
out vec4 frag;
void main() {
  vec2 pc = gl_PointCoord - vec2(0.5);
  float r = length(pc);
  float dist = r * 2.0;
  float facing = smoothstep(-0.05, 0.35, vFacing);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  if (vKind > 1.5) {
    if (r > 0.5 || facing < 0.02) discard;
    float core = exp(-r * r * 42.0);
    float halo = exp(-r * r * 7.5);
    float lamp = core * 1.25 + halo * 0.38;
    float twinkle =
      0.78 +
      0.16 * sin(uTime * (0.55 + vSeed * 1.4) + vSeed * 6.28318) +
      0.08 * sin(uTime * (1.15 + vSeed * 0.7) + vSeed * 17.2);
    float gain = (0.14 + 0.58 * vDen) * facing * twinkle;
    gain *= 1.0 + min(uLevel, 1.0);
    gain *= mix(1.0, 0.78, smoothstep(3.8, 5.4, uEye));
    if (vKind < 2.5) gain *= mix(1.0, 0.12, uFanMix);
    vec3 tint = mix(vColor, vec3(1.0, 0.93, 0.78), core * 0.55);
    frag = vec4(tint * gain * lamp, 1.0);
    return;
  }
  if (vKind > 0.5) {
    if (r > 0.5 || uHasStation < 0.5 || facing < 0.02) discard;
    float core = 1.0 - smoothstep(0.0, 0.32, dist);
    float body = 1.0 - smoothstep(0.06, 0.78, dist);
    float halo = 1.0 - smoothstep(0.22, 1.0, dist);
    vec3 warm = mix(
      uStationColor,
      vec3(0.953, 0.42, 0.271),
      smoothstep(0.05, 0.8, dist)
    );
    vec3 color = mix(warm, vec3(1.0, 0.78, 0.62), core * 0.55);
    float alpha = (0.55 * core + 0.42 * body + 0.38 * halo) * facing;
    frag = vec4(color * alpha, 1.0);
    return;
  }
  float circle = 1.0 - smoothstep(0.5, 1.0, dist);
  if (circle < 0.01) discard;
  float limb = smoothstep(0.48, 0.02, vFacing);
  float land = facing * mix(1.0, 0.45, limb * (1.0 - uRimBoost));
  land *= mix(1.0, 0.48, uFanMix);
  float rim = 1.0 + uRimBoost * 1.8 * limb;
  frag = vec4(uColor * land * rim, circle * land);
}`;

export function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function link(gl, vsSource, fsSource) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return program;
}

// Yaw spins the globe around its own axis, pitch tips that axis so the
// north hemisphere faces the viewer.
export function rotation(yaw, pitch, out) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // R = Rx(pitch) * Ry(yaw), column-major.
  out[0] = cy;
  out[1] = sy * sp;
  out[2] = -sy * cp;
  out[3] = 0;
  out[4] = cp;
  out[5] = sp;
  out[6] = sy;
  out[7] = -cy * sp;
  out[8] = cy * cp;
  return out;
}

const NEAR = 0.1;
const FAR = 10;
export const FOV = (38 * Math.PI) / 180;

export function makeProjection(aspect, out) {
  const f = 1 / Math.tan(FOV / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (FAR + NEAR) / (NEAR - FAR);
  out[11] = -1;
  out[14] = (2 * FAR * NEAR) / (NEAR - FAR);
  return out;
}
