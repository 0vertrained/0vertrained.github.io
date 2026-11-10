"""The résumé's data: the master (resume.json) and the tailored versions laid over it (variants/*.json).

A variant names its file and may replace the headline, the summary, the projects and the skills, and may reorder,
drop or reword the bullets of a role. Everything it leaves alone comes from the master, so a fact is corrected in
one place.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = (HERE / '../../assets').resolve()
GENERAL = 'general'


def names() -> list[str]:
    """The general résumé, then each variant by file name."""
    return [GENERAL, *sorted(p.stem for p in (HERE / 'variants').glob('*.json'))]


def resolve(name: str = GENERAL) -> dict:
    """The résumé as the builders read it: every role's bullets a list, in the order to print."""
    resume = json.loads((HERE / 'resume.json').read_text())
    overlay = {} if name == GENERAL else json.loads((HERE / 'variants' / f'{name}.json').read_text())
    resume = copy.deepcopy(resume)
    resume['file'] = overlay.get('file', 'Rami-Martinez-resume')
    for key in ('headline', 'summary', 'projects', 'skills'):
        if key in overlay:
            resume[key] = overlay[key]

    roles = {role['title']: role for job in resume['experience'] for role in job['roles']}
    changes = overlay.get('experience', {})
    if unknown := set(changes) - set(roles):
        raise SystemExit(f'{name}: no such role in resume.json: {", ".join(sorted(unknown))}')
    for title, role in roles.items():
        change = changes.get(title, {})
        named = set(change.get('order', [])) | set(change.get('text', {}))
        if unknown := named - set(role['bullets']):
            raise SystemExit(f'{name}: {title} has no bullet called {", ".join(sorted(unknown))}')
        text = {**role['bullets'], **change.get('text', {})}
        role['bullets'] = [text[key] for key in change.get('order', list(role['bullets']))]
    return resume


def lines(resume: dict):
    """Every piece of text the résumé should carry, for checking a built file against."""
    yield resume['name']
    yield resume['headline']
    yield resume['location']
    yield resume['email']
    for link in resume['links']:
        yield link['label']
    yield resume['summary']
    for job in resume['experience']:
        yield job['company']
        yield job['location']
        for role in job['roles']:
            yield role['title']
            yield role['dates']
            yield from role['bullets']
    for project in resume['projects']:
        yield project['name']
        yield project['stack']
        yield project['link']['label']
        yield from project['bullets']
    for skill in resume['skills']:
        yield skill['label']
        yield skill['items']
    for school in resume['education']:
        yield school['school']
        yield school['detail']
        yield school['dates']
