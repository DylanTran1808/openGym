// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
