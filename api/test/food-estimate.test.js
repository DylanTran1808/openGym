/* gettingprime: a meal estimated from a photo and/or a description (food-estimate.js), through
   the AI provider the admin connected for the Coach. Each provider kind is checked against a fake
   fetch for the shape it is sent (the image in its own format, the key in its own header); the
   answer is validated before the app sees it; and POST /api/food/estimate runs in a real server
   against a stand-in OpenAI-compatible endpoint. */
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
import { parseInput, estimateFrom, estimateMeal, PROMPT } from '../food-estimate.js';

const JPEG = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg bytes').toString('base64');
const ANSWER = { name: 'Phở bò', items: [
  { name: 'Broth', g: 400, kcal: 15, p: 1.5, c: 1, f: 0.5, fib: 0 },
  { name: 'Rice noodles', g: 200, kcal: 110, p: 1.8, c: 25, f: 0.2, fib: 1 },
  { name: 'Beef', g: 90, kcal: 200, p: 26, c: 0, f: 10, fib: 0 },
] };

/* ---------- input ---------- */

test('input: a description, a photo, or both; never neither, never a non-image, never a huge one', () => {
  assert.deepEqual(parseInput({ text: '  large pho  ' }), { text: 'large pho', image: null });
  assert.deepEqual(parseInput({ image: JPEG }), { text: '', image: { mime: 'image/jpeg', data: Buffer.from('fake jpeg bytes').toString('base64') } });
  assert.equal(parseInput({}).error, 'nothing');
  assert.equal(parseInput({ text: '   ' }).error, 'nothing');
  assert.equal(parseInput({ image: 'data:text/html;base64,PGI+' }).error, 'image');
  assert.equal(parseInput({ image: 'https://example.com/a.jpg' }).error, 'image');
  assert.equal(parseInput({ image: 'data:image/jpeg;base64,' + 'A'.repeat(2.8 * 1024 * 1024) }).error, 'image');
  assert.equal(parseInput({ text: 'x'.repeat(900) }).text.length, 500);
  assert.equal(parseInput(null).error, 'nothing');
});

/* ---------- the answer ---------- */

test('answer: components with grams and per-100 g macros, numbers kept in range', () => {
  const est = estimateFrom(JSON.stringify(ANSWER));
  assert.equal(est.name, 'Phở bò');
  assert.deepEqual(est.items[2], { name: 'Beef', g: 90, per100: { kcal: 200, p: 26, c: 0, f: 10, fib: 0 } });
  const odd = estimateFrom('Sure! ```json\n' + JSON.stringify({ name: 'X', items: [
    { name: 'Oil', g: 15, kcal: 5000, p: -2, c: 'n/a', f: 150, fib: 1 },   // clamped to what 100 g can hold
    { name: 'Ghost', g: 0, kcal: 100 },                                     // no weight: dropped
    { name: 'Nope', g: 'lots', kcal: 100 },                                  // dropped
  ] }) + '\n```');
  assert.deepEqual(odd.items, [{ name: 'Oil', g: 15, per100: { kcal: 900, p: 0, c: 0, f: 100, fib: 1 } }]);
});

test('answer: at most 12 components, grams capped, names trimmed; nothing usable is null', () => {
  const many = estimateFrom(JSON.stringify({ name: ' Buffet ', items: Array.from({ length: 20 }, (_, i) => ({ name: 'Item ' + i, g: 99999, kcal: 100 })) }));
  assert.equal(many.items.length, 12);
  assert.equal(many.items[0].g, 3000);
  assert.equal(many.name, 'Buffet');
  assert.equal(estimateFrom('{"name":"","items":[]}'), null);   // not food
  assert.equal(estimateFrom('I cannot help with that'), null);
  assert.equal(estimateFrom(JSON.stringify({ items: [{ name: 'Rice', g: 200, kcal: 130 }] })).name, 'Rice');
});

/* ---------- the request, per provider ---------- */

function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
  };
  return { fn, calls };
}
const text = JSON.stringify(ANSWER);
const cfgFor = (provider, extra = {}) => ({ provider, providerOptions: {}, ...extra });
const input = { text: 'large, extra beef', image: { mime: 'image/jpeg', data: 'QUJD' } };

