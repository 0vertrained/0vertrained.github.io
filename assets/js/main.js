// Each part of a page brings its own script, and only a page that has the part loads it: the view east on the
// front page is most of the code here, and a case study has no use for it.
const parts = [
  ["[data-hero]", () => import("./hero.js").then((m) => m.initHero)],
  ["[data-leaves]", () => import("./leaves.js").then((m) => m.initLeaves)],
  ["[data-screens]", () => import("./screens.js").then((m) => m.initScreens)],
  ["[data-lattice-replay]", () => import("./lattice.js").then((m) => m.initLattice)],
];

for (const [selector, load] of parts) {
  const roots = document.querySelectorAll(selector);
  if (!roots.length) continue;
  load()
    .then((init) => {
      for (const root of roots) {
        // Each part degrades to its static HTML; one failing must not take the others with it.
        Promise.resolve()
          .then(() => init(root))
          .catch((error) => console.error(`${selector} did not start`, error));
      }
    })
    .catch((error) => console.error(`${selector} did not load`, error));
}
