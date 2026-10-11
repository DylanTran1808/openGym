// gettingprime: dish search for meals eaten out (lib/dishes.js) and the bundled USDA dish list.
import { describe, expect, it } from 'vitest'
import { fold, searchDishes, dishToFood } from './dishes.js'
import { foodFromInput } from './nutrition.js'
import { DISHES } from './dishes-data.js'

const names = (q, rows = DISHES) => searchDishes(rows, q).map(r => r[0])

describe('fold', () => {
  it('ignores case and accents, Vietnamese đ included', () => {
    expect(fold('Phở Bò')).toBe('pho bo')
    expect(fold('Bún đậu')).toBe('bun dau')
    expect(fold('Saté')).toBe('sate')
  })
})

describe('searchDishes', () => {
  const rows = [
    ['Soup, pho, with meat', 77, 5.8, 5.6, 3.3, 0.4, 245],
    ['Phosphate drink', 1, 0, 0, 0, 0, null],
    ['Pad Thai with chicken', 154, 8.1, 14.4, 7.5, 1.2, 200],
    ['Pad Thai, meatless', 150, 5, 20, 6, 1, 200],
    ['Gebakken rijst', 160, 5, 25, 4, 1, null, 'Fried rice, Indonesian (nasi goreng)'],
  ]
  it('needs every word, each as the start of a word in the name, accents ignored', () => {
    expect(names('phở', rows)).toEqual(['Soup, pho, with meat', 'Phosphate drink'])
    expect(names('pad thai chicken', rows)).toEqual(['Pad Thai with chicken'])
    expect(names('thai chick', rows)).toEqual(['Pad Thai with chicken'])
    expect(names('hai', rows)).toEqual([])
  })
  it('also matches a second name; ranks whole words, then names starting with the first word, higher', () => {
    expect(names('nasi', rows)).toEqual(['Gebakken rijst'])
    expect(names('pad', rows)).toEqual(['Pad Thai, meatless', 'Pad Thai with chicken'])
  })
  it('an empty query finds nothing; the limit holds', () => {
    expect(names('  ', rows)).toEqual([])
    expect(searchDishes(rows, 'p', 2)).toHaveLength(2)
  })
})

describe('dishToFood', () => {
  it('a dish is a food per 100 g with its typical serving, valid as a saved food', () => {
    const food = dishToFood(['Soup, pho, with meat', 77, 5.8, 5.6, 3.3, 0.4, 245])
    expect(food).toEqual({ name: 'Soup, pho, with meat', base: 'g', per100: { kcal: 77, p: 5.8, c: 5.6, f: 3.3, fib: 0.4 }, serving: { amt: 245 } })
    expect(dishToFood(['X', 1, 0, 0, 0, 0, null]).serving).toBeUndefined()
  })
})

describe('the bundled USDA dish list', () => {
  it('has thousands of dishes, each a valid food', () => {
    expect(DISHES.length).toBeGreaterThan(5000)
    for (const row of DISHES) {
      const food = dishToFood(row)
      const { error } = foodFromInput({ name: food.name, base: 'g', ...food.per100, servingAmt: food.serving?.amt })
      expect(error, row[0]).toBeUndefined()
      expect(row[6] === null || row[6] > 0, row[0]).toBe(true)
    }
  })
  it('finds dishes eaten out', () => {
    expect(names('pho').slice(0, 3)).toContain('Soup, pho, with meat')
    expect(names('pad thai chicken')).toContain('Pad Thai with chicken')
    expect(names('kung pao chicken').length).toBeGreaterThan(0)
    expect(names('sushi salmon').length).toBeGreaterThan(0)
  })
})
