"""Writes the Word copy of a résumé, for applications that ask for .docx.

Plain, single-column Word: a standard font, real bullet lists, dates on right tab stops, no tables or text boxes,
so an applicant-tracking parser reads it in order.
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from resolve import ASSETS

INK = RGBColor(0x17, 0x21, 0x2B)
SOFT = RGBColor(0x4A, 0x55, 0x60)
ACCENT = '0A6B67'
BODY = 'Calibri'
SIZE = Pt(10)
LINE = Pt(12.5)


def run(paragraph, text, *, bold=False, size=SIZE, color=INK):
    r = paragraph.add_run(text)
    r.bold = bold
    r.font.size = size
    r.font.color.rgb = color
    r.font.name = BODY
    r._element.rPr.rFonts.set(qn('w:eastAsia'), BODY)
    return r


def hyperlink(paragraph, text, url, *, size=SIZE):
    """A link whose visible text is the address itself, so a parser sees the address too."""
    relation = paragraph.part.relate_to(
        url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), relation)
    r = OxmlElement('w:r')
    properties = OxmlElement('w:rPr')
    fonts = OxmlElement('w:rFonts')
    fonts.set(qn('w:ascii'), BODY)
    fonts.set(qn('w:hAnsi'), BODY)
    color = OxmlElement('w:color')
    color.set(qn('w:val'), ACCENT)
    points = OxmlElement('w:sz')
    points.set(qn('w:val'), str(int(size.pt * 2)))
    for element in (fonts, color, points):
        properties.append(element)
    t = OxmlElement('w:t')
    t.text = text
    t.set(qn('xml:space'), 'preserve')
    r.append(properties)
    r.append(t)
    link.append(r)
    paragraph._p.append(link)


def para(doc, *, before=0.0, after=0.0, right_tab=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = LINE
    if right_tab:
        p.paragraph_format.tab_stops.add_tab_stop(Inches(7.5), WD_TAB_ALIGNMENT.RIGHT)
    return p


def heading(doc, text):
    p = para(doc, before=6, after=2)
    run(p, text.upper(), bold=True, size=Pt(8.5), color=SOFT)
    # The rule under a heading is a paragraph border, not a table or a shape.
    border = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    for key, value in (('val', 'single'), ('sz', '4'), ('space', '1'), ('color', '9AA3AB')):
        bottom.set(qn(f'w:{key}'), value)
    border.append(bottom)
    p._p.get_or_add_pPr().append(border)


def bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(0.5)
    p.paragraph_format.line_spacing = LINE
    run(p, text)


def build(r: dict) -> Path:
    """Writes assets/<file>.docx and returns its path."""
    doc = Document()
    for section in doc.sections:
        section.page_width, section.page_height = Inches(8.5), Inches(11)
        section.top_margin = section.bottom_margin = Inches(0.45)
        section.left_margin = section.right_margin = Inches(0.5)
    for style in (doc.styles['Normal'], doc.styles['List Bullet']):
        style.font.name = BODY
        style.font.size = SIZE
    doc.styles['Normal'].element.rPr.rFonts.set(qn('w:eastAsia'), BODY)

    p = para(doc)
    run(p, r['name'], bold=True, size=Pt(20))
    p = para(doc, after=2)
    run(p, r['headline'], bold=True, size=Pt(12), color=SOFT)
    p = para(doc, after=1)
    run(p, f"{r['location']}  ·  ", color=SOFT)
    hyperlink(p, r['email'], f"mailto:{r['email']}")
    p = para(doc, after=1)
    for i, item in enumerate(r['links']):
        if i:
            run(p, '  ·  ', color=SOFT)
        hyperlink(p, item['label'], item['url'])

    heading(doc, 'Summary')
    run(para(doc, after=2), r['summary'])

    heading(doc, 'Experience')
    for job in r['experience']:
        p = para(doc, before=4, right_tab=True)
        run(p, job['company'], bold=True, size=Pt(11))
        run(p, f"\t{job['location']}", color=SOFT)
        for role in job['roles']:
            p = para(doc, before=2, after=1, right_tab=True)
            run(p, role['title'], bold=True)
            run(p, f"\t{role['dates']}", color=SOFT)
            for text in role['bullets']:
                bullet(doc, text)

    heading(doc, 'Projects')
    for project in r['projects']:
        p = para(doc, before=4, after=1, right_tab=True)
        run(p, project['name'], bold=True, size=Pt(11))
        run(p, f"  |  {project['stack']}", color=SOFT)
        run(p, '\t')
        hyperlink(p, project['link']['label'], project['link']['url'])
        for text in project['bullets']:
            bullet(doc, text)

    heading(doc, 'Skills')
    for skill in r['skills']:
        p = para(doc, after=1)
        run(p, f"{skill['label']}: ", bold=True)
        run(p, skill['items'])

    heading(doc, 'Education')
    for school in r['education']:
        p = para(doc, before=3, right_tab=True)
        run(p, school['school'], bold=True, size=Pt(11))
        run(p, f"  ·  {school['detail']}", color=SOFT)
        run(p, f"\t{school['dates']}", color=SOFT)

    core = doc.core_properties
    core.author = core.last_modified_by = r['name']
    core.title = f"{r['name']} - {r['headline']} - Resume"
    core.subject = f"Resume of {r['name']}, {r['headline']}"
    core.keywords = ', '.join(s['items'] for s in r['skills'][:2])[:255]
    core.comments = ''
    core.revision = 1
    out = ASSETS / f"{r['file']}.docx"
    doc.save(out)
    return out
