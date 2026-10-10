import { describe, expect, it } from 'vitest'
import {
  SPOON_ML, unitsFor, toBase, macrosFor, dayTotals, remaining,
  latestKg, computeTargets, targetsFor, proteinNudgeDue, NUTRITION_DEFAULT, mealFromInput,
} from './nutrition.js'

const oil = { id: 'oil', name: 'Olive oil', base: 'g', gPerMl: 0.92, per100: { kcal: 884, p: 0, c: 0, f: 100, fib: 0 } }
const milk = { id: 'milk', name: 'Milk', base: 'ml', per100: { kcal: 64, p: 3.4, c: 4.8, f: 3.6, fib: 0 } }
const oats = { id: 'oats', name: 'Oats', base: 'g', per100: { kcal: 379, p: 13, c: 68, f: 6.5, fib: 10 }, serving: { label: 'bowl', amt: 40 } }
const profile = { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 }

describe('units', () => {
  it('offers g and spoons for a weighed food, ml/L and spoons for a liquid', () => {
    expect(unitsFor(oil)).toEqual(['g', 'tsp', 'tbsp'])
    expect(unitsFor(milk)).toEqual(['ml', 'L', 'tsp', 'tbsp'])
  })

  it('adds serving only when the food defines one', () => {
    expect(unitsFor(oats)).toEqual(['g', 'tsp', 'tbsp', 'serving'])
  })

  it('never offers a cup', () => {
    for (const f of [oil, milk, oats]) expect(unitsFor(f).some(u => /cup/i.test(u))).toBe(false)
  })

  it('spoons are 5 and 15 ml', () => {
    expect(SPOON_ML).toEqual({ tsp: 5, tbsp: 15 })
  })
})

describe('toBase', () => {
  it('converts a tablespoon of a weighed food through its density', () => {
    expect(toBase(1, 'tbsp', oil)).toBeCloseTo(13.8)
  })

  it('treats a spoon of a liquid as plain ml', () => {
    expect(toBase(2, 'tsp', milk)).toBe(10)
  })

  it('converts litres to ml', () => {
    expect(toBase(0.5, 'L', milk)).toBe(500)
  })

  it('uses density 1 when a weighed food has none', () => {
    expect(toBase(1, 'tbsp', oats)).toBe(15)
  })

  it('multiplies servings by the serving amount', () => {
    expect(toBase(2, 'serving', oats)).toBe(80)
  })

  it('refuses negative, non-numeric and unknown units', () => {
    expect(toBase(-1, 'g', oats)).toBeNull()
    expect(toBase('abc', 'g', oats)).toBeNull()
    expect(toBase(1, 'cup', oats)).toBeNull()
    expect(toBase(1, 'serving', oil)).toBeNull()
    expect(toBase(1, 'L', oats)).toBeNull()
  })
})

describe('macrosFor', () => {
  it('a tablespoon of olive oil is about 122 kcal', () => {
    expect(macrosFor(oil, 1, 'tbsp')).toEqual({ kcal: 122, p: 0, c: 0, f: 13.8, fib: 0 })
  })

  it('scales every macro, fibre included', () => {
    expect(macrosFor(oats, 50, 'g')).toEqual({ kcal: 190, p: 6.5, c: 34, f: 3.3, fib: 5 })
  })

  it('returns null for an amount it cannot convert', () => {
    expect(macrosFor(oats, 1, 'cup')).toBeNull()
  })
})

describe('dayTotals and remaining', () => {
  const meals = [
    { d: '2026-10-10', kcal: 500, p: 40, c: 50, f: 10, fib: 5 },
    { d: '2026-10-10', kcal: 300, p: 30, c: 20, f: 5 },
    { d: '2026-10-09', kcal: 900, p: 90, c: 90, f: 30, fib: 9 },
  ]

  it('sums only the given day, counting missing macros as 0', () => {
    expect(dayTotals(meals, '2026-10-10')).toEqual({ kcal: 800, p: 70, c: 70, f: 15, fib: 5 })
  })

  it('is all zeros for an empty or missing list', () => {
    expect(dayTotals(undefined, '2026-10-10')).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
  })

  it('remaining never goes below zero', () => {
    const left = remaining({ kcal: 2500, p: 100, c: 0, f: 0, fib: 0 }, { kcal: 2380, p: 156, c: 300, f: 62, fib: 33 })
    expect(left).toEqual({ kcal: 0, p: 56, c: 300, f: 62, fib: 33 })
  })
})

