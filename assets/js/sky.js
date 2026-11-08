// Where the sun and moon stand over Santa Fe at a given instant, and the light that makes.
// Sun: NOAA's solar position equations (after Meeus), good to a small fraction of a degree.
// Moon: the Astronomical Almanac's low-precision series, good to about half a degree.

export const SANTA_FE = { lat: 35.687, lon: -105.9378, timeZone: "America/Denver" };

const RAD = Math.PI / 180;
const mod = (x, m) => ((x % m) + m) % m;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const julianDay = (date) => date.getTime() / 86400000 + 2440587.5;

function refraction(elevation) {
  if (elevation > 85) return 0;
  const t = Math.tan(elevation * RAD);
  let seconds;
  if (elevation > 5) seconds = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (elevation > -0.575) {
    const e = elevation;
    seconds = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  } else seconds = -20.772 / t;
  return seconds / 3600;
}

function horizontal(latDeg, decl, hourAngle) {
  const lat = latDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));
  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(decl),
    Math.cos(lat) * Math.sin(decl) - Math.sin(lat) * Math.cos(decl) * Math.cos(hourAngle),
  );
  return { elevation: altitude / RAD, azimuth: mod(azimuth / RAD, 360) };
}

/** The sun's apparent position: azimuth in degrees east of north, elevation in degrees above the horizon. */
export function sunPosition(date, { lat, lon } = SANTA_FE) {
  const T = (julianDay(date) - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eqTime = (4 / RAD) * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const minutes = (date.getTime() / 60000) % 1440;
  const trueSolarTime = mod(minutes + eqTime + 4 * lon, 1440);
  const { elevation, azimuth } = horizontal(lat, decl, (trueSolarTime / 4 - 180) * RAD);
  return { azimuth, elevation: elevation + refraction(elevation) };
}

/** The moon's apparent position, as seen from the ground, and how much of it is lit (0 to 1). */
export function moonPosition(date, { lat, lon } = SANTA_FE) {
  const jd = julianDay(date);
  const T = (jd - 2451545) / 36525;
  const s = (a, b) => Math.sin((a + b * T) * RAD);
  const c = (a, b) => Math.cos((a + b * T) * RAD);
  const lambda = 218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36)
    + 0.66 * s(235.7, 890534.22) + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05)
    - 0.11 * s(186.5, 966404.03);
  const beta = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15)
    - 0.17 * s(217.6, -407332.21);
  const parallax = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
    + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);

  const l = Math.cos(beta * RAD) * Math.cos(lambda * RAD);
  const m = 0.9175 * Math.cos(beta * RAD) * Math.sin(lambda * RAD) - 0.3978 * Math.sin(beta * RAD);
  const n = 0.3978 * Math.cos(beta * RAD) * Math.sin(lambda * RAD) + 0.9175 * Math.sin(beta * RAD);
  const rightAscension = Math.atan2(m, l);
  const decl = Math.asin(n);
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
  const hourAngle = (mod(gmst + lon, 360) * RAD) - rightAscension;
  const { elevation, azimuth } = horizontal(lat, decl, hourAngle);
  const topocentric = elevation - parallax * Math.cos(elevation * RAD);

  // Elongation from the sun sets the lit fraction.
  const M = 357.52911 + 35999.05029 * T;
  const sunLambda = 280.46646 + 36000.76983 * T + 1.914602 * Math.sin(M * RAD);
  const elongation = Math.acos(clamp(Math.cos(beta * RAD) * Math.cos((lambda - sunLambda) * RAD), -1, 1));
  return {
    azimuth,
    elevation: topocentric + refraction(topocentric),
    illumination: (1 - Math.cos(elongation)) / 2,
    waxing: mod(lambda - sunLambda, 360) < 180,
  };
}

