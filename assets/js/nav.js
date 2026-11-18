// The bar that stays with the reader marks the part of the page now on screen, and keeps that link in view
// where the links scroll sideways on a phone.

export function initSitebar(bar) {
  const list = bar.querySelector(".sitebar__links");
  if (!list) return;
  // On a page of its own, a case study's link is the marked one from the start; bring it into the row.
  const page = list.querySelector('a[aria-current="page"]');
  if (page) {
    const row = list.getBoundingClientRect();
    const box = page.getBoundingClientRect();
    if (box.right > row.right - 28) list.scrollLeft += box.right - row.right + 28;
  }
  const links = [...bar.querySelectorAll('a[href^="#"]')];
  const targets = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if (!targets.length || !("IntersectionObserver" in window)) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  let current = "";

  function mark(id) {
    if (id === current) return;
    current = id;
    // Back at the top of the page, the row goes back to its start.
    if (!links.some((a) => a.hash === `#${id}` && !a.classList.contains("sitebar__home"))) list.scrollTo({ left: 0 });
    for (const a of links) {
      // The name at the start leads to the top of the page; it is never the place you are.
      const here = a.hash === `#${id}` && !a.classList.contains("sitebar__home");
      if (here) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
      if (!here) continue;
      // Scroll the row itself: scrollIntoView would move the page when the bar is still below the screen.
      const row = list.getBoundingClientRect();
      const box = a.getBoundingClientRect();
      const margin = 28;
      let shift = 0;
      if (box.left < row.left + margin) shift = box.left - row.left - margin;
      else if (box.right > row.right - margin) shift = box.right - row.right + margin;
      if (shift) list.scrollBy({ left: shift, behavior: calm.matches ? "auto" : "smooth" });
    }
  }

  // A part is the one on screen while it crosses a line a third of the way down the window.
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) mark(entry.target.id);
    },
    { rootMargin: "-33% 0px -66% 0px", threshold: 0 },
  );
  for (const target of targets) watcher.observe(target);
}