describe('targets', () => {
  it('derives the 78 kg targets', () => {
    expect(computeTargets(profile, 78, 2026)).toEqual({ kcal: 2380, p: 156, c: 300, f: 62, fib: 33 })
  })

  it('moves with body weight', () => {
    expect(computeTargets(profile, 80, 2026)).toMatchObject({ kcal: 2410, p: 160, f: 64, fib: 34 })
  })

  it('latestKg reads the newest weigh-in by day, then time', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-10-09', w: 79 }, { d: '2026-10-10', w: 80, t: 2 }, { d: '2026-10-10', w: 78.5, t: 1 }] }
    expect(latestKg(S, profile)).toBe(80)
  })

  it('latestKg converts a profile kept in lb', () => {
    expect(latestKg({ unit: 'lb', bodyweight: [{ d: '2026-10-10', w: 176 }] }, profile)).toBeCloseTo(79.83, 2)
  })

  it('latestKg falls back to the profile weight with no usable weigh-in', () => {
    expect(latestKg({ unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 0 }] }, profile)).toBe(78)
  })

  it('targetsFor follows the latest weigh-in in auto mode', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 80 }], nutrition: { mode: 'auto', profile } }
    expect(targetsFor(S, '2026-10-10').p).toBe(160)
  })

  it('targetsFor uses the defaults for a profile that never set nutrition', () => {
    expect(targetsFor({ unit: 'kg', bodyweight: [] }, '2026-10-10')).toEqual({ kcal: 2380, p: 156, c: 300, f: 62, fib: 33 })
  })

  it('targetsFor ignores weight in manual mode', () => {
    const manual = { kcal: 2500, p: 170, c: 280, f: 70, fib: 35 }
    const S = { unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 90 }], nutrition: { mode: 'manual', profile, manual } }
    expect(targetsFor(S, '2026-10-10')).toEqual(manual)
  })

  it('default nutrition state is auto with the user profile and nudges off', () => {
    expect(NUTRITION_DEFAULT).toEqual({
      mode: 'auto', profile, manual: null,
      nudge: { on: false, times: ['14:00', '19:30'], tz: null },
    })
  })
})

describe('proteinNudgeDue', () => {
  const times = ['14:00', '19:30']

  it('fires a slot whose time has come while protein is short', () => {
    expect(proteinNudgeDue({ times, hhmm: '14:00', sent: [], short: true })).toEqual({ slot: '14:00', done: ['14:00'] })
  })

  it('does nothing before the first slot', () => {
    expect(proteinNudgeDue({ times, hhmm: '13:59', sent: [], short: true })).toEqual({ slot: null, done: [] })
  })

  it('catches up with only the latest missed slot after a late start', () => {
    expect(proteinNudgeDue({ times, hhmm: '20:10', sent: [], short: true })).toEqual({ slot: '19:30', done: ['14:00', '19:30'] })
  })

  it('never fires a slot twice in a day', () => {
    expect(proteinNudgeDue({ times, hhmm: '20:10', sent: ['14:00', '19:30'], short: true }).slot).toBeNull()
  })

  it('stays quiet once the goal is met, and consumes the slot', () => {
    expect(proteinNudgeDue({ times, hhmm: '14:05', sent: [], short: false })).toEqual({ slot: null, done: ['14:00'] })
  })

  it('stays quiet from 22:00', () => {
    expect(proteinNudgeDue({ times, hhmm: '22:30', sent: [], short: true }).slot).toBeNull()
  })

  it('ignores malformed slot times', () => {
    expect(proteinNudgeDue({ times: ['nope', '14:00'], hhmm: '15:00', sent: [], short: true }).slot).toBe('14:00')
  })
})

describe('mealFromInput', () => {
  it('builds a meal for the day, blanks counting as 0 and the name trimmed', () => {
    expect(mealFromInput({ name: '  Chicken rice ', kcal: 650, p: 45, c: null, f: '', fib: undefined }, '2026-10-10'))
      .toEqual({ meal: { d: '2026-10-10', name: 'Chicken rice', kcal: 650, p: 45, c: 0, f: 0, fib: 0 } })
  })

  it('needs a name', () => {
    expect(mealFromInput({ name: '   ', p: 30 }, '2026-10-10')).toEqual({ error: 'name' })
  })

  it('refuses negative, non-numeric and implausibly large numbers', () => {
    expect(mealFromInput({ name: 'x', p: -1 }, '2026-10-10')).toEqual({ error: 'numbers' })
    expect(mealFromInput({ name: 'x', kcal: 'lots' }, '2026-10-10')).toEqual({ error: 'numbers' })
    expect(mealFromInput({ name: 'x', p: 2500 }, '2026-10-10')).toEqual({ error: 'numbers' })
    expect(mealFromInput({ name: 'x', kcal: 20000 }, '2026-10-10')).toEqual({ error: 'numbers' })
  })
})
