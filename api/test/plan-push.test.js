/* gettingprime: when a friend's new routines are worth a push (friend-plans.js planPushStep): a
   silent baseline, one push per sitting once the plan has been quiet, spaced out, never at night. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPushStep } from '../friend-plans.js';

const MIN = 60000, H = 60 * MIN;
const opts = { quietMs: 15 * MIN, gapMs: 6 * H };
const r = (id, name, n = 1) => ({ id, name, ex: Array.from({ length: n }, (_, i) => ({ id: '000' + i, sets: 3 })) });
const S = (...routines) => ({ sharePlan: true, routines });

// Runs the step at each [minute, state] and returns every push it would have sent.
function run(rec, steps, o = {}) {
  const sent = [];
  for (const [min, st, awake = true] of steps) {
    const out = planPushStep(rec, st, min * MIN, { ...opts, awake, ...o });
    rec = out.rec;
    if (out.send) sent.push([min, out.send]);
  }
  return { sent, rec };
}

test('turning sharing on records the plan without a push; off forgets it', () => {
  const on = planPushStep(undefined, S(r('a', 'Push'), r('b', 'Pull')), 0, opts);
  assert.deepEqual(on, { rec: { ids: ['a', 'b'] }, send: null });
  assert.deepEqual(planPushStep(on.rec, { routines: [r('a', 'Push')] }, MIN, opts), { rec: null, send: null });
});

test('a whole sitting of new routines is one push, 15 min after the last change', () => {
  const base = planPushStep(undefined, S(), 0, opts).rec;
  const { sent } = run(base, [
    [1, S(r('a', 'Push'))],
    [5, S(r('a', 'Push', 4), r('b', 'Pull'))],              // still building: the timer starts over
    [12, S(r('a', 'Push', 4), r('b', 'Pull', 3), r('c', 'Legs'))],
    [26, S(r('a', 'Push', 4), r('b', 'Pull', 3), r('c', 'Legs'))],   // 14 min quiet: not yet
    [27, S(r('a', 'Push', 4), r('b', 'Pull', 3), r('c', 'Legs'))],
    [60, S(r('a', 'Push', 4), r('b', 'Pull', 3), r('c', 'Legs'))],
  ]);
  assert.deepEqual(sent, [[27, ['Push', 'Pull', 'Legs']]]);
});

test('empty routines, edits and removals send nothing', () => {
  const base = planPushStep(undefined, S(r('a', 'Push')), 0, opts).rec;
  const { sent } = run(base, [
    [1, S(r('a', 'Push', 5), { id: 'e', name: 'Shell', ex: [] })],
    [30, S(r('a', 'Push', 5), { id: 'e', name: 'Shell', ex: [] })],
    [40, S()],
    [80, S()],
  ]);
  assert.deepEqual(sent, []);
});

test('a second batch within 6 h waits for the gap, then goes out with everything added since', () => {
  const base = planPushStep(undefined, S(), 0, opts).rec;
  const { sent } = run(base, [
    [0, S(r('a', 'Push'))], [20, S(r('a', 'Push'))],                                       // sent at 20
    [60, S(r('a', 'Push'), r('b', 'Pull'))], [100, S(r('a', 'Push'), r('b', 'Pull'))],
    [200, S(r('a', 'Push'), r('b', 'Pull'), r('c', 'Legs'))], [379, S(r('a', 'Push'), r('b', 'Pull'), r('c', 'Legs'))],
    [380, S(r('a', 'Push'), r('b', 'Pull'), r('c', 'Legs'))],
  ]);
  assert.deepEqual(sent, [[20, ['Push']], [380, ['Pull', 'Legs']]]);
});

test('while the recipient sleeps it waits, and goes when they are awake', () => {
  const base = planPushStep(undefined, S(), 0, opts).rec;
  const { sent } = run(base, [
    [0, S(r('a', 'Push'))], [30, S(r('a', 'Push')), false], [300, S(r('a', 'Push')), false], [301, S(r('a', 'Push')), true],
  ]);
  assert.deepEqual(sent, [[301, ['Push']]]);
});

test('the push names up to three routines and counts the rest', async () => {
  const { friendPlanPush } = await import('../push-messages.js');
  assert.deepEqual(friendPlanPush('Alex', ['Push', 'Pull']), { title: '📋 Alex added to their plan', body: 'New: Push, Pull. See it in Plan → Friends.', tag: 'friend-plan' });
  assert.equal(friendPlanPush('Alex', ['A', 'B', 'C', 'D', 'E']).body, 'New: A, B, C +2 more. See it in Plan → Friends.');
});
