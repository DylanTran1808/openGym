// gettingprime: a day's food on Home — protein first (it is what the whole feature is for), then
// calories, carbs, fat and fibre against the targets (lib/nutrition.js targetsFor: derived from the
// latest weigh-in unless set by hand), one-tap "log again" for recent meals, and the day's meals —
// tap one to correct or delete it. Steps back through earlier days to check or backfill them.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { todayISO, fmtNum, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayTotals, targetsFor, recentMeals, shiftDay } from '../lib/nutrition.js'
import { mealSheet, editMealSheet, logMeal } from './NutritionSheet.jsx'
import { nutritionSettingsSheet } from './NutritionSettings.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

const MINOR = [['kcal', 'Calories', 'kcal'], ['c', 'Carbs', 'g'], ['f', 'Fat', 'g'], ['fib', 'Fibre', 'g']]
const COPY = ['name', 'foodId', 'qty', 'unit', 'kcal', 'p', 'c', 'f', 'fib']

function Bar({ k, label, eaten, target, unit, big }) {
  const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0
  return <div data-macro={k} style={{ marginTop: big ? 4 : 8 }}>
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <span className={big ? '' : 'small muted'} style={big ? { fontWeight: 600 } : undefined}>{t(label)}</span>
      <span className={big ? 'big' : 'small'} style={big ? { fontSize: 22 } : undefined}>{fmtNum(eaten)} / {fmtNum(target)} {unit}</span>
    </div>
    <div style={{ height: big ? 8 : 5, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 4 }}>
      <i style={{ display: 'block', height: '100%', width: pct + '%', background: pct >= 100 ? 'var(--green)' : 'var(--acc)' }} />
    </div>
  </div>
}

export default function NutritionCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const [day, setDay] = useState(today)
  const eaten = dayTotals(S.meals, day)
  const goal = targetsFor(S, day)
  const meals = (S.meals || []).filter(m => m?.d === day)
  const recent = recentMeals(S.meals)
  const label = day === today ? t('Food today') : day === shiftDay(today, -1) ? t('Food yesterday') : fmtDate(day, true)
  const again = m => logMeal({ ...Object.fromEntries(COPY.filter(k => m[k] != null).map(k => [k, m[k]])), d: day })
  return <div className="card">
    <div className="row between" style={{ marginBottom: 6 }}>
      <div className="row" style={{ gap: 4 }}>
        <button className="iconbtn" style={{ width: 28, height: 28, fontSize: 14 }} onClick={() => setDay(d => shiftDay(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <h2 style={{ margin: 0 }}>{label}</h2>
        {day < today && <button className="iconbtn" style={{ width: 28, height: 28, fontSize: 14 }} onClick={() => setDay(d => shiftDay(d, 1))} aria-label={t('Next day')}><Icon name="chevronRight" /></button>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={nutritionSettingsSheet} aria-label={t('Nutrition settings')}><Icon name="gear" /></button>
        <Button size="sm" icon="plus" onClick={() => mealSheet(day)}>{t('Add food')}</Button>
      </div>
    </div>
    <Bar k="p" label="Protein" eaten={eaten.p} target={goal.p} unit="g" big />
    {MINOR.map(([k, label, unit]) => <Bar key={k} k={k} label={label} eaten={eaten[k]} target={goal[k]} unit={unit} />)}
    {recent.length > 0 && <div style={{ marginTop: 12 }}>
      <div className="small muted" style={{ marginBottom: 6 }}>{t('Log again')}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {recent.map(m => <Button key={m.id} size="sm" variant="tinted" onClick={() => again(m)}>{m.name}</Button>)}
      </div>
    </div>}
    {meals.length > 0 && <div style={{ marginTop: 10 }}>
      {meals.map(m => <div key={m.id} data-meal={m.id} className="row between small tappable" role="button" tabIndex={0}
        style={{ padding: '8px 0', borderTop: '1px solid var(--surface-2)', cursor: 'pointer' }}
        onClick={() => editMealSheet(m)} onKeyDown={e => { if (e.key === 'Enter') editMealSheet(m) }}>
        <span>{m.name}{m.qty ? <span className="muted"> · {fmtNum(m.qty)} {m.unit === 'serving' ? t('serving') : m.unit}</span> : null}</span>
        <span className="muted">{fmtNum(m.p)} g P · {fmtNum(m.kcal)} kcal</span>
      </div>)}
    </div>}
  </div>
}
