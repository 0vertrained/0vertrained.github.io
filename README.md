# 0vertrained.github.io

Rami's portfolio: one page, served by GitHub Pages at https://0vertrained.github.io.

The page is plain HTML, CSS and JavaScript modules, with no framework and no build step. It works without
JavaScript; the scripts add the parts that move.

- **The name in relief.** `assets/js/sky.js` works out where the sun and moon stand over Santa Fe at any minute
  (NOAA's solar equations, and the Astronomical Almanac's short series for the moon), and the light they give.
  `assets/js/relief.js` bakes the letters into a plaster height field on the CPU, then lights it on the GPU with
  WebGL 2, tracing each pixel's shadow across the relief. `assets/js/hero.js` ties it to the hour control, which
  is a native range input, so it works by keyboard and screen reader. Where WebGL 2 is missing, the name is drawn
  in CSS with a shadow cast the same way.
- **What leaves the building.** `assets/js/leaves.js` animates the real output of Caduceus's de-identifier.
- **One round, including the interruption.** `assets/js/lattice.js` replays the 271 measured Gazebo map poses
  of one recorded inspection round (`assets/data/lattice-round.json`), including the core being stopped and the
  reviewed recovery. It reads a checked-in file and never contacts a robot.

Motion follows `prefers-reduced-motion`, colour follows `prefers-color-scheme`, and nothing is tracked.

## Run it

Any static server works, for example:

```
python3 -m http.server 8000
```

## Credits

Set in Archivo and Source Serif 4, both under the SIL Open Font License (`assets/fonts/`).

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
