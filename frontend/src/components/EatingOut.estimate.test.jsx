// @vitest-environment happy-dom
// gettingprime: Eating out → estimate a meal from a photo or a description (POST /api/food/estimate),
// correct the grams of each component, log it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
vi.mock('../lib/photo.js', () => ({ shrinkImage: vi.fn(async () => 'data:image/jpeg;base64,QUJD') }))
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { MealForm } from './NutritionSheet.jsx'

const ME = { mode: 'auto', profile: { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 } }
const ESTIMATE = { name: 'Phở bò', items: [
  { name: 'Broth', g: 400, per100: { kcal: 15, p: 1.5, c: 1, f: 0.5, fib: 0 } },
  { name: 'Rice noodles', g: 200, per100: { kcal: 110, p: 1.8, c: 25, f: 0.2, fib: 1 } },
  { name: 'Beef', g: 90, per100: { kcal: 200, p: 26, c: 0, f: 10, fib: 0 } },
] }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({ config: { coach: { enabled: true } }, S: { ...s.S, unit: 'kg', bodyweight: [], meals: [], foods: [], nutrition: ME } }))
  api.mockReset()
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const today = todayISO()
const type = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const field = label => host.querySelector(`input[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const totals = () => host.querySelector('[data-estimate-total]').textContent

function open() {
  act(() => root.render(<MealForm close={() => {}} />))
  act(() => button('Eating out').click())
}

describe('Estimate with AI', () => {
  it('estimates from a description, lets the grams be corrected, and logs exactly the totals shown', async () => {
    api.mockResolvedValue({ estimate: ESTIMATE })
    open()
    type(field('Describe the meal'), 'large phở bò')
    await act(async () => button('Estimate').click())
    expect(api).toHaveBeenCalledWith('/api/food/estimate', expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'large phở bò' }) }))
    expect(field('Name').value).toBe('Phở bò')
    expect(totals()).toContain('460 kcal · 33 g P')
    type(field('Grams of Beef'), '180')   // a bigger portion of meat than the AI saw
    expect(totals()).toContain('640 kcal · 56.4 g P')
    act(() => button('Log meal').click())
    expect(useStore.getState().S.meals[0]).toMatchObject({ d: today, name: 'Phở bò', kcal: 640, p: 56.4, c: 54, f: 20.4, fib: 2 })
    expect(useUI.getState().toastMsg).toContain('99.6 g protein to go today')
  })

  it('sends the photo, shrunk, with the description', async () => {
    api.mockResolvedValue({ estimate: ESTIMATE })
    open()
    const file = new File(['x'], 'meal.jpg', { type: 'image/jpeg' })
    const input = host.querySelector('input[type="file"]')
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(host.querySelector('img[alt="Meal photo"]').getAttribute('src')).toBe('data:image/jpeg;base64,QUJD')
    await act(async () => button('Estimate').click())
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ image: 'data:image/jpeg;base64,QUJD' })
  })

  it('a component can be dropped from the estimate', async () => {
    api.mockResolvedValue({ estimate: ESTIMATE })
    open()
    type(field('Describe the meal'), 'pho')
    await act(async () => button('Estimate').click())
    act(() => host.querySelector('button[aria-label="Remove Broth"]').click())
    expect(totals()).toContain('400 kcal · 27 g P')
  })

  it('says so when the AI is busy or fails, and the dish search still works', async () => {
    open()
    type(field('Describe the meal'), 'pho')
    api.mockRejectedValueOnce(Object.assign(new Error('too many'), { status: 429 }))
    await act(async () => button('Estimate').click())
    expect(useUI.getState().toastMsg).toBe('Too many estimates. Wait a minute, or search the dish.')
    api.mockRejectedValueOnce(Object.assign(new Error('estimate failed'), { status: 502 }))
    await act(async () => button('Estimate').click())
    expect(useUI.getState().toastMsg).toBe('Could not estimate that. Try a description, or search the dish.')
    expect(field('Search dishes')).not.toBeNull()
  })

  it('without an AI provider it explains how to turn it on, and sends nothing', () => {
    useStore.setState({ config: { invite_only: true } })
    open()
    expect(button('Estimate')).toBeUndefined()
    expect(host.textContent).toContain('Admin dashboard → AI Coach')
    expect(api).not.toHaveBeenCalled()
  })
})
