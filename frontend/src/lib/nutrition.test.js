import { describe, expect, it } from 'vitest'
import {
  SPOON_ML, unitsFor, toBase, macrosFor, dayTotals, remaining,
  latestKg, computeTargets, targetsFor, proteinNudgeDue, NUTRITION_DEFAULT, estimateTotals, handPortions, mealFromInput, foodFromInput, mealFromFood, foodByBarcode, recentMeals, shiftDay, profileFromInput, manualFromInput,
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
    expect(latestKg({ unit: 'kg', bodyweight: [] }, { born: 2005 })).toBeNull()
    expect(latestKg({ unit: 'kg', bodyweight: [] })).toBeNull()
  })

  it('targetsFor follows the latest weigh-in in auto mode', () => {
    const S = { unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 80 }], nutrition: { mode: 'auto', profile } }
    expect(targetsFor(S, '2026-10-10').p).toBe(160)
  })

  it('targetsFor has no targets for someone who never set them up — not somebody else\'s', () => {
    expect(targetsFor({ unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 60 }] }, '2026-10-10')).toBeNull()
    expect(targetsFor({ unit: 'kg', bodyweight: [], nutrition: NUTRITION_DEFAULT }, '2026-10-10')).toBeNull()
    expect(targetsFor({ unit: 'kg', bodyweight: [], nutrition: { mode: 'auto', profile: { sex: 'male', activity: 1.55 } } }, '2026-10-10')).toBeNull()
    expect(targetsFor({ unit: 'kg', bodyweight: [], nutrition: { mode: 'manual', manual: null } }, '2026-10-10')).toBeNull()
  })

  it('targetsFor needs a weight: the latest weigh-in, else the one kept in the profile', () => {
    const { kg, ...noKg } = profile
    expect(targetsFor({ unit: 'kg', bodyweight: [], nutrition: { mode: 'auto', profile: noKg } }, '2026-10-10')).toBeNull()
    expect(targetsFor({ unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 78 }], nutrition: { mode: 'auto', profile: noKg } }, '2026-10-10').p).toBe(156)
  })

  it('the profile already saved in the owner\'s data keeps its targets', () => {
    const stored = { mode: 'auto', profile: { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 }, manual: null, nudge: { on: false, times: ['14:00', '19:30'], tz: null } }
    expect(targetsFor({ unit: 'kg', bodyweight: [{ d: '2026-10-01', w: 78 }], nutrition: stored }, '2026-10-11')).toEqual({ kcal: 2380, p: 156, c: 300, f: 62, fib: 33 })
  })

  it('targetsFor ignores weight in manual mode', () => {
    const manual = { kcal: 2500, p: 170, c: 280, f: 70, fib: 35 }
    const S = { unit: 'kg', bodyweight: [{ d: '2026-10-10', w: 90 }], nutrition: { mode: 'manual', profile, manual } }
    expect(targetsFor(S, '2026-10-10')).toEqual(manual)
  })

  it('default nutrition state is auto with no profile yet and nudges off', () => {
    expect(NUTRITION_DEFAULT).toEqual({
      mode: 'auto', profile: null, manual: null,
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

describe('foodFromInput', () => {
  it('builds a weighed food with optional serving and density', () => {
    expect(foodFromInput({ name: ' Olive oil ', base: 'g', kcal: 884, p: 0, c: 0, f: 100, fib: null, servingAmt: null, gPerMl: 0.92 }))
      .toEqual({ food: { name: 'Olive oil', base: 'g', per100: { kcal: 884, p: 0, c: 0, f: 100, fib: 0 }, gPerMl: 0.92 } })
  })

  it('keeps a serving in the base unit, and no density for a liquid', () => {
    expect(foodFromInput({ name: 'Milk', base: 'ml', kcal: 64, p: 3.4, c: 4.8, f: 3.6, servingAmt: 250, gPerMl: 1.03 }))
      .toEqual({ food: { name: 'Milk', base: 'ml', per100: { kcal: 64, p: 3.4, c: 4.8, f: 3.6, fib: 0 }, serving: { amt: 250 } } })
  })

  it('needs a name and a known base', () => {
    expect(foodFromInput({ name: '', base: 'g' })).toEqual({ error: 'name' })
    expect(foodFromInput({ name: 'x', base: 'cup' })).toEqual({ error: 'numbers' })
  })

  it('refuses more than 100 g of a macro, or 1,000 kcal, per 100', () => {
    expect(foodFromInput({ name: 'x', base: 'g', p: 120 })).toEqual({ error: 'numbers' })
    expect(foodFromInput({ name: 'x', base: 'g', kcal: 1200 })).toEqual({ error: 'numbers' })
    expect(foodFromInput({ name: 'x', base: 'g', gPerMl: -1 })).toEqual({ error: 'numbers' })
  })
})

describe('mealFromFood', () => {
  it('logs an amount of a food with its macros copied in', () => {
    expect(mealFromFood({ id: 'oil', ...oil }, 1, 'tbsp', '2026-10-10')).toEqual({
      meal: { d: '2026-10-10', name: 'Olive oil', foodId: 'oil', qty: 1, unit: 'tbsp', kcal: 122, p: 0, c: 0, f: 13.8, fib: 0 },
    })
  })

  it('refuses an amount that is zero, negative or in a unit the food does not have', () => {
    expect(mealFromFood(oil, 0, 'g', '2026-10-10')).toEqual({ error: 'amount' })
    expect(mealFromFood(oil, -5, 'g', '2026-10-10')).toEqual({ error: 'amount' })
    expect(mealFromFood(oil, 1, 'L', '2026-10-10')).toEqual({ error: 'amount' })
  })
})

describe('foodByBarcode', () => {
  it('finds a saved food by its barcode, else null', () => {
    const foods = [{ id: 'a', name: 'A' }, { id: 'n', name: 'Nutella', barcode: '3017620422003' }]
    expect(foodByBarcode(foods, '3017620422003').id).toBe('n')
    expect(foodByBarcode(foods, '0000000000000')).toBeNull()
    expect(foodByBarcode(undefined, '3017620422003')).toBeNull()
  })
})

describe('recentMeals', () => {
  const m = (id, d, name, p = 10) => ({ id, d, name, kcal: 100, p, c: 0, f: 0, fib: 0 })

  it('lists distinct meals by name, most recent first, capped', () => {
    const meals = [m('1', '2026-10-08', 'Oats'), m('2', '2026-10-09', 'Chicken rice'), m('3', '2026-10-10', 'Oats', 13), m('4', '2026-10-10', 'Shake')]
    expect(recentMeals(meals, 2).map(x => [x.name, x.p])).toEqual([['Shake', 10], ['Oats', 13]])
    expect(recentMeals(meals).map(x => x.name)).toEqual(['Shake', 'Oats', 'Chicken rice'])
  })

  it('treats names case- and space-insensitively and skips nameless entries', () => {
    expect(recentMeals([m('1', '2026-10-10', 'oats '), m('2', '2026-10-09', 'Oats'), { id: '3', d: '2026-10-10' }]).length).toBe(1)
    expect(recentMeals(undefined)).toEqual([])
  })
})

describe('shiftDay', () => {
  it('moves an ISO day across month and year ends', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('profileFromInput', () => {
  it('accepts a sensible profile, keeping the fallback weight', () => {
    expect(profileFromInput({ born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 300 }, { kg: 78 }, 2026))
      .toEqual({ profile: { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 300, kg: 78 } })
    expect(profileFromInput({ born: 1998, cm: 160, sex: 'female', activity: 1.4, deficit: 0 }, null, 2026))
      .toEqual({ profile: { born: 1998, cm: 160, sex: 'female', activity: 1.4, deficit: 0 } })
  })

  it('takes a surplus as a negative deficit, down to 500 kcal', () => {
    expect(profileFromInput({ born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: -300 }, {}, 2026).profile.deficit).toBe(-300)
    expect(profileFromInput({ born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: -600 }, {}, 2026)).toEqual({ error: 'numbers' })
  })

  it('refuses values no adult profile has', () => {
    for (const bad of [{ born: 2024 }, { born: 1900 }, { cm: 90 }, { cm: 260 }, { activity: 0.9 }, { activity: 2.6 }, { deficit: 1500 }, { born: null }, { sex: 'x' }, { sex: undefined }]) {
      expect(profileFromInput({ born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, ...bad }, {}, 2026)).toEqual({ error: 'numbers' })
    }
  })
})

describe('manualFromInput', () => {
  it('takes five targets, fibre optional', () => {
    expect(manualFromInput({ kcal: 2500, p: 170, c: 280, f: 70, fib: null })).toEqual({ manual: { kcal: 2500, p: 170, c: 280, f: 70, fib: 0 } })
  })

  it('needs calories and protein in a plausible range', () => {
    expect(manualFromInput({ kcal: 500, p: 170, c: 0, f: 0 })).toEqual({ error: 'numbers' })
    expect(manualFromInput({ kcal: 2500, p: 0, c: 0, f: 0 })).toEqual({ error: 'numbers' })
    expect(manualFromInput({ kcal: 2500, p: 700, c: 0, f: 0 })).toEqual({ error: 'numbers' })
  })
})

describe('estimateTotals', () => {
  it('adds up each component\'s grams × its macros per 100 g', () => {
    const items = [
      { name: 'Broth', g: 400, per100: { kcal: 15, p: 1.5, c: 1, f: 0.5, fib: 0 } },
      { name: 'Rice noodles', g: 200, per100: { kcal: 110, p: 1.8, c: 25, f: 0.2, fib: 1 } },
      { name: 'Beef', g: 90, per100: { kcal: 200, p: 26, c: 0, f: 10, fib: 0 } },
    ]
    expect(estimateTotals(items)).toEqual({ kcal: 460, p: 33, c: 54, f: 11.4, fib: 2 })
  })
  it('a component with no grams adds nothing; no components is all zero', () => {
    expect(estimateTotals([{ name: 'x', g: null, per100: { kcal: 500, p: 10, c: 0, f: 0, fib: 0 } }])).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
    expect(estimateTotals([])).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
  })
})

describe('handPortions', () => {
  // Precision Nutrition, "How to do hand portion math": per palm of protein, fist of vegetables,
  // cupped hand of carbs and thumb of fat. No fibre figure is given, so none is counted.
  it('2 palms + 2 cupped hands + 1 thumb, for a man and for a woman', () => {
    expect(handPortions({ palm: 2, cupped: 2, thumb: 1 }, 'male')).toEqual({ kcal: 630, p: 56, c: 56, f: 20, fib: 0 })
    expect(handPortions({ palm: 2, cupped: 2, thumb: 1 }, 'female')).toEqual({ kcal: 570, p: 52, c: 50, f: 18, fib: 0 })
  })
  it('half portions and vegetables count; nonsense counts as nothing', () => {
    expect(handPortions({ palm: 0.5, fist: 2 }, 'male')).toEqual({ kcal: 123, p: 15, c: 11, f: 2.3, fib: 0 })
    expect(handPortions({ palm: -1, fist: 'x' })).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
  })
})
