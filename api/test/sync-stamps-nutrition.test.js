/* gettingprime: PUT /api/data stamps meals and saved foods like gym cards (sync-stamps.js) — a
   writer that does not stamp gets its removals recorded and its edits stamped, and the records
   never shrink. Mirror of frontend/src/lib/sync-merge.nutrition.test.js on the server side. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampPut } from '../sync-stamps.js';

const clone = v => JSON.parse(JSON.stringify(v));
const NOW = 1_800_000_000_000;
const stored = () => ({
  _ts: NOW - 5000, _rev: 3,
  meals: [{ id: 'm1', d: '2026-10-10', name: 'Oats', p: 13, _ts: NOW - 9000 }, { id: 'm2', d: '2026-10-10', name: 'Eggs', p: 12, _ts: NOW - 9000 }],
  foods: [{ id: 'f1', name: 'Oats', base: 'g', per100: { p: 13 }, _ts: NOW - 9000 }],
  deleted: { meals: { m9: NOW - 4000 } },
});

test('a writer that does not stamp gets its meal removal recorded and its edits stamped', () => {
  const cur = stored();
  const next = clone(cur);
  delete next.deleted; delete next._rev;
  next.meals = next.meals.filter(m => m.id !== 'm2');
  next.foods[0].name = 'Rolled oats';
  stampPut(cur, next, { overRead: true, stamped: false, now: NOW });
  assert.equal(next.deleted.meals.m9, NOW - 4000);
  assert.ok(next.deleted.meals.m2 >= NOW);
  assert.ok(next.foods[0]._ts >= NOW);
  assert.equal(next.meals[0]._ts, NOW - 9000);
});

test('a stamping app keeps the stored removal records it did not send', () => {
  const cur = stored();
  const next = clone(cur);
  next.deleted = { foods: { f7: NOW - 100 } };
  stampPut(cur, next, { overRead: true, stamped: true, now: NOW });
  assert.equal(next.deleted.meals.m9, NOW - 4000);
  assert.equal(next.deleted.foods.f7, NOW - 100);
});
