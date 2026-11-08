// The sky's colours by the sun's height, as seen looking east from Santa Fe. Values are display colours (sRGB),
// blended in OKLab so a transition never passes through grey. The shader adds what depends on direction:
// the glow round the sun, and opposite it the earth's shadow with the pink band above it (the Belt of Venus).

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToOklab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRGB([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(toSRGB(clamp(c, 0, 1)), 0, 1));
}

/** A ramp of [elevation, hex] stops, read at elevation x and returned as display RGB. */
function ramp(stops) {
  const lab = stops.map(([x, hex]) => [x, hexToOklab(hex)]);
  return (x) => {
    if (x <= lab[0][0]) return oklabToRGB(lab[0][1]);
    for (let i = 1; i < lab.length; i++) {
      if (x <= lab[i][0]) {
        const [x0, c0] = lab[i - 1];
        const [x1, c1] = lab[i];
        const t = smoothstep(0, 1, (x - x0) / (x1 - x0));
        return oklabToRGB(c0.map((v, k) => v + (c1[k] - v) * t));
      }
    }
    return oklabToRGB(lab[lab.length - 1][1]);
  };
}

function numbers(stops) {
  return (x) => {
    if (x <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const [x0, v0] = stops[i - 1];
        const [x1, v1] = stops[i];
        return v0 + (v1 - v0) * smoothstep(0, 1, (x - x0) / (x1 - x0));
      }
    }
    return stops[stops.length - 1][1];
  };
}

// The sky low over the range, and higher up: night, twilight, a high-desert blue.
const HORIZON = ramp([
  [-18, "#18213d"], [-12, "#1d2745"], [-8, "#28335c"], [-5, "#46507c"], [-2.5, "#6a7099"], [-0.5, "#9294b2"],
  [1.5, "#aeaebc"], [4, "#c3c2c6"], [9, "#c7d0db"], [20, "#c1d5e8"], [45, "#b9d2ea"],
]);
const UPPER = ramp([
  [-18, "#060a19"], [-12, "#0a1230"], [-8, "#142150"], [-5, "#233873"], [-2.5, "#3a5492"], [-0.5, "#5574aa"],
  [1.5, "#6d8dbd"], [4, "#7a9acb"], [9, "#6f9ad0"], [20, "#5b8fcf"], [45, "#4b84ca"],
]);
// Round the sun: the dawn and dusk glow low in the sky, and the pale glare of day.
const GLOW = ramp([
  [-18, "#141b36"], [-12, "#33305a"], [-8, "#6e4a6c"], [-5, "#c96a52"], [-2.5, "#f39552"], [-0.5, "#ffb868"],
  [1.5, "#ffd18a"], [5, "#ffe6b8"], [12, "#fff3dc"], [30, "#f5f7f5"],
]);
const GLOW_STRENGTH = numbers([[-18, 0], [-13, 0.22], [-8, 0.55], [-4, 0.88], [-1, 1.0], [2, 0.95], [6, 0.7], [15, 0.45], [40, 0.3]]);
const GLOW_WIDTH = numbers([[-14, 55], [-6, 50], [-1, 40], [4, 26], [15, 18], [40, 12]]);
const GLOW_HEIGHT = numbers([[-14, 8], [-6, 12], [-1, 10], [3, 6], [8, 7], [15, 16], [40, 28]]);
// Opposite the sun after sunset: the earth's shadow, a blue-grey band, rising under a pink one.
const SHADOW = ramp([[-8, "#29335a"], [-4, "#3c4670"], [-1.5, "#56608a"], [1, "#6c7699"]]);
const SHADOW_STRENGTH = numbers([[-9, 0], [-6.5, 0.45], [-4, 0.8], [-1, 0.85], [0.5, 0.45], [2, 0]]);
const BELT = ramp([[-6, "#8d6f96"], [-3, "#c98ea6"], [-1, "#e5a3a8"], [1.5, "#e9b7a6"], [4, "#e6c7b4"]]);
const BELT_STRENGTH = numbers([[-7, 0], [-4.5, 0.32], [-2, 0.66], [0, 0.62], [2, 0.36], [6, 0.12], [10, 0]]);
// The sun's disc: deep orange at the horizon, white high up.
const DISC = ramp([[-1, "#ff6a2a"], [0.5, "#ff8f45"], [3, "#ffb46b"], [8, "#ffe0aa"], [20, "#fff6e6"]]);

/** Everything about the sky that depends only on the sun's height. */
export function skyPalette(sunElevation) {
  const h = sunElevation;
  return {
    horizon: HORIZON(h),
    upper: UPPER(h),
    glow: GLOW(h),
    glowShape: [GLOW_STRENGTH(h), GLOW_WIDTH(h), GLOW_HEIGHT(h)],
    shadow: SHADOW(h),
    // The shadow's edge stands about as far above the horizon as the sun is below it.
    shadowShape: [SHADOW_STRENGTH(h), clamp(-h * 1.05 + 0.35, 0, 9)],
    belt: BELT(h),
    beltShape: [BELT_STRENGTH(h), clamp(4.5 - h * 0.4, 3.5, 7)],
    disc: DISC(h),
    // Stars come out between civil and astronomical twilight.
    stars: smoothstep(-5, -14, h),
  };
}

/** Relative luminance of a display colour, for choosing text over it. */
export function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
