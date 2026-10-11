// gettingprime: the "Eating out" tab of the meal sheet (NutritionSheet.jsx). Restaurant and
// takeaway food has no label or barcode, so the dish is found by name in a bundled list
// (lib/dishes.js; loaded on the first search, then cached for offline use) and logged by serving or
// grams through the same LogFood as a saved food — or saved to My foods to log again later.
// Where the owner has built the Dutch food table (NEVO, scripts/build-dishes.mjs --nevo; never
// committed, its terms are per user) its foods join the list, and RIVM is credited as required.
// When the admin has connected an AI provider (the Coach's), a photo and/or a description can be
// estimated instead (POST /api/food/estimate): the dish comes back as components with grams, the
// grams are corrected here, and the totals are logged as one meal.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { shrinkImage } from '../lib/photo.js'
import { searchDishes, dishToFood } from '../lib/dishes.js'
import { macrosFor, estimateTotals, mealFromInput } from '../lib/nutrition.js'
import { LogFood, FoodForm, logMeal } from './NutritionSheet.jsx'
import { Button, NumberField, TextField } from './ui.jsx'
import Icon from './Icon.jsx'

const toast = msg => useUI.getState().toast(msg)
const macroLine = x => `${fmtNum(x.kcal)} kcal · ${fmtNum(x.p)} g P · ${fmtNum(x.c)} g C · ${fmtNum(x.f)} g F · ${fmtNum(x.fib)} g fibre`

export const NEVO_CREDIT = 'Based on data from NEVO online version 2025/9.0, RIVM, Bilthoven'
// A missing file is a 404, or the app's index.html from a server that falls back to it: no NEVO.
const loadNevo = () => fetch(import.meta.env.BASE_URL + 'dishes-nevo.json')
  .then(r => (r.ok ? r.json() : []), () => []).then(x => (Array.isArray(x) ? x : []), () => [])
const loadDishes = () => Promise.all([import('../lib/dishes-data.js').then(m => m.DISHES), loadNevo()])
  .then(([usda, nevo]) => ({ rows: nevo.length ? [...usda, ...nevo] : usda, nevo: nevo.length > 0 }))

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

// Photo and/or words in, an estimate out. Without an AI provider it says where one is switched on.
function EstimateBox({ onEstimate }) {
  const aiOn = useStore(s => !!s.config?.coach?.enabled)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  if (!aiOn) return <div className="small muted" style={{ marginTop: 16 }}>
    {t('Estimating from a photo is off. The admin can turn it on: Settings → Account → Admin dashboard → AI Coach.')}
  </div>
  const pick = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try { setPhoto(await shrinkImage(file)) } catch { toast(t('Could not read that photo')) }
  }
  const run = async () => {
    const words = text.trim()
    if (!words && !photo) { toast(t('Add a photo or describe the meal')); return }
    setBusy(true)
    try {
      const body = { ...(photo ? { image: photo } : {}), ...(words ? { text: words } : {}) }
      const { estimate } = await api('/api/food/estimate', { method: 'POST', body: JSON.stringify(body), timeout: 75000 })
      onEstimate(estimate)
    } catch (e) {
      toast(e?.status === 429 ? t('Too many estimates. Wait a minute, or search the dish.')
        : e?.status === 503 ? t('Estimating from a photo is off on this server.')
          : t('Could not estimate that. Try a description, or search the dish.'))
    } finally { setBusy(false) }
  }
  return <div style={{ marginTop: 18 }}>
    <div style={{ fontWeight: 600 }}>{t('Or estimate it with AI')}</div>
    <div className="small muted" style={{ marginBottom: 8 }}>{t('A photo of the plate and/or a few words: the AI splits it into parts with their grams, which you can correct.')}</div>
    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <Button icon="camera" onClick={() => fileRef.current?.click()}>{photo ? t('Change photo') : t('Add photo')}</Button>
      {photo && <img src={photo} alt={t('Meal photo')} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />}
    </div>
    <TextField aria-label={t('Describe the meal')} placeholder={t('e.g. large bún bò Huế, extra beef')} value={text}
      onChange={e => setText(e.target.value)} style={{ marginTop: 8 }} />
    <div style={{ height: 8 }} />
    <Button variant="primary" disabled={busy} onClick={run}>{busy ? t('Estimating…') : t('Estimate')}</Button>
  </div>
}

