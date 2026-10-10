/* gettingprime: barcode lookup. food.js maps an Open Food Facts product to the app's saved-food
   shape (per 100 g or ml, kcal/protein/carbs/fat/fibre, a serving only in grams or ml — never a cup
   from the label text); GET /api/food/{code} proxies the lookup for a signed-in user. The route is
   exercised against a stub standing in for Open Food Facts (FOOD_API), real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { offToFood, FOOD_CODE } from '../food.js';

const product = over => ({ code: '5000112637922', status: 1, product: { product_name: 'Skyr Natural', brands: 'Arla,Arla Foods', ...over } });

test('maps a solid: per 100 g macros, fibre, a gram serving, the brand in the name', () => {
  const food = offToFood(product({
    nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 3.9, fat_100g: 0.2, fiber_100g: 0.4 },
    serving_quantity: 150, serving_size: '1 cup (150 g)', quantity: '450 g',
  }));
  assert.deepEqual(food, {
    name: 'Skyr Natural (Arla)', base: 'g', barcode: '5000112637922',
    per100: { kcal: 63, p: 11, c: 3.9, f: 0.2, fib: 0.4 }, serving: { amt: 150 },
  });
});

test('maps a drink as per 100 ml', () => {
  const food = offToFood(product({ product_name: 'Milk', brands: '', quantity: '1 L', nutriments: { 'energy-kcal_100g': 46, proteins_100g: 3.4 } }));
  assert.equal(food.base, 'ml');
  assert.equal(food.name, 'Milk');
  assert.deepEqual(food.per100, { kcal: 46, p: 3.4, c: 0, f: 0, fib: 0 });
});

test('falls back to kJ when kcal is missing', () => {
  assert.equal(offToFood(product({ nutriments: { energy_100g: 1046 } })).per100.kcal, 250);
});

test('missing macros are 0 and nonsense is dropped, not passed on', () => {
  const food = offToFood(product({ nutriments: { proteins_100g: -3, fat_100g: 'n/a', carbohydrates_100g: 500 }, serving_quantity: 0 }));
  assert.deepEqual(food.per100, { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
  assert.equal(food.serving, undefined);
});

test('a product Open Food Facts does not have is null', () => {
  assert.equal(offToFood({ code: '123', status: 0, status_verbose: 'product not found' }), null);
  assert.equal(offToFood(null), null);
});

test('barcode format: 8 to 14 digits', () => {
  assert.ok(FOOD_CODE.test('12345678'));
  assert.ok(FOOD_CODE.test('12345678901234'));
  assert.ok(!FOOD_CODE.test('1234567'));
  assert.ok(!FOOD_CODE.test('123456789012345'));
  assert.ok(!FOOD_CODE.test('12345abc'));
});

/* ---------- the route ---------- */

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_food_1';
const cookie = () => {
  const payload = `${UID}:${Date.now() + 86400000}:0`;
  return `gymsid=${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
};

async function startStub(t) {
  const seen = [];
  const stub = http.createServer((req, res) => {
    seen.push({ url: req.url, ua: req.headers['user-agent'] });
    if (req.url.startsWith('/api/v2/product/5000112637922')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(product({ nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11 } })));
    }
    if (req.url.startsWith('/api/v2/product/99999999')) { res.writeHead(500); return res.end('boom'); }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 0, status_verbose: 'product not found' }));
  });
  await new Promise(r => stub.listen(0, '127.0.0.1', r));
  t.after(() => stub.close());
  return { url: `http://127.0.0.1:${stub.address().port}`, seen };
}

async function startServer(t, foodApi) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-food-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'One', created: new Date().toISOString() }], creds: [], subs: [], invites: [],
  }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', FOOD_API: foodApi },
  });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  return h;
}

test('GET /api/food/{code}: signed in only, validated, mapped, honest about failures', async t => {
  const stub = await startStub(t);
  const h = await startServer(t, stub.url);
  const get = async (code, withCookie = true) => {
    const r = await fetch(`${h.api}/api/food/${code}`, { headers: withCookie ? { Cookie: cookie() } : {} });
    return { status: r.status, body: await r.json() };
  };

  assert.equal((await get('5000112637922', false)).status, 401);
  assert.equal((await get('12ab')).status, 400);
  assert.equal((await get('123')).status, 400);

  const ok = await get('5000112637922');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.food.name, 'Skyr Natural (Arla)');
  assert.deepEqual(ok.body.food.per100, { kcal: 63, p: 11, c: 0, f: 0, fib: 0 });
  assert.match(stub.seen.at(-1).ua, /^gettingprime\//);
  assert.ok(!/@/.test(stub.seen.at(-1).ua), 'no email in the User-Agent');

  assert.equal((await get('12345678')).status, 404);
  assert.equal((await get('99999999')).status, 502);
});
