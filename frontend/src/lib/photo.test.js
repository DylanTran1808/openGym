// gettingprime: photos for a meal estimate are shrunk on the phone before they are sent.
import { describe, expect, it } from 'vitest'
import { fitWithin } from './photo.js'

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ w: 1024, h: 768 })
    expect(fitWithin(3024, 4032, 1024)).toEqual({ w: 768, h: 1024 })
  })
  it('never enlarges a small photo, and never goes below 1 px', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(10000, 3, 1024)).toEqual({ w: 1024, h: 1 })
  })
})
