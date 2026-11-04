// Lightweight UnrealBloom-style pass for the globe. RoamDial uses
// Three.js EffectComposer: UnrealBloomPass(0.45, 0.55, 0.2) plus a
// grain/vignette shader. We keep the widget free of Three.js and
// recreate that look with three fullscreen passes on WebGL2 FBOs.

import { link } from "./globe-gl.js";

const EXTRACT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform float uThreshold;
in vec2 vUv;
out vec4 frag;
void main() {
  vec4 s = texture(uScene, vUv);
  float lum = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
  float knee = 0.5 * uThreshold;
  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee + 1e-4);
  float contrib = max(lum - uThreshold, soft);
  contrib /= max(lum, 1e-4);
  frag = vec4(s.rgb * contrib, s.a * contrib);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUv;
out vec4 frag;
void main() {
  vec2 texel = uDir;
  vec4 c = texture(uTex, vUv) * 0.227027;
  c += texture(uTex, vUv + texel * 1.384615) * 0.316216;
  c += texture(uTex, vUv - texel * 1.384615) * 0.316216;
  c += texture(uTex, vUv + texel * 3.230769) * 0.070270;
  c += texture(uTex, vUv - texel * 3.230769) * 0.070270;
  frag = c;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uStrength;
uniform float uTime;
uniform vec2 uRes;
in vec2 vUv;
out vec4 frag;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec4 scene = texture(uScene, vUv);
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 c = scene.rgb + bloom * uStrength;
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  c *= 1.0 - smoothstep(0.2, 0.85, r2) * 0.55;
  float g = hash(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  c *= 1.0 + g * 0.14;
  frag = vec4(c, scene.a);
}`;

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

function makeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  const ok =
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (!ok) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return null;
  }
  return { fbo, tex, w, h };
}

function dropTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.tex);
}

/// Returns a bloom compositor, or null when shaders/FBOs cannot be built.
export function createBloom(gl) {
  const extract = link(gl, QUAD_VERT, EXTRACT);
  const blur = link(gl, QUAD_VERT, BLUR);
  const composite = link(gl, QUAD_VERT, COMPOSITE);
  if (!extract || !blur || !composite) return null;

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uExtractScene = gl.getUniformLocation(extract, "uScene");
  const uExtractTh = gl.getUniformLocation(extract, "uThreshold");
  const uBlurTex = gl.getUniformLocation(blur, "uTex");
  const uBlurDir = gl.getUniformLocation(blur, "uDir");
  const uCompScene = gl.getUniformLocation(composite, "uScene");
  const uCompBloom = gl.getUniformLocation(composite, "uBloom");
  const uCompStr = gl.getUniformLocation(composite, "uStrength");
  const uCompTime = gl.getUniformLocation(composite, "uTime");
  const uCompRes = gl.getUniformLocation(composite, "uRes");

  let scene = null;
  let bright = null;
  let ping = null;
  let width = 0;
  let height = 0;

  function resize(w, h) {
    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    if (scene && scene.w === w && scene.h === h) return true;
    dropTarget(gl, scene);
    dropTarget(gl, bright);
    dropTarget(gl, ping);
    scene = makeTarget(gl, w, h);
    bright = makeTarget(gl, bw, bh);
    ping = makeTarget(gl, bw, bh);
    width = w;
    height = h;
    return Boolean(scene && bright && ping);
  }

  function drawQuad(program) {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  return {
    resize,
    begin() {
      if (!scene) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, scene.w, scene.h);
      return true;
    },
    /// Blur the bright pass and composite onto the default framebuffer.
    composite(time) {
      if (!scene || !bright || !ping) return;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bright.fbo);
      gl.viewport(0, 0, bright.w, bright.h);
      gl.useProgram(extract);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(uExtractScene, 0);
      gl.uniform1f(uExtractTh, 0.2);
      drawQuad(extract);

      // Two separable blur iterations at half-res (~UnrealBloom radius 0.55).
      for (let i = 0; i < 2; i += 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
        gl.useProgram(blur);
        gl.bindTexture(gl.TEXTURE_2D, bright.tex);
        gl.uniform1i(uBlurTex, 0);
        gl.uniform2f(uBlurDir, 1 / bright.w, 0);
        drawQuad(blur);

        gl.bindFramebuffer(gl.FRAMEBUFFER, bright.fbo);
        gl.bindTexture(gl.TEXTURE_2D, ping.tex);
        gl.uniform2f(uBlurDir, 0, 1 / bright.h);
        drawQuad(blur);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(composite);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(uCompScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bright.tex);
      gl.uniform1i(uCompBloom, 1);
      gl.uniform1f(uCompStr, 0.45);
      gl.uniform1f(uCompTime, time);
      gl.uniform2f(uCompRes, width, height);
      drawQuad(composite);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    destroy() {
      dropTarget(gl, scene);
      dropTarget(gl, bright);
      dropTarget(gl, ping);
      gl.deleteProgram(extract);
      gl.deleteProgram(blur);
      gl.deleteProgram(composite);
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
    },
  };
}
