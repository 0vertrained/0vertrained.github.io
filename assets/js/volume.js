// 0VERTRAINED's weekly volume audit, drawn with an example week: each muscle's sets against the least
// that grows it (MEV), the range where growth is best (MAV) and the most a lifter can recover from (MRV).
// The chart is drawn at its real pixel width, so its type stays the same size on a phone and a desktop.

const WEEK = [
  { name: "Chest", sets: 14, mev: 8, mav: [12, 20], mrv: 22 },
  { name: "Back", sets: 18, mev: 10, mav: [14, 22], mrv: 25 },
  { name: "Quads", sets: 12, mev: 8, mav: [12, 18], mrv: 20 },
  { name: "Hamstrings", sets: 9, mev: 6, mav: [10, 16], mrv: 20 },
  { name: "Side delts", sets: 18, mev: 8, mav: [16, 22], mrv: 26 },
  { name: "Biceps", sets: 21, mev: 8, mav: [14, 20], mrv: 26 },
];
const MAX = 28;
const SVG = "http://www.w3.org/2000/svg";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function el(name, attributes, parent, text) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}

const verdict = (muscle) => {
  if (muscle.sets > muscle.mav[1]) return ", above its best range";
  if (muscle.sets < muscle.mav[0]) return ", below its best range";
  return "";
};

function draw(svg, width) {
  svg.querySelectorAll("g").forEach((g) => g.remove());
  const narrow = width < 560;
  const left = narrow ? 0 : 128;
  const right = narrow ? width : width - 210;
  const x = (sets) => left + ((right - left) * sets) / MAX;
  const rowHeight = narrow ? 58 : 40;
  const top = narrow ? 62 : 58;
  const chart = el("g", {}, svg);

  for (const sets of [0, 10, 20]) {
    const anchor = narrow && sets === 0 ? "start" : "middle";
    el("text", { x: x(sets), y: 14, "text-anchor": anchor }, chart, sets === 20 ? "20 sets" : String(sets));
    el("line", { x1: x(sets), x2: x(sets), y1: 22, y2: top + WEEK.length * rowHeight - 18, class: "volume__grid" }, chart);
  }

  WEEK.forEach((muscle, i) => {
    const y = top + i * rowHeight + (narrow ? 18 : 0);
    const row = el("g", {}, chart);
    if (narrow) {
      el("text", { x: 0, y: y - 12, class: "volume__name" }, row, muscle.name);
      el("text", { x: width, y: y - 12, "text-anchor": "end", class: "volume__value" }, row, `${muscle.sets}${verdict(muscle)}`);
    } else {
      el("text", { x: 0, y: y + 10, class: "volume__name" }, row, muscle.name);
      el("text", { x: right + 24, y: y + 10, class: "volume__value" }, row, `${muscle.sets}${verdict(muscle)}`);
    }
    el("rect", { x: x(0), y: y - 4, width: x(MAX) - x(0), height: 20, rx: 3, class: "volume__track" }, row);
    el("rect", { x: x(muscle.mav[0]), y: y - 4, width: x(muscle.mav[1]) - x(muscle.mav[0]), height: 20, class: "volume__band" }, row);
    for (const limit of [muscle.mev, muscle.mrv]) {
      el("line", { x1: x(limit), x2: x(limit), y1: y - 8, y2: y + 20, class: "volume__limit" }, row);
    }
    const bar = el("rect", {
      x: x(0), y: y + 1, width: x(muscle.sets) - x(0), height: 10, rx: 2,
      class: `volume__bar${muscle.sets > muscle.mav[1] ? " volume__bar--over" : ""}`,
    }, row);
    bar.style.transitionDelay = `${i * 70}ms`;
    if (i === 0 && !narrow) {
      for (const [label, at] of [["MEV", muscle.mev], ["MAV", (muscle.mav[0] + muscle.mav[1]) / 2], ["MRV", muscle.mrv]]) {
        el("text", { x: x(at), y: y - 14, "text-anchor": "middle" }, row, label);
      }
    }
  });
  svg.setAttribute("viewBox", `0 0 ${width} ${top + WEEK.length * rowHeight - 8}`);
}

export function initVolume(figure) {
  const svg = figure.querySelector("[data-volume-chart]");
  let width = 0;
  const redraw = () => {
    const next = Math.round(svg.getBoundingClientRect().width);
    if (!next || next === width) return;
    width = next;
    draw(svg, width);
  };
  redraw();
  new ResizeObserver(redraw).observe(svg);

  if (reducedMotion.matches) return;
  figure.dataset.state = "ready";
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      requestAnimationFrame(() => figure.removeAttribute("data-state"));
    },
    { threshold: 0.45 },
  );
  observer.observe(figure);
}
