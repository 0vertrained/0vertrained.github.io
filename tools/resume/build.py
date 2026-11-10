#!/usr/bin/env python3
"""Builds the résumés: the general one the page links to, and each tailored version in variants/.

    python3 tools/resume/build.py            # all of them
    python3 tools/resume/build.py general forward-deployed-engineer

For each: the PDF (pdf.py) and the Word copy (word.py) into assets/, then both are read back the way a parser
would read them (check.py). Exits 1 if any of them spills past a page or loses a line.

Needs Python with playwright (and its Chromium), pypdf and python-docx. CHROMIUM_PATH names a Chromium to use
instead of Playwright's own.
"""
from __future__ import annotations

import os
import sys

from playwright.sync_api import sync_playwright

import check
import pdf
import word
from resolve import names, resolve


def main(argv: list[str]) -> int:
    wanted = argv or names()
    if unknown := set(wanted) - set(names()):
        print(f'No such résumé: {", ".join(sorted(unknown))}. There are: {", ".join(names())}.')
        return 2
    failed = False
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
        for name in wanted:
            resume = resolve(name)
            printed, pages, room = pdf.build(resume, browser)
            written = word.build(resume)
            problems = check.check(resume, printed, written)
            fit = f'{room} px to spare' if pages == 1 else f'{pages} pages, {-room} px over'
            words = sum(len(line.split()) for line in check.lines(resume))
            print(f'{name}: {printed.name} and {written.name}, {words} words, {fit}')
            for problem in problems:
                print(f'  - {problem}')
            failed = failed or bool(problems)
        browser.close()
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
