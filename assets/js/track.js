// Blob tracking over the view east. Each time the hero draws, this looks at the picture itself, wherever the
// view shows past the plaster, and finds the things that stand out bright against what is round them: snow on
// the peaks, a lit window, the moon, a star. It keeps a few of them boxed, labels each with its bearing and its
// height above the horizon, and joins them with lines. Every few seconds it lets one go and takes up another,
// and it follows them when the hour is dragged. The reader's pointer over the view is followed the same way.
// Nothing it draws covers the plaster: the boxes and lines pass behind the name, as the view does.

const SLOTS = { wide: 6, narrow: 3 }; // how many it follows at once
const DWELL = 3600; // milliseconds between letting one go and taking up another
const ARRIVE = 420;
const LEAVE = 320;
const INK = "13, 19, 26";
const SKY = 1; // what a cell of the picture shows
const LAND = 2;
const RIDGE = 3; // some of each: the skyline passes through it

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const easeOut = (t) => 1 - (1 - t) ** 3;
const bearing = (az) => `${(((az % 360) + 360) % 360).toFixed(1).padStart(5, "0")}°`;
const height = (alt) => `${alt < 0 ? "−" : "+"}${Math.abs(alt).toFixed(1)}°`;

/**
 * `scene` is the hero's scene (scene.js), which hands over small copies of the picture it has drawn, and `layer`
 * the canvas over it that the boxes go on. `landmarks` are named things with a bearing and a height, such as
 * the summits; a find that lands on one takes its name. `skyline` gives the height of the land at a bearing,
 * which is where the scene's sky ends.
 */
