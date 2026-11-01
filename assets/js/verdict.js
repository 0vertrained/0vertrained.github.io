// 0VERTRAINED's morning verdict, ported from version 19.6: the training recommendation
// (src/oura/insights.js), the morning check-in (src/checkinMorning.js) and the resolver
// that turns all of it into one call (src/recovery/verdictResolver.js). The copy is the app's.

const CHECKIN_FIELDS = ["sleepQuality", "soreness", "stress", "energy"];

/** The check-in's "rough" flags and good signs, on the app's 1–10 scales. */
export function readCheckin(body) {
  const flags = [];
  let goodSigns = 0;
  let answered = 0;
  for (const field of CHECKIN_FIELDS) {
    const value = body[field];
    if (!Number.isFinite(value)) continue;
    answered += 1;
    if (field === "soreness" && value >= 7) flags.push("very_sore");
    if (field === "stress" && value >= 7) flags.push("high_stress");
    if (field === "sleepQuality" && value <= 4) flags.push("slept_poorly");
    if (field === "energy" && value <= 4) flags.push("low_energy");
    if (field === "soreness" && value <= 3) goodSigns += 1;
    if (field === "stress" && value <= 3) goodSigns += 1;
    if (field === "sleepQuality" && value >= 8) goodSigns += 1;
    if (field === "energy" && value >= 8) goodSigns += 1;
  }
  if (body.illnessOrInjury === true) flags.push("illness_or_injury");
  return { answered, complete: answered === CHECKIN_FIELDS.length, flags, goodSigns };
}

/** Illness or injury counts 2; slept poorly and very sore 1 each; high stress with low energy 1. */
export function checkinSeverity(checkin) {
  const flags = new Set(checkin.flags);
  let units = 0;
  if (flags.has("illness_or_injury")) units += 2;
  if (flags.has("slept_poorly")) units += 1;
  if (flags.has("very_sore")) units += 1;
  if (flags.has("high_stress") && flags.has("low_energy")) units += 1;
  return Math.min(3, units);
}

const FLAG_COPY = {
  slept_poorly: "you rated last night's sleep poor",
  very_sore: "you're very sore",
  high_stress: "stress is high",
  low_energy: "energy is low",
  illness_or_injury: "you flagged illness or injury",
};

