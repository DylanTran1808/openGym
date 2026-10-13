/* gettingprime: GET /api/friends/plans — the plans of the other people on this server who chose to
   share theirs (S.sharePlan), and nothing else of theirs. Real server.js in a child, as in
   server-admin-state.test.js. */
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
function mintSession(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const ME = 'u_me_1', FRIEND = 'u_fr_1', SHY = 'u_shy_1', GONE = 'u_gone_1', BROKEN = 'u_brk_1';

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-friends-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const created = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ME, name: 'Me', created }, { id: FRIEND, name: 'Friend', created }, { id: SHY, name: 'Shy', created },
      { id: GONE, name: 'Gone', created, disabled: true }, { id: BROKEN, name: 'Broken', created },
    ], creds: [], subs: [], invites: [],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', ...env },
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.write = (uid, S) => fs.writeFileSync(path.join(dataDir, `state-${uid}.json`), typeof S === 'string' ? S : JSON.stringify(S));
  h.get = async (uid) => {
    const r = await fetch(`${h.api}/api/friends/plans`, { headers: uid ? { Cookie: `gymsid=${mintSession(uid)}` } : {} });
    return { status: r.status, body: await r.json() };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}

const routine = (id, name, ex = [{ id: '0001', sets: 3, reps: 8, weight: 100 }], ts = 1000) => ({ id, name, emoji: '💪', ex, _ts: ts });
// Everything a real state holds besides the plan: none of it may leave.
const PRIVATE = {
  workouts: [{ id: 'w1', d: '2026-10-01', entries: [] }], bodyweight: [{ d: '2026-10-01', w: 70 }],
  meals: [{ id: 'm1', d: '2026-10-01', name: 'Pho', p: 30 }], foods: [{ id: 'f1', name: 'Rice' }],
  nutrition: { mode: 'auto', profile: { born: 1999, cm: 170 } }, measurements: [{ d: '2026-10-01', waist: 80 }],
  coach: { profile: { goal: 'muscle' } }, reminder: { on: true, time: '08:00', tz: 'Asia/Ho_Chi_Minh' },
  exWeights: { '0001': { w: 100 } }, dayPlan: { '2026-10-01': 'x' },
};

test('only the other people who share, with their plan and nothing else of theirs', async t => {
  const h = await startServer(t);
  h.write(ME, { sharePlan: true, unit: 'kg', routines: [routine('rm', 'Mine')] });
  h.write(FRIEND, {
    ...PRIVATE, sharePlan: true, unit: 'kg', week: { 1: ['ra'], 4: ['rb'] },
    routines: [routine('ra', 'Push', [{ id: 'c_1', sets: 3, reps: 10 }], 2000), routine('rb', 'Pull', undefined, 5000)],
    customEx: [{ id: 'c_1', n: 'Band press', bp: 'chest', media: 'm/1.jpg' }, { id: 'c_unused', n: 'Other' }],
  });
  h.write(SHY, { sharePlan: false, routines: [routine('rs', 'Secret')] });
  h.write(GONE, { sharePlan: true, routines: [routine('rg', 'Gone')] });
  h.write(BROKEN, '{not json');

  const { status, body } = await h.get(ME);
  assert.equal(status, 200, h.log);
  assert.deepEqual(body.friends.map(f => f.name), ['Friend']);
  const [f] = body.friends;
  assert.equal(f.id, FRIEND);
  assert.equal(f.updated, 5000);
  assert.deepEqual(Object.keys(f.plan).sort(), ['customEx', 'routines', 'unit', 'week']);
  assert.deepEqual(f.plan.week, { 1: ['ra'], 4: ['rb'] });
  assert.deepEqual(f.plan.routines.map(r => r.name), ['Push', 'Pull']);
  assert.deepEqual(f.plan.customEx.map(c => c.id), ['c_1']);
  const text = JSON.stringify(body);
  for (const leak of ['Pho', 'Rice', 'waist', 'Ho_Chi_Minh', 'muscle', '1999', 'w1', 'Secret', 'Gone']) assert.ok(!text.includes(leak), leak);
});

test('signed out is refused; nobody sharing is an empty list', async t => {
  const h = await startServer(t);
  assert.equal((await h.get(null)).status, 401);
  h.write(FRIEND, { routines: [routine('ra', 'Push')] });
  const { status, body } = await h.get(ME);
  assert.equal(status, 200);
  assert.deepEqual(body.friends, []);
});
