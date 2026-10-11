// @vitest-environment happy-dom
// gettingprime: the Eating out tab of the meal sheet — find a restaurant dish, log it by serving.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { MealForm } from './NutritionSheet.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({ S: { ...s.S, unit: 'kg', bodyweight: [], meals: [], foods: [], nutrition: { mode: 'auto', profile: { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 } } } }))
  nevo(null)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

// The NEVO file (Dutch food table) exists only where its owner built it: a 404 means none.
const nevo = rows => vi.stubGlobal('fetch', vi.fn(async () => (rows ? { ok: true, json: async () => rows } : { ok: false, status: 404 })))

const today = todayISO()
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const field = label => host.querySelector(`input[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const dish = name => [...host.querySelectorAll('[data-dish]')].find(el => el.textContent.includes(name))

async function search(q) {
  act(() => root.render(<MealForm close={() => {}} />))
  act(() => button('Eating out').click())
  type(field('Search dishes'), q)
  await vi.waitFor(() => expect(host.querySelectorAll('[data-dish]').length).toBeGreaterThan(0))
}

describe('Eating out', () => {
  it('finds a dish by name, accents ignored, with what a serving holds', async () => {
    await search('phở')
    expect(dish('Soup, pho, with meat').textContent).toContain('189 kcal · 14.2 g P per serving (245 g)')
  })

  it('logs one and a half servings of pho and says how much protein is left', async () => {
    await search('pho')
    act(() => dish('Soup, pho, with meat').click())
    expect(host.textContent).toContain('Restaurant plates are often 1.5–2 servings')
    expect(field('Amount').value).toBe('1')
    type(field('Amount'), '1.5')
    act(() => button('Log').click())
    expect(useStore.getState().S.meals[0]).toMatchObject({ d: today, name: 'Soup, pho, with meat', qty: 1.5, unit: 'serving', kcal: 283, p: 21.3 })   // 367.5 g × 77 kcal and 5.8 g per 100 g
    expect(useUI.getState().toastMsg).toContain('134.7 g protein to go today')
  })

  it('saves a dish to My foods with its serving', async () => {
    await search('pad thai chicken')
    act(() => dish('Pad Thai with chicken').click())
    act(() => button('Save to My foods').click())
    act(() => button('Save food').click())
    expect(useStore.getState().S.foods[0]).toMatchObject({ name: 'Pad Thai with chicken', base: 'g', serving: { amt: 200 }, per100: { kcal: 154, p: 8.1 } })
  })

  it('says so when nothing matches', async () => {
    act(() => root.render(<MealForm close={() => {}} />))
    act(() => button('Eating out').click())
    type(field('Search dishes'), 'zzzz')
    await vi.waitFor(() => expect(host.textContent).toContain('No dishes found'))
  })
})

describe('Eating out with the Dutch food table (NEVO)', () => {
  const NASI = ['Fried rice Indonesian', 148, 5.9, 20.3, 4.85, 1.4, null, 'Nasi goreng', 'nevo']
  it('finds a NEVO food in English or by its Dutch name, and credits RIVM as its terms require', async () => {
    nevo([NASI])
    await search('nasi')
    expect(dish('Fried rice Indonesian').textContent).toContain('148 kcal · 5.9 g P per 100 g')
    expect(host.textContent).toContain('Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven and other data sources')
    act(() => dish('Fried rice Indonesian').click())
    expect(host.textContent).toContain('Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven')
    type(field('Amount'), '300')
    act(() => button('Log').click())
    expect(useStore.getState().S.meals[0]).toMatchObject({ name: 'Fried rice Indonesian', qty: 300, unit: 'g', kcal: 444, p: 17.7 })
  })
  it('without the file there is no credit line and the USDA dishes still work', async () => {
    await search('pho')
    expect(host.textContent).not.toContain('NEVO')
  })
})

