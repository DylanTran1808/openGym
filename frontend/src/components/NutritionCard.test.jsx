// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import NutritionCard from './NutritionCard.jsx'
import { MealForm } from './NutritionSheet.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '' })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const today = todayISO()
const withState = over => useStore.setState(s => ({ S: { ...s.S, unit: 'kg', bodyweight: [], meals: [], foods: [], nutrition: undefined, ...over } }))
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const field = label => host.querySelector(`input[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)

describe('NutritionCard', () => {
  it('shows protein eaten against the target from the latest weigh-in, today only', () => {
    withState({
      bodyweight: [{ d: today, w: 80 }],
      meals: [
        { id: 'a', d: today, name: 'Oats', kcal: 400, p: 50, c: 60, f: 8, fib: 9 },
        { id: 'b', d: today, name: 'Chicken', kcal: 300, p: 42, c: 0, f: 6, fib: 0 },
        { id: 'c', d: '2000-01-01', name: 'Old', kcal: 999, p: 99, c: 0, f: 0, fib: 0 },
      ],
    })
    act(() => root.render(<NutritionCard />))
    expect(host.querySelector('[data-macro="p"]').textContent).toContain('92 / 160 g')
    expect(host.textContent).toContain('Oats')
    expect(host.textContent).not.toContain('Old')
  })

  it('invites a first log on an empty day', () => {
    withState({})
    act(() => root.render(<NutritionCard />))
    expect(host.querySelector('[data-macro="p"]').textContent).toContain('0 / 156 g')
    expect(button('Add food')).toBeTruthy()
  })
})

describe('MealForm', () => {
  it('logs a meal for today and says how much protein is left', () => {
    withState({})
    let closed = false
    act(() => root.render(<MealForm close={() => { closed = true }} />))
    type(field('Name'), 'Chicken rice')
    type(field('Protein (g)'), '45')
    type(field('Calories (kcal)'), '650')
    act(() => button('Log meal').click())
    const meals = useStore.getState().S.meals
    expect(meals).toHaveLength(1)
    expect(meals[0]).toMatchObject({ d: today, name: 'Chicken rice', kcal: 650, p: 45, c: 0, f: 0, fib: 0 })
    expect(meals[0].id).toBeTruthy()
    expect(closed).toBe(true)
    expect(useUI.getState().toastMsg).toBe('111 g protein to go today')
  })

  it('says the goal is hit once protein reaches the target', () => {
    withState({ meals: [{ id: 'a', d: today, name: 'Big day', kcal: 2000, p: 150, c: 0, f: 0, fib: 0 }] })
    act(() => root.render(<MealForm close={() => {}} />))
    type(field('Name'), 'Shake')
    type(field('Protein (g)'), '10')
    act(() => button('Log meal').click())
    expect(useUI.getState().toastMsg).toBe('Protein goal hit ✓')
  })

  it('refuses a meal without a name and keeps the sheet open', () => {
    withState({})
    let closed = false
    act(() => root.render(<MealForm close={() => { closed = true }} />))
    type(field('Protein (g)'), '30')
    act(() => button('Log meal').click())
    expect(useStore.getState().S.meals).toHaveLength(0)
    expect(closed).toBe(false)
    expect(useUI.getState().toastMsg).toBe('Give the meal a name')
  })
})

describe('My foods', () => {
  const oil = { id: 'oil', name: 'Olive oil', base: 'g', gPerMl: 0.92, per100: { kcal: 884, p: 0, c: 0, f: 100, fib: 0 } }

  it('saves a new food from the sheet', () => {
    withState({})
    act(() => root.render(<MealForm close={() => {}} />))
    act(() => button('My foods').click())
    act(() => button('New food').click())
    type(field('Name'), 'Greek yoghurt')
    type(field('Protein (g)'), '10')
    type(field('Calories (kcal)'), '97')
    act(() => button('Save food').click())
    const foods = useStore.getState().S.foods
    expect(foods).toHaveLength(1)
    expect(foods[0]).toMatchObject({ name: 'Greek yoghurt', base: 'g', per100: { kcal: 97, p: 10, c: 0, f: 0, fib: 0 } })
    expect(host.textContent).toContain('Greek yoghurt')
  })

  it('logs a tablespoon of a saved food and never offers a cup', () => {
    withState({ foods: [oil] })
    let closed = false
    act(() => root.render(<MealForm close={() => { closed = true }} />))
    act(() => [...host.querySelectorAll('[data-food]')].find(el => el.textContent.includes('Olive oil')).click())
    type(field('Amount'), '1')
    act(() => button('tbsp').click())
    expect(host.textContent).toContain('122 kcal')
    expect(host.textContent.toLowerCase()).not.toContain('cup')
    act(() => button('Log').click())
    expect(useStore.getState().S.meals[0]).toMatchObject({ name: 'Olive oil', foodId: 'oil', qty: 1, unit: 'tbsp', kcal: 122, f: 13.8 })
    expect(closed).toBe(true)
  })

  it('editing a food leaves meals already logged alone', () => {
    withState({ foods: [oil], meals: [{ id: 'm', d: today, name: 'Olive oil', foodId: 'oil', qty: 1, unit: 'tbsp', kcal: 122, p: 0, c: 0, f: 13.8, fib: 0 }] })
    act(() => root.render(<MealForm close={() => {}} />))
    act(() => [...host.querySelectorAll('[data-food]')].find(el => el.textContent.includes('Olive oil')).click())
    act(() => button('Edit food').click())
    type(field('Calories (kcal)'), '900')
    act(() => button('Save food').click())
    expect(useStore.getState().S.foods[0].per100.kcal).toBe(900)
    expect(useStore.getState().S.meals[0].kcal).toBe(122)
  })

  it('deletes a food', () => {
    withState({ foods: [oil] })
    act(() => root.render(<MealForm close={() => {}} />))
    act(() => [...host.querySelectorAll('[data-food]')].find(el => el.textContent.includes('Olive oil')).click())
    act(() => button('Edit food').click())
    act(() => button('Delete food').click())
    expect(useStore.getState().S.foods).toHaveLength(0)
  })
})

describe('Barcode lookup', () => {
  const nutella = { id: 'n', name: 'Nutella', base: 'g', barcode: '3017620422003', per100: { kcal: 539, p: 6.3, c: 57.5, f: 30.9, fib: 0 } }
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })
  const respond = (status, body) => { globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) }
  const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
  const lookUp = async code => {
    act(() => button('My foods').click())
    type(field('Barcode'), code)
    await act(async () => button('Look up').click())
    await flush()
  }

  it('a saved food with that barcode opens straight away, no network', async () => {
    withState({ foods: [nutella] })
    globalThis.fetch = vi.fn()
    act(() => root.render(<MealForm close={() => {}} />))
    await lookUp('3017620422003')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(field('Amount')).toBeTruthy()
    expect(host.textContent).toContain('Nutella')
  })

  it('an unknown barcode is looked up and opens a prefilled food to check and save', async () => {
    withState({})
    respond(200, { food: { name: 'Skyr (Arla)', base: 'g', barcode: '5701234567890', per100: { kcal: 63, p: 11, c: 3.9, f: 0.2, fib: 0 }, serving: { amt: 150 } } })
    act(() => root.render(<MealForm close={() => {}} />))
    await lookUp('5701234567890')
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/api/food/5701234567890')
    expect(field('Name').value).toBe('Skyr (Arla)')
    act(() => button('Save food').click())
    expect(useStore.getState().S.foods[0]).toMatchObject({ name: 'Skyr (Arla)', barcode: '5701234567890', per100: { p: 11 }, serving: { amt: 150 } })
  })

  it('a product nobody knows opens an empty food with the barcode kept', async () => {
    withState({})
    respond(404, { error: 'not found' })
    act(() => root.render(<MealForm close={() => {}} />))
    await lookUp('12345678')
    expect(field('Name').value).toBe('')
    type(field('Name'), 'Local bread')
    act(() => button('Save food').click())
    expect(useStore.getState().S.foods[0]).toMatchObject({ name: 'Local bread', barcode: '12345678' })
  })

  it('refuses a barcode that is not 8 to 14 digits', async () => {
    withState({})
    globalThis.fetch = vi.fn()
    act(() => root.render(<MealForm close={() => {}} />))
    await lookUp('123')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toBe('A barcode is 8 to 14 digits')
  })
})