export function checkinEvidenceLine(checkin) {
  const parts = checkin.flags.map((flag) => FLAG_COPY[flag]).filter(Boolean);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Check-in: ${list}.`;
}

/** Said only when how you feel and what the metrics say disagree. */
export function divergenceNote(checkin, score) {
  if (!checkin.complete) return null;
  const severity = checkinSeverity(checkin);
  if (score >= 72 && severity >= 2) {
    return "You feel rougher than your metrics look. Subjective often leads objective by a day — ease into the first sets and let the warm-up cast the deciding vote.";
  }
  if (score < 55 && severity === 0 && checkin.goodSigns >= 3) {
    return "You feel better than your metrics look. Feeling good is real, but suppressed overnight signals usually collect their debt tomorrow — keep today honest.";
  }
  return null;
}

/** Acute against chronic load, by the app's bands. */
export function loadZone(ratio) {
  if (ratio < 0.8) return "undertraining";
  if (ratio <= 1.3) return "optimal";
  if (ratio <= 1.5) return "overreaching";
  return "high_risk";
}

/** The recommendation from the score, before the resolver; load and sleep debt can only lower it. */
export function recommend(score, zone, debtHours) {
  let label;
  let prescription;
  if (score >= 85) {
    label = "Push";
    prescription = "High-intensity work is reasonable. PR attempts are allowed if warm-ups move well.";
  } else if (score >= 70) {
    label = "Normal Load";
    prescription = "Proceed with planned strength/cardio. Avoid adding extra volume just because the score is good.";
  } else if (score >= 55) {
    label = "Moderate Load";
    prescription = "Reduce top-end intensity or volume by roughly 10–20%. Favor technical work and zone 2.";
  } else if (score >= 40) {
    label = "Pull Back";
    prescription = "Skip maximal sets. Use easy cardio, mobility, or a short deload session.";
  } else {
    label = "Rest / Recovery";
    prescription = "Prioritize sleep, hydration, food, and stress reduction. Train only if there is a specific low-risk reason.";
  }
  const modifiers = [];
  if ((zone === "high_risk" || zone === "overreaching") && label === "Push") {
    label = "Normal Load";
    modifiers.push(`training load is ${zone.replace(/_/g, " ")} — holding back from a push day`);
  }
  if (zone === "high_risk") {
    modifiers.push("acute load is well above your chronic baseline; favor a deload regardless of the score");
  }
  if (debtHours >= 5 && (label === "Push" || label === "Normal Load")) {
    label = "Moderate Load";
    modifiers.push(`sleep debt is ~${debtHours.toFixed(1)}h — recovery is sleep-limited, so cap intensity`);
  } else if (debtHours >= 3) {
    modifiers.push(`carrying ~${debtHours.toFixed(1)}h of sleep debt; protect sleep tonight`);
  }
  if (modifiers.length) prescription += ` Note: ${modifiers.join("; ")}.`;
  return { label, prescription };
}

export const CALLS = ["push", "train", "capped", "easy", "recover"];

const LABEL_TO_CALL = {
  push: "push",
  "normal load": "train",
  "moderate load": "capped",
  "pull back": "easy",
  "rest / recovery": "recover",
};

/** What the score alone would call, by the same thresholds. */
export const callFromScore = (score) => (score >= 85 ? "push" : score >= 70 ? "train" : score >= 55 ? "capped" : score >= 40 ? "easy" : "recover");

/** "2.25" hours as "2h 15m". */
export function formatDebtHours(hours) {
  const h = Math.max(0, hours);
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h 0m`;
  if (whole === 0) return `${mins}m`;
  return `${whole}h ${mins}m`;
}

/** Lower a call to at least `floor` on the caution ladder; never raise it. */
function demote(call, floor) {
  return CALLS[Math.max(CALLS.indexOf(call), CALLS.indexOf(floor))];
}

const COPY = {
  push: {
    headline: "Green light — load the bar.",
    deck: (s) => `Recovery ${s} with clear markers. High-intensity work and PR attempts are on the table if warm-ups move well.`,
  },
  train: {
    headline: "Run the plan as written.",
    deck: (s) => `Recovery ${s}. Proceed with the planned session — no need to add volume just because the score is good.`,
  },
  capped: {
    headline: "Train today. Don't chase the PR.",
    deck: () => "Readiness supports training, but a limiter lowers the ceiling — run the planned session as written and skip added volume.",
  },
  easy: {
    headline: "Back off — keep it technical.",
    deck: () => "Reduce top-end intensity or volume today. Favor technique work, easy cardio, and mobility.",
  },
  recover: {
    headline: "Today is a recovery day.",
    deck: () => "Skip intensity. Sleep, food, hydration, and easy movement are the training.",
  },
};

const RESOLVED_PRESCRIPTION = {
  capped: "Complete the planned session as written — do not add volume or chase a PR today.",
  easy: "Reduce top-end intensity or volume by roughly 10–20%. Favor technical work and zone 2.",
  recover: "Skip maximal work. Use easy movement, mobility, food, and sleep; resume intensity when markers rebound.",
};

/**
 * One morning in, one call out. Limiters can only make the call more cautious; the most
 * severe one is named, and a demoted call replaces the prescription rather than adding to it.
 */
