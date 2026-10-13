// @vitest-environment happy-dom
// gettingprime: the Friends view is a third segment on Plan, there only when signed in to a server.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Plan from './Plan.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, user: null }
  state.snapshot = () => ({ S: state.S, user: state.user, update: mut => { const next = structuredClone(state.S); mut(next); state.S = next } })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => (selector ? selector(mocks.snapshot()) : mocks.snapshot())
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('../sheets.jsx', () => ({ starterPlanSheet: vi.fn(), dayAssignSheet: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(async () => ({ friends: [] })) }))

let host, root
beforeEach(() => {
  mocks.S = { unit: 'kg', workouts: [], exWeights: {}, week: {}, dayPlan: {}, routines: [] }
  mocks.user = null
  try { localStorage.clear() } catch { /* none */ }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const segs = () => [...host.querySelectorAll('.plan-views button')].map(b => b.textContent)
const seg = label => [...host.querySelectorAll('.plan-views button')].find(b => b.textContent === label)

describe('Plan → Friends', () => {
  it('is a segment only when signed in, and opens the friends view', async () => {
    act(() => root.render(<Plan />))
    expect(segs()).toEqual(['Schedule', 'Routines'])
    act(() => root.unmount()); root = createRoot(host)
    mocks.user = { id: 'u_me', name: 'Me' }
    act(() => root.render(<Plan />))
    expect(segs()).toEqual(['Schedule', 'Routines', 'Friends'])
    await act(async () => seg('Friends').click())
    expect(host.querySelector('[aria-label="Share my plan"]')).not.toBeNull()
    expect(localStorage.getItem('gym_plan_view')).toBe('friends')
  })
})
