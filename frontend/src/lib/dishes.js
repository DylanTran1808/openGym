// gettingprime: dishes eaten out — restaurant and takeaway food has no label and no barcode, so it
// is looked up by name in a bundled list (dishes-data.js, USDA FNDDS) and logged by serving or
// grams like a saved food. A row is [name, kcal, p, c, f, fib, typical serving g | null, other
// name?] per 100 g; the other name is a second way to find it (a Dutch name in the NEVO list).

/** Lower case without accents, so "pho" finds "Phở" (đ has no decomposition, hence by hand). */
export const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd')

const wordsOf = s => fold(s).split(/[^a-z0-9]+/).filter(Boolean)
const cache = new WeakMap()
const rowWords = row => {
  let w = cache.get(row)
  if (!w) cache.set(row, w = wordsOf(row[0] + ' ' + (row[7] || '')))
  return w
}

/** The rows matching every word of `q` (each the start of a word), best first. */
export function searchDishes(rows, q, limit = 20) {
  const want = wordsOf(q)
  if (!want.length) return []
  const hits = rows.filter(row => { const w = rowWords(row); return want.every(x => w.some(y => y.startsWith(x))) })
  // Whole words before mere prefixes ("pho" soup before "phosphate"), then names that start with it.
  const rank = row => { const w = rowWords(row); return (want.every(x => w.includes(x)) ? 0 : 2) + (w[0].startsWith(want[0]) ? 0 : 1) }
  return hits.sort((a, b) => rank(a) - rank(b) || a[0].length - b[0].length).slice(0, limit)
}

/** A dish as an unsaved food: per 100 g, with its typical serving when it has one. */
export function dishToFood([name, kcal, p, c, f, fib, serving]) {
  return { name, base: 'g', per100: { kcal, p, c, f, fib }, ...(serving > 0 ? { serving: { amt: serving } } : {}) }
}
