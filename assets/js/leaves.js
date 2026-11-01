// What leaves the building: the identifiers are found inside the network, a copy of the referral crosses
// the network's edge, and on the way its identifiers become the de-identifier's tokens.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function initLeaves(figure) {
  const stage = figure.querySelector("[data-leaves-stage]");
  const source = figure.querySelector("[data-leaves-source]");
  const result = figure.querySelector("[data-leaves-result]");
  const checks = [...figure.querySelectorAll("[data-leaves-checks] > div")];
  const button = figure.querySelector("[data-leaves-run]");
  const marks = [...source.querySelectorAll("mark")];
  let run = 0;

  function reset() {
    figure.classList.remove("has-arrived");
    marks.forEach((mark) => mark.classList.remove("is-found"));
    checks.forEach((check) => check.classList.remove("is-shown"));
    stage.querySelectorAll(".leaves__copy").forEach((copy) => copy.remove());
  }

  function finish() {
    marks.forEach((mark) => mark.classList.add("is-found"));
    figure.classList.add("has-arrived");
    checks.forEach((check) => check.classList.add("is-shown"));
  }

  /** A copy of the referral whose identifiers can each turn into their token. */
  function makeCopy() {
    const copy = source.cloneNode(true);
    copy.removeAttribute("data-leaves-source");
    copy.className = "leaves__copy";
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("mark").forEach((mark) => {
      const swap = document.createElement("span");
      swap.className = "leaves__swap";
      const from = document.createElement("mark");
      from.className = "leaves__id is-found";
      from.textContent = mark.textContent;
      const to = document.createElement("span");
      to.className = "leaves__token";
      to.textContent = mark.dataset.token;
      swap.append(from, to);
      mark.replaceWith(swap);
    });
    return copy;
  }

  async function play() {
    const id = ++run;
    const current = () => id === run;
    reset();
    if (reducedMotion.matches) {
      finish();
      return;
    }
    for (const mark of marks) {
      await wait(170);
      if (!current()) return;
      mark.classList.add("is-found");
    }
    await wait(520);
    if (!current()) return;

    const copy = makeCopy();
    stage.append(copy);
    const box = stage.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    const to = result.getBoundingClientRect();
    // Offset by the copy's own padding, so its text starts exactly over the original's.
    const style = getComputedStyle(copy);
    const padX = parseFloat(style.paddingLeft);
    const padY = parseFloat(style.paddingTop);
    Object.assign(copy.style, {
      left: `${from.left - box.left - padX}px`,
      top: `${from.top - box.top - padY}px`,
      width: `${from.width + padX * 2}px`,
    });
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const travel = copy.animate(
      [
        { transform: "translate(0, 0) scale(1)", boxShadow: "none" },
        { transform: `translate(${dx * 0.08}px, ${dy * 0.08 - 6}px) scale(1.015)`, offset: 0.18 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)` },
      ],
      { duration: 1700, easing: "cubic-bezier(0.55, 0, 0.3, 1)", fill: "forwards" },
    );
    // The identifiers turn into tokens as the copy crosses the edge, in the order it reaches it.
    await wait(760);
    if (!current()) return;
    const swaps = [...copy.querySelectorAll(".leaves__swap")];
    for (const swap of swaps) {
      swap.classList.add("is-swapped");
      await wait(70);
      if (!current()) return;
    }
    await travel.finished.catch(() => {});
    if (!current()) return;
    figure.classList.add("has-arrived");
    copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: "forwards" }).finished
      .then(() => copy.remove())
      .catch(() => copy.remove());
    for (const check of checks) {
      await wait(380);
      if (!current()) return;
      check.classList.add("is-shown");
    }
  }

  figure.dataset.state = "ready";
  button.addEventListener("click", () => play());
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      play();
    },
    { threshold: 0.55 },
  );
  observer.observe(stage);
}
