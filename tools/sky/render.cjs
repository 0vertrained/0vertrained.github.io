// Renders the hero at given Santa Fe times, as a visitor would see it then. The site must be served (see
// README.md); SITE_URL overrides the default. Usage:
//   node render.cjs <out-prefix> <size: desk|phone|wide|laptop|og|WxH> <HH:MM,HH:MM,...> [date YYYY-MM-DD] [scale]
const { chromium } = require('playwright');

const SITE = process.env.SITE_URL || 'http://127.0.0.1:8030/';

const [prefix = 'shot', sizeArg = 'desk', timesArg = '17:05', day = '2026-11-05', scaleArg = '1'] = process.argv.slice(2);
const sizes = { desk: [1440, 900], phone: [390, 844], wide: [1920, 1080], laptop: [1280, 800], og: [1200, 630] };
const [width, height] = sizes[sizeArg] || sizeArg.split('x').map(Number);

/** The UTC offset Santa Fe keeps on a date, from the time-zone database: "-06:00" in daylight time, "-07:00" in standard. */
function santaFeOffset(day) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', timeZoneName: 'longOffset' }).formatToParts(new Date(`${day}T18:00:00Z`));
  return parts.find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(scaleArg) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  for (const time of timesArg.split(',')) {
    const offset = santaFeOffset(day);
    const at = `${day}T${time}:00${offset}`;
    const started = Date.now();
    await page.goto(`${SITE}?still&at=${encodeURIComponent(at)}`);
    await page.waitForFunction(() => document.querySelector('[data-hero]')?.classList.contains('hero--relief'), null, { timeout: 60000 });
    // The photographs of the land arrive after the relief; wait for them unless this is a plate render.
    await page.waitForFunction(() => document.querySelector('[data-hero]')?.dataset.land === 'ready', null, { timeout: 20000 }).catch(() => console.log('  (land not ready)'));
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => {
      const hero = document.querySelector('[data-hero]');
      return { caption: document.querySelector('[data-light-caption]').textContent, wall: hero.dataset.wall, sky: hero.dataset.sky, land: hero.dataset.land, cls: hero.className };
    });
    const file = `${prefix}-${sizeArg}-${time.replace(':', '')}.png`;
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
    console.log(file, `${Date.now() - started}ms`, JSON.stringify(info));
  }
  if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 8));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