/** Minutes east of UTC for a time zone at an instant, e.g. -360 for Mountain Daylight Time. */
export function zoneOffset(date, timeZone = SANTA_FE.timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant of local midnight that starts the day containing `date`, in the place's time zone. */
export function localMidnight(date, timeZone = SANTA_FE.timeZone) {
  const offset = zoneOffset(date, timeZone);
  const local = new Date(date.getTime() + offset * 60000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // The offset at midnight can differ from the offset now on the days the clocks change.
  return new Date(midnight - zoneOffset(new Date(midnight - offset * 60000), timeZone) * 60000);
}

/** Sunrise and sunset (the sun's upper edge on the horizon) for the local day starting at `midnight`. */
export function sunTimes(midnight) {
  // sunPosition already includes refraction, so only the sun's apparent radius is added here.
  const altitude = (minutes) => sunPosition(new Date(midnight.getTime() + minutes * 60000)).elevation + 0.2667;
  const crossings = [];
  for (let m = 0; m < 1440; m += 10) {
    const a = altitude(m);
    const b = altitude(m + 10);
    if ((a < 0) !== (b < 0)) {
      let lo = m;
      let hi = m + 10;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if ((altitude(mid) < 0) === (a < 0)) lo = mid;
        else hi = mid;
      }
      crossings.push({ minutes: (lo + hi) / 2, rising: a < 0 });
    }
  }
  const rise = crossings.find((x) => x.rising);
  const set = crossings.find((x) => !x.rising);
  return {
    sunrise: rise ? new Date(midnight.getTime() + rise.minutes * 60000) : null,
    sunset: set ? new Date(midnight.getTime() + set.minutes * 60000) : null,
  };
}

const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function ramp(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      return lerp3(c0, c1, smoothstep(0, 1, (x - x0) / (x1 - x0)));
    }
  }
  return stops[stops.length - 1][1];
}

// Sunlight reddens near the horizon; the sky that fills the shadows goes from blue to violet to night.
const SUN = [[0, [1.0, 0.46, 0.24]], [3, [1.0, 0.6, 0.36]], [10, [1.0, 0.8, 0.6]], [25, [1.0, 0.93, 0.84]], [45, [1.0, 0.97, 0.92]]];
const SKY = [
  [-18, [0.024, 0.034, 0.075]], [-10, [0.045, 0.06, 0.13]], [-5, [0.13, 0.11, 0.22]], [-1, [0.3, 0.21, 0.31]],
  [3, [0.3, 0.27, 0.37]], [12, [0.24, 0.29, 0.39]], [40, [0.23, 0.29, 0.4]],
];

/** The plaster's colour: a pale, faintly warm stone. */
export const ALBEDO = [0.8, 0.79, 0.76];
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));

/**
 * Directions are in the frame of the screen, looking down at the plaza with south at the top: x points west,
 * y north (down the screen) and z up. With south at the top, the sun comes from the top of the screen for most
 * of the day, and raised letters read as raised; lit from below, the eye takes them for carved.
 */
export function lightAt(date) {
  const sun = sunPosition(date);
  const moon = moonPosition(date);
  const toVector = ({ azimuth, elevation }) => {
    const el = Math.max(elevation, 1.5) * RAD; // a light at the horizon would cast endless shadows
    return [-Math.cos(el) * Math.sin(azimuth * RAD), Math.cos(el) * Math.cos(azimuth * RAD), Math.sin(el)];
  };
  const sunUp = smoothstep(-1.2, 2.2, sun.elevation);
  // A thin crescent lights nothing, so it never becomes the key light.
  const moonUp = smoothstep(-0.8, 3, moon.elevation) * (1 - smoothstep(-8, -2, sun.elevation)) * smoothstep(0.03, 0.12, moon.illumination);
  const sunColor = ramp(SUN, sun.elevation).map((v) => v * sunUp * 1.05);
  const moonColor = [0.66, 0.74, 0.98].map((v) => v * moonUp * (0.05 + 0.15 * moon.illumination));
  const useSun = sunUp >= 0.02 || moonUp < 0.02;
  const color = useSun ? sunColor : moonColor;
  const ambient = ramp(SKY, sun.elevation);
  // Expose like a camera would: only a moonless night is lifted, enough to read the plaster by.
  const level = lum(ambient) + lum(color);
  const exposure = 1.1 * Math.min(1.6, Math.max(1, 0.06 / Math.max(level, 1e-3)));
  return { sun, moon, direction: useSun ? toVector(sun) : toVector(moon), color, ambient, exposure, key: useSun ? "sun" : "moon" };
}

/** How bright open, lit ground looks on screen (0 to 1), to choose the text colour over the scene. */
export function groundBrightness(light) {
  const linear = lum(ALBEDO) * (lum(light.color) + lum(light.ambient)) * light.exposure;
  return Math.pow(aces(linear), 1 / 2.2);
}
