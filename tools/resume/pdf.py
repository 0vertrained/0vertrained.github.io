"""Prints a résumé to PDF with Chromium: one column, standard headings, text a parser reads in order."""
from __future__ import annotations

import io
import tempfile
from html import escape as esc
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from resolve import ASSETS, HERE

# The page, as resume.css sets it: Letter with these margins, in inches.
MARGIN_TOP, MARGIN_SIDE, MARGIN_BOTTOM = 0.45, 0.5, 0.4
PX = 96


def link(item: dict) -> str:
    return f'<a href="{esc(item["url"])}">{esc(item["label"])}</a>'


def bullets(items: list[str]) -> str:
    return '<ul>' + ''.join(f'<li>{esc(b)}</li>' for b in items) + '</ul>'


def render(r: dict) -> str:
    contact = ' · '.join([esc(r['location']), f'<a href="mailto:{esc(r["email"])}">{esc(r["email"])}</a>'])
    first, *rest = r['links']
    experience = '\n'.join(
        f'''<div class="job">
  <div class="line"><strong>{esc(job["company"])}</strong><span>{esc(job["location"])}</span></div>
  ''' + '\n  '.join(
            f'<p class="title">{esc(role["title"])} <span class="dates">· {esc(role["dates"])}</span></p>'
            + bullets(role['bullets']) for role in job['roles']) + '\n</div>'
        for job in r['experience'])
    projects = '\n'.join(
        f'''<div class="job">
  <div class="line"><strong>{esc(p["name"])} <span class="stack">| {esc(p["stack"])}</span></strong>{link(p["link"])}</div>
  {bullets(p["bullets"])}
</div>''' for p in r['projects'])
    skills = '<dl class="skills">' + ''.join(
        f'<dt>{esc(s["label"])}</dt><dd>{esc(s["items"])}</dd>' for s in r['skills']) + '</dl>'
    education = '\n'.join(
        f'''<div class="job">
  <div class="line"><div><strong>{esc(e["school"])}</strong> <span class="detail">· {esc(e["detail"])}</span></div><span>{esc(e["dates"])}</span></div>
</div>''' for e in r['education'])
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{esc(r["name"])} - {esc(r["headline"])} - Resume</title>
<base href="{HERE.as_uri()}/">
<link rel="stylesheet" href="resume.css">
</head>
<body>
<header>
  <div>
    <h1>{esc(r["name"])}</h1>
    <p class="headline">{esc(r["headline"])}</p>
  </div>
  <p class="where">{contact}<br>
    {link(first)}<br>
    {" · ".join(link(l) for l in rest)}</p>
</header>

<h2>Summary</h2>
<p class="summary">{esc(r["summary"])}</p>

<h2>Experience</h2>
{experience}

<h2>Projects</h2>
{projects}

<h2>Skills</h2>
{skills}

<h2>Education</h2>
{education}
</body>
</html>
'''


def build(r: dict, browser) -> tuple[Path, int, int]:
    """Writes assets/<file>.pdf. Returns its path, its page count, and the room left on the page in CSS pixels
    (negative when it spills)."""
    with tempfile.TemporaryDirectory() as work:
        source = Path(work) / 'resume.html'
        source.write_text(render(r))
        # Laid out at the printed text width, so the height read below is the height on paper.
        page = browser.new_page(viewport={'width': round((8.5 - 2 * MARGIN_SIDE) * PX), 'height': 1056})
        page.emulate_media(media='print')
        page.goto(source.as_uri())
        page.evaluate('document.fonts.ready')
        printed = page.pdf(format='Letter', print_background=True, prefer_css_page_size=True)
        height = page.evaluate('document.body.getBoundingClientRect().height')
        page.close()

    # Document metadata, which Chromium leaves blank.
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(printed)))
    title = f'{r["name"]} - {r["headline"]} - Resume'
    writer.add_metadata({
        '/Title': title, '/Author': r['name'], '/Subject': f'Resume of {r["name"]}, {r["headline"]}',
        '/Keywords': ', '.join(s['items'] for s in r['skills']),
        '/Creator': 'tools/resume/build.py', '/Producer': 'tools/resume/build.py',
    })
    out = ASSETS / f'{r["file"]}.pdf'
    with out.open('wb') as f:
        writer.write(f)
    room = round((11 - MARGIN_TOP - MARGIN_BOTTOM) * PX - height)
    return out, len(writer.pages), room