export function resolveVerdict({ score, debtHours, zone, illnessMarkers, checkin }) {
  const recommendation = recommend(score, zone, debtHours);
  let call = LABEL_TO_CALL[recommendation.label.toLowerCase()];
  const baseCall = call;
  const limiters = [];

  if (illnessMarkers) {
    call = demote(call, "recover");
    limiters.push({
      label: "Limiter · illness markers",
      detail: "Several recovery markers are deviating together. Treat today as recovery regardless of the score.",
    });
  }
  if (checkinSeverity(checkin) >= 2) {
    const flagged = checkin.flags.includes("illness_or_injury");
    call = demote(call, flagged ? "easy" : call === "push" ? "train" : call === "train" ? "capped" : call);
    limiters.push({
      label: "Limiter · your check-in",
      detail: flagged
        ? "You flagged illness or injury this morning. The plan yields to the body — keep today easy at most."
        : "Two or more rough answers on this morning's check-in. How you feel is data too — the call steps down one notch.",
    });
  }
  if (zone === "high_risk") {
    call = demote(call, "capped");
    limiters.push({
      label: "Ceiling · acute load high vs baseline",
      detail: "Acute training load is well above your chronic baseline. Hold volume flat; no new stress today.",
    });
  } else if (zone === "overreaching" && call === "push") {
    call = demote(call, "capped");
    limiters.push({
      label: "Ceiling · training load overreaching",
      detail: "Load is running ahead of baseline — keep today at planned volume and intensity.",
    });
  }
  if (debtHours >= 2) {
    if (call === "push") call = demote(call, "capped");
    limiters.push({
      label: `Ceiling · sleep debt ${formatDebtHours(debtHours || 2)}`,
      detail:
        call === "train"
          ? "Meaningful sleep debt this week — complete the plan, add nothing on top, and protect sleep tonight."
          : "Sleep debt lowers today's ceiling. Complete the planned session; skip extra volume and max attempts.",
    });
  }

  const demoted = call !== baseCall;
  const prescription = demoted ? RESOLVED_PRESCRIPTION[call] || RESOLVED_PRESCRIPTION.capped : recommendation.prescription;
  return {
    call,
    headline: COPY[call].headline,
    deck: COPY[call].deck(Math.round(score)),
    limiter: limiters[0] || null,
    limiters,
    prescription,
  };
}

// The figure: the form is the morning, the ladder shows how far the limiters moved the call.

