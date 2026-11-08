// The moments on a date when the sun reaches each keyframe's elevation, morning and evening, in Santa Fe:
// the times to render plates at. Usage: node keytimes.mjs [YYYY-MM-DD]
import { sunPosition, localMidnight } from '../../assets/js/sky.js';
const day = process.argv[2] || '2026-11-08';
const midnight = localMidnight(new Date(`${day}T12:00:00-07:00`));
const at = (m) => new Date(midnight.getTime() + m * 60000);
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const samples = [];
for (let m = 0; m <= 1440; m += 1) samples.push({ m, ...sunPosition(at(m)) });
const noon = samples.reduce((a, b) => (b.elevation > a.elevation ? b : a));
function crossing(target, rising) {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (rising ? a.elevation < target && b.elevation >= target && b.m <= noon.m : a.elevation >= target && b.elevation < target && a.m >= noon.m) return b;
  }
  return null;
}
const frames = [
  ['night', -24, 'am'], ['astronomical dawn', -15, 'am'], ['nautical dawn', -9, 'am'], ['civil dawn', -4, 'am'],
  ['sunrise', 0.3, 'am'], ['early morning', 8, 'am'], ['mid-morning', 20, 'am'], ['midday', noon.elevation - 0.05, 'noon'],
  ['afternoon', 20, 'pm'], ['late afternoon', 8, 'pm'], ['golden hour', 3, 'pm'], ['alpenglow', 0.4, 'pm'],
  ['civil dusk', -4, 'pm'], ['nautical dusk', -9, 'pm'], ['astronomical dusk', -15, 'pm'],
];
for (const [name, elevation, half] of frames) {
  const s = half === 'noon' ? noon : crossing(elevation, half === 'am');
  if (!s) { console.log(name, 'not reached'); continue; }
  console.log(`${name.padEnd(18)} ${fmt.format(at(s.m))}  elevation ${s.elevation.toFixed(1).padStart(5)}  azimuth ${s.azimuth.toFixed(0)}`);
}
