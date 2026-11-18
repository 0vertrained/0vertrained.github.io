// Makes the picture a link to each case study unfolds into (assets/img/share/<project>.jpg, 1200 × 630) from
// card.html, which draws it with the site's own fonts and screenshots. The site must be served; SITE_URL
// overrides the default. Usage: node build.cjs [out-dir]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SITE = process.env.SITE_URL || 'http://127.0.0.1:8030/';
const out = process.argv[2] || path.join(__dirname, '../../assets/img/share');

// The name and the line under it are the ones each case study opens with. A screenshot is drawn 900 px wide and
// runs off the card; width draws it smaller where more of it should show.
const CARDS = [
  { project: 'caduceus', title: 'Caduceus', kind: 'A prior-authorization agent that keeps patient data inside the clinic', shots: ['assets/img/caduceus/fax-check.webp'] },
  { project: 'ensemble', title: 'Ensemble', kind: 'A software team of AI agents, held to a process that is written in code', shots: ['assets/img/ensemble/run.webp'] },
  { project: 'overtrained', title: '0VERTRAINED', kind: 'A training app for athletes who lift and race, designed and built alone', shots: ['assets/img/overtrained/today.webp', 'assets/img/overtrained/recovery.webp', 'assets/img/overtrained/session.webp'] },
  { project: 'lattice', title: 'Lattice', kind: 'Robot missions that keep their objective when the route or body changes', shots: ['assets/img/lattice/tour-opening-poster.webp'], width: 770 },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    for (const card of CARDS) {
      const query = new URLSearchParams({ title: card.title, kind: card.kind, shots: card.shots.join(',') });
      if (card.width) query.set('width', card.width);
      await page.goto(`${SITE}tools/share/card.html?${query}`, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      const file = path.join(out, `${card.project}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
      console.log(file, `${Math.round(fs.statSync(file).size / 1024)} KB`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
