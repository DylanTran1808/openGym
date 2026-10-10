// Nutrition: what a logged amount of a food comes to, what a day adds up to, and what the targets
// are. Pure helpers, no store access — the Home card, the log sheet and the server's protein nudge
// (api/protein-nudge.js, a hand copy of targetsFor and proteinNudgeDue) all read these.
//
// Macros travel as { kcal, p, c, f, fib }: kilocalories, then grams of protein, carbohydrate, fat
// and fibre. Fibre is its own number — never subtracted from carbs or kcal, since labels count it
// differently by country and the label's kcal already accounts for it.

export const MACROS = ['kcal', 'p', 'c', 'f', 'fib']
const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// A tablespoon of oil is not 15 g: spoons measure volume, so a weighed food converts through its
// own density. Grams stay the accurate path; spoons are for what you actually scoop. No cups —
// the user has no cup measure, and a cup is not one size anyway.
export const SPOON_ML = { tsp: 5, tbsp: 15 }

/** The units a food can be logged in: its base, the spoons, and its serving if it has one. */
export function unitsFor(food) {
  const units = food?.base === 'ml' ? ['ml', 'L', 'tsp', 'tbsp'] : ['g', 'tsp', 'tbsp']
  if (food?.serving?.amt > 0) units.push('serving')
  return units
}

/** `qty` of `unit` in the food's base (g or ml), or null when it cannot be converted. */
export function toBase(qty, unit, food) {
  const n = typeof qty === 'string' && qty.trim() === '' ? NaN : Number(qty)
  if (!Number.isFinite(n) || n < 0 || !unitsFor(food).includes(unit)) return null
  if (unit === 'L') return n * 1000
  if (unit in SPOON_ML) return n * SPOON_ML[unit] * (food.base === 'ml' ? 1 : (food.gPerMl > 0 ? food.gPerMl : 1))
  if (unit === 'serving') return n * food.serving.amt
  return n // g or ml, already the food's base
}

const r1 = v => Math.round(v * 10) / 10

/** The macros of `qty` `unit` of `food` (kcal whole, grams to 0.1), or null for a bad amount. */
export function macrosFor(food, qty, unit) {
  const amount = toBase(qty, unit, food)
  if (amount == null) return null
  const k = amount / 100, per = food.per100 || {}
  return { kcal: Math.round(num(per.kcal) * k), p: r1(num(per.p) * k), c: r1(num(per.c) * k), f: r1(num(per.f) * k), fib: r1(num(per.fib) * k) }
}

/** Everything logged on `iso` added up. A missing macro counts as 0. */
export function dayTotals(meals, iso) {
  const out = zero()
  for (const m of Array.isArray(meals) ? meals : []) {
    if (m?.d !== iso) continue
    for (const k of MACROS) out[k] += num(m[k])
  }
  for (const k of MACROS) out[k] = k === 'kcal' ? Math.round(out[k]) : r1(out[k])
  return out
}

/** What is still to eat: target − eaten, never below zero. */
export function remaining(totals, targets) {
  const out = zero()
  for (const k of MACROS) out[k] = k === 'kcal' ? Math.max(0, Math.round(num(targets?.[k]) - num(totals?.[k]))) : Math.max(0, r1(num(targets?.[k]) - num(totals?.[k])))
  return out
}

/* ---------- targets ---------- */

export const PROFILE_DEFAULT = { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 }
export const NUTRITION_DEFAULT = {
  // 'auto': targets derived from the latest weigh-in every time they are read (never stored, so
  // they cannot go stale — a weight from the Home card, the pre-workout prompt, an import or a
  // sync all count). 'manual': `manual` holds the five numbers and weight leaves them alone.
  mode: 'auto', profile: PROFILE_DEFAULT, manual: null,
  // Protein reminder push (api/protein-nudge.js): off until switched on; times on the user's clock.
  nudge: { on: false, times: ['14:00', '19:30'], tz: null },
}

const LB_TO_KG = 0.45359237

/** The newest weigh-in in kg (by day, then entry time), or the profile weight when there is none. */
export function latestKg(S, profile = PROFILE_DEFAULT) {
  let best = null
  for (const b of Array.isArray(S?.bodyweight) ? S.bodyweight : []) {
    if (!b?.d || !(Number(b.w) > 0)) continue
    if (!best || b.d > best.d || (b.d === best.d && num(b.t) > num(best.t))) best = b
  }
  if (!best) return num(profile.kg) || PROFILE_DEFAULT.kg
  return S.unit === 'lb' ? Number(best.w) * LB_TO_KG : Number(best.w)
}

/**
 * Daily targets for `kg` body weight in `year`: Mifflin-St Jeor BMR × activity − deficit (kcal to
 * the nearest 10), protein 2 g/kg, fat 0.8 g/kg, fibre 14 g per 1,000 kcal, carbs what is left.
 */
export function computeTargets(profile, kg, year) {
  const p0 = { ...PROFILE_DEFAULT, ...profile }
  const age = year - num(p0.born)
  const bmr = 10 * kg + 6.25 * num(p0.cm) - 5 * age + (p0.sex === 'female' ? -161 : 5)
  const kcal = Math.round((bmr * num(p0.activity) - num(p0.deficit)) / 10) * 10
  const p = Math.round(2 * kg), f = Math.round(0.8 * kg)
  return { kcal, p, c: Math.max(0, Math.round((kcal - 4 * p - 9 * f) / 4)), f, fib: Math.round(14 * kcal / 1000) }
}

