// The name as a plaster relief, seen from above and lit by a single directional light plus the sky.
// The relief is a height field baked on the CPU (a distance transform of the letters, rounded at the
// shoulders, with trowelled plaster on top); the GPU lights it and traces each pixel's shadow across it.

import { ALBEDO } from "./sky.js";

const INF = 1e20;

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared Euclidean distance from every cell to the nearest cell that is 0 (Felzenszwalb and Huttenlocher). */
function distanceTransform(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[row + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[row + x] = d[x];
  }
}

/** Box blur in place, horizontally then vertically, `passes` times (a cheap stand-in for a Gaussian). */
function blur(values, w, h, radius, passes = 2) {
  const line = new Float32Array(Math.max(w, h));
  const span = radius * 2 + 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += values[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        line[x] = sum / span;
        sum += values[row + Math.min(w - 1, x + radius + 1)] - values[row + Math.max(0, x - radius)];
      }
      values.set(line.subarray(0, w), row);
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += values[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        line[y] = sum / span;
        sum += values[Math.min(h - 1, y + radius + 1) * w + x] - values[Math.max(0, y - radius) * w + x];
      }
      for (let y = 0; y < h; y++) values[y * w + x] = line[y];
    }
  }
}

/** Smooth value noise on a lattice of the given cell size, sampled bilinearly with a smoothstep. */
function valueNoise(w, h, cell, seed, out, amplitude, stretchX = 1) {
  const gw = Math.ceil(w / (cell * stretchX)) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const lattice = new Float32Array(gw * gh);
  let state = seed >>> 0;
  for (let i = 0; i < lattice.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    lattice[i] = state / 4294967296 - 0.5;
  }
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const iy = gy | 0;
    let ty = gy - iy;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const gx = x / (cell * stretchX);
      const ix = gx | 0;
      let tx = gx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const a = lattice[iy * gw + ix];
      const b = lattice[iy * gw + ix + 1];
      const c = lattice[(iy + 1) * gw + ix];
      const d = lattice[(iy + 1) * gw + ix + 1];
      out[y * w + x] += amplitude * (a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty);
    }
  }
}

/**
 * Bakes the relief: R holds the height in pixels, G the ambient occlusion at the letters' feet.
 * `text` is drawn centred, as large as fits, in the font the page has already loaded.
 */
