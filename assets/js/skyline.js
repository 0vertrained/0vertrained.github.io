// The skyline east of the Santa Fe Plaza: for each azimuth, how high the land stands, in degrees above the
// horizon, as traced from USGS elevation data (skyline-data.js), in three bands of distance.

import { SKYLINE, SUMMIT_TABLE } from "./skyline-data.js";

/** The Plaza, seen from a rooftop. */
export const VIEWPOINT = { lat: SKYLINE.viewpoint.lat, lon: SKYLINE.viewpoint.lon, elevation: SKYLINE.viewpoint.eye };

function unpack(base64) {
  const bytes = typeof atob === "function" ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : Buffer.from(base64, "base64");
  const words = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const out = new Float32Array(words.length);
  for (let i = 0; i < words.length; i++) out[i] = words[i] / 5000 - 2;
  return out;
}

function profile(samples) {
  const last = samples.length - 1;
  return (az) => {
    const t = (az - SKYLINE.azFrom) / SKYLINE.azStep;
    if (t <= 0) return samples[0];
    if (t >= last) return samples[last];
    const i = Math.floor(t);
    const f = t - i;
    return samples[i] * (1 - f) + samples[i + 1] * f;
  };
}

/** Heights of the three bands at an azimuth: the far crest, the foothills within 9 km, the hills within 3 km. */
export const BANDS = {
  crest: profile(unpack(SKYLINE.crest)),
  foothills: profile(unpack(SKYLINE.hills)),
  near: profile(unpack(SKYLINE.near)),
};

/** Summits that stand on the skyline, with their bearing and height as seen from the Plaza. */
export const SUMMITS = SUMMIT_TABLE.filter((s) => s.altitude > BANDS.crest(s.azimuth) - 0.15);

/** How much bare rock shows above the trees at an azimuth: the summits that clear the treeline, about 3,550 m. */
export function rockAt(az) {
  let rock = 0;
  for (const s of SUMMITS) {
    if (s.elevation < 3600) continue;
    const d = Math.abs(az - s.azimuth) / 2.5;
    rock = Math.max(rock, Math.min(1, (s.elevation - 3550) / 250) * (1 - Math.min(1, d)) ** 0.7);
  }
  return rock;
}

/** Heights of the three bands at an azimuth. */
export function skylineAt(az) {
  return { crest: BANDS.crest(az), foothills: BANDS.foothills(az), near: BANDS.near(az) };
}
