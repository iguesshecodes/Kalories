import assert from 'node:assert/strict';
import { cleanItems, sumItems, toEntry, itemTotals } from '../js/vision.js';
import handler, { readTool, readGemini, limited } from '../api/analyze.js';

let n = 0;
const ok = (name) => console.log('ok', name) || n++;

// cleanItems
{
  const items = cleanItems([
    { name: '  Roti ', portion: '2 rotis', grams: 80, kcal: 240, protein_g: 8, carbs_g: 46, fat_g: 3, confidence: 'high' },
    { name: 'Dal', grams: 150, kcal: 900, protein_g: 10, carbs_g: 20, fat_g: 4, confidence: 'weird' },
    { name: '', grams: 10 },
    null,
    { name: 'Huge', grams: 99999, kcal: 'abc', protein_g: -5 }
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].name, 'Roti');
  assert.equal(items[0].conf, 'high');
  assert.ok(Math.abs(itemTotals(items[0]).k - 240) < 1);
  // kcal 900 vs macros 4*10+4*20+9*4=156 -> trusts the macros
  assert.equal(items[1].adjusted, true);
  assert.ok(Math.abs(itemTotals(items[1]).k - 156) < 1);
  assert.equal(items[1].conf, 'medium');
  assert.equal(items[2].grams, 2000);
  assert.equal(itemTotals(items[2]).k, 0);
  assert.deepEqual(cleanItems('nope'), []);
  assert.equal(cleanItems(Array.from({ length: 30 }, () => ({ name: 'x', grams: 10, kcal: 10 }))).length, 12);
  ok('cleanItems validates, clamps and trusts macros over wild kcal');
}
// scaling and entry shape
{
  const [it] = cleanItems([{ name: 'Rice', grams: 100, kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }]);
  it.grams = 200;
  const t = sumItems([it]);
  assert.ok(Math.abs(t.k - 2 * itemTotals({ ...it, grams: 100 }).k) < 0.01);
  const e = toEntry(it, 'Lunch', 'id1');
  assert.equal(e.unit, 'g');
  assert.equal(e.n, 200);
  assert.ok(Math.abs(e.per.k * e.n - t.k) < 0.01);
  ok('grams rescale macros and entries use per gram units');
}

// api handler
const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.setHeader = (k, v) => ((r.headers[k] = v), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const JPEG = '/9j/' + 'A'.repeat(100);
const req = (over = {}) => ({ method: 'POST', headers: { 'x-forwarded-for': '1.1.1.' + Math.floor(Math.random() * 250) }, body: { image: JPEG, hint: 'home', meal: 'Dinner' }, ...over });
const realFetch = globalThis.fetch;
const reply = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });

{
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  let r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 503);
  r = mkRes();
  await handler(req({ method: 'GET' }), r);
  assert.equal(r.code, 405);
  ok('api: missing key gives 503, GET gives 405');
}
{
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'log_meal', input: { is_food: true, items: [{ name: 'Roti', portion: '2', grams: 80, kcal: 240, protein_g: 8, carbs_g: 46, fat_g: 3, confidence: 'high' }], notes: 'ok' } }] }) };
  };
  const r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.items[0].name, 'Roti');
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  const b = JSON.parse(sent.init.body);
  assert.equal(b.tool_choice.name, 'log_meal');
  assert.equal(b.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.ok(b.messages[0].content[1].text.includes('home'));
  assert.equal(sent.init.headers['x-api-key'], 'sk-test');
  ok('api: sends a forced tool call and returns parsed items');
}
{
  process.env.ACCESS_CODE = 'secret';
  let r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 401);
  r = mkRes();
  await handler(req({ headers: { 'x-tally-code': 'secret', 'x-forwarded-for': '9.9.9.9' } }), r);
  assert.equal(r.code, 200);
  delete process.env.ACCESS_CODE;
  ok('api: access code enforced when set');
}
{
  let r = mkRes();
  await handler(req({ body: { image: 'not base64!' } }), r);
  assert.equal(r.code, 400);
  r = mkRes();
  await handler(req({ body: {} }), r);
  assert.equal(r.code, 400);
  r = mkRes();
  await handler(req({ body: { image: '/9j/' + 'A'.repeat(4_100_000) } }), r);
  assert.equal(r.code, 413);
  ok('api: rejects bad and oversized images');
}
{
  globalThis.fetch = reply(401, {});
  let r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 503);
  globalThis.fetch = reply(429, {});
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 429);
  globalThis.fetch = reply(500, {});
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 502);
  globalThis.fetch = reply(200, { content: [{ type: 'text', text: 'hi' }] });
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 502);
  globalThis.fetch = async () => {
    throw new Error('boom');
  };
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 502);
  ok('api: upstream errors map to clear statuses');
}
{
  // free Gemini path takes priority when its key is set
  process.env.GEMINI_API_KEY = 'g-test';
  let sent;
  const meal = { is_food: true, items: [{ name: 'Idli', portion: '3 idlis', grams: 120, kcal: 156, protein_g: 5, carbs_g: 30, fat_g: 1, confidence: 'high' }], notes: '' };
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(meal) }] } }] }) };
  };
  let r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.items[0].name, 'Idli');
  assert.ok(sent.url.includes('generativelanguage.googleapis.com') && sent.url.includes('gemini-2.5-flash'));
  assert.equal(sent.init.headers['x-goog-api-key'], 'g-test');
  const b = JSON.parse(sent.init.body);
  assert.equal(b.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  process.env.GEMINI_MODEL = 'gemini-custom';
  await handler(req(), mkRes());
  assert.ok(sent.url.includes('gemini-custom'));
  delete process.env.GEMINI_MODEL;
  for (const [st, want] of [[429, 429], [403, 503], [400, 503], [404, 503], [500, 502]]) {
    globalThis.fetch = async () => ({ ok: false, status: st, json: async () => ({}) });
    r = mkRes();
    await handler(req(), r);
    assert.equal(r.code, want, 'gemini status ' + st);
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) });
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 502);
  assert.equal(readGemini({ candidates: [{ content: { parts: [{ text: '```json\n{"is_food":false,"items":[]}\n```' }] } }] }).is_food, false);
  assert.equal(readGemini({}), null);
  delete process.env.GEMINI_API_KEY;
  process.env.Gemini_API_Kalorie = 'g-odd-name';
  globalThis.fetch = async (url, init) => {
    sent = { url, init };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(meal) }] } }] }) };
  };
  r = mkRes();
  await handler(req(), r);
  assert.equal(r.code, 200);
  assert.equal(sent.init.headers['x-goog-api-key'], 'g-odd-name');
  delete process.env.Gemini_API_Kalorie;
  ok('api: free Gemini path, model override and error mapping');
}
{
  assert.equal(readTool({ content: [] }), null);
  assert.equal(readTool({ content: [{ type: 'tool_use', name: 'log_meal', input: { is_food: false, items: [] } }] }).is_food, false);
  const t0 = 1_000_000;
  for (let i = 0; i < 40; i++) assert.equal(limited('ip-x', t0 + i), false);
  assert.equal(limited('ip-x', t0 + 100), true);
  assert.equal(limited('ip-x', t0 + 3_700_000), false);
  ok('api: tool reader and rate limiter');
}
globalThis.fetch = realFetch;
console.log(`\n${n} vision test groups passed`);
