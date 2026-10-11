// gettingprime: a meal estimated from a photo and/or a description — for food eaten out, where
// there is no label and no barcode. It goes to the AI provider the admin already connected for the
// Coach (coach/config.js: its key, model and endpoint), as one plain HTTPS request of our own: the
// Coach's adapters always add its training system prompt and send text only. The headers, the
// endpoint rules, reading the answer and pulling JSON out of it are the Coach's, reused.
//
// What comes back is a guess, and the app treats it as one: a list of components, each with its
// weight in grams and its macros per 100 g, which the user corrects before logging. Nothing here is
// stored — not the photo, not the answer — and nothing about the user is sent, only the photo and
// the words they typed.
import { HTTP_PROVIDERS, baseUrlFor, extraHeadersFor } from './coach/core/providers.js';
import { endpointUrl } from './coach/core/adapters/http.js';
import { anthropicSpec } from './coach/core/adapters/anthropic.js';
import { geminiSpec } from './coach/core/adapters/gemini.js';
import { openaiSpec } from './coach/core/adapters/openai.js';
import { compatibleSpec } from './coach/core/adapters/compatible.js';
import { extractJSON } from './coach/core/parse.js';

export const PROMPT = `You estimate the nutrition of one meal from a photo and/or a short description.
It was most likely cooked in a restaurant or bought as takeaway: count the cooking oil, sauces and
dressings you can see or would expect for that dish.
Split it into its main components (at most 12). For each give its estimated weight in grams as
served, and its energy (kcal) and grams of protein (p), carbohydrate (c), fat (f) and fibre (fib)
per 100 g of that component. Use the description for the portion size when it gives one.
Name the dish and the components in the language of the description, or in English when there is
no description.
Answer with JSON only, exactly this shape:
{"name": "dish", "items": [{"name": "component", "g": 0, "kcal": 0, "p": 0, "c": 0, "f": 0, "fib": 0}]}
If the photo shows no food, answer {"name": "", "items": []}.`;

const MAX_TEXT = 500;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_ITEMS = 12;
const MAX_OUT = 4096;   // room for a "thinking" model's reasoning, which counts against it on Gemini
const PER100_MAX = { kcal: 900, p: 100, c: 100, f: 100, fib: 100 };
const r1 = v => Math.round(v * 10) / 10;

/** The request body → { text, image: { mime, data } | null } or { error: 'nothing' | 'image' }. */
export function parseInput(body) {
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  let image = null;
  if (body?.image != null) {
    const m = typeof body.image === 'string' ? IMAGE_RE.exec(body.image) : null;
    if (!m || m[2].length * 3 / 4 > MAX_IMAGE_BYTES) return { error: 'image' };
    image = { mime: m[1], data: m[2] };
  }
  if (!text && !image) return { error: 'nothing' };
  return { text, image };
}

/** The model's answer → { name, items: [{ name, g, per100 }] }, or null when nothing in it is usable. */
export function estimateFrom(answer) {
  const { value } = extractJSON(answer);
  if (!value || !Array.isArray(value.items)) return null;
  const items = [];
  for (const it of value.items) {
    const g = Number(it?.g);
    const name = typeof it?.name === 'string' ? it.name.trim().slice(0, 60) : '';
    if (!name || !Number.isFinite(g) || g <= 0) continue;
    const per100 = {};
    for (const [k, max] of Object.entries(PER100_MAX)) {
      const n = Number(it[k]);
      per100[k] = Number.isFinite(n) ? Math.min(max, Math.max(0, k === 'kcal' ? Math.round(n) : r1(n))) : 0;
    }
    items.push({ name, g: Math.min(3000, Math.round(g)), per100 });
    if (items.length === MAX_ITEMS) break;
  }
  if (!items.length) return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : items[0].name;
  return { name, items };
}

const ask = text => (text ? `Description: ${text}` : 'No description: estimate from the photo.');

// One request shape per kind of API: the photo travels in each one's own format.
const KINDS = {
  anthropic: {
    spec: anthropicSpec,
    request: ({ model, text, image }) => ({
      path: '/v1/messages',
      body: {
        model, max_tokens: MAX_OUT, system: PROMPT,
        messages: [{ role: 'user', content: [
          ...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }] : []),
          { type: 'text', text: ask(text) },
        ] }],
      },
    }),
  },
  gemini: {
    spec: geminiSpec,
    request: ({ model, text, image }) => ({
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts: [
          ...(image ? [{ inline_data: { mime_type: image.mime, data: image.data } }] : []),
          { text: ask(text) },
        ] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUT },
      },
    }),
  },
  chat: {
    request: ({ model, text, image, tokensField }) => ({
      path: '/v1/chat/completions',
      body: {
        model, [tokensField]: MAX_OUT,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: [
            ...(image ? [{ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } }] : []),
            { type: 'text', text: ask(text) },
          ] },
        ],
      },
    }),
  },
};
const kindOf = provider => ({
  anthropic: { ...KINDS.anthropic },
  gemini: { ...KINDS.gemini },
  openai: { ...KINDS.chat, spec: openaiSpec, tokensField: 'max_completion_tokens' },
  compatible: { ...KINDS.chat, spec: compatibleSpec, tokensField: 'max_tokens' },
})[provider];

/**
 * Asks the configured provider. → { estimate } on success, else { status, error }: 503 when the
 * provider is not a plain-HTTPS one (the Claude/Codex runtimes are the Coach's alone), 502 when
 * the provider fails or answers with nothing usable.
 */
export async function estimateMeal({ cfg, key, model, text, image, fetch: fetchImpl = globalThis.fetch, timeoutMs = 60000 }) {
  const provider = cfg?.provider;
  const kind = HTTP_PROVIDERS[provider] && kindOf(provider);
  if (!kind) return { status: 503, error: 'ai-off' };
  const base = baseUrlFor(provider, cfg);
  const chosen = model || HTTP_PROVIDERS[provider].defaultModel;
  if (!base || !chosen) return { status: 503, error: 'ai-off' };
  const { path, body } = kind.request({ model: chosen, text, image, tokensField: kind.tokensField });
  let res, raw;
  try {
    res = await fetchImpl(endpointUrl(base, path), {
      method: 'POST',
      headers: { ...extraHeadersFor(provider, cfg), 'content-type': 'application/json', ...kind.spec.headers(key) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    raw = await res.text();
  } catch (e) {
    return { status: 502, error: e?.name === 'TimeoutError' ? 'timed out' : 'could not reach the AI provider' };
  }
  let data = null;
  try { data = JSON.parse(raw); } catch { /* not JSON: an error page */ }
  if (!res.ok) return { status: 502, error: `${res.status} ${String(kind.spec.errorMessage(data) || raw).slice(0, 200)}` };
  let out;
  try { out = kind.spec.readText(data || {}); } catch { out = { error: 'unexpected answer' }; }
  if (out.error) return { status: 502, error: String(out.error).slice(0, 200) };
  if (out.truncated) return { status: 502, error: 'the answer was cut off' };
  const estimate = estimateFrom(out.text);
  return estimate ? { estimate } : { status: 502, error: 'no estimate in the answer' };
}
