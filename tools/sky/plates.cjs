// Renders reference plates: the view alone, no wall or text, at each keyframe moment, for an image model to
// repaint photographically. The site must be served (see README.md); SITE_URL overrides the default.
// Usage: node plates.cjs <out-dir> <YYYY-MM-DD> <HH:MM=name,...> [geometry]
// geometry: view azimuth, field of view, altitude at the top edge, height in degrees, pixels per degree.
// The default makes the strips the land photographs were made from: azimuth 40° to 80°, altitude -4.5° to
// 5.5°, 128 px per degree, 5120 × 1280.
const fs = require('node:fs');
const { chromium } = require('playwright');

const SITE = process.env.SITE_URL || 'http://127.0.0.1:8030/';
const [out = 'plates', day = '2026-11-08', list = '12:00=noon', geometry = '60,40,5.5,10,128'] = process.argv.slice(2);
const [VIEW_AZ, FOV, TOP, HEIGHT_DEG, PX_PER_DEG] = geometry.split(',').map(Number);

/** The UTC offset Santa Fe keeps on a date, from the time-zone database: "-06:00" in daylight time, "-07:00" in standard. */
function santaFeOffset(day) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'longOffset' }).formatToParts(new Date(`${day}T18:00:00Z`));
  return parts.find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
}
const width = FOV * PX_PER_DEG, height = HEIGHT_DEG * PX_PER_DEG;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    // Software GL, so the render is the same on any machine; drop these to use the GPU.
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const manifest = [];
    for (const item of list.split(',')) {
      const [time, name] = item.split('=');
      const offset = santaFeOffset(day);
      const at = `${day}T${time}:00${offset}`;
      const started = Date.now();
      await page.goto(`${SITE}?still&plate=${VIEW_AZ},${FOV},${TOP}&at=${encodeURIComponent(at)}`);
      await page.waitForFunction(() => document.querySelector('[data-hero]')?.classList.contains('hero--relief'), null, { timeout: 180000 });
      await page.waitForTimeout(2500);
      const caption = await page.evaluate(() => document.querySelector('[data-light-caption]').textContent);
      const file = `${String(manifest.length + 1).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: `${out}/${file}`, clip: { x: 0, y: 0, width, height } });
      manifest.push({ file, time, at, name, caption: caption.replace(/^Santa Fe right now, /, '') });
      console.log(file, `${Date.now() - started}ms`, caption);
    }
    fs.writeFileSync(`${out}/plates.json`, JSON.stringify({ day, viewAz: VIEW_AZ, fov: FOV, topAltitude: TOP, bottomAltitude: TOP - height / PX_PER_DEG, pxPerDeg: PX_PER_DEG, width, height, frames: manifest }, null, 1));
    if (errors.length) console.log('errors:', [...new Set(errors)].filter((e) => !e.includes('404')).slice(0, 5));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
