// gettingprime: scripts/build-dishes.mjs — turning the NEVO table (RIVM, the Dutch food table) into
// dish rows. NEVO's terms allow its values only unchanged, so they are copied as they are.
import { describe, expect, it } from 'vitest'
import { nevoRows, decodeTable } from '../../../scripts/build-dishes.mjs'
import { searchDishes } from './dishes.js'

const HEAD = 'Voedingsmiddelgroep|Food group|NEVO-code|Voedingsmiddelnaam/Dutch food name|Engelse naam/Food name|Synoniem|Hoeveelheid/Quantity|Opmerking|ENERCJ (kJ)|ENERCC (kcal)|WATER (g)|PROT (g)|PROTPL (g)|FAT (g)|FASAT (g)|CHO (g)|SUGAR (g)|FIBT (g)'
const fixture = [
  HEAD,
  'Gerechten|Dishes|2001|Nasi goreng|Fried rice Indonesian|nasi|per 100g||620|148|60,1|5,9|1,2|4,85|1|20,3|1,5|1,4',
  'Gerechten|Dishes|2002|Saté ajam|Chicken satay|"sate, sateh"|per 100g||800|191|55|21,2||9,8|2|3,5|2,9|',
  'Dranken|Drinks|3001|Melk halfvol|Milk semi-skimmed||per 100ml||195|46|89|3,5||1,5|1|4,7|4,7|0',
].join('\r\n')

describe('nevoRows', () => {
  it('labels each food in English, keeps the Dutch name to search by, and copies values unchanged', () => {
    expect(nevoRows(fixture)).toEqual([
      ['Chicken satay', 191, 21.2, 3.5, 9.8, 0, null, 'Saté ajam', 'nevo'],
      ['Fried rice Indonesian', 148, 5.9, 20.3, 4.85, 1.4, null, 'Nasi goreng', 'nevo'],
    ])
  })
  it('the rows are found in English and by their Dutch name', () => {
    const rows = nevoRows(fixture)
    expect(searchDishes(rows, 'fried rice').map(r => r[0])).toEqual(['Fried rice Indonesian'])
    expect(searchDishes(rows, 'nasi').map(r => r[0])).toEqual(['Fried rice Indonesian'])
    expect(searchDishes(rows, 'sate').map(r => r[0])).toEqual(['Chicken satay'])
  })
  it('reads semicolon tables too, and fails loudly on a table it does not recognise', () => {
    expect(nevoRows(fixture.replaceAll('|', ';'))).toHaveLength(2)
    expect(() => nevoRows('a|b\n1|2')).toThrow(/NEVO/)
  })
})

describe('decodeTable', () => {
  it('reads UTF-8, and Windows-1252 when the bytes are not UTF-8', () => {
    expect(decodeTable(Buffer.from('Saté', 'utf8'))).toBe('Saté')
    expect(decodeTable(Buffer.from([0x53, 0x61, 0x74, 0xe9]))).toBe('Saté')
  })
})
