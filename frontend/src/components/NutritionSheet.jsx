// gettingprime: logging what you ate. A bottom sheet opened from the Home nutrition card
// (NutritionCard.jsx) with two ways in: a saved food by amount ("My foods"), or a one-off entry
// ("Quick"). Every number is checked by lib/nutrition.js, and the toast after saving answers the
// one question the feature exists for — how much protein is still to go today.
import { useCallback, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, uid, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { mealFromInput, mealFromFood, foodFromInput, foodByBarcode, macrosFor, unitsFor, dayTotals, remaining, targetsFor } from '../lib/nutrition.js'
import { api } from '../lib/api.js'
import { decodeBarcode } from '../lib/scan-barcode.js'
import CameraScan from './CameraScan.jsx'
import { Button, NumberField, Segmented, TextField } from './ui.jsx'

const FIELDS = [
  ['kcal', 'Calories (kcal)'], ['p', 'Protein (g)'], ['c', 'Carbs (g)'], ['f', 'Fat (g)'], ['fib', 'Fibre (g)'],
]
const toast = msg => useUI.getState().toast(msg)
const update = fn => useStore.getState().update(fn)
const errorText = e => (e === 'name' ? t('Give it a name') : e === 'amount' ? t('Enter an amount') : t('Check the numbers'))

/** The toast after a meal is logged: protein still to go today, or that the goal is reached. */
export function proteinToast(S, iso = todayISO()) {
  const left = remaining(dayTotals(S.meals, iso), targetsFor(S, iso)).p
  if (left <= 0) return t('Protein goal hit ✓')
  return iso === todayISO() ? t('{0} g protein to go today', fmtNum(left)) : t('{0} g protein short that day', fmtNum(left))
}

/** Adds `meal` (a new copy, its own id) and says how much protein is left that day. */
export function logMeal(meal, close = () => {}) {
  update(s => { s.meals = [...(s.meals || []), { ...meal, id: uid() }] })
  close()
  toast(proteinToast(useStore.getState().S, meal.d))
}

const MacroGrid = ({ v, set }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
  {FIELDS.map(([k, label]) => <label key={k} className="small muted" style={{ display: 'grid', gap: 4 }}>
    {t(label)}
    <NumberField aria-label={t(label)} nullable value={v[k]} onChange={n => set(x => ({ ...x, [k]: n }))} />
  </label>)}
</div>

function QuickPane({ close, iso }) {
  const [v, setV] = useState({ name: '', kcal: null, p: null, c: null, f: null, fib: null })
  const save = () => {
    const { meal, error } = mealFromInput(v, iso)
    if (error) { toast(error === 'name' ? t('Give the meal a name') : t('Check the numbers')); return }
    logMeal(meal, close)
  }
  return <>
    <TextField aria-label={t('Name')} placeholder={t('What did you eat?')} value={v.name}
      onChange={e => setV(x => ({ ...x, name: e.target.value }))} />
    <MacroGrid v={v} set={setV} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Log meal')}</Button>
  </>
}

const unitLabel = (u, food) => (u === 'serving' ? t('serving ({0} {1})', fmtNum(food.serving.amt), food.base) : u)

function LogFood({ food, close, onEdit, onBack, iso }) {
  const [qty, setQty] = useState(null)
  const [unit, setUnit] = useState(unitsFor(food)[0])
  const preview = Number(qty) > 0 ? macrosFor(food, qty, unit) : null
  const save = () => {
    const { meal, error } = mealFromFood(food, qty, unit, iso)
    if (error) { toast(errorText(error)); return }
    logMeal(meal, close)
  }
  return <>
    <div className="row between"><strong>{food.name}</strong><Button size="sm" variant="ghost" onClick={onBack}>{t('Back')}</Button></div>
    <div className="small muted">{t('Per 100 {0}: {1} kcal · {2} g protein', food.base, fmtNum(food.per100.kcal), fmtNum(food.per100.p))}</div>
    <label className="small muted" style={{ display: 'grid', gap: 4, marginTop: 12 }}>
      {t('Amount')}
      <NumberField aria-label={t('Amount')} nullable value={qty} onChange={setQty} />
    </label>
    <div style={{ marginTop: 8 }}>
      <Segmented options={unitsFor(food).map(u => ({ value: u, label: unitLabel(u, food) }))} value={unit} onChange={setUnit} />
    </div>
    <div className="small" style={{ marginTop: 10, minHeight: '1.4em' }}>
      {preview && `${fmtNum(preview.kcal)} kcal · ${fmtNum(preview.p)} g P · ${fmtNum(preview.c)} g C · ${fmtNum(preview.f)} g F · ${fmtNum(preview.fib)} g fibre`}
    </div>
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={save}>{t('Log')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" onClick={onEdit}>{t('Edit food')}</Button>
  </>
}

export function FoodForm({ food, onDone, initial }) {
  const src = food || initial || {}
  const [v, setV] = useState({
    name: src.name || '', base: src.base || 'g', barcode: src.barcode,
    ...Object.fromEntries(FIELDS.map(([k]) => [k, src.per100?.[k] ?? null])),
    servingAmt: src.serving?.amt ?? null, gPerMl: src.gPerMl ?? null,
  })
  const save = () => {
    const { food: next, error } = foodFromInput(v)
    if (error) { toast(errorText(error)); return }
    const id = food?.id || uid()
    update(s => { s.foods = food ? (s.foods || []).map(x => (x.id === id ? { ...next, id } : x)) : [...(s.foods || []), { ...next, id }] })
    onDone({ ...next, id })
  }
  const remove = () => { update(s => { s.foods = (s.foods || []).filter(x => x.id !== food.id) }); onDone(null) }
  return <>
    <strong>{food ? t('Edit food') : t('New food')}</strong>
    <TextField aria-label={t('Name')} placeholder={t('Food name')} value={v.name} style={{ marginTop: 8 }}
      onChange={e => setV(x => ({ ...x, name: e.target.value }))} />
    <div style={{ marginTop: 10 }}>
      <Segmented options={[{ value: 'g', label: t('Per 100 g') }, { value: 'ml', label: t('Per 100 ml') }]} value={v.base}
        onChange={base => setV(x => ({ ...x, base }))} />
    </div>
    <MacroGrid v={v} set={setV} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
      <label className="small muted" style={{ display: 'grid', gap: 4 }}>
        {t('Serving ({0}, optional)', v.base)}
        <NumberField aria-label={t('Serving size')} nullable value={v.servingAmt} onChange={n => setV(x => ({ ...x, servingAmt: n }))} />
      </label>
      {v.base === 'g' && <label className="small muted" style={{ display: 'grid', gap: 4 }}>
        {t('Grams per ml (spoons)')}
        <NumberField aria-label={t('Grams per ml')} nullable value={v.gPerMl} onChange={n => setV(x => ({ ...x, gPerMl: n }))} />
      </label>}
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save food')}</Button>
    {food && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Delete food')}</Button></>}
  </>
}

// A barcode → the food to log. Saved foods first (works offline, no lookup twice), then Open Food
// Facts through the server (GET /api/food/{code}), then an empty food with the barcode kept so the
// next scan finds it. A failed lookup says so rather than pretending the product is unknown.
async function foodForBarcode(code, foods) {
  const saved = foodByBarcode(foods, code)
  if (saved) return { log: saved }
  try {
    const { food } = await api(`/api/food/${code}`)
    return { edit: null, initial: food }
  } catch (e) {
    toast(e?.status === 404 ? t('Not in Open Food Facts. Enter it from the label.') : t('Lookup failed. Enter it from the label.'))
    return { edit: null, initial: { barcode: code } }
  }
}

function FoodsPane({ close, iso }) {
  const foods = useStore(s => s.S.foods) || []
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // view: list | scan | { log: food } | { edit: food|null, initial? }
  const [view, setView] = useState('list')
  const lookUp = async raw => {
    const c = String(raw || '').trim()
    if (!/^\d{8,14}$/.test(c)) { toast(t('A barcode is 8 to 14 digits')); return }
    setBusy(true)
    const next = await foodForBarcode(c, useStore.getState().S.foods)
    setBusy(false)
    setView(next)
  }
  const onFound = useCallback(hit => lookUp(hit.value), [])
  const backToList = useCallback(() => setView('list'), [])
  if (view === 'scan') return <CameraScan decode={decodeBarcode} onFound={onFound} onCancel={backToList} hint={t('Point the camera at the barcode')} />
  if (view.log) return <LogFood food={view.log} close={close} iso={iso} onBack={() => setView('list')} onEdit={() => setView({ edit: view.log })} />
  if (view.edit !== undefined) return <FoodForm food={view.edit} initial={view.initial} onDone={f => setView(f ? { log: f } : 'list')} />
  const shown = foods.filter(f => f.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  return <>
    <Button icon="camera" onClick={() => setView('scan')}>{t('Scan barcode')}</Button>
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <TextField aria-label={t('Barcode')} inputMode="numeric" placeholder={t('…or type the barcode')} value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ flex: 1 }} />
      <Button size="sm" disabled={busy} onClick={() => lookUp(code)}>{t('Look up')}</Button>
    </div>
    <div style={{ height: 12 }} />
    {foods.length > 0 && <TextField aria-label={t('Search foods')} placeholder={t('Search your foods')} value={q} onChange={e => setQ(e.target.value)} />}
    <div style={{ marginTop: 8 }}>
      {shown.map(f => <div key={f.id} data-food={f.id} className="row between tappable" role="button" tabIndex={0}
        style={{ padding: '10px 0', borderTop: '1px solid var(--surface-2)', cursor: 'pointer' }}
        onClick={() => setView({ log: f })} onKeyDown={e => { if (e.key === 'Enter') setView({ log: f }) }}>
        <span>{f.name}</span>
        <span className="small muted">{t('{0} g protein / 100 {1}', fmtNum(f.per100?.p || 0), f.base)}</span>
      </div>)}
      {!foods.length && <div className="small muted">{t('No saved foods yet. Add the ones you eat often.')}</div>}
    </div>
    <div style={{ height: 12 }} />
    <Button icon="plus" onClick={() => setView({ edit: null })}>{t('New food')}</Button>
  </>
}

export function MealForm({ close, iso = todayISO() }) {
  const hasFoods = (useStore.getState().S.foods || []).length > 0
  const [mode, setMode] = useState(hasFoods ? 'foods' : 'quick')
  return <>
    <h3>{t('Log a meal')}</h3>
    <Segmented options={[{ value: 'foods', label: t('My foods') }, { value: 'quick', label: t('Quick') }]} value={mode} onChange={setMode} />
    <div style={{ height: 12 }} />
    {mode === 'foods' ? <FoodsPane close={close} iso={iso} /> : <QuickPane close={close} iso={iso} />}
  </>
}

export const mealSheet = iso => useUI.getState().openSheet(close => <MealForm close={close} iso={iso || todayISO()} />)

/** A logged meal, to correct or remove. Its day, food and amount stay; name and macros change. */
export function MealEditForm({ meal, close }) {
  const [v, setV] = useState({ name: meal.name || '', ...Object.fromEntries(FIELDS.map(([k]) => [k, meal[k] ?? null])) })
  const save = () => {
    const { meal: next, error } = mealFromInput(v, meal.d)
    if (error) { toast(error === 'name' ? t('Give the meal a name') : t('Check the numbers')); return }
    update(s => { s.meals = (s.meals || []).map(m => (m.id === meal.id ? { ...m, ...next } : m)) })
    close()
  }
  const remove = () => { update(s => { s.meals = (s.meals || []).filter(m => m.id !== meal.id) }); close(); toast(t('Meal deleted')) }
  return <>
    <h3>{t('Edit meal')}</h3>
    <TextField aria-label={t('Name')} value={v.name} onChange={e => setV(x => ({ ...x, name: e.target.value }))} />
    <MacroGrid v={v} set={setV} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="danger" onClick={remove}>{t('Delete meal')}</Button>
  </>
}

export const editMealSheet = meal => useUI.getState().openSheet(close => <MealEditForm meal={meal} close={close} />)
