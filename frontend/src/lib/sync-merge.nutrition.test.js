import { describe, expect, it } from 'vitest'
import { highestStamp, localExtras, mergeStates, resetIdsOf, sinceReset, stampChange, stampDeletions } from './sync-merge.js'

// gettingprime: meals and saved foods merge like gym cards — union by id, field by field on a shared
// id, a removal holds against a copy that was offline. Without this they were one setting each and
// the newer copy's whole list won: a meal logged on an offline phone vanished the moment the
// desktop had saved anything since.
const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], meals: [], foods: [], _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))
const ids = xs => (xs || []).map(x => x.id).sort()
const meal = (id, over = {}) => ({ id, d: '2026-10-10', name: id, kcal: 300, p: 30, c: 20, f: 10, fib: 2, _ts: 50, ...over })
const food = (id, over = {}) => ({ id, name: id, base: 'g', per100: { kcal: 100, p: 10, c: 10, f: 1, fib: 1 }, _ts: 50, ...over })

describe('meals and foods merge by id', () => {
  it('keeps the meals and foods of both copies', () => {
    const a = base({ _ts: 200, meals: [meal('m1')], foods: [food('f1')] })
    const b = base({ _ts: 100, meals: [meal('m2')], foods: [food('f2')] })
    const m = mergeStates(a, b)
    expect(ids(m.meals)).toEqual(['m1', 'm2'])
    expect(ids(m.foods)).toEqual(['f1', 'f2'])
  })

  it('keeps a meal logged offline on the phone when the desktop saved later', () => {
    const both = base({ _ts: 100, meals: [meal('m1')] })
    const phone = clone(both)
    phone.meals.push(meal('fromPhone', { _ts: 0 }))
    phone._ts = stampChange(both, phone, 150)
    const desktop = clone(both)
    desktop.restSec = 120
    desktop._ts = stampChange(both, desktop, 300)
    for (const m of [mergeStates(phone, desktop), mergeStates(desktop, phone)]) expect(ids(m.meals)).toEqual(['fromPhone', 'm1'])
  })

  it('takes each field of a shared meal from the copy that changed it last', () => {
    const both = base({ _ts: 100, meals: [meal('m1')] })
    const a = clone(both)
    a.meals[0].p = 45
    a._ts = stampChange(both, a, 1000)
    const b = clone(both)
    b.meals[0].name = 'Chicken rice'
    b._ts = stampChange(both, b, 2000)
    const m = mergeStates(a, b)
    expect(m.meals[0]).toMatchObject({ id: 'm1', p: 45, name: 'Chicken rice' })
  })

  it('stamps a new or edited meal and food, and counts their stamps', () => {
    const prev = base({ _ts: 100, meals: [meal('m1')], foods: [food('f1')] })
    const next = clone(prev)
    next.meals.push(meal('m2', { _ts: undefined }))
    next.foods[0].name = 'Renamed'
    const at = stampChange(prev, next, 5000)
    expect(next.meals.find(x => x.id === 'm2')._ts).toBe(at)
    expect(next.foods[0]._ts).toBe(at)
    expect(next.meals.find(x => x.id === 'm1')._ts).toBe(50)
    expect(highestStamp(base({ meals: [meal('m9', { _ts: 7777 })] }))).toBe(7777)
  })
})

describe('a removed meal or food stays removed', () => {
  const both = base({ _ts: 300, meals: [meal('m1'), meal('keep')], foods: [food('f1')] })
  const removedOnA = () => {
    const a = clone(both)
    a.meals = a.meals.filter(x => x.id !== 'm1')
    a.foods = []
    a._ts = 1000
    return stampDeletions(both, a, 1000)
  }
  const offlineB = () => {
    const b = clone(both)
    b.bodyweight = [{ d: '2026-10-11', w: 79, t: 2000 }]
    b._ts = 2000
    return b
  }

  it('records the removal', () => {
    expect(removedOnA().deleted).toEqual({ meals: { m1: 1000 }, foods: { f1: 1000 } })
  })

  it('holds against the offline copy, whichever is newer', () => {
    for (const m of [mergeStates(removedOnA(), offlineB()), mergeStates(offlineB(), removedOnA())]) {
      expect(ids(m.meals)).toEqual(['keep'])
      expect(m.foods).toEqual([])
    }
  })
})

describe('reset and sign-in', () => {
  it('a reset names the meals and foods it wiped, and a copy that missed it drops exactly those', () => {
    const old = base({ meals: [meal('m1')], foods: [food('f1')] })
    const ids0 = resetIdsOf(old)
    expect(ids0.meals).toEqual(['m1'])
    expect(ids0.foods).toEqual(['f1'])
    const late = base({ meals: [meal('m1'), meal('after')], foods: [food('f1')] })
    const out = sinceReset(late, 500, ids0)
    expect(ids(out.meals)).toEqual(['after'])
    expect(out.foods).toEqual([])
  })

  it('a reset without ids keeps only meals and foods edited after it', () => {
    const late = base({ meals: [meal('old', { _ts: 100 }), meal('new', { _ts: 900 })], foods: [food('f', { _ts: 100 })] })
    const out = sinceReset(late, 500)
    expect(ids(out.meals)).toEqual(['new'])
    expect(out.foods).toEqual([])
  })

  it('sign-in asks about meals and foods only this device has', () => {
    const local = base({ meals: [meal('m1'), meal('m2')], foods: [food('f1')] })
    const server = base({ meals: [meal('m1')] })
    expect(localExtras(local, server).setup).toBe(2)
  })
})
