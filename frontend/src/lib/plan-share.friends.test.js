// gettingprime: a friend's shared plan (GET /api/friends/plans) read the way a plan file is.
import { describe, expect, it } from 'vitest'
import { friendPlan } from './plan-share.js'

const FRIEND = {
  id: 'u_fr', name: 'Friend', updated: 5000,
  plan: {
    unit: 'kg', week: { 1: ['ra'], 4: ['rb'] },
    routines: [
      { id: 'ra', name: 'Push', emoji: '💪', _ts: 1, ex: [{ id: '0025', sets: 3, reps: 8, weight: 100 }, { id: 'c_1', sets: 3, reps: 12 }] },
      { id: 'rb', name: 'Pull', ex: [{ id: 'nope', sets: 3 }] },
    ],
    customEx: [{ id: 'c_1', n: 'Band press', bp: 'chest', media: 'm/1.jpg' }],
  },
}

describe('friendPlan', () => {
  it('reads the plan in my unit, keeps their custom exercise and drops what resolves to nothing', () => {
    const b = friendPlan(FRIEND, 'lb')
    expect(b.routines.map(r => r.name)).toEqual(['Push', 'Pull'])
    expect(b.routines[0].ex[0]).toMatchObject({ id: '0025', weight: 220.5 })
    expect(b.routines[0].ex[1].id).toBe('c_1')
    expect(b.routines[1].ex).toEqual([])
    expect(b.dropped).toBe(1)
    expect(b.week).toEqual({ 1: ['ra'], 4: ['rb'] })
    expect(b.customEx).toEqual([{ id: 'c_1', n: 'Band press', bp: 'chest' }])   // their photo stays theirs
    expect(b.name).toBe('Friend')
  })
})

describe('copying from a friend', () => {
  it('one routine arrives as one new routine of mine, in my unit, with their custom exercise as mine', async () => {
    const { oneRoutine, mergePlan } = await import('./plan-share.js')
    const b = oneRoutine(friendPlan(FRIEND, 'lb'), 'ra')
    expect(b).toMatchObject({ name: 'Push', routineCount: 1, exerciseCount: 2, scheduledDays: 0, week: {} })
    const s = { unit: 'lb', routines: [{ id: 'mine', name: 'Legs', ex: [] }], week: { 2: ['mine'] }, customEx: [] }
    mergePlan(s, b, { schedule: false })
    expect(s.routines.map(r => r.name)).toEqual(['Legs', 'Push'])
    const copy = s.routines[1]
    expect(copy.id).not.toBe('ra')
    expect(copy.ex[0]).toMatchObject({ id: '0025', weight: 220.5 })   // converted once, not twice
    expect(s.customEx).toHaveLength(1)
    expect(s.customEx[0]).toMatchObject({ n: 'Band press', custom: true })
    expect(copy.ex[1].id).toBe(s.customEx[0].id)
    expect(s.week).toEqual({ 2: ['mine'] })
  })
})
