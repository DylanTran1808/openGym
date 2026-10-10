import { describe, expect, it } from 'vitest'
import { FOOD_FORMATS, pickBarcode, nativeSupportsFood } from './scan-barcode.js'

describe('pickBarcode', () => {
  it('takes the first product barcode among what the detector saw', () => {
    expect(pickBarcode([{ rawValue: 'https://x.test' }, { rawValue: '4006381333931', format: 'ean_13' }]))
      .toEqual({ value: '4006381333931', fmt: 'ean_13' })
  })

  it('ignores anything that is not 8 to 14 digits', () => {
    expect(pickBarcode([{ rawValue: '1234567' }, { rawValue: '123456789012345' }, { rawValue: 'abc12345' }])).toBeNull()
    expect(pickBarcode([])).toBeNull()
    expect(pickBarcode(undefined)).toBeNull()
  })
})

describe('nativeSupportsFood', () => {
  it('uses the browser detector only when it reads EAN-13', async () => {
    expect(await nativeSupportsFood({ getSupportedFormats: async () => ['qr_code', 'ean_13', 'upc_a'] })).toBe(true)
    expect(await nativeSupportsFood({ getSupportedFormats: async () => ['qr_code'] })).toBe(false)
    expect(await nativeSupportsFood(undefined)).toBe(false)
    expect(await nativeSupportsFood({ getSupportedFormats: async () => { throw new Error('no') } })).toBe(false)
  })

  it('asks for the retail formats only', () => {
    expect(FOOD_FORMATS).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e'])
  })
})
