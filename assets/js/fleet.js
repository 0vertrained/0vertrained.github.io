// Lattice's first milestone, simulated: missions leave the queue as numbered commands, one body is
// interrupted and its mission requeued and reassigned, and a late report on the old command is refused.
// A wide layout runs left to right; on a phone the same story runs top to bottom, so the type stays legible.

const SVG = "http://www.w3.org/2000/svg";
const LOOP = 15;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const LAYOUTS = {
  wide: {
    width: 640, height: 340, chip: 92,
    queue: (i) => [62, 74 + i * 40], queueLabel: [62, 40],
    core: [252, 163],
    body: (i) => ({ x: 494, y: 38 + i * 70, w: 108, h: 40 }), bodiesLabel: [548, 26],
    at: (i) => [432, 58 + i * 70],
  },
  tall: {
    width: 360, height: 452, chip: 84,
    queue: (i) => [48 + i * 88, 52], queueLabel: [20, 22],
    core: [180, 176],
    body: (i) => ({ x: 248, y: 262 + i * 50, w: 104, h: 36 }), bodiesLabel: [300, 248],
    at: (i) => [170, 280 + i * 50],
  },
};

const EVENTS = [
  [0.6, "Command 41 sends M-07 to body 1"],
  [1.8, "Command 42 sends M-08 to body 2"],
  [3.0, "Command 43 sends M-09 to body 3"],
  [4.2, "Command 44 sends M-10 to body 4"],
  [5.6, "Body 3 is interrupted, and M-09 goes back to the queue"],
  [8.0, "Body 3 is back online"],
  [8.4, "Body 1 finishes M-07, and its result is accepted"],
  [9.6, "Command 45 sends M-09 to body 1"],
  [11.8, "Body 3 reports on command 43, and is refused: that mission was reassigned"],
];

/** Each chip's path through the simulation, in the given layout. */
function chipsFor({ queue: Q, core, at }) {
  return [
    { keys: [[0, ...Q(0)], [0.6, ...Q(0)], [1.2, ...core], [1.8, ...at(0)]], labels: [[0, "M-07"], [0.6, "M-07 #41"]], out: 8.4 },
    { keys: [[0, ...Q(1)], [1.8, ...Q(1)], [2.4, ...core], [3.0, ...at(1)]], labels: [[0, "M-08"], [1.8, "M-08 #42"]] },
    {
      keys: [[0, ...Q(2)], [3.0, ...Q(2)], [3.6, ...core], [4.2, ...at(2)], [5.8, ...at(2)], [6.4, ...core], [7.0, ...Q(0)],
        [9.6, ...Q(0)], [10.2, ...core], [10.8, ...at(0)]],
      labels: [[0, "M-09"], [3.0, "M-09 #43"], [5.6, "M-09"], [9.6, "M-09 #45"]],
    },
    { keys: [[0, ...Q(3)], [4.2, ...Q(3)], [4.8, ...core], [5.4, ...at(3)]], labels: [[0, "M-10"], [4.2, "M-10 #44"]] },
    { keys: [[11.8, ...at(2)], [12.6, ...core]], labels: [[11.8, "#43 report"], [12.6, "#43 refused"]], in: 11.8, out: 13.2, refusedAt: 12.6 },
  ];
}

function el(name, attributes, parent, text) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}

function position(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i];
    if (t <= t1) {
      const [t0, x0, y0] = keys[i - 1];
      const k = ease((t - t0) / (t1 - t0));
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
  }
  return keys[keys.length - 1].slice(1);
}

const labelAt = (labels, t) => labels.reduce((label, [at, text]) => (t >= at ? text : label), labels[0][1]);

