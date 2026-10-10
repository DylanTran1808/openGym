/* gettingprime: the protein reminder end to end through the real reminder tick (server.js in a child,
   REMINDER_TICK_MS shortened). As in server-nudge.test.js, each test picks the zone where it is the
   wanted hour right now instead of faking the clock — so every test is also a timezone test.
   protein-nudge.test.js covers the rules and their parity with the app. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_protein_1';
const sub = { userId: UID, endpoint: 'https://localhost/x', keys: { p256dh: 'p', auth: 'a' }, created: new Date().toISOString() };

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-protein-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'One', created: new Date().toISOString() }], creds: [], subs: [sub], invites: [],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', REMINDER_TICK_MS: '200' },
  });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  await boundPort(child, () => h.log);
  h.write = state => fs.writeFileSync(path.join(dataDir, 'state-' + UID + '.json'), JSON.stringify(state));
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}

function zoneAt(hour) {
  let off = (hour - new Date().getUTCHours() + 48) % 24;
  if (off > 14) off -= 24;
  return off === 0 ? 'UTC' : off > 0 ? `Etc/GMT-${off}` : `Etc/GMT+${-off}`;
}
const dateIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// The workout reminder is off: the protein reminder does not depend on it.
const state = (tz, over = {}) => ({
  reminder: { on: false, time: '08:00', tz },
  meals: [{ id: 'm1', d: dateIn(tz), name: 'Oats', p: 40 }],
  nutrition: { mode: 'auto', nudge: { on: true, times: ['14:00', '19:30'], tz } }, ...over,
});
const firings = log => [...log.matchAll(new RegExp(`protein nudge firing ${UID} (\\d\\d:\\d\\d) left=(\\d+)`, 'g'))].map(m => [m[1], Number(m[2])]);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(pred, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !pred()) await wait(100);
}

test('a slot that has come fires once, with the protein still to go', async t => {
  const tz = zoneAt(15);
  const h = await startServer(t);
  h.write(state(tz));
  await until(() => firings(h.log).length > 0);
  await wait(1200);
  assert.deepEqual(firings(h.log), [['14:00', 116]], h.log);   // 156 g target − 40 g eaten
  assert.deepEqual(h.db().users[0].proteinSent, { date: dateIn(tz), slots: ['14:00'] });
});

test('after a late start only the latest missed slot fires, never a burst', async t => {
  const tz = zoneAt(20);
  const h = await startServer(t);
  h.write(state(tz));
  await until(() => firings(h.log).length > 0);
  await wait(1200);
  assert.deepEqual(firings(h.log).map(f => f[0]), ['19:30'], h.log);
  assert.deepEqual(h.db().users[0].proteinSent.slots, ['14:00', '19:30']);
});

test('quiet once the goal is met, and from 22:00', async t => {
  const met = zoneAt(15), late = zoneAt(22);
  const h = await startServer(t);
  h.write(state(met, { meals: [{ id: 'm1', d: dateIn(met), name: 'Lots', p: 200 }] }));
  await until(() => h.db().users[0].proteinSent);
  await wait(800);
  assert.deepEqual(firings(h.log), [], h.log);
  h.write(state(late));
  await wait(1200);
  assert.deepEqual(firings(h.log), [], h.log);
});

test('a bad zone is skipped without stopping the tick', async t => {
  const h = await startServer(t);
  const good = zoneAt(15);
  h.write(state(good, { nutrition: { mode: 'auto', nudge: { on: true, times: ['14:00'], tz: 'Not/AZone' } } }));
  await wait(1000);
  assert.deepEqual(firings(h.log), []);
  assert.doesNotMatch(h.log, /reminder tick/);   // no crash logged by the tick's catch
  h.write(state(good));                            // the tick is still running: a good zone fires
  await until(() => firings(h.log).length > 0);
  assert.deepEqual(firings(h.log).map(f => f[0]), ['14:00'], h.log);
});
