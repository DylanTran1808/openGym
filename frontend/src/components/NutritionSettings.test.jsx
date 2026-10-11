// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { targetsFor } from '../lib/nutrition.js'
import NutritionCard from './NutritionCard.jsx'
import { NutritionSettings } from './NutritionSettings.jsx'
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
const ME = { mode: 'auto', profile: { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 } }
const withState = over => useStore.setState(s => ({ S: { ...s.S, unit: 'kg', bodyweight: [{ d: today, w: 78 }], meals: [], foods: [], nutrition: ME, ...over } }))
const S = () => useStore.getState().S
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const field = label => host.querySelector(`input[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)

describe('targets follow the weight', () => {
  it('a new weigh-in moves the card\'s protein target with nothing else to do', () => {
    withState({})
    act(() => root.render(<NutritionCard />))
    expect(host.querySelector('[data-macro="p"]').textContent).toContain('/ 156 g')
    act(() => useStore.getState().update(s => { s.bodyweight = [...s.bodyweight, { d: today, w: 80, t: Date.now() }] }))
    expect(host.querySelector('[data-macro="p"]').textContent).toContain('/ 160 g')
  })

  it('the card\'s gear opens nutrition settings', () => {
    withState({})
    act(() => root.render(<NutritionCard />))
    act(() => host.querySelector('button[aria-label="Nutrition settings"]').click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })
})

describe('NutritionSettings', () => {
  it('auto: shows what the latest weigh-in gives, and a profile change applies on save', () => {
    withState({})
    act(() => root.render(<NutritionSettings close={() => {}} />))
    expect(host.textContent).toContain('78 kg')
    expect(host.textContent).toContain('2,380 kcal')
    type(field('Calorie deficit (kcal, negative = surplus)'), '300')
    act(() => button('Save').click())
    expect(S().nutrition.mode).toBe('auto')
    expect(S().nutrition.profile.deficit).toBe(300)
    expect(targetsFor(S(), today).kcal).toBe(2480)
  })

  it('manual: typed targets hold, a weigh-in leaves them alone, auto brings the derived ones back', () => {
    withState({})
    act(() => root.render(<NutritionSettings close={() => {}} />))
    act(() => button('Manual').click())
    expect(field('Protein target (g)').value).toBe('156')   // prefilled from auto
    type(field('Protein target (g)'), '170')
    act(() => button('Save').click())
    expect(targetsFor(S(), today).p).toBe(170)
    act(() => useStore.getState().update(s => { s.bodyweight = [...s.bodyweight, { d: today, w: 90, t: Date.now() }] }))
    expect(targetsFor(S(), today).p).toBe(170)
    act(() => button('Auto').click())
    act(() => button('Save').click())
    expect(targetsFor(S(), today).p).toBe(180)
  })

  it('refuses an implausible profile and keeps the old one', () => {
    withState({})
    act(() => root.render(<NutritionSettings close={() => {}} />))
    type(field('Height (cm)'), '20')
    act(() => button('Save').click())
    expect(useUI.getState().toastMsg).toBe('Check the numbers')
    expect(targetsFor(S(), today).kcal).toBe(2380)
  })
})

describe('protein reminder', () => {
  it('is off by default, and turning it on saves the times on this device\'s clock', () => {
    withState({})
    act(() => root.render(<NutritionSettings close={() => {}} />))
    const sw = host.querySelector('[aria-label="Protein reminder"]')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    act(() => sw.click())
    type(host.querySelector('input[aria-label="Reminder 1"]'), '13:00')
    act(() => button('Save').click())
    const nudge = S().nutrition.nudge
    expect(nudge.on).toBe(true)
    expect(nudge.times).toEqual(['13:00', '19:30'])
    expect(nudge.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('a cleared time drops that slot', () => {
    withState({ nutrition: { ...ME, nudge: { on: true, times: ['14:00', '19:30'], tz: 'UTC' } } })
    act(() => root.render(<NutritionSettings close={() => {}} />))
    type(host.querySelector('input[aria-label="Reminder 2"]'), '')
    act(() => button('Save').click())
    expect(S().nutrition.nudge.times).toEqual(['14:00'])
  })
})

describe('settings inputs follow the app theme', () => {
  it('styles every number input as a field', () => {
    withState({})
    act(() => root.render(<NutritionSettings close={() => {}} />))
    const auto = [...host.querySelectorAll('input:not([type="time"])')]
    act(() => button('Manual').click())
    const manual = [...host.querySelectorAll('input:not([type="time"])')]
    for (const el of [...auto, ...manual]) expect(el.className, el.getAttribute('aria-label')).toMatch(/\bfield\b/)
  })
})

describe('a profile with no targets yet (a friend just invited)', () => {
  const fresh = { bodyweight: [], nutrition: undefined }
  it('the card asks for setup instead of showing somebody else\'s targets', () => {
    withState(fresh)
    act(() => root.render(<NutritionCard />))
    expect(host.querySelector('[data-macro]')).toBeNull()
    expect(host.textContent).not.toContain('156')
    act(() => button('Set up your targets').click())
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('setup takes sex, age, height and weight, logs the weight, and gives their own targets', () => {
    withState(fresh)
    act(() => root.render(<NutritionSettings close={() => {}} />))
    expect(field('Birth year').value).toBe('')
    act(() => button('Female').click())
    type(field('Birth year'), '1998')
    type(field('Height (cm)'), '160')
    type(field('Weight (kg)'), '55')
    type(field('Calorie deficit (kcal, negative = surplus)'), '300')
    act(() => button('Save').click())
    expect(S().nutrition.profile).toMatchObject({ born: 1998, cm: 160, sex: 'female', activity: 1.55, deficit: 300 })
    expect(S().bodyweight).toEqual([{ d: today, w: 55, t: expect.any(Number) }])
    // Mifflin-St Jeor (female): 10×55 + 6.25×160 − 5×age − 161, × 1.55 − 300
    const age = Number(today.slice(0, 4)) - 1998
    const kcal = Math.round(((550 + 1000 - 5 * age - 161) * 1.55 - 300) / 10) * 10
    expect(targetsFor(S(), today)).toMatchObject({ kcal, p: 110, f: 44 })
  })

  it('setup will not save without a weight when none was ever logged', () => {
    withState(fresh)
    act(() => root.render(<NutritionSettings close={() => {}} />))
    type(field('Birth year'), '1998')
    type(field('Height (cm)'), '160')
    act(() => button('Save').click())
    expect(S().nutrition).toBeUndefined()
    expect(useUI.getState().toastMsg).toBe('Check the numbers')
  })

  it('logging a meal with no targets just says it is logged', () => {
    withState(fresh)
    act(() => root.render(<MealForm close={() => {}} />))
    act(() => button('Quick').click())
    type(host.querySelector('input[aria-label="Name"]'), 'Rice')
    type(field('Protein (g)'), '5')
    act(() => button('Log meal').click())
    expect(useUI.getState().toastMsg).toBe('Logged')
  })
})