/** Today's targets for this profile: derived from the latest weigh-in, or the manual numbers. */
export function targetsFor(S, iso) {
  const n = { ...NUTRITION_DEFAULT, ...(S?.nutrition || {}) }
  if (n.mode === 'manual' && n.manual) {
    const out = zero()
    for (const k of MACROS) out[k] = num(n.manual[k])
    return out
  }
  const profile = { ...PROFILE_DEFAULT, ...(n.profile || {}) }
  return computeTargets(profile, latestKg(S, profile), Number(String(iso).slice(0, 4)))
}

/* ---------- protein nudge ---------- */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const NUDGE_CUTOFF = '22:00'

/**
 * Which protein reminder to send now, if any. `times` are the user's slots, `hhmm` their clock now,
 * `sent` the slots already handled today, `short` whether protein is still below target.
 * Returns { slot, done }: `slot` to push (or null), `done` every slot to mark handled today.
 * A late start (the Mac was off) sends only the latest missed slot — never a burst — and every
 * slot that has passed is consumed, sent or not. Nothing goes out from 22:00.
 */
export function proteinNudgeDue({ times, hhmm, sent = [], short }) {
  const past = (Array.isArray(times) ? times : []).filter(t => HHMM.test(t) && t <= hhmm).sort()
  if (hhmm >= NUDGE_CUTOFF) return { slot: null, done: past }
  const pending = past.filter(t => !sent.includes(t))
  return { slot: short && pending.length ? pending[pending.length - 1] : null, done: past }
}

/* ---------- logging ---------- */

// Past these a number is a typo (1,500 g of protein in one meal), not a meal: refused rather than
// left to wreck the day's totals and the protein reminder.
export const MEAL_MAX = { kcal: 10000, p: 2000, c: 2000, f: 2000, fib: 2000 }

/**
 * A meal for day `iso` from what the log form holds — { meal } or { error: 'name' | 'numbers' }.
 * Blank macros count as 0; the name is trimmed and required. No id: the caller gives it one.
 */
export function mealFromInput(input, iso) {
  const name = String(input?.name ?? '').trim()
  if (!name) return { error: 'name' }
  const meal = { d: iso, name }
  for (const k of MACROS) {
    const v = input?.[k]
    const n = v == null || v === '' ? 0 : Number(v)
    if (!Number.isFinite(n) || n < 0 || n > MEAL_MAX[k]) return { error: 'numbers' }
    meal[k] = k === 'kcal' ? Math.round(n) : r1(n)
  }
  return { meal }
}

/* ---------- saved foods ---------- */

// Per 100 g or ml nothing holds more than 100 g of a macro, or much past 900 kcal (pure fat).
export const PER100_MAX = { kcal: 1000, p: 100, c: 100, f: 100, fib: 100 }
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi
const optNum = v => (v == null || v === '' ? null : Number(v))

/**
 * A saved food from what the food form holds — { food } or { error: 'name' | 'numbers' }.
 * Input: { name, base: 'g'|'ml', kcal, p, c, f, fib (per 100), servingAmt?, gPerMl? }. A serving is
 * in the food's base unit; a density only means something for a weighed food. No id: the caller's.
 */
export function foodFromInput(input) {
  const name = String(input?.name ?? '').trim()
  if (!name) return { error: 'name' }
  const base = input?.base === 'ml' ? 'ml' : input?.base === 'g' || input?.base == null ? 'g' : null
  if (!base) return { error: 'numbers' }
  const per100 = {}
  for (const k of MACROS) {
    const n = optNum(input?.[k]) ?? 0
    if (!inRange(n, 0, PER100_MAX[k])) return { error: 'numbers' }
    per100[k] = k === 'kcal' ? Math.round(n) : r1(n)
  }
  const food = { name, base, per100 }
  const serving = optNum(input?.servingAmt)
  if (serving != null) {
    if (!inRange(serving, 0.1, 5000)) return { error: 'numbers' }
    food.serving = { amt: r1(serving) }
  }
  const density = optNum(input?.gPerMl)
  if (base === 'g' && density != null) {
    if (!inRange(density, 0.05, 5)) return { error: 'numbers' }
    food.gPerMl = Math.round(density * 100) / 100
  }
  if (input?.barcode) food.barcode = String(input.barcode)
  return { food }
}

/** A meal of `qty` `unit` of a saved food on `iso`, macros copied in — { meal } or { error: 'amount' }. */
export function mealFromFood(food, qty, unit, iso) {
  const macros = Number(qty) > 0 ? macrosFor(food, qty, unit) : null
  if (!macros) return { error: 'amount' }
  return { meal: { d: iso, name: food.name, foodId: food.id, qty: Number(qty), unit, ...macros } }
}

/** The saved food carrying this barcode, or null — a rescan never needs the network. */
export function foodByBarcode(foods, code) {
  return (Array.isArray(foods) ? foods : []).find(f => f?.barcode && f.barcode === String(code)) || null
}

/**
 * Meals worth a one-tap "log again": one per name (case and spacing aside), the latest of each,
 * most recent first — by day, then by when it was added on that day. At most `n`.
 */
export function recentMeals(meals, n = 6) {
  const all = (Array.isArray(meals) ? meals : []).map((m, i) => ({ m, i })).filter(x => x.m?.name && x.m.d)
  all.sort((a, b) => (a.m.d === b.m.d ? b.i - a.i : a.m.d < b.m.d ? 1 : -1))
  const seen = new Set(), out = []
  for (const { m } of all) {
    const key = m.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
    if (out.length >= n) break
  }
  return out
}

/** The ISO day `by` days from `iso` (calendar arithmetic at UTC noon: no zone or DST edge moves it). */
export const shiftDay = (iso, by) => new Date(Date.parse(iso + 'T12:00:00Z') + by * 86400000).toISOString().slice(0, 10)
