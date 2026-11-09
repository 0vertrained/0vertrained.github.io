// Prints resume.html to assets/Rami-Martinez-resume.pdf with Chromium. Usage: node tools/resume/build.cjs
// Needs Playwright with Chromium (npm i playwright && npx playwright install chromium).
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'resume.html'));
  await page.evaluate(() => document.fonts.ready);
  const out = path.resolve(__dirname, '../../assets/Rami-Martinez-resume.pdf');
  await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const pages = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / (11 * 96 - 1.45 * 96)));
  console.log('wrote', out, '~pages', pages);
  await browser.close();
})();