// The estimate to check before it is logged: the grams of each part are what to correct (the
// macros follow), a part the AI imagined can go, and what is logged is exactly the total shown.
function EstimateReview({ estimate, iso, close, onBack }) {
  const [name, setName] = useState(estimate.name)
  const [items, setItems] = useState(estimate.items)
  const sum = estimateTotals(items)
  const setG = (i, g) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, g } : x)))
  const save = () => {
    const { meal, error } = mealFromInput({ name, ...sum }, iso)
    if (error) { toast(error === 'name' ? t('Give the meal a name') : t('Check the numbers')); return }
    logMeal(meal, close)
  }
  return <>
    <div className="row between"><strong>{t('AI estimate')}</strong><Button size="sm" variant="ghost" onClick={onBack}>{t('Back')}</Button></div>
    <div className="small muted">{t('Check the grams: restaurant food is often oilier than it looks.')}</div>
    <TextField aria-label={t('Name')} value={name} onChange={e => setName(e.target.value)} style={{ marginTop: 8 }} />
    <div style={{ marginTop: 8 }}>
      {items.map((it, i) => { const x = estimateTotals([it]); return <div key={i} className="row between" style={{ gap: 8, padding: '8px 0', borderTop: '1px solid var(--surface-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>{it.name}</div>
          <div className="small muted">{fmtNum(x.kcal)} kcal · {fmtNum(x.p)} g P</div>
        </div>
        <NumberField className="field" aria-label={t('Grams of {0}', it.name)} nullable value={it.g} onChange={g => setG(i, g)} style={{ width: 76 }} />
        <span className="small muted">g</span>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 14 }} aria-label={t('Remove {0}', it.name)}
          onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}><Icon name="trash" /></button>
      </div> })}
    </div>
    <div data-estimate-total className="small" style={{ marginTop: 10 }}><strong>{t('Total')}:</strong> {macroLine(sum)}</div>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save}>{t('Log meal')}</Button>
  </>
}

export default function EatingOut({ close, iso }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)   // { rows, nevo }
  const rows = data?.rows
  // view: list | { log: food } | { save: dish } (new saved food) | { edit: food } (one saved here)
  //       | { estimate } (an AI estimate to check)
  const [view, setView] = useState('list')
  useEffect(() => {
    if (!q.trim() || rows) return
    let live = true
    loadDishes().then(d => { if (live) setData(d) })
    return () => { live = false }
  }, [q, rows])

  if (view.estimate) return <EstimateReview estimate={view.estimate} iso={iso} close={close} onBack={() => setView('list')} />
  if (view.save || view.edit) return <FoodForm food={view.edit} initial={view.save} onDone={f => setView(f ? { log: f } : 'list')} />
  if (view.log) {
    const food = view.log
    const source = view.nevo ? t(NEVO_CREDIT) + '.' : t('Restaurant plates are often 1.5–2 servings. Typical serving from USDA FNDDS.')
    return <LogFood food={food} close={close} iso={iso} onBack={() => setView('list')}
      start={food.serving && !food.id ? { qty: 1, unit: 'serving' } : undefined}
      note={food.id ? null : source}
      editLabel={food.id ? t('Edit food') : t('Save to My foods')}
      onEdit={() => setView(food.id ? { edit: food } : { save: food })} />
  }
  const hits = rows && q.trim() ? searchDishes(rows, q) : []
  return <>
    <TextField aria-label={t('Search dishes')} placeholder={t('Dish, e.g. pho, pad thai, sushi')} value={q} onChange={e => setQ(e.target.value)} />
    <div style={{ marginTop: 8 }}>
      {hits.map(row => <DishRow key={row[0]} row={row} onPick={() => setView({ log: dishToFood(row), nevo: row[8] === 'nevo' })} />)}
      {rows && q.trim() && !hits.length && <div className="small muted">{t('No dishes found. Try fewer or other words, or log it under Quick.')}</div>}
      {!q.trim() && <div className="small muted">{t('Restaurant or takeaway? Search the dish and log it by serving.')}</div>}
    </div>
    {data?.nevo && <div className="small muted" style={{ marginTop: 10 }}>{t(NEVO_CREDIT + ' and other data sources')}.</div>}
    {!q.trim() && <EstimateBox onEstimate={estimate => setView({ estimate })} />}
  </>
}