/** Draws the static scene for a layout and returns the moving parts. */
function build(map, layout) {
  map.replaceChildren();
  map.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  const { core } = layout;
  el("text", { x: layout.queueLabel[0], y: layout.queueLabel[1], "text-anchor": layout === LAYOUTS.wide ? "middle" : "start", class: "fleet__label" }, map, "Queue");
  el("text", { x: layout.bodiesLabel[0], y: layout.bodiesLabel[1], "text-anchor": "middle", class: "fleet__label" }, map, "Bodies");
  for (let i = 0; i < 4; i++) {
    const box = layout.body(i);
    el("line", { x1: core[0], y1: core[1], x2: box.x, y2: box.y + box.h / 2, class: "fleet__wire" }, map);
  }
  el("line", { x1: layout.queue(0)[0], y1: layout.queue(0)[1], x2: core[0], y2: core[1], class: "fleet__wire" }, map);
  el("circle", { cx: core[0], cy: core[1], r: 40, class: "fleet__core" }, map);
  el("text", { x: core[0], y: core[1] - 3, "text-anchor": "middle", class: "fleet__core-text" }, map, "Lattice");
  el("text", { x: core[0], y: core[1] + 12, "text-anchor": "middle", class: "fleet__core-text" }, map, "core");
  const bodies = [0, 1, 2, 3].map((i) => {
    const box = layout.body(i);
    const g = el("g", { class: "fleet__body" }, map);
    el("rect", { x: box.x, y: box.y, width: box.w, height: box.h, rx: 6 }, g);
    el("text", { x: box.x + box.w / 2, y: box.y + box.h / 2 + 4, "text-anchor": "middle" }, g, `Body ${i + 1}`);
    return g;
  });
  const chips = chipsFor(layout).map((chip) => {
    const g = el("g", { class: "fleet__chip" }, map);
    el("rect", { x: -layout.chip / 2, y: -13, width: layout.chip, height: 26, rx: 13 }, g);
    const text = el("text", { x: 0, y: 4, "text-anchor": "middle" }, g, chip.labels[0][1]);
    return { ...chip, g, text };
  });
  return { bodies, chips };
}

export function initFleet(figure) {
  const map = figure.querySelector("[data-fleet-map]");
  const log = figure.querySelector("[data-fleet-log]");
  const toggle = figure.querySelector("[data-fleet-toggle]");
  let layout = null;
  let scene = null;
  let t = reducedMotion.matches ? 12.9 : 0; // reduced motion: a still frame with everything that happens
  let shown = -1;

  function draw() {
    for (const chip of scene.chips) {
      const [x, y] = position(chip.keys, t);
      let opacity = 1;
      if (chip.in !== undefined) opacity = Math.min(opacity, Math.max(0, (t - chip.in) / 0.25));
      if (chip.out !== undefined) opacity = Math.min(opacity, Math.max(0, 1 - (t - chip.out) / 0.45));
      const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)})`;
      if (transform !== chip.transform) chip.g.setAttribute("transform", (chip.transform = transform));
      const fade = opacity.toFixed(2);
      if (fade !== chip.fade) chip.g.style.opacity = chip.fade = fade;
      const label = labelAt(chip.labels, t);
      if (label !== chip.label) chip.text.textContent = chip.label = label;
      chip.g.classList.toggle("is-refused", chip.refusedAt !== undefined && t >= chip.refusedAt);
    }
    scene.bodies[2].classList.toggle("is-interrupted", t >= 5.6 && t < 8.0);
    scene.bodies[0].classList.toggle("is-done", t >= 8.4 && t < 9.4);
    const count = EVENTS.filter(([at]) => t >= at).length;
    if (count !== shown) {
      shown = count;
      log.replaceChildren(...EVENTS.slice(0, count).map(([, text], i) => {
        const item = document.createElement("li");
        item.textContent = text;
        if (i === count - 1) item.className = "is-new";
        return item;
      }));
    }
  }

  function fit() {
    const next = figure.getBoundingClientRect().width < 560 ? LAYOUTS.tall : LAYOUTS.wide;
    if (next === layout) return;
    layout = next;
    scene = build(map, layout);
    draw();
  }

  let playing = !reducedMotion.matches;
  let visible = false;
  let frame = 0;
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    if (t >= LOOP) {
      t = 0;
      shown = -1;
    }
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    if (playing && visible) frame = requestAnimationFrame(tick);
    toggle.textContent = playing ? "Pause" : "Play";
    toggle.setAttribute("aria-pressed", String(!playing));
  }

  toggle.addEventListener("click", () => {
    playing = !playing;
    sync();
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }, { threshold: 0.2 }).observe(figure);
  new ResizeObserver(fit).observe(figure);
  fit();
  sync();
}
