// The land as photographs: fifteen keyframes of the view from the Plaza, one per light condition, blended by
// the sun's height the way a dynamic wallpaper blends its stills. Each frame covers azimuth 40° to 80° and
// altitude -4.5° to 5.5°, locked to the skyline traced from elevation data, so the live sky, sun and moon line
// up with it. The frames were made with an image model from the page's own renders of the moment.

/** The frame's window in the sky, and the two texture sizes. */
export const LAND_FRAME = { azFrom: 40, azTo: 80, altTop: 5.5, altBottom: -4.5 };

// Each keyframe: the sun's height when it was made, and which side of noon. The morning and evening ladders
// share the midday and night frames, so the blend is continuous around the clock.
export const KEYFRAMES = [
  { name: "01-night", elevation: -24 },
  { name: "02-astronomical-dawn", elevation: -15, side: "am" },
  { name: "03-nautical-dawn", elevation: -9, side: "am" },
  { name: "04-civil-dawn", elevation: -4, side: "am" },
  { name: "05-sunrise", elevation: 0.3, side: "am" },
  { name: "06-early-morning", elevation: 8, side: "am" },
  { name: "07-mid-morning", elevation: 20, side: "am" },
  { name: "08-midday", elevation: 37.6 },
  { name: "09-afternoon", elevation: 20, side: "pm" },
  { name: "10-late-afternoon", elevation: 8, side: "pm" },
  { name: "11-golden-hour", elevation: 3, side: "pm" },
  { name: "12-alpenglow", elevation: 0.4, side: "pm" },
  { name: "13-civil-dusk", elevation: -4, side: "pm" },
  { name: "14-nautical-dusk", elevation: -9, side: "pm" },
  { name: "15-astronomical-dusk", elevation: -15, side: "pm" },
];

const ladder = (side) => KEYFRAMES.filter((k) => !k.side || k.side === side).sort((a, b) => a.elevation - b.elevation);
const LADDERS = { am: ladder("am"), pm: ladder("pm") };

/** The two keyframes for a sun height on a side of noon, and how far from the first toward the second. */
export function framesFor(elevation, morning) {
  const steps = LADDERS[morning ? "am" : "pm"];
  if (elevation <= steps[0].elevation) return { a: steps[0], b: steps[0], t: 0 };
  for (let i = 1; i < steps.length; i++) {
    if (elevation <= steps[i].elevation) {
      const lo = steps[i - 1];
      const hi = steps[i];
      return { a: lo, b: hi, t: (elevation - lo.elevation) / (hi.elevation - lo.elevation) };
    }
  }
  const top = steps[steps.length - 1];
  return { a: top, b: top, t: 0 };
}

/**
 * Loads keyframe images on demand and keeps them. `urlFor(name)` gives the file for a frame; `onReady` is
 * called when a frame has arrived, so the scene can redraw.
 */
export function createLandLibrary(urlFor, onReady) {
  const frames = new Map();
  function get(name) {
    let entry = frames.get(name);
    if (!entry) {
      entry = { name, image: null, failed: false, loading: true };
      frames.set(name, entry);
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.onload = () => {
        entry.image = img;
        entry.loading = false;
        onReady(entry);
      };
      img.onerror = () => {
        entry.failed = true;
        entry.loading = false;
      };
      img.src = urlFor(name);
    }
    return entry;
  }
  return {
    get,
    /** Both frames for a moment, requested if need be. */
    pair(elevation, morning) {
      const { a, b, t } = framesFor(elevation, morning);
      return { a: get(a.name), b: get(b.name), t };
    },
    /**
     * The best pair that has arrived for a moment: the ideal frames when both are here, otherwise the nearest
     * loaded frames on the ladder, so a drag of the hour control never drops back to the drawn land.
     */
    loaded(elevation, morning) {
      const { a, b, t } = framesFor(elevation, morning);
      const A = frames.get(a.name);
      const B = frames.get(b.name);
      if (A?.image && B?.image) return { a: A.image, b: B.image, t };
      let lo = null;
      let hi = null;
      for (const s of LADDERS[morning ? "am" : "pm"]) {
        if (!frames.get(s.name)?.image) continue;
        if (s.elevation <= elevation) lo = s;
        else if (!hi) hi = s;
      }
      if (!lo && !hi) return null;
      if (!lo || !hi) {
        const only = frames.get((lo || hi).name).image;
        return { a: only, b: only, t: 0 };
      }
      return { a: frames.get(lo.name).image, b: frames.get(hi.name).image, t: (elevation - lo.elevation) / (hi.elevation - lo.elevation) };
    },
    /** Warm the frames next on the ladder, in both directions, so a drag of the hour control finds them ready. */
    warm(elevation, morning, span = 1) {
      const steps = LADDERS[morning ? "am" : "pm"];
      const i = steps.findIndex((s) => s.elevation >= elevation);
      for (let k = Math.max(0, i - span - 1); k <= Math.min(steps.length - 1, i + span); k++) get(steps[k].name);
    },
  };
}
