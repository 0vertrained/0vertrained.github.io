import { initHero } from "./hero.js";
import { initLeaves } from "./leaves.js";
import { initScreens } from "./screens.js";
import { initFleet } from "./fleet.js";

const parts = [
  ["[data-hero]", initHero],
  ["[data-leaves]", initLeaves],
  ["[data-screens]", initScreens],
  ["[data-fleet]", initFleet],
];

for (const [selector, init] of parts) {
  const root = document.querySelector(selector);
  if (!root) continue;
  try {
    init(root);
  } catch (error) {
    // Each part degrades to its static HTML; one failing must not take the others with it.
    console.error(`${selector} did not start`, error);
  }
}
