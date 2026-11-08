// Where the catalogue's stars stand over Santa Fe at an instant: precessed from J2000 to the date, turned to
// azimuth and altitude with the sidereal time, raised by refraction and dimmed by the air near the horizon.

import { STARS } from "./stars-data.js";

const RAD = Math.PI / 180;
const ARCSEC = RAD / 3600;
const mod = (x, m) => ((x % m) + m) % m;

function refraction(altitude) {
  if (altitude < -1) return 0;
  // Saemundsson's formula, in degrees, for an apparent altitude from a true one.
  return 1.02 / Math.tan((altitude + 10.3 / (altitude + 5.11)) * RAD) / 60;
}

/** Each star above `minAltitude`: azimuth and altitude in degrees, apparent magnitude after extinction, B-V. */
export function starsAt(date, { lat, lon }, minAltitude = -1) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  // IAU 1976 precession angles.
  const zeta = (2306.2181 * T + 0.30188 * T * T) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T) * ARCSEC;
  const gmst = mod(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T, 360);
  const lst = (gmst + lon) * RAD;
  const sinLat = Math.sin(lat * RAD);
  const cosLat = Math.cos(lat * RAD);
  const out = [];
  for (let i = 0; i < STARS.length; i += 4) {
    const ra0 = STARS[i] * RAD;
    const dec0 = STARS[i + 1] * RAD;
    const A = Math.cos(dec0) * Math.sin(ra0 + zeta);
    const B = Math.cos(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) - Math.sin(theta) * Math.sin(dec0);
    const C = Math.sin(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) + Math.cos(theta) * Math.sin(dec0);
    const ra = Math.atan2(A, B) + z;
    const dec = Math.asin(C);
    const H = lst - ra;
    const sinAlt = sinLat * Math.sin(dec) + cosLat * Math.cos(dec) * Math.cos(H);
    const altitude = Math.asin(sinAlt) / RAD;
    if (altitude < minAltitude) continue;
    const azimuth = mod(Math.atan2(-Math.sin(H) * Math.cos(dec), cosLat * Math.sin(dec) - sinLat * Math.cos(dec) * Math.cos(H)) / RAD, 360);
    const apparent = altitude + refraction(altitude);
    // Extinction: about 0.2 magnitudes per airmass on a dry night at 7,000 feet.
    const airmass = 1 / (Math.sin(Math.max(apparent, 0.5) * RAD) + 0.025 * Math.exp(-11 * Math.sin(Math.max(apparent, 0.5) * RAD)));
    out.push({ azimuth, altitude: apparent, mag: STARS[i + 2] + 0.2 * (airmass - 1), bv: STARS[i + 3] });
  }
  return out;
}

/** A star's colour from its B-V index, as display RGB from 0 to 1 (after Ballesteros's temperature formula). */
export function starColor(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  // A rough black-body tint, kept pale: stars look nearly white to the eye.
  const r = t < 6600 ? 1 : Math.min(1, 1.29 * Math.pow(t / 100 - 60, -0.1332));
  const g = t < 6600 ? Math.min(1, 0.39 * Math.log(t / 100) - 0.634) : Math.min(1, 1.13 * Math.pow(t / 100 - 60, -0.0755));
  const b = t >= 6600 ? 1 : t < 1900 ? 0 : Math.min(1, 0.543 * Math.log(t / 100 - 10) - 1.196);
  const pale = 0.55;
  return [r, g, b].map((v) => Math.min(1, Math.max(0, v)) * (1 - pale) + pale);
}
