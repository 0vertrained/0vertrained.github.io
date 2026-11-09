#!/usr/bin/env python3
"""Reads the résumé PDF (and the Word copy) the way a parser does and fails if anything is lost.

Checks: one page, no Type 3 fonts, standard section headings, and every line of resume.json present
in the extracted text (pypdf, pdftotext when it is installed, and python-docx for the .docx).

Usage: python3 tools/resume/check.py
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
PDF = HERE / '../../assets/Rami-Martinez-resume.pdf'
DOCX = HERE / '../../assets/Rami-Martinez-resume.docx'
DATA = json.loads((HERE / 'resume.json').read_text())
HEADINGS = ['Summary', 'Experience', 'Projects', 'Skills', 'Education']


def squash(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().lower()


def expected_lines():
    r = DATA
    yield r['name']
    yield r['headline']
    yield r['location']
    yield r['email']
    for link in r['links']:
        yield link['label']
    yield r['summary']
    for job in r['experience']:
        yield job['company']
        yield job['location']
        for role in job['roles']:
            yield role['title']
            yield role['dates']
            yield from role['bullets']
    for project in r['projects']:
        yield project['name']
        yield project['stack']
        yield project['link']['label']
        yield from project['bullets']
    for skill in r['skills']:
        yield skill['label']
        yield skill['items']
    for school in r['education']:
        yield school['school']
        yield school['detail']
        yield school['dates']


def fonts(reader: PdfReader):
    seen = {}
    for page in reader.pages:
        for name, font in (page.get('/Resources') or {}).get('/Font', {}).items():
            font = font.get_object()
            seen[str(font.get('/BaseFont'))] = str(font.get('/Subtype'))
    return seen


def main() -> int:
    problems = []
    reader = PdfReader(PDF)
    if len(reader.pages) != 1:
        problems.append(f'{len(reader.pages)} pages; the résumé is meant to be one')
    for name, kind in fonts(reader).items():
        if kind == '/Type3':
            problems.append(f'{name} is embedded as a Type 3 font, which some parsers cannot read')

    extractions = {'pypdf': ''.join(p.extract_text() or '' for p in reader.pages)}
    if shutil.which('pdftotext'):
        extractions['pdftotext'] = subprocess.run(['pdftotext', '-raw', str(PDF), '-'], capture_output=True, text=True, check=True).stdout
    if DOCX.exists():
        from docx import Document
        doc = Document(DOCX)
        # Hyperlink text sits outside paragraph.text, so read every w:t in the body.
        extractions['docx'] = ' '.join(t.text or '' for t in doc.element.body.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))

    for tool, text in extractions.items():
        flat = squash(text)
        for heading in HEADINGS:
            if heading.lower() not in flat:
                problems.append(f'{tool}: heading "{heading}" not found')
        for line in expected_lines():
            if squash(line) not in flat:
                problems.append(f'{tool}: missing or garbled: "{line[:70]}"')

    meta = reader.metadata or {}
    if not meta.get('/Title') or not meta.get('/Author'):
        problems.append('PDF title or author metadata is missing')

    words = len(extractions['pypdf'].split())
    if problems:
        print('\n'.join(f'- {p}' for p in problems))
        return 1
    print(f'ok: 1 page, {len(fonts(reader))} TrueType fonts, {words} words, every line of resume.json readable by {", ".join(extractions)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