test('Anthropic: the photo as an image block, the key as x-api-key', async () => {
  const { fn, calls } = fakeFetch({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
  const r = await estimateMeal({ cfg: cfgFor('anthropic'), key: 'sk-ant-1', model: 'claude-haiku', ...input, fetch: fn });
  assert.equal(r.estimate.items.length, 3);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'sk-ant-1');
  const body = calls[0].body;
  assert.equal(body.model, 'claude-haiku');
  assert.equal(body.system, PROMPT);
  assert.deepEqual(body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  assert.match(body.messages[0].content[1].text, /large, extra beef/);
});

test('Gemini: the photo as inline_data, the key as x-goog-api-key, JSON asked for', async () => {
  const { fn, calls } = fakeFetch({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
  const r = await estimateMeal({ cfg: cfgFor('gemini'), key: 'AIza1', model: 'gemini-flash', ...input, fetch: fn });
  assert.equal(r.estimate.name, 'Phở bò');
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:generateContent');
  assert.equal(calls[0].headers['x-goog-api-key'], 'AIza1');
  assert.ok(!calls[0].url.includes('AIza1'), 'never the key in the URL');
  const body = calls[0].body;
  assert.equal(body.systemInstruction.parts[0].text, PROMPT);
  assert.deepEqual(body.contents[0].parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('OpenAI and compatible endpoints: the photo as an image_url data URL; a keyless endpoint sends no auth', async () => {
  for (const [provider, key, base] of [['openai', 'sk-1', 'https://api.openai.com'], ['compatible', null, 'http://ollama.lan:11434']]) {
    const { fn, calls } = fakeFetch({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });
    const cfg = cfgFor(provider, provider === 'compatible' ? { providerOptions: { compatible: { baseUrl: base } } } : {});
    const r = await estimateMeal({ cfg, key, model: 'vision-1', ...input, fetch: fn });
    assert.equal(r.estimate.items.length, 3, provider);
    assert.equal(calls[0].url, base + '/v1/chat/completions');
    assert.equal(calls[0].headers.authorization, key ? 'Bearer ' + key : undefined);
    const msgs = calls[0].body.messages;
    assert.deepEqual(msgs[0], { role: 'system', content: PROMPT });
    assert.deepEqual(msgs[1].content[0], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
  }
});

test('a description alone is sent without an image', async () => {
  const { fn, calls } = fakeFetch({ content: [{ type: 'text', text }] });
  await estimateMeal({ cfg: cfgFor('anthropic'), key: 'k', model: 'm', text: 'bún chả', image: null, fetch: fn });
  assert.deepEqual(calls[0].body.messages[0].content.map(c => c.type), ['text']);
});

test('provider trouble is a 502, a provider that is not plain HTTPS a 503', async () => {
  const bad = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"invalid key"}}' });
  assert.deepEqual(await estimateMeal({ cfg: cfgFor('anthropic'), key: 'k', model: 'm', ...input, fetch: bad }), { status: 502, error: '401 invalid key' });
  const junk = fakeFetch({ content: [{ type: 'text', text: 'no idea' }] });
  assert.equal((await estimateMeal({ cfg: cfgFor('anthropic'), key: 'k', model: 'm', ...input, fetch: junk.fn })).status, 502);
  const down = async () => { throw new Error('ECONNREFUSED') };
  assert.equal((await estimateMeal({ cfg: cfgFor('gemini'), key: 'k', model: 'm', ...input, fetch: down })).status, 502);
  assert.equal((await estimateMeal({ cfg: cfgFor('claude'), key: 'k', model: 'm', ...input, fetch: down })).status, 503);
});

/* ---------- the route ---------- */

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_est_1';
const cookie = () => {
  const payload = `${UID}:${Date.now() + 86400000}:0`;
  return `gymsid=${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
};

async function startModel(t) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push(body);
      const said = body.messages[1].content.find(c => c.type === 'text').text;
      const content = said.includes('gibberish') ? 'hmm' : JSON.stringify(ANSWER);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  return { url: `http://127.0.0.1:${srv.address().port}`, seen };
}

async function startServer(t, coach) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-estimate-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'One', created: new Date().toISOString() }], creds: [], subs: [], invites: [],
  }));
  if (coach) fs.writeFileSync(path.join(dataDir, 'coach.json'), JSON.stringify(coach));
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' };
  delete env.COACH_DISABLED;
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], env });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.post = async (body, withCookie = true) => {
    const r = await fetch(`${h.api}/api/food/estimate`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080', ...(withCookie ? { Cookie: cookie() } : {}) },
    });
    return { status: r.status, body: await r.json() };
  };
  return h;
}

test('POST /api/food/estimate: signed in, AI connected, an input; the estimate comes back and the photo is not kept', async t => {
  const model = await startModel(t);
  const h = await startServer(t, { enabled: true, provider: 'compatible', providerOptions: { compatible: { baseUrl: model.url } }, models: { compatible: 'fake-vision' } });
  assert.equal((await h.post({ text: 'pho' }, false)).status, 401);
  assert.equal((await h.post({})).status, 400);
  assert.equal((await h.post({ image: 'data:text/plain;base64,QQ==' })).status, 400);

  const ok = await h.post({ text: 'phở, large', image: JPEG });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.estimate.name, 'Phở bò');
  assert.deepEqual(ok.body.estimate.items[0], { name: 'Broth', g: 400, per100: { kcal: 15, p: 1.5, c: 1, f: 0.5, fib: 0 } });
  assert.equal(model.seen[0].model, 'fake-vision');
  assert.equal(model.seen[0].messages[1].content[0].image_url.url, JPEG);
  assert.ok(!JSON.stringify(model.seen[0]).includes(UID), 'nothing about the user goes to the provider');

  const b64 = JPEG.split(',')[1];
  const files = fs.readdirSync(h.dataDir, { recursive: true }).filter(f => fs.statSync(path.join(h.dataDir, f)).isFile());
  for (const f of files) assert.ok(!fs.readFileSync(path.join(h.dataDir, f), 'utf8').includes(b64), 'photo written to ' + f);

  assert.equal((await h.post({ text: 'gibberish' })).status, 502);
});

test('POST /api/food/estimate: off until the admin connects an AI provider; ten a minute per profile', async t => {
  const off = await startServer(t, null);
  const r = await off.post({ text: 'pho' });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'ai-off');

  const model = await startModel(t);
  const h = await startServer(t, { enabled: true, provider: 'compatible', providerOptions: { compatible: { baseUrl: model.url } }, models: { compatible: 'm' } });
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await h.post({ text: 'pho' })).status);
  assert.deepEqual(codes, [...Array(10).fill(200), 429]);
});
