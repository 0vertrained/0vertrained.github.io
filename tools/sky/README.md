# The view east

The hero shows the view from a rooftop on the Santa Fe Plaza toward the Sangre de Cristo Mountains, lit as it
is at that minute. The sky, the sun, the moon, the stars and the plaster wall are rendered live in WebGL
(`assets/js/scene.js`); the land is a set of fifteen photographs, one per light of the day, blended by the sun's
height (`assets/js/land.js`). These are the tools that made the data and the photographs. None of them run on
the page.

## The skyline

`assets/js/skyline-data.js` is traced from USGS 3DEP 1/3 arc-second elevation data, tile `n36w106`, which the
USGS serves from `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n36w106/USGS_13_n36w106.tif`
(about 400 MB, public domain).

```bash
pip install numpy tifffile imagecodecs
python3 -I skyline.py USGS_13_n36w106.tif skyline.json       # marches a ray per hundredth of a degree: a few minutes
python3 -I pack.py skyline.json summits.json ../../assets/js/skyline-data.js
```

`skyline.py` stands the eye 8 m above the ground at 35.687° N, 105.9378° W, allows for the earth's curve and
standard refraction, and for each azimuth from 15° to 165° records the highest land along the line of sight,
how far away it is, and the same profile for the land within 9 km and within 3 km (the foothills and the hills
behind the town; the page draws these as separate bands). It also prints each listed summit's altitude against
the skyline at its azimuth. `summits.json` holds the summits' positions snapped to the highest point of the
elevation data within 700 m of their published coordinates, which is why they differ a little from the maps.
`pack.py` keeps the azimuths the page can show (30° to 100°), packs each profile as 16-bit values in base64,
and drops summits that stand behind a nearer ridge; the page names a summit when the sun or moon rises over
it.

## The photographs of the land

The land photographs (`assets/img/land/*.webp`) were made with an image model, Higgsfield's Nano Banana 2.1,
from the page's own renders, so their geometry is the page's geometry.

1. **Key times.** `node keytimes.mjs 2026-11-08` prints when the sun reaches each keyframe's height on a date,
   morning and evening: night (−24°), astronomical dawn (−15°), nautical dawn (−9°), civil dawn (−4°), sunrise
   (0.3°), early morning (8°), mid-morning (20°), midday, afternoon (20°), late afternoon (8°), golden hour
   (3°), alpenglow (0.4°), civil dusk (−4°), nautical dusk (−9°), astronomical dusk (−15°). The list in
   `assets/js/land.js` must match.
2. **Plates.** Serve the site, then `node plates.cjs plates 2026-11-08 "02:30=night,05:40=astronomical-dawn,…"`
   renders the view alone at each time, azimuth 40° to 80° and altitude −4.5° to 5.5°, 5120 × 1280 (the
   `?plate=` query renders the view with nothing of the page over it; `?still&at=` pins the moment). A plate
   is the drawn land under the real sky of that minute: the model's job is only to make the land real.
3. **Generation.** The afternoon plate became the master photograph: the model was asked for a photograph
   from the Plaza rooftop in that light, keeping every ridge line exactly where the plate has it, with
   November colours (bare cottonwoods, dry grass, piñon and juniper, light snow on the summits), no people
   and no text. Each other frame was then relit from two references, the master and that hour's plate, and
   asked to keep the master's land and change only its light. Strips at 4:1 keep the geometry within a
   tenth of a degree or so; full-frame generations tended to make the mountains about twice as tall, and
   masked inpainting was not honoured, which is why the sky is not asked of the model at all. At 4K each
   image cost 3 credits; the set was about 60.
4. **Lock.** `python3 -I lock.py frames skyline.json textures` finds the sky/land edge in each frame near
   where the traced skyline says it should be and stretches every column so the edge lands exactly on the
   skyline, then writes the textures: PNG, and WebP at 3200 × 800 and 1600 × 400. The frames the page
   serves were re-encoded at 2560 × 640 (quality 80) and 1600 × 400 (quality 78); the lock report lists
   each frame's drift before the lock, typically 0.03° to 0.06°. The page samples the photographs only
   below the skyline, so their sky never shows.
5. **Checks.** `node render.cjs out desk 06:40,12:30,17:05 2026-11-08` renders the finished hero at given
   times, and the `og` size makes the social image.

The frames were lit for November. A set for another season is the same steps again with that season's
colours asked of the model; `land.js` could then choose a set by the date.

## Running the renderers

`plates.cjs` and `render.cjs` need Playwright with Chromium (`npm i playwright && npx playwright install
chromium`) and the site served on `http://127.0.0.1:8030/` (`python3 -m http.server 8030` from the
repository root), or `SITE_URL` set to wherever it is. They render with software GL so the output is the same
on any machine.
