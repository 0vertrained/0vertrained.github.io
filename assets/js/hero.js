import { SANTA_FE, groundBrightness, lightAt, localMidnight, sunPosition, sunTimes } from "./sky.js";
import { createRelief } from "./relief.js";

const COMPASS = [
  "north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast",
  "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest",
];
const compass = (azimuth) => COMPASS[Math.round(azimuth / 22.5) % 16];
const clock = new Intl.DateTimeFormat("en-US", { timeZone: SANTA_FE.timeZone, hour: "numeric", minute: "2-digit" });
const formatTime = (date) => clock.format(date).replace(/\s?([AP])M$/, (_, x) => ` ${x.toLowerCase()}m`);
const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: SANTA_FE.timeZone, hour: "2-digit", minute: "2-digit" });
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const PATH_TOP = 80; // the sun path graph spans 80° above the horizon
const PATH_BOTTOM = -32; // and, compressed, the whole night below it
const BELOW = 0.4; // how much the night half of the graph is compressed

/** Minutes in the local day that starts at `midnight`: 1440, or 1380 and 1500 on the days the clocks change. */
function dayLength(midnight) {
  const next = localMidnight(new Date(midnight.getTime() + 26 * 3600000));
  return Math.round((next - midnight) / 60000);
}

function describe(date, light, live, times) {
  const when = live ? `Santa Fe right now, ${formatTime(date)}` : `Santa Fe at ${formatTime(date)}`;
  const { sun, moon } = light;
  if (sun.elevation > -0.27) {
    const height = Math.max(0, Math.round(sun.elevation));
    return `${when}: lit by the sun, ${height}° above the horizon in the ${compass(sun.azimuth)}.`;
  }
  const afterSunset = times.sunset && date > times.sunset;
  if (sun.elevation > -6) {
    if (afterSunset) return `${when}: the sun set at ${formatTime(times.sunset)}, and the sky is still light.`;
    if (times.sunrise) return `${when}: the sky is getting light. The sun rises at ${formatTime(times.sunrise)}.`;
  }
  if (sun.elevation > -12 && light.key !== "moon") {
    if (afterSunset) return `${when}: the sun set at ${formatTime(times.sunset)}, and the last of its light is leaving the sky.`;
    if (times.sunrise) return `${when}: the first light is in the sky. The sun rises at ${formatTime(times.sunrise)}.`;
  }
  if (light.key === "moon") {
    const lit = Math.round(moon.illumination * 100);
    return `${when}: lit by the moon, ${lit}% full and ${Math.round(moon.elevation)}° up in the ${compass(moon.azimuth)}.`;
  }
  return `${when}: the sun and the moon are both down, and only the sky lights it.`;
}

/** The long, soft shadow the flat version of the name casts when WebGL isn't there. */
function paintFlat(element, light) {
  const [x, y, z] = light.direction;
  const run = Math.hypot(x, y) || 1;
  const length = Math.min(34, 7 / Math.max(z / run, 0.2));
  const dx = -x / run;
  const dy = -y / run;
  const layers = [];
  for (let i = 1; i <= 16; i++) {
    const k = (i / 16) * length;
    layers.push(`${(dx * k).toFixed(1)}px ${(dy * k).toFixed(1)}px ${(i / 6).toFixed(1)}px rgb(16 22 30 / 0.07)`);
  }
  element.style.textShadow = layers.join(",");
}

