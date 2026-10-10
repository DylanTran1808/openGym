// gettingprime: logging what you ate. A bottom sheet opened from the Home nutrition card
// (NutritionCard.jsx); the numbers are checked by lib/nutrition.js mealFromInput, and the toast
// after saving answers the one question the feature exists for — how much protein is still to go.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, uid, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { mealFromInput, dayTotals, remaining, targetsFor } from '../lib/nutrition.js'
import { Button, NumberField, TextField } from './ui.jsx'

const FIELDS = [
  ['kcal', 'Calories (kcal)'], ['p', 'Protein (g)'], ['c', 'Carbs (g)'], ['f', 'Fat (g)'], ['fib', 'Fibre (g)'],
]

/** The toast after a meal is logged: protein still to go today, or that the goal is reached. */
export function proteinToast(S, iso = todayISO()) {
  const left = remaining(dayTotals(S.meals, iso), targetsFor(S, iso)).p
  return left > 0 ? t('{0} g protein to go today', fmtNum(left)) : t('Protein goal hit ✓')
}

export function MealForm({ close }) {
  const [v, setV] = useState({ name: '', kcal: null, p: null, c: null, f: null, fib: null })
  const set = k => n => setV(x => ({ ...x, [k]: n }))
  const { toast } = useUI.getState()
  const save = () => {
    const iso = todayISO()
    const { meal, error } = mealFromInput(v, iso)
    if (error) { toast(error === 'name' ? t('Give the meal a name') : t('Check the numbers')); return }
    useStore.getState().update(s => { s.meals = [...(s.meals || []), { id: uid(), ...meal }] })
    close()
    toast(proteinToast(useStore.getState().S, iso))
  }
  return <>
    <h3>{t('Log a meal')}</h3>
    <TextField aria-label={t('Name')} placeholder={t('What did you eat?')} value={v.name}
      onChange={e => setV(x => ({ ...x, name: e.target.value }))} autoFocus />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
      {FIELDS.map(([k, label]) => <label key={k} className="small muted" style={{ display: 'grid', gap: 4 }}>
        {t(label)}
        <NumberField aria-label={t(label)} nullable value={v[k]} onChange={set(k)} />
      </label>)}
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Log meal')}</Button>
  </>
}

export const mealSheet = () => useUI.getState().openSheet(close => <MealForm close={close} />)
