// The view east from the Santa Fe Plaza, drawn in one pass: the sky with its sun, moon and stars, the range in
// three bands of distance, and in front of it the name in plaster, standing on a parapet. The plaster is a
// height field baked on the CPU; the GPU lights all of it with the same sun or moon.

import { SANTA_FE, lightAt, moonPosition, sunPosition } from "./sky.js";
import { BANDS, VIEWPOINT, rockAt } from "./skyline.js";
import { starColor, starsAt } from "./stars.js";
import { luminance, skyPalette } from "./palette.js";

const INF = 1e20;
const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------- The plaster: the name standing on a parapet ---------- */

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
 * Bakes the plaster: R height in pixels, G ambient occlusion, B coverage. The letters stand out from the wall's
 * face; the wall stops at the parapet, whose top edge is rounded, and above it the letters stand alone.
 */
export function bakePlaster(w, h, { text, family, weight = 900, tracking = 0.04, widthShare, centreY, parapetShare }) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const setFont = (px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    if ("fontStretch" in ctx) ctx.fontStretch = "ultra-expanded";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking * px}px`;
  };
  let size = h;
  setFont(size);
  size *= (w * widthShare) / ctx.measureText(text).width;
  setFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const cap = metrics.actualBoundingBoxAscent;
  const nudge = "letterSpacing" in ctx ? (tracking * size) / 2 : 0;
  const top = h * centreY - cap / 2;
  const baseline = top + cap;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, w / 2 + nudge, baseline);
  const letters = ctx.getImageData(0, 0, w, h).data;

  // The wall: from the parapet down, its top edge laid by hand, never quite straight.
  const parapet = top + cap * parapetShare;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(-12, h + 12);
  const wobble = [];
  let state = 7919;
  for (let i = 0; i < 12; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    wobble.push(state / 4294967296 - 0.5);
  }
  // Run the edge past both sides of the canvas, so the wall has no edge there to round.
  for (let x = -8; x <= w + 8; x += 4) {
    const t = (Math.min(Math.max(x, 0), w) / w) * (wobble.length - 1);
    const i = Math.min(wobble.length - 2, Math.floor(t));
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    ctx.lineTo(x, parapet + (wobble[i] * (1 - u) + wobble[i + 1] * u) * size * 0.022);
  }
  ctx.lineTo(w + 12, h + 12);
  ctx.closePath();
  ctx.fill();
  const wall = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  const inLetters = new Float32Array(n);
  const outLetters = new Float32Array(n);
  const inWall = new Float32Array(n);
  const coverL = new Float32Array(n);
  const coverW = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = letters[i * 4 + 3] / 255;
    const b = wall[i * 4 + 3] / 255;
    coverL[i] = a;
    coverW[i] = b;
    inLetters[i] = a < 0.5 ? 0 : INF;
    outLetters[i] = a >= 0.5 ? 0 : INF;
    inWall[i] = b < 0.5 ? 0 : INF;
  }
  distanceTransform(inLetters, w, h);
  distanceTransform(outLetters, w, h);
  distanceTransform(inWall, w, h);

  const reliefHeight = size * 0.085;
  const bevel = size * 0.075;
  const lip = size * 0.05; // how far the parapet's rounded edge falls away
  const plaster = new Float32Array(n);
  const seed = 1610;
  valueNoise(w, h, Math.max(90, size * 0.5), seed, plaster, 1.6);
  valueNoise(w, h, 22, seed + 1, plaster, 0.55, 2.6);
  valueNoise(w, h, 7, seed + 2, plaster, 0.22, 1.8);
  valueNoise(w, h, 2.2, seed + 3, plaster, 0.1);

  const heights = new Float32Array(n);
  const occlusion = new Float32Array(n);
  const coverage = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = coverL[i];
    let signed = a >= 0.5 ? Math.sqrt(inLetters[i]) - 0.5 : 0.5 - Math.sqrt(outLetters[i]);
    if (a > 0 && a < 1) signed = a - 0.5;
    const inW = Math.sqrt(inWall[i]);
    // The wall's face is at 0; its top edge rounds away like plaster pulled over the coping.
    const wallHeight = coverW[i] > 0 ? -lip * (1 - Math.sin((Math.min(inW / (bevel * 1.4), 1) * Math.PI) / 2)) : -lip;
    if (signed > 0) {
      const t = Math.min(signed / bevel, 1);
      const shoulder = Math.sin((t * Math.PI) / 2);
      const crown = Math.min(signed / (bevel * 4), 1);
      heights[i] = Math.max(wallHeight, reliefHeight * (0.92 * shoulder + 0.08 * crown));
      occlusion[i] = 1 - 0.1 * (1 - shoulder);
    } else {
      heights[i] = wallHeight;
      occlusion[i] = 1 - 0.45 * Math.exp(signed / (bevel * 0.8));
    }
    coverage[i] = Math.max(a, coverW[i]);
  }
  blur(heights, w, h, Math.max(1, Math.round(size * 0.006)));
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = heights[i] + plaster[i];
    data[i * 4 + 1] = occlusion[i];
    data[i * 4 + 2] = coverage[i];
    data[i * 4 + 3] = 1;
  }
  return { data, reliefHeight: reliefHeight + 2.5, size, top, baseline, cap, parapet };
}

/* ---------- The shader ---------- */

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uRelief;
uniform sampler2D uRidge;
uniform sampler2D uStars;
uniform vec2 uSize;
uniform float uHorizon;
uniform float uScale;
uniform float uAz0;
uniform float uViewAz;
uniform float uMaxHeight;
uniform vec3 uAlbedo;
uniform vec3 uKeyENU;
uniform vec3 uKeyWall;
uniform vec3 uKeyColor;
uniform vec3 uPeakColor;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uAlpen;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyUpper;
uniform vec3 uGlowColor;
uniform vec3 uGlowShape;
uniform vec3 uShadowColor;
uniform vec2 uShadowShape;
uniform vec3 uBeltColor;
uniform vec2 uBeltShape;
uniform vec3 uSunENU;
uniform vec3 uSunDisc;
uniform float uSunVis;
uniform vec4 uMoonPos;
uniform vec2 uMoonPhase;
uniform float uStarVis;
out vec4 outColor;

const float RAD = 0.017453292519943295;
vec2 texel;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec3 enu(float azDeg, float altDeg) {
  float az = azDeg * RAD;
  float al = altDeg * RAD;
  return vec3(cos(al) * sin(az), cos(al) * cos(az), sin(al));
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 display(vec3 radiance) {
  return pow(aces(radiance * uExposure), vec3(1.0 / 2.2));
}

vec3 skyAt(vec3 d, float alt, float az) {
  float t = pow(clamp(alt / 16.0, 0.0, 1.0), 0.7);
  vec3 c = mix(uSkyHorizon, uSkyUpper, t);
  // Twilight glows in a band along the horizon under the sun; by day the glare gathers round the sun itself.
  float g = acos(clamp(dot(d, uSunENU), -1.0, 1.0)) / RAD;
  float sunAz = atan(uSunENU.x, uSunENU.y) / RAD;
  float sunAlt = asin(clamp(uSunENU.z, -1.0, 1.0)) / RAD;
  float da = abs(mod(az - sunAz + 180.0, 360.0) - 180.0);
  float band = exp(-pow(da / uGlowShape.y, 2.0)) * exp(-max(alt - max(sunAlt, 0.0), 0.0) / uGlowShape.z);
  float glare = exp(-g / (uGlowShape.y * 0.35));
  float glow = uGlowShape.x * mix(band, glare, smoothstep(4.0, 15.0, sunAlt));
  c = mix(c, uGlowColor, clamp(glow, 0.0, 1.0));
  vec2 anti = -uSunENU.xy;
  float len = length(anti);
  if (len > 1e-4) {
    float cosA = dot(normalize(d.xy), anti / len);
    float side = exp(-pow(acos(clamp(cosA, -1.0, 1.0)) / RAD / 78.0, 2.0));
    float top = uShadowShape.y;
    float shade = (1.0 - smoothstep(top - 0.8, top + 0.8, alt)) * side * uShadowShape.x;
    c = mix(c, uShadowColor, shade);
    float y = (alt - top - uBeltShape.y) / uBeltShape.y;
    float belt = exp(-y * y) * side * uBeltShape.x * smoothstep(top - 0.4, top + 1.2, alt);
    c = mix(c, uBeltColor, clamp(belt, 0.0, 1.0));
  }
  return c;
}

vec3 toViewer() { return -vec3(sin(uViewAz * RAD), cos(uViewAz * RAD), 0.0); }
vec3 screenRight() { return vec3(cos(uViewAz * RAD), -sin(uViewAz * RAD), 0.0); }

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amp *= 0.5;
  }
  return sum;
}

// A slope's normal: its mean faces the viewer and tilts up; the relief of ridges and gullies, from the gradient
// of a noise height field in (azimuth, altitude), turns it left, right, up and down.
vec3 terrainNormal(vec2 q, float strength, out float height) {
  float e = 0.12;
  height = fbm(q);
  float hx = fbm(q + vec2(e, 0.0)) - height;
  float hy = fbm(q + vec2(0.0, e)) - height;
  vec3 r = screenRight();
  vec3 base = normalize(toViewer() * 0.62 + vec3(0.0, 0.0, 0.78));
  vec3 up = normalize(cross(base, r));
  return normalize(base - (r * hx + up * hy) * (strength / e));
}

uniform float uNight;
uniform sampler2D uLandA;
uniform sampler2D uLandB;
uniform float uLandMix;
uniform float uLandOn;
uniform vec4 uLandFrame; // azimuth at the left edge, degrees across, altitude at the top edge, degrees down

// Light on a slope: the key light where it reaches, the sky's light everywhere, then the air between.
vec3 lightSlope(vec3 albedo, vec3 n, float lit, vec3 light, vec3 haze, float hazeAmount) {
  float direct = max(dot(n, uKeyENU), 0.0);
  vec3 radiance = albedo * (light * direct * lit + uAmbient * (0.5 + 0.5 * n.z));
  float strength = clamp(dot(light, vec3(0.2126, 0.7152, 0.0722)) * direct * lit, 0.0, 1.0);
  return mix(display(radiance), haze, hazeAmount * (1.0 - 0.45 * strength));
}

// The high range: conifer forest, bare rock on the summits that clear the treeline, ridges and drainages.
vec3 rangeColor(float alt, float top, float rockiness, float az, vec3 haze) {
  float hf = clamp(alt / max(top, 0.3), 0.0, 1.0);
  float h;
  vec3 n = terrainNormal(vec2(az, alt * 1.15) / 0.55, 0.32, h);
  float rock = rockiness * smoothstep(0.78, 0.9, hf + 0.25 * (h - 0.5));
  float patchy = fbm(vec2(az, alt) / 0.18);
  vec3 forest = mix(vec3(0.05, 0.064, 0.052), vec3(0.085, 0.088, 0.07), patchy);
  vec3 albedo = mix(forest, vec3(0.2, 0.185, 0.165), rock);
  float lit = smoothstep(uAlpen - 0.035, uAlpen + 0.035, hf + 0.05 * (h - 0.5));
  // Haze thins where the light is strong: a sunlit range stands out, a shaded one sinks into the sky.
  return lightSlope(albedo, n, lit, uPeakColor, haze, 0.4);
}

// Pinon and juniper: dark, rounded, uneven crowns, scattered thick or thin over pale ground. Returns the cover
// and the crown's normal on screen (x right, y up, z toward the viewer), so each tree has a lit and a shaded side.
vec4 trees(vec2 q, float density, float radius, float aa) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec4 best = vec4(0.0, 0.0, 0.0, 1.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      float k = hash12(c);
      if (k > density) continue;
      vec2 o = vec2(hash12(c + 17.1), hash12(c + 31.7)) * 0.8 + 0.1;
      float r = radius * (0.55 + 0.9 * hash12(c + 5.3) * hash12(c + 2.9));
      vec2 rel = (f - vec2(float(x), float(y)) - o) * vec2(1.0, 1.2);
      float lobes = 1.0 + 0.16 * sin(atan(rel.y, rel.x) * 3.0 + k * 40.0);
      float d = length(rel) * lobes;
      float cover = smoothstep(r + aa, r - aa, d);
      if (cover > best.x) {
        vec2 s = rel / max(r, 1e-3);
        best = vec4(cover, s, sqrt(max(1.0 - dot(s, s), 0.05)));
      }
    }
  }
  return best;
}

vec3 slopeColor(float alt, float top, float az, vec3 haze, float cell, float scale, float hazeAmount, float shadowLine, vec3 light) {
  float h;
  vec3 n = terrainNormal(vec2(az, alt * 1.2) / scale, 0.42, h);
  float clumps = fbm(vec2(az, alt) / (cell * 6.0));
  float density = mix(0.2, 0.92, smoothstep(0.28, 0.72, clumps));
  float aa = (1.0 / uScale) / cell;
  vec4 tree = trees(vec2(az, alt) / cell, density, 0.34, max(aa, 0.1));
  vec3 crown = normalize(screenRight() * tree.y + vec3(0.0, 0.0, 1.0) * tree.z + toViewer() * tree.w);
  n = normalize(mix(n, crown, tree.x * 0.85));
  vec3 ground = mix(vec3(0.11, 0.095, 0.078), vec3(0.15, 0.13, 0.102), fbm(vec2(az, alt) / (cell * 2.0)));
  vec3 albedo = mix(ground, vec3(0.04, 0.05, 0.036), tree.x * 0.88);
  float hf = clamp(alt / max(top, 0.3), 0.0, 1.0);
  float lit = smoothstep(shadowLine - 0.22, shadowLine + 0.22, hf + 0.2 * (h - 0.5));
  vec3 c = lightSlope(albedo, n, lit, light, haze, hazeAmount);
  // After dark, the lights of houses in the hills.
  if (uNight > 0.0) {
    vec2 q = vec2(az, alt) / (cell * 4.0);
    vec2 i = floor(q);
    float k = hash12(i + 91.7);
    if (k < 0.045 * (1.0 - hf)) {
      vec2 o = vec2(hash12(i + 3.1), hash12(i + 8.9)) * 0.8 + 0.1;
      float d = length((fract(q) - o) * cell * 4.0 * uScale);
      float glow = exp(-d * d / 1.2) + 0.25 * exp(-d / 3.0);
      c += vec3(1.0, 0.72, 0.42) * glow * uNight * (0.5 + 0.5 * hash12(i + 1.3));
    }
  }
  return c;
}

float heightAt(vec2 p) { return texture(uRelief, p * texel).r; }

float shadowAt(vec2 p, float h0) {
  float run = length(uKeyWall.xy);
  if (run < 1e-4 || uKeyWall.z <= 0.0) return 1.0;
  vec2 dir = uKeyWall.xy / run;
  // A light grazing the wall would lay shadows right across it; keep them to the length a camera would frame.
  float rise = max(uKeyWall.z, 0.22) / run;
  float lit = 1.0;
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

vec3 plasterColor(vec2 p, vec3 rel) {
  float h0 = rel.r;
  float hl = heightAt(p - vec2(1.0, 0.0));
  float hr = heightAt(p + vec2(1.0, 0.0));
  float hu = heightAt(p - vec2(0.0, 1.0));
  float hd = heightAt(p + vec2(0.0, 1.0));
  vec3 n = normalize(vec3((hl - hr) * 0.5, (hu - hd) * 0.5, 1.0));
  float direct = max(dot(n, uKeyWall), 0.0);
  float shadow = direct > 0.0 ? shadowAt(p, h0) : 0.0;
  // A wall takes the light of the half of the sky in front of it, more where its surface turns up, and light
  // thrown back up from the sunlit ground in front of it, more where it turns down.
  float sky = (0.8 - 0.3 * n.y) * rel.g;
  float bounce = 0.16 * max(uKeyENU.z, 0.0) * (0.6 + 0.4 * n.y) * rel.g;
  vec3 radiance = uAlbedo * (uKeyColor * (direct * shadow + bounce) + uAmbient * sky);
  return display(radiance);
}

void main() {
  texel = 1.0 / uSize;
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  float px = 1.0 / uScale;
  float alt = (uHorizon - p.y) * px;
  float az = uAz0 + p.x * px;
  vec3 d = enu(az, alt);
  vec3 col = skyAt(d, alt, az);

  col += texture(uStars, p * texel).rgb * uStarVis;

  float g = acos(clamp(dot(d, uSunENU), -1.0, 1.0)) / RAD;
  float disc = smoothstep(0.267 + 0.7 * px, 0.267 - 0.7 * px, g) * uSunVis;
  float halo = (exp(-g / 0.7) * 0.6 + exp(-g / 3.0) * 0.2) * uSunVis;
  col = mix(col, uSunDisc, disc);
  col += uSunDisc * halo * (1.0 - disc);

  if (uMoonPos.w > 0.0) {
    float rm = 0.259;
    float dAz = mod(az - uMoonPos.x + 180.0, 360.0) - 180.0;
    vec2 q = vec2(dAz * cos(uMoonPos.y * RAD), alt - uMoonPos.y) / rm;
    float rr = length(q);
    if (rr < 14.0) {
      vec2 limb = vec2(sin(uMoonPos.z), cos(uMoonPos.z));
      vec2 u = vec2(dot(q, limb), dot(q, vec2(-limb.y, limb.x)));
      float edge = 0.9 * px / rm;
      float inside = smoothstep(1.0 + edge, 1.0 - edge, rr);
      float term = (1.0 - 2.0 * uMoonPhase.x) * sqrt(max(1.0 - u.y * u.y, 0.0));
      float lit = smoothstep(term - 0.07, term + 0.07, u.x);
      vec3 face = mix(col + vec3(0.012, 0.014, 0.02), vec3(0.94, 0.93, 0.88), lit * uMoonPhase.y);
      col = mix(col, face, inside * uMoonPos.w);
      col += vec3(0.7, 0.76, 0.88) * exp(-max(rr - 1.0, 0.0) * 0.7) * 0.07 * uMoonPhase.x * uMoonPhase.y * uMoonPos.w * (1.0 - inside);
    }
  }

  vec4 ridge = texture(uRidge, vec2((floor(p.x) + 0.5) * texel.x, 0.5));
  vec3 haze = skyAt(enu(az, 0.4), 0.4, az);
  float c1 = smoothstep(ridge.x + 0.5 * px, ridge.x - 0.5 * px, alt);
  if (c1 > 0.0) {
    // The drawn land, and over it, once they have arrived, the photographs of the moment.
    vec3 land = rangeColor(alt, ridge.x, ridge.w, az, haze);
    float c2 = smoothstep(ridge.y + 0.5 * px, ridge.y - 0.5 * px, alt);
    if (c2 > 0.0) land = mix(land, slopeColor(alt, ridge.y, az, haze, 0.1, 0.45, 0.26, uAlpen * 1.7, uPeakColor), c2);
    float c3 = smoothstep(ridge.z + 0.5 * px, ridge.z - 0.5 * px, alt);
    if (c3 > 0.0) land = mix(land, slopeColor(alt, ridge.z, az, haze, 0.26, 0.8, 0.1, uAlpen * 2.6, uKeyColor), c3);
    if (uLandOn > 0.0) {
      // Sample from just under the skyline, so the photograph's own sky never shows along the ridge.
      float sampleAlt = min(alt, ridge.x - 1.5 * px);
      vec2 uv = vec2((az - uLandFrame.x) / uLandFrame.y, (uLandFrame.z - sampleAlt) / uLandFrame.w);
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        vec3 photo = mix(texture(uLandA, uv).rgb, texture(uLandB, uv).rgb, uLandMix);
        land = mix(land, photo, uLandOn);
      }
    }
    col = mix(col, land, c1);
  }

  vec4 rel = texture(uRelief, p * texel);
  if (rel.b > 0.002) col = mix(col, plasterColor(p, rel.rgb), clamp(rel.b, 0.0, 1.0));

  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(col + dither / 255.0, 1.0);
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

/* ---------- The light, the camera and what the sky holds at an instant ---------- */

/** The camera for a hero of this size: which way it looks, how wide, and where the horizon falls. */
export function frameFor(cssWidth) {
  const narrow = cssWidth < 640;
  return narrow
    ? { viewAz: 52, fov: 20, widthShare: 0.86, centreY: 0.45, parapetShare: 0.85, topAltitude: 1.0 }
    : { viewAz: 60, fov: 36, widthShare: 0.74, centreY: 0.575, parapetShare: 0.88, topAltitude: 1.3 };
}

// The Jemez Mountains stand about a degree above the western horizon; the sun leaves the city behind them.
const WEST_RIDGE = 0.9;
// The high peaks stand 1,700 m above the city and see the sun about 1.3 degrees longer.
const PEAK_DIP = 1.3;

const SUN = [[0, [1.0, 0.46, 0.24]], [3, [1.0, 0.6, 0.36]], [10, [1.0, 0.8, 0.6]], [25, [1.0, 0.93, 0.84]], [45, [1.0, 0.97, 0.92]]];
function sunlight(elevation) {
  let c = SUN[SUN.length - 1][1];
  if (elevation <= SUN[0][0]) c = SUN[0][1];
  else {
    for (let i = 1; i < SUN.length; i++) {
      if (elevation <= SUN[i][0]) {
        const [x0, c0] = SUN[i - 1];
        const [x1, c1] = SUN[i];
        const t = smoothstep(0, 1, (elevation - x0) / (x1 - x0));
        c = c0.map((v, k) => v + (c1[k] - v) * t);
        break;
      }
    }
  }
  return c;
}

const toENU = ({ azimuth, elevation }) => [
  Math.cos(elevation * RAD) * Math.sin(azimuth * RAD),
  Math.cos(elevation * RAD) * Math.cos(azimuth * RAD),
  Math.sin(elevation * RAD),
];

/** Everything the shader needs at an instant, plus what the page needs to choose its text colours. */
export function lightingAt(date, frame) {
  const light = lightAt(date);
  const { sun, moon } = light;
  const palette = skyPalette(sun.elevation);
  const sunENU = toENU(sun);
  const moonENU = toENU(moon);

  // Is the sun, or else the moon, the light? The site's model decides; the ridges decide whether it reaches.
  const keyIsSun = light.key === "sun";
  const key = keyIsSun ? sun : moon;
  const keyENU = toENU({ azimuth: key.azimuth, elevation: Math.max(key.elevation, 0.5) });
  const facingWest = Math.cos((key.azimuth - 260) * RAD) > 0;
  const reaches = keyIsSun ? smoothstep(WEST_RIDGE - 0.6, WEST_RIDGE + 0.9, sun.elevation) : 1;
  const local = facingWest ? reaches : 1;
  const keyColor = light.color.map((v) => v * local);
  const peakSun = sun.elevation + PEAK_DIP;
  const afterglow = keyIsSun && facingWest ? smoothstep(3.5, 1.0, sun.elevation) : 0;
  const peakColor = keyIsSun
    ? sunlight(peakSun)
      .map((v, i) => v * [1, 0.66, 0.92][i] ** afterglow)
      .map((v) => v * smoothstep(-1.2, 2.2, peakSun) * 1.05 * (1 + 2.2 * afterglow))
    : light.color;
  // The shadow line on the far range: 0 when the foot is lit, 1 when the summits are in shade.
  const alpen = keyIsSun && facingWest ? clamp((1.8 - sun.elevation) / 3.3, 0, 1.05) : keyIsSun ? 0 : 0;

  // The wall faces the viewer: x to the right, y down the screen, z out of the wall.
  const view = frame.viewAz * RAD;
  const right = [Math.cos(view), -Math.sin(view), 0];
  const out = [-Math.sin(view), -Math.cos(view), 0];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const keyWall = [dot(keyENU, right), -keyENU[2], dot(keyENU, out)];

  // The moon's bright limb faces the sun.
  const dAz = (sun.azimuth - moon.azimuth) * RAD;
  const limb = Math.atan2(
    Math.sin(dAz) * Math.cos(sun.elevation * RAD),
    Math.cos(moon.elevation * RAD) * Math.sin(sun.elevation * RAD) - Math.sin(moon.elevation * RAD) * Math.cos(sun.elevation * RAD) * Math.cos(dAz),
  );
  const moonVisible = smoothstep(-0.6, 0.4, moon.elevation);
  const moonBright = 0.42 + 0.58 * smoothstep(2, -6, sun.elevation);

  // Moonlight and the city's glow hide the faint stars.
  const moonGlare = moonVisible * moon.illumination;
  const starLimit = 5.2 - 2.4 * moonGlare;

  return {
    light, palette, sunENU, moonENU, keyENU, keyWall, keyColor, peakColor, alpen,
    sunVisible: smoothstep(-1.0, -0.2, sun.elevation),
    moon: [moon.azimuth, moon.elevation, limb, moonVisible],
    moonPhase: [moon.illumination, moonBright],
    starLimit,
  };
}

/** Display luminance of the wall's flat face and of the sky where the navigation sits, for the text colours. */
export function surfaceLuminance(lit, frame) {
  const aces = (x) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1);
  const albedo = [0.8, 0.79, 0.76];
  const direct = Math.max(lit.keyWall[2], 0);
  const bounce = 0.16 * Math.max(lit.keyENU[2], 0) * 0.6;
  const wall = albedo.map((a, i) => Math.pow(aces(a * (lit.keyColor[i] * (direct + bounce) + lit.light.ambient[i] * 0.8) * lit.light.exposure), 1 / 2.2));
  const { palette } = lit;
  const sky = palette.upper.map((u, i) => palette.horizon[i] * 0.45 + u * 0.55);
  return { wall: luminance(wall), sky: luminance(sky) };
}

/* ---------- The renderer ---------- */

export function createScene(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: true });
  if (!gl) return null;
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.error(error);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const makeTexture = (unit, filter) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };
  const reliefTexture = makeTexture(0, gl.LINEAR);
  const ridgeTexture = makeTexture(1, gl.NEAREST);
  const starTexture = makeTexture(2, gl.NEAREST);
  const landTextures = [makeTexture(3, gl.LINEAR), makeTexture(4, gl.LINEAR)];
  const landLoaded = [null, null];
  // A pixel each, so the samplers are complete before any photograph has arrived.
  landTextures.forEach((texture, slot) => {
    gl.activeTexture(gl.TEXTURE3 + slot);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  });
  const names = [
    "uRelief", "uRidge", "uStars", "uSize", "uHorizon", "uScale", "uAz0", "uViewAz", "uMaxHeight", "uAlbedo",
    "uKeyENU", "uKeyWall", "uKeyColor", "uPeakColor", "uAmbient", "uExposure", "uAlpen", "uSkyHorizon", "uSkyUpper",
    "uGlowColor", "uGlowShape", "uShadowColor", "uShadowShape", "uBeltColor", "uBeltShape", "uSunENU", "uSunDisc",
    "uSunVis", "uMoonPos", "uMoonPhase", "uStarVis", "uNight", "uLandA", "uLandB", "uLandMix", "uLandOn", "uLandFrame",
  ];
  const u = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(u.uRelief, 0);
  gl.uniform1i(u.uRidge, 1);
  gl.uniform1i(u.uStars, 2);
  gl.uniform1i(u.uLandA, 3);
  gl.uniform1i(u.uLandB, 4);
  gl.uniform1f(u.uLandOn, 0);
  gl.uniform3f(u.uAlbedo, 0.8, 0.79, 0.76);

  let landUsable = true;
  /** Puts a photograph in a texture slot; false if the browser will not let it be read (a cross-origin image). */
  function uploadLand(slot, image) {
    if (landLoaded[slot] === image) return true;
    try {
      gl.activeTexture(gl.TEXTURE3 + slot);
      gl.bindTexture(gl.TEXTURE_2D, landTextures[slot]);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      landLoaded[slot] = image;
      return true;
    } catch (error) {
      console.warn("the photographs of the land cannot be used here; showing the drawn land", error);
      landUsable = false;
      return false;
    }
  }

  const stars = document.createElement("canvas");
  const starCtx = stars.getContext("2d");
  let geometry = null;
  let sprite = null;

  function makeSprite(radius) {
    const size = Math.ceil(radius * 6) | 1;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.75)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  return {
    /** Lays out the camera and bakes the plaster for the canvas's current size. */
    bake(options) {
      const { width, height } = canvas;
      // A plate is the view alone, sky and land with no wall: the reference an image model repaints from.
      const plaster = options.plate
        ? { data: new Float32Array(width * height * 4), reliefHeight: 1, top: 0, baseline: 0, cap: 0, parapet: 0, size: 1 }
        : bakePlaster(width, height, options);
      const scale = width / options.fov; // canvas pixels per degree
      const horizon = options.plate ? options.topAltitude * scale : plaster.top + options.topAltitude * scale;
      const az0 = options.viewAz - options.fov / 2;
      geometry = { width, height, scale, horizon, az0, viewAz: options.viewAz, plaster, pixelRatio: options.pixelRatio || 1, plate: Boolean(options.plate) };

      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, reliefTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, plaster.data);

      const ridge = new Float32Array(width * 4);
      for (let x = 0; x < width; x++) {
        const az = az0 + (x + 0.5) / scale;
        ridge[x * 4] = BANDS.crest(az);
        ridge[x * 4 + 1] = BANDS.foothills(az);
        ridge[x * 4 + 2] = BANDS.near(az);
        ridge[x * 4 + 3] = rockAt(az);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ridgeTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, ridge);

      stars.width = width;
      stars.height = height;
      sprite = makeSprite(1.15 * geometry.pixelRatio);

      gl.uniform2f(u.uSize, width, height);
      gl.uniform1f(u.uHorizon, horizon);
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uAz0, az0);
      gl.uniform1f(u.uViewAz, options.viewAz);
      gl.uniform1f(u.uMaxHeight, plaster.reliefHeight);
      return geometry;
    },

    /**
     * Draws the scene at an instant; returns what it lit, for the page. `clear`: canvas-pixel boxes kept free of
     * stars. `land`: `{ a, b, t, on, frame }`, the two photographs of the moment (images, or null while loading),
     * the blend between them, how far the photographs have faded in, and the window they cover.
     */
    draw(date, clear = [], land = null) {
      if (!geometry) return null;
      const lit = lightingAt(date, { viewAz: geometry.viewAz });
      const { palette } = lit;

      const photos = land && landUsable && land.a && land.b && land.on > 0 && uploadLand(0, land.a) && (land.b === land.a || uploadLand(1, land.b));
      if (photos) {
        gl.uniform1f(u.uLandMix, land.b === land.a ? 0 : land.t);
        gl.uniform1f(u.uLandOn, land.on);
        const f = land.frame;
        gl.uniform4f(u.uLandFrame, f.azFrom, f.azTo - f.azFrom, f.altTop, f.altTop - f.altBottom);
      } else {
        gl.uniform1f(u.uLandOn, 0);
      }

      // Stars: the real ones, where they stand now.
      starCtx.clearRect(0, 0, stars.width, stars.height);
      if (palette.stars > 0.01) {
        starCtx.globalCompositeOperation = "lighter";
        const { scale, horizon, az0, width } = geometry;
        for (const star of starsAt(date, VIEWPOINT, 0)) {
          let dAz = star.azimuth - az0;
          dAz = ((dAz % 360) + 360) % 360;
          const x = dAz * scale;
          if (x < -8 || x > width + 8) continue;
          const y = horizon - star.altitude * scale;
          if (y < -8) continue;
          if (clear.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) continue;
          const over = lit.starLimit - star.mag;
          if (over < 0) continue;
          const flux = Math.min(1, Math.pow(10, -0.4 * (star.mag - 0.5)));
          const alpha = Math.min(1, flux * 1.5 + 0.08) * smoothstep(0, 0.8, over);
          const [r, g, b] = starColor(star.bv);
          starCtx.globalAlpha = alpha;
          const s = sprite.width * (0.75 + 0.6 * Math.min(1, flux * 2));
          starCtx.filter = "none";
          starCtx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
          if (flux > 0.3) {
            // Bright stars carry a little colour.
            starCtx.globalAlpha = 0.35 * alpha;
            starCtx.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
            starCtx.beginPath();
            starCtx.arc(x, y, s * 0.18, 0, Math.PI * 2);
            starCtx.fill();
          }
        }
        starCtx.globalAlpha = 1;
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, starTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stars);

      gl.uniform3f(u.uKeyENU, ...lit.keyENU);
      const kw = lit.keyWall;
      const kl = Math.hypot(...kw) || 1;
      gl.uniform3f(u.uKeyWall, kw[0] / kl, kw[1] / kl, kw[2] / kl);
      gl.uniform3f(u.uKeyColor, ...lit.keyColor);
      gl.uniform3f(u.uPeakColor, ...lit.peakColor);
      gl.uniform3f(u.uAmbient, ...lit.light.ambient);
      gl.uniform1f(u.uExposure, lit.light.exposure);
      gl.uniform1f(u.uAlpen, lit.alpen);
      gl.uniform3f(u.uSkyHorizon, ...palette.horizon);
      gl.uniform3f(u.uSkyUpper, ...palette.upper);
      gl.uniform3f(u.uGlowColor, ...palette.glow);
      gl.uniform3f(u.uGlowShape, ...palette.glowShape);
      gl.uniform3f(u.uShadowColor, ...palette.shadow);
      gl.uniform2f(u.uShadowShape, ...palette.shadowShape);
      gl.uniform3f(u.uBeltColor, ...palette.belt);
      gl.uniform2f(u.uBeltShape, ...palette.beltShape);
      gl.uniform3f(u.uSunENU, ...lit.sunENU);
      gl.uniform3f(u.uSunDisc, ...palette.disc);
      gl.uniform1f(u.uSunVis, geometry.plate ? 0 : lit.sunVisible);
      gl.uniform4f(u.uMoonPos, lit.moon[0], lit.moon[1], lit.moon[2], geometry.plate ? 0 : lit.moon[3]);
      gl.uniform2f(u.uMoonPhase, ...lit.moonPhase);
      gl.uniform1f(u.uStarVis, geometry.plate ? 0 : palette.stars);
      gl.uniform1f(u.uNight, smoothstep(-1.5, -7, lit.light.sun.elevation));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return lit;
    },

    geometry: () => geometry,
  };
}

export { SANTA_FE, moonPosition, sunPosition };
