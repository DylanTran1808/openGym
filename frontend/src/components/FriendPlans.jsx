// gettingprime: Plan → Friends. Your switch for sharing your own plan (S.sharePlan, off until you
// turn it on), and the plans of the others on this server who share theirs, read-only — fetched
// fresh on every open (GET /api/friends/plans), read through lib/plan-share.js friendPlan so they
// show in your unit. Never cached: offline it says so.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { DAYN, fmtAgo, weekOrder, weekStartOf } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { EXIDX } from '../lib/exercises.js'
import { exLine } from '../lib/history.js'
import { speedUnitOf } from '../lib/speed.js'
import { friendPlan } from '../lib/plan-share.js'
import { Row, Section, Switch } from './ui.jsx'

function FriendPlan({ f, S }) {
  const unit = S.unit || 'kg'
  const b = friendPlan(f, unit)
  const customs = new Map(b.customEx.map(c => [c.id, c.n]))
  const nameOf = id => (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : customs.get(id) || t('Unknown exercise'))
  const byId = new Map(b.routines.map(r => [r.id, r]))
  const days = weekOrder(weekStartOf(S)).filter(d => b.week[d]?.length)
  return <div data-friend={f.id} style={{ marginTop: 18 }}>
    <h2 style={{ margin: '0 4px 2px' }}>{f.name}</h2>
    <div className="small muted" style={{ margin: '0 4px 10px' }}>
      {f.updated ? t('Updated {0}', fmtAgo(f.updated)) : t('No routines yet')}
    </div>
    {days.length > 0 && <Section title={t('Week')}>
      {days.map(d => <Row key={d} title={t(DAYN[d])} value={b.week[d].map(id => byId.get(id)?.name).filter(Boolean).join(' + ')} />)}
    </Section>}
    {b.routines.map(r => <Section key={r.id} title={`${r.emoji ? r.emoji + ' ' : ''}${r.name}`}>
      {r.ex.length
        ? r.ex.map((e, i) => <Row key={i} title={nameOf(e.id)} subtitle={exLine(e, unit, speedUnitOf(S))} />)
        : <Row title={t('No exercises yet')} />}
    </Section>)}
  </div>
}

export default function FriendPlans() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [res, setRes] = useState(null)   // null loading · { friends } · { error }
  useEffect(() => {
    let live = true
    api('/api/friends/plans').then(r => live && setRes({ friends: r?.friends || [] }), () => live && setRes({ error: true }))
    return () => { live = false }
  }, [])

  return <div className="friend-plans">
    <Section footer={t('Friends on this server see your routines and week. Never your workouts, weigh-ins or meals.')}>
      <Row title={t('Share my plan')}>
        <Switch aria-label={t('Share my plan')} checked={S.sharePlan === true} onChange={v => update(s => { s.sharePlan = v })} />
      </Row>
    </Section>
    {!res ? <div className="small muted" style={{ margin: 12 }}>{t('Loading…')}</div>
      : res.error ? <div className="small muted" style={{ margin: 12 }}>{t('Connect to see friends’ plans.')}</div>
        : !res.friends.length ? <div className="small muted" style={{ margin: 12 }}>{t('No one is sharing a plan yet. When a friend turns on “Share my plan”, it shows up here.')}</div>
          : res.friends.map(f => <FriendPlan key={f.id} f={f} S={S} />)}
  </div>
}