export function bakeRelief(w, h, { text, family, weight = 900, tracking = 0.04, widthShare = 0.82, heightShare = 0.42, centreY = 0.44 }) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const setFont = (px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    if ("fontStretch" in ctx) ctx.fontStretch = "ultra-expanded";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking * px}px`;
  };
  let size = Math.min((h * heightShare) / 0.72, w);
  setFont(size);
  const measured = ctx.measureText(text).width;
  if (measured > w * widthShare) size *= (w * widthShare) / measured;
  setFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const capHeight = metrics.actualBoundingBoxAscent;
  // letterSpacing adds space after the last letter too; shift by half of it to centre the ink.
  const nudge = "letterSpacing" in ctx ? (tracking * size) / 2 : 0;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, w / 2 + nudge, h * centreY + capHeight / 2);
  const alpha = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  const inside = new Float32Array(n);
  const outside = new Float32Array(n);
  const coverage = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = alpha[i * 4 + 3] / 255;
    coverage[i] = a;
    inside[i] = a < 0.5 ? 0 : INF;
    outside[i] = a >= 0.5 ? 0 : INF;
  }
  distanceTransform(inside, w, h);
  distanceTransform(outside, w, h);

  const reliefHeight = size * 0.085;
  const bevel = size * 0.075;
  const plaster = new Float32Array(n);
  const seed = 1610; // fixed, so the plaster is the same on every visit
  valueNoise(w, h, Math.max(90, size * 0.5), seed, plaster, 1.6);
  valueNoise(w, h, 22, seed + 1, plaster, 0.55, 2.6);
  valueNoise(w, h, 7, seed + 2, plaster, 0.22, 1.8);
  valueNoise(w, h, 2.2, seed + 3, plaster, 0.1);

  const heights = new Float32Array(n);
  const occlusion = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = coverage[i];
    let signed = a >= 0.5 ? Math.sqrt(inside[i]) - 0.5 : 0.5 - Math.sqrt(outside[i]);
    if (a > 0 && a < 1) signed = a - 0.5;
    if (signed > 0) {
      // A rounded shoulder, like plaster pulled over an edge, rising to a slight crown.
      const t = Math.min(signed / bevel, 1);
      const shoulder = Math.sin((t * Math.PI) / 2);
      const crown = Math.min(signed / (bevel * 4), 1);
      heights[i] = reliefHeight * (0.92 * shoulder + 0.08 * crown);
      occlusion[i] = 1 - 0.1 * (1 - shoulder);
    } else {
      occlusion[i] = 1 - 0.45 * Math.exp(signed / (bevel * 0.8));
    }
  }
  blur(heights, w, h, Math.max(1, Math.round(size * 0.006)));
  const data = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    data[i * 2] = heights[i] + plaster[i];
    data[i * 2 + 1] = occlusion[i];
  }
  return { data, reliefHeight: reliefHeight + 2.5, size };
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uRelief;
uniform vec2 uSize;
uniform float uMaxHeight;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uAlbedo;
uniform float uExposure;
out vec4 outColor;

vec2 texel;
float heightAt(vec2 p) { return texture(uRelief, p * texel).r; }

float shadowAt(vec2 p, float h0) {
  float run = length(uLightDir.xy);
  if (run < 1e-4) return 1.0;
  vec2 dir = uLightDir.xy / run;
  float rise = uLightDir.z / run;
  float lit = 1.0;
  // Start each pixel's march a random fraction of a step in, so the steps blur into grain, not bands.
  float t = 1.0 + fract(sin(dot(p, vec2(41.31, 289.17))) * 15731.743);
  for (int i = 0; i < 128; i++) {
    vec2 q = p + dir * t;
    if (q.x < 0.0 || q.y < 0.0 || q.x > uSize.x || q.y > uSize.y) break;
    float ray = h0 + 0.35 + t * rise;
    if (ray > uMaxHeight) break;
    float gap = ray - heightAt(q);
    lit = min(lit, gap / (0.9 + t * 0.03));
    if (lit < 0.0) return 0.0;
    t += max(1.0, t * 0.042);
  }
  return clamp(lit, 0.0, 1.0);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  texel = 1.0 / uSize;
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 sample0 = texture(uRelief, p * texel).rg;
  float h0 = sample0.r;
  float hl = heightAt(p - vec2(1.0, 0.0));
  float hr = heightAt(p + vec2(1.0, 0.0));
  float hu = heightAt(p - vec2(0.0, 1.0));
  float hd = heightAt(p + vec2(0.0, 1.0));
  vec3 n = normalize(vec3((hl - hr) * 0.5, (hu - hd) * 0.5, 1.0));
  // Open ground reads as lit at any height of the sun, as a photograph exposed for the scene would show it;
  // slopes turned toward the light brighten and slopes turned away fall into their own shade.
  float facing = clamp(1.0 + 1.6 * (dot(n, uLightDir) - uLightDir.z), 0.0, 2.4);
  float shadow = facing > 0.0 ? shadowAt(p, h0) : 0.0;
  float sky = (0.55 + 0.45 * n.z) * sample0.g;
  vec3 radiance = uAlbedo * (uLightColor * facing * shadow + uAmbient * sky);
  vec2 centred = gl_FragCoord.xy / uSize - 0.5;
  radiance *= 1.0 - 0.22 * smoothstep(0.35, 0.95, length(centred * vec2(1.0, 1.25)));
  vec3 colour = pow(aces(radiance * uExposure), vec3(1.0 / 2.2));
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(colour + dither / 255.0, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "shader did not compile");
  }
  return shader;
}

/** Creates the renderer, or returns null where WebGL 2 is unavailable. */
export function createRelief(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch {
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const at = (name) => gl.getUniformLocation(program, name);
  const u = {
    size: at("uSize"), maxHeight: at("uMaxHeight"), lightDir: at("uLightDir"), lightColor: at("uLightColor"),
    ambient: at("uAmbient"), albedo: at("uAlbedo"), relief: at("uRelief"), exposure: at("uExposure"),
  };
  gl.uniform1i(u.relief, 0);
  gl.uniform3f(u.albedo, ...ALBEDO);
  let ready = false;

  return {
    /** Re-bakes the relief for the canvas's current pixel size. */
    bake(options) {
      const { width, height } = canvas;
      const relief = bakeRelief(width, height, options);
      gl.viewport(0, 0, width, height);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, width, height, 0, gl.RG, gl.FLOAT, relief.data);
      gl.uniform2f(u.size, width, height);
      gl.uniform1f(u.maxHeight, relief.reliefHeight);
      ready = true;
      return relief;
    },
    /** Draws the relief under `light` (direction x east, y south, z up; linear colours). */
    draw(light) {
      if (!ready) return;
      const [x, y, z] = light.direction;
      const length = Math.hypot(x, y, z);
      gl.uniform3f(u.lightDir, x / length, y / length, z / length);
      gl.uniform3f(u.lightColor, ...light.color);
      gl.uniform3f(u.ambient, ...light.ambient);
      gl.uniform1f(u.exposure, light.exposure);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    lost: () => gl.isContextLost(),
  };
}
