// gettingprime: the protein reminder — the server half. Hand-copied (not imported) from
// frontend/src/lib/nutrition.js targetsFor and proteinNudgeDue, as nudge.js is from lib/nudge.js;
// test/protein-nudge.test.js runs the same fixtures through both copies so they cannot drift.
// Kept out of server.js so it can be tested without booting the server; the tick in server.js adds
// what only it knows (the push subscription, the user's clock, the per-day record in db.json).

const MACROS = ['kcal', 'p', 'c', 'f', 'fib'];
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = v => Math.round(v * 10) / 10;

const PROFILE_DEFAULT = { sex: 'male', activity: 1.55, deficit: 400 };
const LB_TO_KG = 0.45359237;

function latestKg(S, profile) {
  let best = null;
  for (const b of Array.isArray(S?.bodyweight) ? S.bodyweight : []) {
    if (!b?.d || !(Number(b.w) > 0)) continue;
    if (!best || b.d > best.d || (b.d === best.d && num(b.t) > num(best.t))) best = b;
  }
  if (!best) return num(profile?.kg) || null;
  return S.unit === 'lb' ? Number(best.w) * LB_TO_KG : Number(best.w);
}

function computeTargets(profile, kg, year) {
  const p0 = { ...PROFILE_DEFAULT, ...profile };
  const age = year - num(p0.born);
  const bmr = 10 * kg + 6.25 * num(p0.cm) - 5 * age + (p0.sex === 'female' ? -161 : 5);
  const kcal = Math.round((bmr * num(p0.activity) - num(p0.deficit)) / 10) * 10;
  const p = Math.round(2 * kg), f = Math.round(0.8 * kg);
  return { kcal, p, c: Math.max(0, Math.round((kcal - 4 * p - 9 * f) / 4)), f, fib: Math.round(14 * kcal / 1000) };
}

/** The day's targets: from the latest weigh-in (auto) or the manual numbers; null when not set up. */
export function targetsFor(S, iso) {
  const n = { mode: 'auto', profile: null, manual: null, ...(S?.nutrition || {}) };
  if (n.mode === 'manual' && n.manual) {
    const out = {};
    for (const k of MACROS) out[k] = num(n.manual[k]);
    return out;
  }
  if (!(num(n.profile?.born) > 0) || !(num(n.profile?.cm) > 0)) return null;
  const profile = { ...PROFILE_DEFAULT, ...n.profile };
  const kg = latestKg(S, profile);
  return kg ? computeTargets(profile, kg, Number(String(iso).slice(0, 4))) : null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const NUDGE_CUTOFF = '22:00';

/** { slot, done }: which reminder to send now (the latest unsent past slot, never from 22:00). */
export function proteinNudgeDue({ times, hhmm, sent = [], short }) {
  const past = (Array.isArray(times) ? times : []).filter(t => HHMM.test(t) && t <= hhmm).sort();
  if (hhmm >= NUDGE_CUTOFF) return { slot: null, done: past };
  const pending = past.filter(t => !sent.includes(t));
  return { slot: short && pending.length ? pending[pending.length - 1] : null, done: past };
}

/**
 * For a user whose reminder is on: { slot, done, eaten, target, left } at `now` ({ date, hhmm } on
 * their clock) given the slots already handled today, or null when the reminder is off or the
 * user has no targets set up.
 */
export function proteinDue(S, now, sent) {
  const nudge = S?.nutrition?.nudge;
  if (!nudge?.on) return null;
  let eaten = 0;
  for (const m of Array.isArray(S.meals) ? S.meals : []) if (m?.d === now.date) eaten += num(m.p);
  eaten = r1(eaten);
  const goal = targetsFor(S, now.date);
  if (!goal) return null;   // no targets set up yet: nothing to remind about
  const target = goal.p;
  const left = r1(Math.max(0, target - eaten));
  return { ...proteinNudgeDue({ times: nudge.times, hhmm: now.hhmm, sent, short: left > 0 }), eaten, target, left };
}
