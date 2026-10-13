// @vitest-environment happy-dom
// gettingprime: Plan → Friends. The sharing switch and the read-only view of friends' plans.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import FriendPlans from './FriendPlans.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  api.mockReset()
  useStore.setState(s => ({ S: { ...s.S, unit: 'kg', weekStart: 1, sharePlan: undefined } }))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const FRIEND = {
  id: 'u_fr', name: 'Friend', updated: Date.now() - 2 * 86400000,
  plan: {
    unit: 'kg', week: { 1: ['ra'] },
    routines: [{ id: 'ra', name: 'Push', emoji: '💪', ex: [{ id: '0025', sets: 3, reps: 8, weight: 100 }, { id: 'c_1', sets: 3, reps: 12 }] }],
    customEx: [{ id: 'c_1', n: 'Band press', bp: 'chest' }],
  },
}
const render = async () => { await act(async () => root.render(<FriendPlans />)) }

describe('FriendPlans', () => {
  it('sharing is off until switched on, and the switch saves it', async () => {
    api.mockResolvedValue({ friends: [] })
    await render()
    const sw = host.querySelector('[aria-label="Share my plan"]')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    act(() => sw.click())
    expect(useStore.getState().S.sharePlan).toBe(true)
  })

  it('shows each friend\'s week and routines, read-only, in my unit', async () => {
    useStore.setState(s => ({ S: { ...s.S, unit: 'lb' } }))
    api.mockResolvedValue({ friends: [FRIEND] })
    await render()
    expect(api).toHaveBeenCalledWith('/api/friends/plans')
    const text = host.textContent
    expect(text).toContain('Friend')
    expect(text).toContain('2 days ago')
    expect(text).toMatch(/Monday.*Push/)
    expect(text).toContain('barbell bench press')
    expect(text).toContain('220.5 lb')
    expect(text).toContain('Band press')
    expect(host.querySelector('input')).toBeNull()   // nothing of theirs is editable
  })

  it('says so when nobody shares, and when the server cannot be reached', async () => {
    api.mockResolvedValue({ friends: [] })
    await render()
    expect(host.textContent).toContain('No one is sharing a plan yet')
    act(() => root.unmount()); root = createRoot(host)
    api.mockRejectedValue(new Error('offline'))
    await render()
    expect(host.textContent).toContain('Connect to see friends’ plans')
  })
})
