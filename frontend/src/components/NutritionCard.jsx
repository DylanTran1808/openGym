// gettingprime: today's food on Home — protein first (it is what the whole feature is for), then
// calories, carbs, fat and fibre against the targets (lib/nutrition.js targetsFor: derived from the
// latest weigh-in unless set by hand), and today's meals under it.
import { useStore } from '../store/useStore.js'
import { todayISO, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayTotals, targetsFor } from '../lib/nutrition.js'
import { mealSheet } from './NutritionSheet.jsx'
import { Button } from './ui.jsx'

const MINOR = [['kcal', 'Calories', 'kcal'], ['c', 'Carbs', 'g'], ['f', 'Fat', 'g'], ['fib', 'Fibre', 'g']]

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
  const iso = todayISO()
  const eaten = dayTotals(S.meals, iso)
  const goal = targetsFor(S, iso)
  const meals = (S.meals || []).filter(m => m?.d === iso)
  return <div className="card">
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Food today')}</h2>
      <Button size="sm" icon="plus" onClick={mealSheet}>{t('Add food')}</Button>
    </div>
    <Bar k="p" label="Protein" eaten={eaten.p} target={goal.p} unit="g" big />
    {MINOR.map(([k, label, unit]) => <Bar key={k} k={k} label={label} eaten={eaten[k]} target={goal[k]} unit={unit} />)}
    {meals.length > 0 && <div style={{ marginTop: 10 }}>
      {meals.map(m => <div key={m.id} className="row between small" style={{ padding: '6px 0', borderTop: '1px solid var(--surface-2)' }}>
        <span>{m.name}</span>
        <span className="muted">{fmtNum(m.p)} g P · {fmtNum(m.kcal)} kcal</span>
      </div>)}
    </div>}
  </div>
}