export function initHero(root) {
  const canvas = root.querySelector("[data-relief]");
  const flat = root.querySelector("[data-relief-flat]");
  const caption = root.querySelector("[data-light-caption]");
  const range = root.querySelector("[data-light-time]");
  const nowButton = root.querySelector("[data-light-now]");
  const graph = root.querySelector("[data-sun-path]");
  const marker = root.querySelector("[data-sun-marker]");
  const riseLabel = root.querySelector("[data-sunrise]");
  const setLabel = root.querySelector("[data-sunset]");

  let midnight = localMidnight(new Date());
  let day = dayLength(midnight);
  let times = sunTimes(midnight);
  let minutes = 0;
  let live = true;
  let tween = null;
  let relief = null;
  let visible = true;
  let pendingDraw = false;

  const minutesNow = () => (Date.now() - midnight.getTime()) / 60000;
  const at = (m) => new Date(midnight.getTime() + m * 60000);
  const toY = (elevation) => {
    const e = elevation >= 0 ? elevation : elevation * BELOW;
    return (PATH_TOP - Math.max(PATH_BOTTOM, Math.min(PATH_TOP, e))) / (PATH_TOP - PATH_BOTTOM);
  };

  function drawPath() {
    const points = [];
    for (let m = 0; m <= day; m += 6) {
      points.push(`${((m / day) * 1440).toFixed(1)},${(toY(sunPosition(at(m)).elevation) * 100).toFixed(2)}`);
    }
    const horizon = (toY(0) * 100).toFixed(2);
    graph.querySelector("[data-path-all]").setAttribute("points", points.join(" "));
    graph.querySelector("[data-path-day]").setAttribute("points", points.join(" "));
    graph.querySelector("[data-horizon-clip]").setAttribute("height", horizon);
    const line = graph.querySelector("[data-horizon-line]");
    line.setAttribute("y1", horizon);
    line.setAttribute("y2", horizon);
    const place = (label, date) => {
      if (!label) return;
      label.hidden = !date;
      if (!date) return;
      label.textContent = formatTime(date);
      label.style.left = `${((date - midnight) / 60000 / day) * 100}%`;
    };
    place(riseLabel, times.sunrise);
    place(setLabel, times.sunset);
    root.style.setProperty("--horizon", `${toY(0) * 100}%`);
  }

  function render() {
    pendingDraw = false;
    const date = at(minutes);
    const light = lightAt(date);
    if (relief) relief.draw(light);
    else if (flat) paintFlat(flat, light);
    root.classList.toggle("hero--dark", groundBrightness(light) < 0.5);
    caption.textContent = describe(date, light, live, times);
    range.value = String(Math.round(minutes));
    range.setAttribute("aria-valuetext", formatTime(date));
    marker.style.left = `${(minutes / day) * 100}%`;
    marker.style.top = `${toY(light.sun.elevation) * 100}%`;
    marker.dataset.below = String(light.sun.elevation < 0);
  }

  function schedule() {
    if (!visible || pendingDraw) return;
    pendingDraw = true;
    requestAnimationFrame(render);
  }

  function setMinutes(m, { follow = false } = {}) {
    minutes = Math.max(0, Math.min(day - 1, m));
    live = follow;
    // While the light is on its way back to now, there is nothing to go back to.
    nowButton.hidden = live || Boolean(tween?.follow);
    schedule();
  }

  function stopTween() {
    if (tween) cancelAnimationFrame(tween.frame);
    tween = null;
  }

  function animateTo(target, duration, { follow }) {
    stopTween();
    if (reducedMotion.matches || duration <= 0) {
      setMinutes(target, { follow });
      return;
    }
    const from = minutes;
    const started = performance.now();
    tween = { frame: 0, follow };
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      setMinutes(from + (target - from) * easeInOut(t), { follow: t === 1 && follow });
      if (t < 1) tween.frame = requestAnimationFrame(step);
      else tween = null;
    };
    tween.frame = requestAnimationFrame(step);
  }

  function writeHash() {
    const url = new URL(location.href);
    url.hash = live ? "" : `light=${hhmm.format(at(minutes))}`;
    history.replaceState(null, "", url.hash ? url : url.pathname + url.search);
  }

  /** Minutes after midnight for a wall-clock time today, allowing for a clock change during the day. */
  function hashMinutes() {
    const match = /light=(\d{1,2}):(\d{2})/.exec(location.hash);
    if (!match) return null;
    const wanted = Number(match[1]) * 60 + Number(match[2]);
    if (Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    const [h, m] = hhmm.format(at(wanted)).split(":").map(Number);
    const shown = h * 60 + m;
    return Math.max(0, Math.min(day - 1, wanted + (wanted - shown)));
  }

  range.addEventListener("input", () => {
    stopTween();
    setMinutes(Number(range.value));
  });
  range.addEventListener("change", writeHash);
  nowButton.addEventListener("click", () => {
    animateTo(minutesNow(), 900, { follow: true });
    nowButton.hidden = true;
    history.replaceState(null, "", location.pathname + location.search);
    range.focus();
  });

  // Follow the clock while live, and start a new day after midnight.
  setInterval(() => {
    if (!live || tween) return;
    if (minutesNow() >= day) {
      midnight = localMidnight(new Date());
      day = dayLength(midnight);
      range.max = String(day - 1);
      times = sunTimes(midnight);
      drawPath();
    }
    setMinutes(minutesNow(), { follow: true });
  }, 30000);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  }).observe(root);

  range.max = String(day - 1);
  drawPath();
  const shared = hashMinutes();
  if (shared !== null) {
    minutes = shared;
    live = false;
  } else minutes = minutesNow();
  nowButton.hidden = live;
  render();

  // The relief: bake once fonts are ready, fade it in over the flat version, then let the light arrive.
  const bake = () => {
    const box = canvas.getBoundingClientRect();
    let scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const budget = 2.3e6;
    if (box.width * box.height * scale * scale > budget) scale = Math.sqrt(budget / (box.width * box.height));
    canvas.width = Math.max(1, Math.round(box.width * scale));
    canvas.height = Math.max(1, Math.round(box.height * scale));
    const narrow = box.width < 640;
    relief.bake({
      text: "RAMI",
      family: '"Archivo Relief", "Archivo", sans-serif',
      widthShare: narrow ? 0.86 : 0.74,
      heightShare: narrow ? 0.3 : 0.4,
      centreY: narrow ? 0.4 : 0.43,
    });
  };

  const start = async () => {
    relief = createRelief(canvas);
    if (!relief) return;
    try {
      await document.fonts.load('900 100px "Archivo Relief"');
    } catch {
      // The fallback stack still draws legible letters.
    }
    bake();
    render();
    root.classList.add("hero--relief");
    canvas.addEventListener("webglcontextlost", () => {
      relief = null;
      root.classList.remove("hero--relief");
      render();
    });
    let lastSize = [innerWidth, innerHeight];
    let resizeTimer = 0;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const [w, h] = lastSize;
        if (Math.abs(innerWidth - w) / w < 0.04 && Math.abs(innerHeight - h) / h < 0.15) return;
        lastSize = [innerWidth, innerHeight];
        if (relief) {
          bake();
          schedule();
        }
      }, 180);
    });
    if (shared === null && !reducedMotion.matches) {
      const target = minutesNow();
      const rise = times.sunrise ? (times.sunrise - midnight) / 60000 : null;
      const set = times.sunset ? (times.sunset - midnight) / 60000 : null;
      let from = Math.max(0, target - 240);
      if (rise !== null && set !== null && target > rise && target < set) from = rise - 20;
      else if (set !== null && target >= set) from = set - 75;
      minutes = from;
      render();
      animateTo(target, 3200, { follow: true });
    }
  };
  // Give the page its first paint before the CPU-heavy bake.
  (window.requestIdleCallback || ((fn) => setTimeout(fn, 60)))(() => start(), { timeout: 600 });
}
