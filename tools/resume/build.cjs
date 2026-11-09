// Renders resume.json through resume.css and prints it to assets/Rami-Martinez-resume.pdf.
// Usage: node tools/resume/build.cjs [--html out.html]
// Needs Playwright with Chromium (npm i playwright && npx playwright install chromium).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const here = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(here, 'resume.json'), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`;
const bullets = (items) => `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;

function render(r) {
  const contact = [esc(r.location), r.email && `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`].filter(Boolean).join(' · ');
  const [first, ...rest] = r.links;
  const header = `<header>
  <div>
    <h1>${esc(r.name)}</h1>
    <p class="headline">${esc(r.headline)}</p>
  </div>
  <p class="where">${contact}<br>
    ${link(first)}<br>
    ${rest.map(link).join(' · ')}</p>
</header>`;

  const experience = r.experience.map((e) => `<div class="job">
  <div class="line"><strong>${esc(e.company)}</strong><span>${esc(e.location)}</span></div>
  ${e.roles.map((role) => `<p class="title">${esc(role.title)} <span class="dates">· ${esc(role.dates)}</span></p>${bullets(role.bullets)}`).join('\n  ')}
</div>`).join('\n');

  const projects = r.projects.map((p) => `<div class="job">
  <div class="line"><strong>${esc(p.name)}${p.stack ? ` <span class="stack">| ${esc(p.stack)}</span>` : ''}</strong>${link(p.link)}</div>
  ${bullets(p.bullets)}
</div>`).join('\n');

  const skills = `<dl class="skills">${r.skills.map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.items)}</dd>`).join('')}</dl>`;

  const education = r.education.map((e) => `<div class="job">
  <div class="line"><strong>${esc(e.school)}</strong><span>${esc(e.dates)}</span></div>
  <p class="title">${esc(e.detail)}</p>
</div>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(r.name)} - ${esc(r.headline)} - Resume</title>
<meta name="author" content="${esc(r.name)}">
<meta name="description" content="Resume of ${esc(r.name)}, ${esc(r.headline)}">
<base href="file://${here}/">
<link rel="stylesheet" href="resume.css">
</head>
<body>
${header}

<h2>Summary</h2>
<p class="summary">${esc(r.summary)}</p>

<h2>Experience</h2>
${experience}

<h2>Projects</h2>
${projects}

<h2>Skills</h2>
${skills}

<h2>Education</h2>
${education}
</body>
</html>
`;
}

(async () => {
  const html = render(data);
  const htmlOut = process.argv.includes('--html') ? process.argv[process.argv.indexOf('--html') + 1] : path.join(os.tmpdir(), 'resume.html');
  fs.writeFileSync(htmlOut, html);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file://' + htmlOut);
  await page.evaluate(() => document.fonts.ready);
  const out = path.resolve(here, '../../assets/Rami-Martinez-resume.pdf');
  await page.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const pages = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / (11 * 96 - 1.05 * 96)));
  console.log('wrote', out, '~pages', pages);
  await browser.close();
})();
