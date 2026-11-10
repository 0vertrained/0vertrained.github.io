"""Reads a built résumé back the way a parser does and says what was lost.

For the PDF: one page, no Type 3 fonts, document metadata, the standard section headings, and every line of the
résumé present in the text two extractors recover (pypdf, and pdftotext where it is installed). For the Word copy:
every line present in its text, and one page where LibreOffice is there to lay it out.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader

from resolve import lines

HEADINGS = ['Summary', 'Experience', 'Projects', 'Skills', 'Education']
WORD_TEXT = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'


def squash(text: str) -> str:
    """Text as one line. A line that wraps after a hyphen comes back from a PDF as "customer- facing"; a reader
    of the page sees "customer-facing", so the break is closed here."""
    return re.sub(r'-\s+', '-', re.sub(r'\s+', ' ', text)).strip().lower()


def missing(resume: dict, text: str) -> list[str]:
    flat = squash(text)
    lost = [f'heading "{h}"' for h in HEADINGS if h.lower() not in flat]
    return lost + [f'"{line[:60]}"' for line in lines(resume) if squash(line) not in flat]


def word_pages(docx: Path) -> int | None:
    """How many pages LibreOffice lays the document out on, or None where it is not installed."""
    office = shutil.which('soffice') or shutil.which('libreoffice')
    if not office:
        return None
    with tempfile.TemporaryDirectory() as work:
        subprocess.run([office, '--headless', '--convert-to', 'pdf', '--outdir', work, str(docx)],
                       capture_output=True, check=True, timeout=180)
        return len(PdfReader(Path(work) / f'{docx.stem}.pdf').pages)


def check(resume: dict, pdf: Path, docx: Path) -> list[str]:
    problems = []
    reader = PdfReader(pdf)
    if len(reader.pages) != 1:
        problems.append(f'the PDF has {len(reader.pages)} pages; a résumé here is one')
    for page in reader.pages:
        for font in (page.get('/Resources') or {}).get('/Font', {}).values():
            font = font.get_object()
            if str(font.get('/Subtype')) == '/Type3':
                problems.append(f'{font.get("/BaseFont")} is embedded as a Type 3 font, which some parsers cannot read')
    meta = reader.metadata or {}
    if not meta.get('/Title') or not meta.get('/Author'):
        problems.append('the PDF has no title or author')

    readings = {'pypdf': ''.join(page.extract_text() or '' for page in reader.pages)}
    if shutil.which('pdftotext'):
        readings['pdftotext'] = subprocess.run(['pdftotext', '-raw', str(pdf), '-'], capture_output=True, text=True,
                                               check=True).stdout
    # Link text sits outside a paragraph's own text in Word, so read every text run in the body.
    readings['Word'] = ' '.join(t.text or '' for t in Document(docx).element.body.iter(WORD_TEXT))
    for reader_name, text in readings.items():
        problems += [f'{reader_name} does not find {item}' for item in missing(resume, text)]

    pages = word_pages(docx)
    if pages is not None and pages != 1:
        problems.append(f'the Word copy runs to {pages} pages')
    return problems
