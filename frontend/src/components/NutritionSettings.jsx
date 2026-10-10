// gettingprime: nutrition settings, opened from the ⚙ on the Home food card (not a Settings page:
// upstream's settings test wants every page title translated into every locale, and this fork is
// English-only). Auto targets follow the latest weigh-in through the profile here; manual targets
// are typed and stay put. The protein reminder (api/protein-nudge.js) is switched on and timed here
// too: a push at each time, on this device's clock, while protein is still short that day.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, fmtNum, localTZ } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { NUTRITION_DEFAULT, PROFILE_DEFAULT, computeTargets, latestKg, targetsFor, profileFromInput, manualFromInput } from '../lib/nutrition.js'
import { Button, NumberField, Segmented, Switch } from './ui.jsx'

const PROFILE_FIELDS = [
  ['born', 'Birth year', false], ['cm', 'Height (cm)', false], ['activity', 'Activity factor', true], ['deficit', 'Calorie deficit (kcal)', false],
]
const TARGET_FIELDS = [
  ['kcal', 'Calories target (kcal)'], ['p', 'Protein target (g)'], ['c', 'Carbs target (g)'], ['f', 'Fat target (g)'], ['fib', 'Fibre target (g)'],
]
const summary = x => `${fmtNum(x.kcal)} kcal · ${fmtNum(x.p)} g protein · ${fmtNum(x.c)} g carbs · ${fmtNum(x.f)} g fat · ${fmtNum(x.fib)} g fibre`

const Grid = ({ fields, v, set }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
  {fields.map(([k, label, decimal = false]) => <label key={k} className="small muted" style={{ display: 'grid', gap: 4 }}>
    {t(label)}
    <NumberField className="field" aria-label={t(label)} nullable decimal={decimal} value={v[k]} onChange={n => set(x => ({ ...x, [k]: n }))} />
  </label>)}
</div>

export function NutritionSettings({ close }) {
  const S = useStore(s => s.S)
  const n = { ...NUTRITION_DEFAULT, ...(S.nutrition || {}) }
  const profile = { ...PROFILE_DEFAULT, ...(n.profile || {}) }
  const iso = todayISO(), year = Number(iso.slice(0, 4))
  const autoNow = targetsFor({ ...S, nutrition: { ...n, mode: 'auto', profile } }, iso)
  const [mode, setMode] = useState(n.mode === 'manual' && n.manual ? 'manual' : 'auto')
  const [p, setP] = useState({ born: profile.born, cm: profile.cm, activity: profile.activity, deficit: profile.deficit })
  const [m, setM] = useState(n.manual || autoNow)
  const nudge0 = { ...NUTRITION_DEFAULT.nudge, ...(n.nudge || {}) }
  const [remind, setRemind] = useState(!!nudge0.on)
  const [times, setTimes] = useState([nudge0.times?.[0] || '', nudge0.times?.[1] || ''])
  const kg = latestKg(S, profile)
  const draft = profileFromInput(p, profile, year)
  const preview = draft.profile ? computeTargets(draft.profile, kg, year) : null
  const { toast } = useUI.getState()

  const save = () => {
    const upd = useStore.getState().update
    // The zone is stamped on every save, so the server fires at these times wherever you are.
    const nudge = { on: remind, times: [...new Set(times.filter(Boolean))].sort(), tz: localTZ() }
    if (mode === 'auto') {
      if (draft.error) { toast(t('Check the numbers')); return }
      upd(s => { s.nutrition = { ...NUTRITION_DEFAULT, ...(s.nutrition || {}), mode: 'auto', profile: draft.profile, nudge } })
    } else {
      const { manual, error } = manualFromInput(m)
      if (error) { toast(t('Check the numbers')); return }
      upd(s => { s.nutrition = { ...NUTRITION_DEFAULT, ...(s.nutrition || {}), mode: 'manual', manual, nudge } })
    }
    close()
    toast(t('Targets saved'))
  }

  return <>
    <h3>{t('Nutrition settings')}</h3>
    <Segmented options={[{ value: 'auto', label: t('Auto') }, { value: 'manual', label: t('Manual') }]} value={mode} onChange={setMode} />
    {mode === 'auto' ? <>
      <div className="small muted" style={{ marginTop: 10 }}>
        {t('Targets follow your latest weigh-in: Mifflin-St Jeor × activity − deficit; protein 2 g/kg, fat 0.8 g/kg, fibre 14 g per 1,000 kcal, carbs the rest.')}
      </div>
      <Grid fields={PROFILE_FIELDS} v={p} set={setP} />
      <div className="small" style={{ marginTop: 12 }}>
        <strong>{t('From {0} kg', fmtNum(kg))}:</strong> {preview ? summary(preview) : t('Check the numbers')}
      </div>
    </> : <>
      <div className="small muted" style={{ marginTop: 10 }}>{t('Your own targets. Logging a weight leaves them alone.')}</div>
      <Grid fields={TARGET_FIELDS} v={m} set={setM} />
    </>}
    <div className="row between" style={{ marginTop: 18 }}>
      <div>
        <div style={{ fontWeight: 600 }}>{t('Protein reminder')}</div>
        <div className="small muted">{t('A push at these times while protein is still short. Needs notifications on (Settings → Reminders).')}</div>
      </div>
      <Switch aria-label={t('Protein reminder')} checked={remind} onChange={setRemind} />
    </div>
    {remind && <div className="row" style={{ gap: 10, marginTop: 8 }}>
      {times.map((v, i) => <input key={i} type="time" className="timef" aria-label={t('Reminder {0}', i + 1)} value={v}
        onChange={e => setTimes(ts => ts.map((x, j) => (j === i ? e.target.value : x)))} />)}
    </div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

export const nutritionSettingsSheet = () => useUI.getState().openSheet(close => <NutritionSettings close={close} />)
