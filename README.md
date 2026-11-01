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
- **The figures.** `assets/js/volume.js` draws 0VERTRAINED's volume audit and `assets/js/fleet.js` simulates
  Lattice's first milestone. Both draw at their real width, so their type stays legible on a phone.

Motion follows `prefers-reduced-motion`, colour follows `prefers-color-scheme`, and nothing is tracked.

## Run it

Any static server works, for example:

```
python3 -m http.server 8000
```

## Credits

Set in Archivo and Source Serif 4, both under the SIL Open Font License (`assets/fonts/`).
