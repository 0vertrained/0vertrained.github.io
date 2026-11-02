import { initHero } from "./hero.js";
import { initLeaves } from "./leaves.js";
import { initScreens } from "./screens.js";
import { initLattice } from "./lattice.js";

const parts = [
  ["[data-hero]", initHero],
  ["[data-leaves]", initLeaves],
  ["[data-screens]", initScreens],
  ["[data-lattice-replay]", initLattice],
];

for (const [selector, init] of parts) {
  for (const root of document.querySelectorAll(selector)) {
    try {
      Promise.resolve(init(root)).catch(error => console.error(`${selector} did not start`, error));
    } catch (error) {
      // Each part degrades to its static HTML; one failing must not take the others with it.
      console.error(`${selector} did not start`, error);
    }
  }
}
