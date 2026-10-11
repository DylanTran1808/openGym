// gettingprime: the "Eating out" tab of the meal sheet (NutritionSheet.jsx). Restaurant and
// takeaway food has no label or barcode, so the dish is found by name in a bundled list
// (lib/dishes.js; loaded on the first search, then cached for offline use) and logged by serving or
// grams through the same LogFood as a saved food — or saved to My foods to log again later.
import { useEffect, useState } from 'react'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { searchDishes, dishToFood } from '../lib/dishes.js'
import { macrosFor } from '../lib/nutrition.js'
import { LogFood, FoodForm } from './NutritionSheet.jsx'
import { TextField } from './ui.jsx'

let loaded = null
const loadDishes = () => (loaded ||= import('../lib/dishes-data.js').then(m => m.DISHES))

function DishRow({ row, onPick }) {
  const food = dishToFood(row)
  const per = food.serving ? macrosFor(food, 1, 'serving') : food.per100
  const what = food.serving ? t('per serving ({0} g)', fmtNum(food.serving.amt)) : t('per 100 g')
  return <div data-dish={row[0]} className="tappable" role="button" tabIndex={0}
    style={{ padding: '10px 0', borderTop: '1px solid var(--surface-2)', cursor: 'pointer' }}
    onClick={onPick} onKeyDown={e => { if (e.key === 'Enter') onPick() }}>
    <div>{row[0]}</div>
    <div className="small muted">≈ {fmtNum(per.kcal)} kcal · {fmtNum(per.p)} g P {what}</div>
  </div>
}

export default function EatingOut({ close, iso }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  // view: list | { log: food } | { save: dish } (new saved food) | { edit: food } (one saved here)
  const [view, setView] = useState('list')
  useEffect(() => {
    if (!q.trim() || rows) return
    let live = true
    loadDishes().then(r => { if (live) setRows(r) })
    return () => { live = false }
  }, [q, rows])

  if (view.save || view.edit) return <FoodForm food={view.edit} initial={view.save} onDone={f => setView(f ? { log: f } : 'list')} />
  if (view.log) {
    const food = view.log
    return <LogFood food={food} close={close} iso={iso} onBack={() => setView('list')}
      start={food.serving && !food.id ? { qty: 1, unit: 'serving' } : undefined}
      note={food.id ? null : t('Restaurant plates are often 1.5–2 servings. Typical serving from USDA FNDDS.')}
      editLabel={food.id ? t('Edit food') : t('Save to My foods')}
      onEdit={() => setView(food.id ? { edit: food } : { save: food })} />
  }
  const hits = rows && q.trim() ? searchDishes(rows, q) : []
  return <>
    <TextField aria-label={t('Search dishes')} placeholder={t('Dish, e.g. pho, pad thai, sushi')} value={q} onChange={e => setQ(e.target.value)} />
    <div style={{ marginTop: 8 }}>
      {hits.map(row => <DishRow key={row[0]} row={row} onPick={() => setView({ log: dishToFood(row) })} />)}
      {rows && q.trim() && !hits.length && <div className="small muted">{t('No dishes found. Try fewer or other words, or log it under Quick.')}</div>}
      {!q.trim() && <div className="small muted">{t('Restaurant or takeaway? Search the dish and log it by serving.')}</div>}
    </div>
  </>
}
