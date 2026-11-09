#!/usr/bin/env python3
"""Builds the Word copy of the résumé from resume.json, for applications that ask for .docx.

Plain, single-column Word: standard fonts, real bullet lists, right-aligned dates on tab stops, no
tables or text boxes, so applicant-tracking parsers read it in order. Usage: python3 tools/resume/docx.py
"""
import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / 'resume.json').read_text())
OUT = HERE / '../../assets/Rami-Martinez-resume.docx'

INK = RGBColor(0x17, 0x21, 0x2B)
SOFT = RGBColor(0x4A, 0x55, 0x60)
ACCENT = RGBColor(0x0A, 0x6B, 0x67)
BODY = 'Calibri'
SIZE = Pt(10)


def run(paragraph, text, *, bold=False, size=SIZE, color=INK, font=BODY):
    r = paragraph.add_run(text)
    r.bold = bold
    r.font.size = size
    r.font.color.rgb = color
    r.font.name = font
    r._element.rPr.rFonts.set(qn('w:eastAsia'), font)
    return r


def hyperlink(paragraph, text, url, *, size=SIZE):
    """A clickable link whose visible text is the address itself, so parsers see the URL too."""
    part = paragraph.part
    r_id = part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), r_id)
    r = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    fonts = OxmlElement('w:rFonts')
    fonts.set(qn('w:ascii'), BODY)
    fonts.set(qn('w:hAnsi'), BODY)
    rpr.append(fonts)
    color = OxmlElement('w:color')
    color.set(qn('w:val'), '0A6B67')
    rpr.append(color)
    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), str(int(size.pt * 2)))
    rpr.append(sz)
    r.append(rpr)
    t = OxmlElement('w:t')
    t.text = text
    t.set(qn('xml:space'), 'preserve')
    r.append(t)
    link.append(r)
    paragraph._p.append(link)


def para(doc, *, before=0, after=0, right_tab=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = Pt(12.5)
    if right_tab:
        p.paragraph_format.tab_stops.add_tab_stop(Inches(7.5), WD_TAB_ALIGNMENT.RIGHT)
    return p


def heading(doc, text):
    p = para(doc, before=6, after=2)
    run(p, text.upper(), bold=True, size=Pt(8.5), color=SOFT)
    # A rule under the heading, drawn as a paragraph border rather than a table or shape.
    ppr = p._p.get_or_add_pPr()
    border = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    for k, v in (('val', 'single'), ('sz', '4'), ('space', '1'), ('color', '9AA3AB')):
        bottom.set(qn(f'w:{k}'), v)
    border.append(bottom)
    ppr.append(border)


def bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(0.5)
    p.paragraph_format.line_spacing = Pt(12.5)
    run(p, text)


def build():
    r = DATA
    doc = Document()
    for section in doc.sections:
        section.page_width, section.page_height = Inches(8.5), Inches(11)
        section.top_margin = section.bottom_margin = Inches(0.45)
        section.left_margin = section.right_margin = Inches(0.5)
    style = doc.styles['Normal']
    style.font.name = BODY
    style.font.size = SIZE
    style.element.rPr.rFonts.set(qn('w:eastAsia'), BODY)
    doc.styles['List Bullet'].font.name = BODY
    doc.styles['List Bullet'].font.size = SIZE

    # Header: name, headline, then contact details each on a line parsers split cleanly.
    p = para(doc)
    run(p, r['name'], bold=True, size=Pt(20))
    p = para(doc, after=2)
    run(p, r['headline'], bold=True, size=Pt(12), color=SOFT)
    p = para(doc, after=1)
    run(p, f"{r['location']}  ·  ", color=SOFT)
    hyperlink(p, r['email'], f"mailto:{r['email']}")
    p = para(doc, after=1)
    for i, link in enumerate(r['links']):
        if i:
            run(p, '  ·  ', color=SOFT)
        hyperlink(p, link['label'], link['url'])

    heading(doc, 'Summary')
    p = para(doc, after=2)
    run(p, r['summary'])

    heading(doc, 'Experience')
    for job in r['experience']:
        p = para(doc, before=4, right_tab=True)
        run(p, job['company'], bold=True, size=Pt(11))
        run(p, f"\t{job['location']}", color=SOFT, size=Pt(10))
        for role in job['roles']:
            p = para(doc, before=2, after=1, right_tab=True)
            run(p, role['title'], bold=True)
            run(p, f"\t{role['dates']}", color=SOFT, size=Pt(10))
            for b in role['bullets']:
                bullet(doc, b)

    heading(doc, 'Projects')
    for project in r['projects']:
        p = para(doc, before=4, after=1, right_tab=True)
        run(p, project['name'], bold=True, size=Pt(11))
        run(p, f"  |  {project['stack']}", color=SOFT, size=Pt(10))
        run(p, '\t')
        hyperlink(p, project['link']['label'], project['link']['url'], size=Pt(10))
        for b in project['bullets']:
            bullet(doc, b)

    heading(doc, 'Skills')
    for skill in r['skills']:
        p = para(doc, after=1)
        run(p, f"{skill['label']}: ", bold=True)
        run(p, skill['items'])

    heading(doc, 'Education')
    for school in r['education']:
        p = para(doc, before=3, right_tab=True)
        run(p, school['school'], bold=True, size=Pt(11))
        run(p, f"  ·  {school['detail']}", color=SOFT, size=Pt(10))
        run(p, f"\t{school['dates']}", color=SOFT, size=Pt(10))

    core = doc.core_properties
    core.author = r['name']
    core.title = f"{r['name']} - {r['headline']} - Resume"
    core.subject = f"Resume of {r['name']}, {r['headline']}"
    core.keywords = ', '.join(s['items'] for s in r['skills'][:2])[:255]
    core.comments = ''
    core.last_modified_by = r['name']
    core.revision = 1
    doc.save(OUT)
    print('wrote', OUT.resolve())


if __name__ == '__main__':
    build()