const CALL_NAME = { push: "Push", train: "Train", capped: "Train, capped", easy: "Easy", recover: "Recover" };
const ZONE_NAME = { undertraining: "undertraining", optimal: "optimal", overreaching: "overreaching", high_risk: "high risk" };
const typeset = (text) => text.replace(/'/g, "’");

function spokenHours(hours) {
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  const parts = [];
  if (whole) parts.push(`${whole} hour${whole === 1 ? "" : "s"}`);
  if (mins || !whole) parts.push(`${mins} minutes`);
  return parts.join(" ");
}

export function initVerdict(figure) {
  const form = figure.querySelector("[data-verdict-form]");
  const ladder = figure.querySelector("[data-verdict-ladder]");
  const rungs = new Map([...ladder.querySelectorAll("[data-call]")].map((rung) => [rung.dataset.call, rung]));
  const scoreMark = ladder.querySelector('[data-verdict-mark="score"]');
  const verdictMark = ladder.querySelector('[data-verdict-mark="verdict"]');
  const span = ladder.querySelector("[data-verdict-span]");
  const out = (name) => figure.querySelector(`[data-verdict-out="${name}"]`);
  const field = (name) => figure.querySelector(`[data-verdict-${name}]`);
  const live = field("live");
  const limiterBox = field("limiter");
  const diverge = field("diverge");
  const also = field("also");
  let revealed = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = null;
  let announce = 0;

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  function read() {
    const value = (name) => Number(form.elements[name].value);
    return {
      score: value("score"),
      debtHours: value("debt"),
      ratio: value("load"),
      illnessMarkers: form.elements.illnessMarkers.checked,
      body: {
        sleepQuality: value("sleepQuality"),
        soreness: value("soreness"),
        stress: value("stress"),
        energy: value("energy"),
        illnessOrInjury: form.elements.illnessOrInjury.checked,
      },
    };
  }

  /** Centre of a rung's bar, in the ladder's coordinates. */
  const centre = (call) => {
    const rung = rungs.get(call);
    return rung.offsetLeft + rung.offsetWidth / 2;
  };

  function place(scoreCall, call) {
    const from = centre(scoreCall);
    const to = revealed ? centre(call) : from;
    scoreMark.style.transform = `translateX(${from}px)`;
    verdictMark.style.transform = `translateX(${to}px)`;
    span.style.transform = `translateX(${from}px) scaleX(${Math.max(0, to - from)})`;
  }

  function render() {
    const morning = read();
    const zone = loadZone(morning.ratio);
    const checkin = readCheckin(morning.body);
    const verdict = resolveVerdict({ score: morning.score, debtHours: morning.debtHours, zone, illnessMarkers: morning.illnessMarkers, checkin });
    const scoreCall = callFromScore(morning.score);

    setText(out("score"), String(morning.score));
    setText(out("debt"), formatDebtHours(morning.debtHours));
    setText(out("load"), `${morning.ratio.toFixed(2)}×, ${ZONE_NAME[zone]}`);
    form.elements.debt.setAttribute("aria-valuetext", spokenHours(morning.debtHours));
    form.elements.load.setAttribute("aria-valuetext", `${morning.ratio.toFixed(2)} times usual, ${ZONE_NAME[zone]}`);
    for (const input of form.querySelectorAll('input[type="range"]')) {
      const fill = ((input.valueAsNumber - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty("--fill", `${fill}%`);
    }

    for (const [call, rung] of rungs) {
      rung.classList.toggle("is-verdict", call === verdict.call);
      rung.classList.toggle("is-score", call === scoreCall);
      if (call === verdict.call) rung.setAttribute("aria-current", "true");
      else rung.removeAttribute("aria-current");
    }
    place(scoreCall, verdict.call);

    setText(field("headline"), typeset(verdict.headline));
    setText(field("deck"), typeset(checkinEvidenceLine(checkin) || verdict.deck));
    const note = divergenceNote(checkin, morning.score);
    diverge.hidden = !note;
    setText(diverge, note ? typeset(note) : "");
    limiterBox.hidden = !verdict.limiter;
    if (verdict.limiter) {
      setText(field("limiter-label"), verdict.limiter.label);
      setText(field("limiter-detail"), typeset(verdict.limiter.detail));
    }
    // The app names only the most severe limiter in the verdict; the rest stay below it.
    const others = verdict.limiters.slice(1).map((limiter) => limiter.label);
    also.hidden = !others.length;
    setText(also, others.length ? `Also weighed: ${others.join("; ")}.` : "");
    setText(field("prescription"), typeset(verdict.prescription));

    // Spoken once the morning settles, so a slider drag isn't read out step by step.
    const summary = `${CALL_NAME[verdict.call]}. ${typeset(verdict.headline)}${verdict.limiter ? ` ${verdict.limiter.label}.` : ""}`;
    if (last !== null && summary !== last) {
      clearTimeout(announce);
      announce = setTimeout(() => setText(live, summary), 700);
    }
    last = summary;
  }

  form.addEventListener("input", render);
  form.addEventListener("submit", (event) => event.preventDefault());
  new ResizeObserver(() => render()).observe(ladder);
  render();
  figure.dataset.state = "ready";

  // The one orchestrated moment: on first sight, the verdict slides from where the score alone
  // would put the day to where the limiters leave it.
  if (!revealed) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        ladder.classList.add("is-revealing");
        revealed = true;
        render();
        setTimeout(() => ladder.classList.remove("is-revealing"), 1100);
      },
      { threshold: 0.9 },
    );
    observer.observe(ladder);
  }
}
