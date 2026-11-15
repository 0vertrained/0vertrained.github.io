# 0vertrained.github.io

Rami's portfolio: one page, served by GitHub Pages at https://0vertrained.github.io.

The page is plain HTML, CSS and JavaScript modules, with no framework and no build step. It works without
JavaScript; the scripts add the parts that move.

- **The view east.** `assets/js/sky.js` works out where the sun and moon stand over Santa Fe at any minute
  (NOAA's solar equations, and the Astronomical Almanac's short series for the moon), and the light they give.
  `assets/js/scene.js` draws the view from a rooftop on the Plaza toward the Sangre de Cristo Mountains in
  WebGL 2: the sky from the sun's height, the sun, the moon with its phase, the stars that are up (Hipparcos to
  magnitude 5), and the name baked into a plaster height field on the CPU and lit on the GPU, each pixel's
  shadow traced across the relief. The skyline is traced from USGS elevation data (`assets/js/skyline-data.js`),
  and the land below it is fifteen photographs of the view, one per light of the day, blended by the sun's
  height (`assets/js/land.js`, `assets/img/land/`). `assets/js/hero.js` ties it to the hour control, which is a
  native range input, so it works by keyboard and screen reader. Where WebGL 2 is missing, the name is drawn
  in CSS with a shadow cast the same way. `tools/sky/` holds the tools that made the skyline and the
  photographs, and says how to make another set.
- **What leaves the building.** `assets/js/leaves.js` animates the real output of Caduceus's de-identifier.
- **One round, including the interruption.** `assets/js/lattice.js` replays the 271 measured Gazebo map poses
  of one recorded inspection round (`assets/data/lattice-round.json`), including the core being stopped and the
  reviewed recovery. It reads a checked-in file and never contacts a robot.

Motion follows `prefers-reduced-motion`, colour follows `prefers-color-scheme`, and nothing is tracked.

The résumé the page links to is built, not uploaded. `tools/resume/resume.json` holds the content, and each
file in `tools/resume/variants/` lays a version for one kind of role over it: its own headline and summary,
the same facts in a different order. `python3 tools/resume/build.py` prints each as a PDF, writes its Word
copy, and reads both back the way a résumé parser would, failing if a line is lost or a page is overrun.

## Run it

Any static server works, for example:

```
python3 -m http.server 8000
```

## Credits

Set in Archivo and Source Serif 4, both under the SIL Open Font License (`assets/fonts/`). Star positions
are from the Hipparcos catalogue by way of d3-celestial, BSD-3-Clause (`assets/js/LICENSE-d3-celestial.txt`).
The skyline comes from the USGS 3D Elevation Program, which is public domain. The land photographs were
generated with Higgsfield from this page's own renders.

## Lattice guided tour

`lattice/` is a generated static build from `0vertrained/Lattice`: four recorded stories
(blocked aisle, rover to quadruped, two-rover handoff, core restart), each told in chapters
drawn from its recording, with light and dark themes and an optional 3D replay. It requires
JavaScript and makes no robot API calls; the case study on the main page works without it.
`theme.js` and `favicon.svg` sit beside its `index.html` because the tour's
Content-Security-Policy allows only same-origin scripts, so the theme can't be set inline.
Rebuild it from the Lattice checkout with:

```bash
LATTICE_HOSTED_ORIGIN=https://lattice-robotics.netlify.app node scripts/export-portfolio-demo.mjs /path/to/this/portfolio
```

The operator console isn't part of this copy. `LATTICE_HOSTED_ORIGIN` makes `lattice/operator.html`
point to the hosted console, which sits behind a sign-in at https://lattice-robotics.netlify.app,
with the core on Google Cloud Run.

`assets/video/lattice-tour-opening.mp4` is a recording of the tour's opening from this copy, and
the `console-*.webp` screens come from the console with sample data; their route plans are the
planner's real output for the warehouse map.

## Ensemble recorded runs

`ensemble/index.html` is one self-contained page built from `0vertrained/Ensemble` (commit `e2a44a4`):
the app itself, with five recorded runs written into it and no server behind it. It makes no requests, and
each run can be played back and scrubbed step by step. `ensemble/#run-recorded-1` to `#run-recorded-5` open
the runs directly, in the order below.

The logs are in `ensemble/runs/`, as GitHub runners recorded them on 10 and 11 November 2026 (they are kept
on that repository's `live-runs` branch):

| File | Run | Recorded as |
| --- | --- | --- |
| `rename-glm-5.3.jsonl` | Add a rename command, glm-5.3, the sample project | `20261111-072720-benchmark2/rename` |
| `km-paces-0vertrained-gemma4.jsonl` | Paces per kilometre, gemma4:31b, a copy of 0VERTRAINED | `20261110-201819-project2` |
| `priorities-after-gemma4.jsonl` | Add priorities, gemma4:31b, after the harness began checking what was read | `20261110-123856-sample2` |
| `priorities-before-gemma4.jsonl` | The same request two hours earlier, which asked for help | `20261110-105024-sample1` |
| `undo-glm-5.3.jsonl` | Add an undo command, glm-5.3, the sample project | `20261111-072720-benchmark2/undo` |

Rebuild it from the Ensemble checkout, after `npm install` and `npm run build`, giving the runs in that
order:

```bash
node scripts/build-static.mjs "glm-5.3 on the sample project=/path/to/this/portfolio/ensemble/runs/rename-glm-5.3.jsonl" ... --out /path/to/this/portfolio/ensemble/index.html
```

The recording at the head of the case study (`assets/video/ensemble-run.mp4`) is that page playing the
first run at its own pace. The desktop stills in `assets/img/ensemble/` are the same page at chosen steps;
the two phone stills are the app's scripted demo, which needs no model. The page was checked with axe-core
against WCAG 2.2 AA on 40 screens: ten moments of the runs, in both colourings, at desktop and phone width.