export function createTracker(root, scene, layer, { landmarks = [], skyline = null } = {}) {
  const ctx = layer.getContext("2d");
  if (!ctx || !scene?.snapshot) return null;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const mouse = matchMedia("(hover: hover) and (pointer: fine)");

  let geometry = null; // the scene's camera, in its own canvas pixels
  let cover = null; // where the plaster stands in front of the view: a small canvas, opaque there
  let coverData = null;
  let plan = null; // which cells of a copy are sky, which land and which neither, and what that was worked out for
  let work = null; // the arrays a look works in, kept from one look to the next
  let grid = null; // the size of the last copy read, and of one of its cells on the page
  let clear = []; // boxes in scene pixels where nothing should be picked, such as behind the links
  let sun = null;
  let moon = null;
  let box = layer.getBoundingClientRect();
  let dpr = 1;
  let finds = []; // what the last look found, best first, in CSS pixels
  let anchors = []; // the finds it never lets go of: the strongest, and the strongest well apart from that one
  const tracks = []; // what is being followed
  const followed = new Map(); // where it has followed things, and when, so that it takes turns
  let pointer = null;
  let enabled = true;
  let visible = true;
  let frame = 0;
  let lookTimer = 0;
  let pictures = 0; // how many times the scene has drawn
  let waiting = false; // a copy of the picture has been asked for and has not come back yet
  let turnTimer = 0;
  let lastLook = 0;
  let reading = 0; // how long the last look took to read, in milliseconds
  let lastScene = 0;
  let lastFrame = 0;

  function measure() {
    box = layer.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
  }

  /** The plaster's outline at a third of the scene's size, from the coverage the scene baked. */
  function outline(g) {
    const step = 3;
    const w = Math.ceil(g.width / step);
    const h = Math.ceil(g.height / step);
    const image = new ImageData(w, h);
    const baked = g.plaster.data;
    for (let y = 0; y < h; y++) {
      const row = Math.min(g.height - 1, y * step + 1) * g.width;
      for (let x = 0; x < w; x++) {
        const covered = baked[(row + Math.min(g.width - 1, x * step + 1)) * 4 + 2];
        image.data[(y * w + x) * 4 + 3] = covered > 0.02 ? 255 : 0;
      }
    }
    cover = document.createElement("canvas");
    cover.width = w;
    cover.height = h;
    cover.getContext("2d").putImageData(image, 0, 0);
    coverData = { alpha: image.data, w, h, step };
    plan = null;
  }

  /** Whether the view shows at a point of the scene, with a little room to spare from the plaster's edge. */
  function open(px, py, room) {
    const { alpha, w, h, step } = coverData;
    for (let i = 0; i < 5; i++) {
      const dx = i === 1 ? -room : i === 2 ? room : 0;
      const dy = i === 3 ? -room : i === 4 ? room : 0;
      const x = clamp(Math.round((px + dx) / step), 0, w - 1);
      const y = clamp(Math.round((py + dy) / step), 0, h - 1);
      if (alpha[(y * w + x) * 4 + 3]) return false;
    }
    return true;
  }

  /**
   * What each cell of a copy `aw` by `ah` (its top rows, down to the wall) shows: sky, land, the ridge between
   * them, or nothing to look at, which is the plaster, a margin round it, the hero's edges and what lies behind
   * its links. With that go running counts of the sky cells and of the land cells, so that how many lie in any
   * rectangle is four look-ups.
   */
  function planFor(g, aw, ah, cellX, cellY) {
    const key = `${aw}x${ah}:${clear.map((r) => `${Math.round(r.x0)},${Math.round(r.y0)},${Math.round(r.x1)},${Math.round(r.y1)}`).join(";")}`;
    if (plan?.key === key) return plan;
    const k = g.width / box.width;
    const stride = aw + 1;
    const kind = new Uint8Array(aw * ah);
    const skyCount = new Int32Array(stride * (ah + 1));
    const landCount = new Int32Array(stride * (ah + 1));
    // The scene draws the land below the skyline and only sky above it. A cell that the skyline passes
    // through is a mixture of the two, and so is the land a cell further down, where a little sky in the
    // mixture would make the ridge look bright: those are the ridge, and count as neither.
    const crest = new Float32Array(aw);
    for (let x = 0; x < aw; x++) {
      crest[x] = skyline ? g.horizon - skyline(g.az0 + ((x + 0.5) * cellX) / g.scale) * g.scale : -1e6;
    }
    for (let y = 0; y < ah; y++) {
      const py = (y + 0.5) * cellY;
      let sky = 0;
      let land = 0;
      for (let x = 0; x < aw; x++) {
        const px = (x + 0.5) * cellX;
        const edge = y < 2 || y >= ah - 1 || x < 2 || x >= aw - 2;
        if (!edge && open(px, py, 10 * k) && !clear.some((r) => px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1)) {
          const highest = Math.min(crest[Math.max(0, x - 1)], crest[x], crest[Math.min(aw - 1, x + 1)]);
          const lowest = Math.max(crest[Math.max(0, x - 1)], crest[x], crest[Math.min(aw - 1, x + 1)]);
          if (py > lowest + cellY) {
            kind[y * aw + x] = LAND;
            land++;
          } else if (py < highest - cellY / 2) {
            kind[y * aw + x] = SKY;
            sky++;
          } else {
            kind[y * aw + x] = RIDGE;
          }
        }
        const at = (y + 1) * stride + x + 1;
        skyCount[at] = skyCount[at - stride] + sky;
        landCount[at] = landCount[at - stride] + land;
      }
    }
    plan = { key, kind, skyCount, landCount };
    return plan;
  }

  const place = (find) => `${Math.round(find.x / 28)}:${Math.round(find.y / 28)}`;
  const apart = (a, b, d) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > d * d;
  const live = () => tracks.filter((t) => !t.leaving);

  /**
   * While the hour is dragged the scene draws every frame; a look every tenth of a second is plenty, and on a
   * slow machine fewer, so that reading never takes more than a sixth of the time.
   */
  function lookSoon() {
    if (!lookTimer) lookTimer = setTimeout(look, Math.max(0, Math.max(110, reading * 6) - (performance.now() - lastLook)));
  }

  /** Asks the scene for a small copy of the picture, then reads it. */
  function look() {
    lookTimer = 0;
    // One copy at a time: the one on its way looks again itself if the picture has changed by then.
    if (waiting || !geometry || !coverData || !enabled || !visible || !box.width) return;
    lastLook = performance.now();
    waiting = true;
    const picture = pictures;
    // Cells about five CSS pixels across on a wide screen and under three on a phone, where what stands out
    // is smaller.
    scene.snapshot(box.width < 640 ? 150 : 320).then((copy) => {
      waiting = false;
      if (!enabled || !geometry) return;
      const began = performance.now();
      if (copy) read(copy);
      reading = performance.now() - began;
      // A slow graphics card can take longer over a copy than the scene takes to draw again.
      if (pictures !== picture) lookSoon();
    });
  }

  /** Lists what stands out in a copy of the picture. */
  function read({ data, width: aw, height: rows }) {
    const g = geometry;
    const k = g.width / box.width; // scene pixels per CSS pixel
    const cellX = g.width / aw;
    const cellY = g.height / rows;
    // Only the rows above the top of the wall hold any view.
    const ah = Math.min(rows, Math.floor(g.plaster.parapet / cellY));
    if (ah < 8) return;
    const { kind, skyCount, landCount } = planFor(g, aw, ah, cellX, cellY);

    // Brightness, and its running sums over the sky and over the land, so that the average of either over any
    // rectangle is a few look-ups.
    const n = aw * ah;
    const stride = aw + 1;
    if (work?.n !== n) {
      work = { n, lum: new Float32Array(n), white: new Uint8Array(n), skySum: new Float64Array(stride * (ah + 1)), landSum: new Float64Array(stride * (ah + 1)), over: new Float32Array(n), seen: new Uint8Array(n) };
    }
    const { lum, white, skySum, landSum, over, seen } = work;
    over.fill(0);
    seen.fill(0);
    for (let y = 0; y < ah; y++) {
      const from = (rows - 1 - y) * aw * 4; // the copy's rows run from the bottom up
      let sky = 0;
      let land = 0;
      for (let x = 0; x < aw; x++) {
        const i = from + x * 4;
        const v = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        const cell = y * aw + x;
        lum[cell] = v;
        white[cell] = data[i] > 250 && data[i + 1] > 250 ? 1 : 0; // the sun's glare is as bright as red and green go
        if (kind[cell] === SKY) sky += v;
        else if (kind[cell] === LAND) land += v;
        const at = (y + 1) * stride + x + 1;
        skySum[at] = skySum[at - stride] + sky;
        landSum[at] = landSum[at - stride] + land;
      }
    }

    // How far each cell stands above its surroundings. A blob is brighter than what lies on every side of it;
    // the bright side of an edge is brighter than one side only. So each cell is measured against the
    // brightest of four averages: of what lies to its left, to its right, above it and below it, each a step
    // away so that a blob a few cells across still stands clear, and each about a degree of the view deep.
    // Land is measured against land and sky against sky: snow on a summit stands out from the rock round it,
    // whatever the sky behind is doing, and a star from the sky, however near the ridge. The ridge itself is
    // measured against the sky, which only something brighter than both can outshine: a planet rising.
    const reach = Math.max(4, Math.round(g.scale / cellX));
    const tally = new Uint32Array(250); // how many cells stand out by each five-hundredth, up to a half
    let count = 0;
    const gauge = (wanted, sums, counts) => {
      /** The average over the cells of this kind between four corners, or -1 where under an eighth are of it. */
      const mean = (a, b, c, d, cells) => {
        const own = counts[d] - counts[b] - counts[c] + counts[a];
        return own < 4 || own * 8 < cells ? -1 : (sums[d] - sums[b] - sums[c] + sums[a]) / own;
      };
      for (let y = 2; y < ah - 2; y++) {
        const top = Math.max(0, y - reach);
        const bottom = Math.min(ah, y + reach + 1);
        const t0 = top * stride;
        const b0 = bottom * stride;
        const above = (y - 1) * stride;
        const below = (y + 2) * stride;
        for (let x = 2; x < aw - 2; x++) {
          const i = y * aw + x;
          if (kind[i] !== wanted) continue;
          // The sun sits in its own glare, with nothing darker near it to be measured against. In the sky,
          // what is as bright as the picture can show stands out whatever is round it.
          if (white[i] && wanted !== LAND) {
            over[i] = 0.5;
            continue;
          }
          const l = Math.max(0, x - reach);
          const r = Math.min(aw, x + reach + 1);
          const around = Math.max(
            mean(t0 + l, t0 + x - 1, b0 + l, b0 + x - 1, (x - 1 - l) * (bottom - top)),
            mean(t0 + x + 2, t0 + r, b0 + x + 2, b0 + r, (r - x - 2) * (bottom - top)),
            mean(t0 + l, t0 + r, above + l, above + r, (r - l) * (y - 1 - top)),
            mean(below + l, below + r, b0 + l, b0 + r, (r - l) * (bottom - y - 2)),
          );
          if (around < 0) continue;
          const d = lum[i] - around;
          over[i] = d;
          count++;
          if (d > 0) tally[Math.min(249, Math.floor(d * 500))]++;
        }
      }
    };
    gauge(LAND, landSum, landCount);
    gauge(SKY, skySum, skyCount);
    gauge(RIDGE, skySum, skyCount);
    if (!count) return;
    // What counts as standing out depends on the picture: the bar sits where only one cell in a hundred clears
    // it. It is never below a small step, so a dark, even sky yields nothing rather than noise, and never so
    // high that glare would not clear it.
    let bar = 0.5;
    for (let i = 249, above = 0; i >= 0; i--) {
      above += tally[i];
      if (above > count * 0.01) break;
      bar = i / 500;
    }
    bar = clamp(bar, 0.025, 0.45);

    // Gather neighbouring cells that clear the bar into blobs.
    const blobs = [];
    const starts = [];
    for (let i = 0; i < n; i++) if (over[i] > bar) starts.push(i);
    for (const start of starts) {
      if (seen[start]) continue;
      seen[start] = 1;
      const members = [start];
      const b = { area: 0, glare: 0, mass: 0, sx: 0, sy: 0, x0: aw, x1: 0, y0: ah, y1: 0, peak: 0 };
      for (let m = 0; m < members.length; m++) {
        const i = members[m];
        const x = i % aw;
        const y = (i - x) / aw;
        const d = over[i];
        b.area++;
        if (white[i] && kind[i] !== LAND) b.glare++;
        b.mass += d;
        b.sx += d * x;
        b.sy += d * y;
        if (d > b.peak) b.peak = d;
        if (x < b.x0) b.x0 = x;
        if (x > b.x1) b.x1 = x;
        if (y < b.y0) b.y0 = y;
        if (y > b.y1) b.y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= ah) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= aw) continue;
            const j = ny * aw + nx;
            if (!seen[j] && over[j] > bar) {
              seen[j] = 1;
              members.push(j);
            }
          }
        }
      }
      // A whole bright hillside is not a blob, and neither is a long bright streak. Glare is, however wide.
      const across = b.x1 - b.x0 + 1;
      const down = b.y1 - b.y0 + 1;
      const glare = b.glare * 2 > b.area;
      if (!glare && (b.area > n * 0.01 || across > aw * 0.09 || across > down * 4 + 3 || down > across * 4 + 3)) continue;
      b.score = b.peak * (1 + Math.log2(1 + b.area));
      blobs.push(b);
    }
    blobs.sort((a, b) => b.score - a.score);

    // The strongest, kept apart from each other, in the page's own pixels and as directions. A box marks where
    // a thing is, not how far it spreads: none is more than a degree and a quarter of the view across.
    const toX = cellX / k;
    const toY = cellY / k;
    const gap = Math.max(44, box.width * 0.055);
    const widest = (1.25 * g.scale) / k;
    const next = [];
    for (const b of blobs) {
      const find = {
        x: (b.sx / b.mass + 0.5) * toX,
        y: (b.sy / b.mass + 0.5) * toY,
        w: Math.min(widest, (b.x1 - b.x0 + 1) * toX),
        h: Math.min(widest, (b.y1 - b.y0 + 1) * toY),
        score: b.score,
      };
      if (!next.every((other) => apart(find, other, gap))) continue;
      find.az = g.az0 + (find.x * k) / g.scale;
      find.alt = (g.horizon - find.y * k) / g.scale;
      find.name = nameAt(find.az, find.alt);
      next.push(find);
      if (next.length === 18) break;
    }
    grid = { aw, ah, toX, toY };
    finds = next;
    anchors = next.length ? [next[0], next.find((f) => apart(f, next[0], box.width / 3))].filter(Boolean) : [];
    follow(performance.now());
    wake();
  }

  function nameAt(az, alt) {
    if (sun && Math.abs(sun.azimuth - az) < 0.9 && Math.abs(sun.elevation - alt) < 0.9) return "The sun";
    if (moon && Math.abs(moon.azimuth - az) < 0.9 && Math.abs(moon.elevation - alt) < 0.9) return "The moon";
    for (const mark of landmarks) {
      if (Math.abs(mark.azimuth - az) < 0.8 && Math.abs(mark.altitude - alt) < 0.7) return mark.name;
    }
    return "";
  }

  /** Keeps each box on its blob, lets go of blobs that have gone, and takes up new ones in turn. */
  function follow(now) {
    const free = new Set(finds);
    for (const t of tracks) {
      if (t.leaving) continue;
      let best = null;
      let near = 34 * 34;
      for (const f of free) {
        const d = (f.x - t.tx) ** 2 + (f.y - t.ty) ** 2;
        if (d < near) {
          near = d;
          best = f;
        }
      }
      if (best) {
        free.delete(best);
        Object.assign(t, { tx: best.x, ty: best.y, tw: best.w, th: best.h, az: best.az, alt: best.alt, name: best.name, missed: 0 });
      } else if (++t.missed >= 2) {
        release(t, now);
      }
    }
    const want = box.width < 640 ? SLOTS.narrow : SLOTS.wide;
    let held = live().length;
    const gap = Math.max(60, box.width * 0.07);
    // The anchors come first and are never let go; after them, those it has not followed lately.
    const turnOf = (f) => (anchors.includes(f) ? -1 : followed.get(place(f)) || 0);
    const queue = [...free].sort((a, b) => turnOf(a) - turnOf(b) || b.score - a.score);
    let delay = 0;
    for (const f of queue) {
      if (held >= want) break;
      if (!live().every((t) => apart(f, { x: t.tx, y: t.ty }, gap))) continue;
      tracks.push({ x: f.x, y: f.y, w: f.w, h: f.h, tx: f.x, ty: f.y, tw: f.w, th: f.h, az: f.az, alt: f.alt, name: f.name, born: now + delay, leaving: 0, missed: 0 });
      followed.set(place(f), now);
      delay += 140;
      held++;
    }
  }

  function release(track, now) {
    track.leaving = now;
    followed.set(place({ x: track.tx, y: track.ty }), now);
  }

  /** Lets the one it has held longest go, when there is another waiting. */
  function turn() {
    if (!enabled || !visible || document.hidden || calm.matches) return;
    const now = performance.now();
    if (now - lastScene < 1500) return; // the hour is being moved: the picture is doing the changing
    const held = live();
    const gap = Math.max(60, box.width * 0.07);
    const another = finds.some((f) => held.every((t) => apart(f, { x: t.tx, y: t.ty }, gap)));
    const loose = held.filter((t) => anchors.every((f) => apart(f, { x: t.tx, y: t.ty }, 34)));
    if (!another || !loose.length) return;
    release(loose.reduce((a, b) => (a.born <= b.born ? a : b)), now);
    follow(now);
    wake();
  }

  /* ---------- Drawing ---------- */

  /**
   * A white line with a dark edge, so it reads over snow and over a night sky alike; or, where the picture is
   * too bright for white, as round the sun, a dark line with a light edge.
   */
  function line(alpha, path, onLight = false) {
    ctx.beginPath();
    path();
    ctx.lineWidth = 3;
    ctx.strokeStyle = onLight ? `rgba(255, 255, 255, ${0.3 * alpha})` : `rgba(${INK}, ${0.24 * alpha})`;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = onLight ? `rgba(${INK}, ${0.85 * alpha})` : `rgba(255, 255, 255, ${0.92 * alpha})`;
    ctx.stroke();
  }

  function write(text, x, y, alpha, align, onLight = false) {
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = onLight ? `rgba(255, 255, 255, ${0.55 * alpha})` : `rgba(${INK}, ${0.5 * alpha})`;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = onLight ? `rgba(${INK}, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
    ctx.fillText(text, x, y);
  }

  /** How bright the picture was under a point of the page when it was last read, from 0 to 1. */
  function brightness(x, y) {
    if (!grid || !work) return 0;
    const column = clamp(Math.floor(x / grid.toX), 0, grid.aw - 1);
    const row = clamp(Math.floor(y / grid.toY), 0, grid.ah - 1);
    return work.lum[row * grid.aw + column];
  }

  /** Whether a rectangle of the page lies wholly over the view: clear of the plaster, the hero's edges and its links. */
  function overView({ x0, x1, y0, y1 }) {
    if (!geometry || x0 < 6 || x1 > box.width - 6 || y0 < 6) return false;
    const k = geometry.width / box.width;
    if (clear.some((r) => x1 * k > r.x0 && x0 * k < r.x1 && y1 * k > r.y0 && y0 * k < r.y1)) return false;
    for (const fx of [0, 0.5, 1]) {
      for (const fy of [0, 1]) {
        if (!open((x0 + (x1 - x0) * fx) * k, (y0 + (y1 - y0) * fy) * k, 2 * k)) return false;
      }
    }
    return true;
  }

  /** Digits that have not settled yet, for the moment a box arrives. */
  function settling(text, now, since) {
    const age = now - since;
    if (calm.matches || age > 620) return text;
    const tick = Math.floor(now / 55);
    let i = 0;
    return text.replace(/\d/g, (digit) => {
      i++;
      // Settle from the left.
      if (age > 260 + i * 60) return digit;
      return String((tick * 7 + i * 13) % 10);
    });
  }

  function draw(now) {
    frame = 0;
    const dt = Math.min(80, now - lastFrame || 16);
    lastFrame = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    if (!enabled) return;
    let moving = false;
    const pull = calm.matches ? 1 : 1 - Math.exp(-dt / 110);

    const nodes = [];
    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      for (const [cur, goal] of [["x", "tx"], ["y", "ty"], ["w", "tw"], ["h", "th"]]) {
        t[cur] += (t[goal] - t[cur]) * pull;
        if (Math.abs(t[goal] - t[cur]) > 0.2) moving = true;
      }
      let presence;
      if (t.leaving) {
        presence = calm.matches ? 0 : 1 - (now - t.leaving) / LEAVE;
        if (presence <= 0) {
          tracks.splice(i, 1);
          continue;
        }
        moving = true;
      } else {
        presence = calm.matches ? 1 : (now - t.born) / ARRIVE;
        if (presence < 1 || now - t.born < 700) moving = true;
      }
      t.presence = clamp(presence, 0, 1);
      if (t.presence > 0) nodes.push(t);
    }

    if (pointer) {
      const goal = pointer.inside ? 1 : 0;
      pointer.presence += (goal - pointer.presence) * (calm.matches ? 1 : 1 - Math.exp(-dt / 90));
      if (Math.abs(goal - pointer.presence) > 0.02) moving = true;
      else pointer.presence = goal;
      if (pointer.presence > 0.02) nodes.push(pointer);
    }

    // The other things it has found and is not following: a small mark each.
    const gap = Math.max(60, box.width * 0.07);
    for (const f of finds) {
      if (!tracks.every((t) => apart(f, { x: t.tx, y: t.ty }, gap * 0.6))) continue;
      const x = Math.round(f.x) + 0.5;
      const y = Math.round(f.y) + 0.5;
      line(0.5, () => ctx.rect(x - 3, y - 3, 6, 6));
    }

    // Join what is being followed with the shortest set of lines that reaches all of it.
    if (nodes.length > 1) {
      const linked = [nodes[0]];
      const rest = nodes.slice(1);
      while (rest.length) {
        let best = null;
        for (const a of linked) {
          for (let j = 0; j < rest.length; j++) {
            const d = (a.x - rest[j].x) ** 2 + (a.y - rest[j].y) ** 2;
            if (!best || d < best.d) best = { a, j, d };
          }
        }
        const b = rest.splice(best.j, 1)[0];
        linked.push(b);
        const alpha = 0.62 * Math.min(best.a.presence, b.presence);
        line(alpha, () => {
          ctx.moveTo(best.a.x, best.a.y);
          ctx.lineTo(b.x, b.y);
        });
      }
    }

    ctx.font = '600 10.5px "Archivo", system-ui, sans-serif';
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.3px";
    // Boxes first, so that no label is put over a box drawn after it.
    const taken = nodes.filter((t) => t !== pointer).map((t) => {
      const w = Math.max(13, t.tw + 8);
      const h = Math.max(13, t.th + 8);
      return { x0: t.x - w / 2, x1: t.x + w / 2, y0: t.y - h / 2, y1: t.y + h / 2, of: t };
    });
    const free = (spot, t) => taken.every((r) => r.of === t || spot.x1 < r.x0 - 3 || spot.x0 > r.x1 + 3 || spot.y1 < r.y0 - 2 || spot.y0 > r.y1 + 2);
    for (const t of nodes) {
      const shown = t === pointer ? t.presence : easeOut(t.presence);
      const grow = t === pointer || t.leaving ? 1 : 1 + (1 - shown) * 1.3;
      const w = Math.max(13, t.w + 8) * grow;
      const h = Math.max(13, t.h + 8) * grow;
      const x = Math.round(t.x - w / 2) + 0.5;
      const y = Math.round(t.y - h / 2) + 0.5;
      // Over a bright part of the picture the box and its words are drawn dark: judged at the box's corners,
      // since the middle of it is bright by definition.
      const onLight = (brightness(x, y) + brightness(x + w, y) + brightness(x, y + h) + brightness(x + w, y + h)) / 4 > 0.74;
      if (t === pointer) {
        // Where the reader points: a cross, and what direction that is.
        line(shown, () => {
          ctx.moveTo(t.x - 7, t.y);
          ctx.lineTo(t.x - 2, t.y);
          ctx.moveTo(t.x + 2, t.y);
          ctx.lineTo(t.x + 7, t.y);
          ctx.moveTo(t.x, t.y - 7);
          ctx.lineTo(t.x, t.y - 2);
          ctx.moveTo(t.x, t.y + 2);
          ctx.lineTo(t.x, t.y + 7);
        }, onLight);
      } else {
        line(shown, () => ctx.rect(x, y, Math.round(w), Math.round(h)), onLight);
      }
      const words = clamp((t.presence - 0.35) / 0.65, 0, 1);
      if (words <= 0) continue;
      const numbers = `${bearing(t.az)} ${height(t.alt)}`;
      const text = t === pointer || t.leaving ? numbers : settling(numbers, now, t.born);
      const lines = t.name ? [t.name, text] : [text];
      const wide = Math.max(...lines.map((s) => ctx.measureText(numbers.length > s.length ? numbers : s).width));
      const tall = lines.length * 13;
      const right = x + Math.round(w);
      const bottom = y + Math.round(h);
      // Beside the box if the view shows there, else above or below it: the words never go behind the name.
      const spots = [
        { x: right + 6, y: y + 9, align: "left", x0: right + 6, x1: right + 6 + wide, y0: y, y1: y + tall },
        { x: x - 6, y: y + 9, align: "right", x0: x - 6 - wide, x1: x - 6, y0: y, y1: y + tall },
        { x: t.x, y: y - tall + 6, align: "center", x0: t.x - wide / 2, x1: t.x + wide / 2, y0: y - tall - 4, y1: y - 4 },
        { x: t.x, y: bottom + 13, align: "center", x0: t.x - wide / 2, x1: t.x + wide / 2, y0: bottom + 4, y1: bottom + 4 + tall },
      ];
      // No room for the words: the box goes without them.
      const spot = spots.find((s) => overView(s) && free(s, t));
      if (!spot) continue;
      taken.push({ ...spot, of: null });
      lines.forEach((s, i) => write(s, spot.x, spot.y + i * 13, words, spot.align, onLight));
    }

    // Rub out whatever fell on the plaster, so everything passes behind the name.
    if (cover) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(cover, 0, 0, box.width, box.height);
      ctx.globalCompositeOperation = "source-over";
    }

    if (moving) wake();
  }

  function wake() {
    if (!frame && enabled && visible) frame = requestAnimationFrame(draw);
  }

  function wipe() {
    cancelAnimationFrame(frame);
    frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.width, layer.height);
  }

  function rhythm() {
    clearInterval(turnTimer);
    turnTimer = enabled && visible ? setInterval(turn, DWELL) : 0;
  }

  /* ---------- The reader's pointer ---------- */

  function point(event) {
    if (!geometry || !coverData || !enabled || event.pointerType !== "mouse" || !mouse.matches) return;
    const g = geometry;
    const k = g.width / box.width;
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const overControl = event.target instanceof Element && event.target.closest("a, button, input");
    const inside = !overControl && x > 0 && x < box.width && y > 0 && y * k < g.plaster.parapet && open(x * k, y * k, 4 * k);
    if (!pointer) pointer = { x, y, w: 0, h: 0, presence: 0, inside: false, name: "" };
    pointer.inside = inside;
    if (inside) {
      Object.assign(pointer, { x, y, az: g.az0 + (x * k) / g.scale, alt: (g.horizon - y * k) / g.scale });
    }
    wake();
  }
  root.addEventListener("pointermove", point);
  root.addEventListener("pointerleave", () => {
    if (pointer) pointer.inside = false;
    wake();
  });
  // The page scrolls under a still pointer; the box it was measured against has moved.
  addEventListener("scroll", () => {
    box = layer.getBoundingClientRect();
    if (pointer?.inside) {
      pointer.inside = false;
      wake();
    }
  }, { passive: true });
  document.addEventListener("visibilitychange", rhythm);

  measure();
  rhythm();

  return {
    /** The scene has just been drawn: `g` is its camera, `light` what lights it, `keepClear` where not to pick. */
    scene(g, light, keepClear = []) {
      if (g !== geometry) {
        geometry = g;
        measure();
        outline(g);
      }
      clear = keepClear;
      sun = light?.sun && light.sun.elevation > -1 ? light.sun : null;
      moon = light?.moon && light.moon.elevation > -1 ? light.moon : null;
      lastScene = performance.now();
      pictures++;
      lookSoon();
    },
    /** The hero has changed size: start again from the next picture. */
    resize() {
      measure();
      tracks.length = 0;
      finds = [];
      anchors = [];
      plan = null;
      grid = null;
      wake();
    },
    setVisible(value) {
      visible = value;
      rhythm();
      if (visible) wake();
    },
    setEnabled(value) {
      enabled = value;
      rhythm();
      if (enabled) {
        tracks.length = 0;
        look();
      } else {
        wipe();
      }
    },
    get enabled() {
      return enabled;
    },
  };
}
