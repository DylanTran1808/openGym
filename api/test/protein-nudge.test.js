/* gettingprime: the protein reminder's rules (protein-nudge.js), and their parity with the app. The
   server hand-copies targetsFor and proteinNudgeDue from frontend/src/lib/nutrition.js (the repo's
   convention for nudge.js and queue.js); this file runs the same fixtures through both copies, so
   the reminder can never quote a different target than the Home card shows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proteinDue, targetsFor as serverTargets, proteinNudgeDue as serverDue } from '../protein-nudge.js';
import { targetsFor as appTargets, proteinNudgeDue as appDue } from '../../frontend/src/lib/nutrition.js';

const profile = { born: 2005, cm: 178, sex: 'male', activity: 1.55, deficit: 400, kg: 78 };
const S = over => ({
  unit: 'kg', bodyweight: [], meals: [],
  nutrition: { mode: 'auto', profile, manual: null, nudge: { on: true, times: ['14:00', '19:30'], tz: 'UTC' } }, ...over,
});

test('targets: the server copy matches the app on every kind of profile', () => {
  const fixtures = [
    S(),
    S({ bodyweight: [{ d: '2026-10-09', w: 79 }, { d: '2026-10-10', w: 80, t: 2 }, { d: '2026-10-10', w: 78.5, t: 1 }] }),
    S({ unit: 'lb', bodyweight: [{ d: '2026-10-10', w: 176 }] }),
    S({ nutrition: { mode: 'manual', profile, manual: { kcal: 2500, p: 170, c: 280, f: 70, fib: 35 } } }),
    S({ nutrition: { mode: 'auto', profile: { ...profile, sex: 'female', deficit: 0, activity: 1.375 } } }),
    { unit: 'kg', bodyweight: [] },
    {},
    // No targets yet (a friend just invited): both copies say none, never the owner's numbers.
    S({ nutrition: { mode: 'auto', profile: null, nudge: { on: true, times: ['14:00'] } } }),
    S({ nutrition: { mode: 'auto', profile: { sex: 'male', activity: 1.55 } } }),
    S({ nutrition: { mode: 'auto', profile: { born: 1998, cm: 160, sex: 'female', activity: 1.55, deficit: 300 } } }),
    S({ bodyweight: [{ d: '2026-10-10', w: 55 }], nutrition: { mode: 'auto', profile: { born: 1998, cm: 160, sex: 'female', activity: 1.55, deficit: -300 } } }),
    S({ nutrition: { mode: 'manual', manual: null } }),
  ];
  for (const f of fixtures) assert.deepEqual(serverTargets(f, '2026-10-10'), appTargets(f, '2026-10-10'), JSON.stringify(f));
});

test('slots: the server copy matches the app', () => {
  const cases = [
    { times: ['14:00', '19:30'], hhmm: '14:00', sent: [], short: true },
    { times: ['14:00', '19:30'], hhmm: '20:10', sent: [], short: true },
    { times: ['14:00', '19:30'], hhmm: '20:10', sent: ['14:00', '19:30'], short: true },
    { times: ['14:00', '19:30'], hhmm: '14:05', sent: [], short: false },
    { times: ['14:00', '19:30'], hhmm: '22:30', sent: [], short: true },
    { times: ['nope', '14:00'], hhmm: '15:00', sent: [], short: true },
  ];
  for (const c of cases) assert.deepEqual(serverDue(c), appDue(c), JSON.stringify(c));
});

test('proteinDue: the slot to send with the numbers for its message', () => {
  const st = S({ meals: [{ d: '2026-10-10', p: 50 }, { d: '2026-10-10', p: 42.4 }, { d: '2026-10-09', p: 200 }] });
  assert.deepEqual(proteinDue(st, { date: '2026-10-10', hhmm: '14:03' }, []), {
    slot: '14:00', done: ['14:00'], eaten: 92.4, target: 156, left: 63.6,
  });
});

test('proteinDue: no reminder for someone with no targets set up', () => {
  const st = S({ nutrition: { mode: 'auto', profile: null, nudge: { on: true, times: ['14:00'], tz: 'UTC' } } });
  assert.equal(proteinDue(st, { date: '2026-10-10', hhmm: '14:03' }, []), null);
});

test('proteinDue: nothing when the goal is met, the reminder is off, or the state is odd', () => {
  const met = S({ meals: [{ d: '2026-10-10', p: 160 }] });
  assert.equal(proteinDue(met, { date: '2026-10-10', hhmm: '14:03' }, []).slot, null);
  assert.equal(proteinDue(S({ nutrition: { mode: 'auto', nudge: { on: false, times: ['14:00'] } } }), { date: '2026-10-10', hhmm: '14:03' }, []), null);
  assert.equal(proteinDue({ nutrition: { profile, nudge: { on: true, times: 'x' } }, meals: 'x' }, { date: '2026-10-10', hhmm: '14:03' }, []).slot, null);
});
