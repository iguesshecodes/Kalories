// Vercel serverless function: looks at one meal photo and returns what is on the plate.
// Keys live only in environment variables, never in the app. Use ONE of these:
//   GEMINI_API_KEY      Free key from Google AI Studio (aistudio.google.com). No card needed. Used first if set.
//   ANTHROPIC_API_KEY   Paid key from console.anthropic.com. Used if there is no Gemini key.
//
// Optional environment variables
//   GEMINI_MODEL    Force one Gemini model. By default the newest Flash model your key can use is picked automatically.
//   ACCESS_CODE     If set, the app must send the same code (Me tab, "Photo logging code"). Strongly recommended
//                   because your link is public and every photo costs a little.
//   ANALYZE_MODEL   Override the model. Defaults to claude-sonnet-5-5.

const MODEL = () => process.env.ANALYZE_MODEL || 'claude-sonnet-5-5';
const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

const SYSTEM = `You estimate the nutrition of a meal from one photo, for someone tracking calories to lose fat. Most meals are Indian home style or Indian restaurant food, but any cuisine can appear.

Rules:
- List each distinct food separately: for example roti, dal, a sabzi, rice, curd, salad, chutney, a drink. Count visible pieces (3 rotis is three, not one).
- "grams" is the weight of that food as served on the plate, in grams (use ml as grams for liquids). Judge size from the plate, bowl, hands and cutlery. A standard roti is about 40 g, a katori of dal or sabzi about 150 g, a cooked rice serving about 150 to 200 g.
- Protein, carbs, fat and kcal are for the portion shown, not per 100 g. Include the cooking oil, ghee, butter or cream normally used for that dish. Home cooking uses less than restaurants. If the note says restaurant, takeaway or street food, assume the richer version.
- kcal must be consistent with the macros (4 per g of protein and carbs, 9 per g of fat).
- Use plain common names, like "Dal tadka", "Roti", "Paneer butter masala", "Jeera rice". Do not add brand names unless a package is clearly visible.
- Only list what you can see. Do not invent side dishes. Skip plates, bowls and cutlery.
- Set confidence to "low" when the food is hidden, mixed together, stuffed or ambiguous, "medium" when the type is clear but the portion is a guess, and "high" only when both are clear.
- If the picture is not food, set is_food to false and return no items.
- "notes" is at most one short sentence about anything that limits accuracy. Never give health advice.`;

const TOOL = {
  name: 'log_meal',
  description: 'Record the foods visible in the meal photo with estimated portions and nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      is_food: { type: 'boolean' },
      items: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portion: { type: 'string', description: 'Human readable, for example "2 rotis" or "1 katori"' },
            grams: { type: 'number' },
            kcal: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
          },
          required: ['name', 'portion', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence']
        }
      },
      notes: { type: 'string' }
    },
    required: ['is_food', 'items']
  }
};

/* ---------- small helpers, exported for tests ---------- */
export function readTool(data) {
  const block = data && Array.isArray(data.content) ? data.content.find((b) => b.type === 'tool_use' && b.name === 'log_meal') : null;
  if (!block || !block.input || typeof block.input !== 'object') return null;
  const i = block.input;
  return { is_food: i.is_food !== false, items: Array.isArray(i.items) ? i.items : [], notes: typeof i.notes === 'string' ? i.notes : '' };
}

const hits = new Map();
export function limited(ip, now = Date.now(), max = 40, windowMs = 3600000) {
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

const send = (res, status, body) => {
  res.status(status).setHeader('cache-control', 'no-store');
  res.json(body);
};


const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          portion: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] }
        },
        required: ['name', 'portion', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence']
      }
    },
    notes: { type: 'STRING' }
  },
  required: ['is_food', 'items']
};

export function readGemini(data) {
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
    ? data.candidates[0].content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) return null;
  let j;
  try {
    j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (_) {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  return { is_food: j.is_food !== false, items: Array.isArray(j.items) ? j.items : [], notes: typeof j.notes === 'string' ? j.notes : '' };
}

// Find current Flash models this key can use, newest first. Model names change over time, so we ask Google.
let modelCache = { at: 0, list: null };
export function _resetModelCache() {
  modelCache = { at: 0, list: null };
}
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

export function rankModels(models) {
  const ok = (models || [])
    .filter((m) => m && typeof m.name === 'string' && (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .map((n) => ({ n, m: /^gemini-(\d+)(?:\.(\d+))?-flash$/.exec(n) }))
    .filter((x) => x.m)
    .map((x) => ({ n: x.n, v: Number(x.m[1]) * 1000 + Number(x.m[2] || 0) }))
    .sort((p, q) => q.v - p.v)
    .map((x) => x.n);
  return ok;
}

async function geminiModels(key) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  if (modelCache.list && Date.now() - modelCache.at < 6 * 3600000) return modelCache.list;
  let list = [];
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000) });
    if (r.ok) list = rankModels((await r.json()).models);
  } catch (_) {}
  list = [...list.slice(0, 3), ...FALLBACK_MODELS.filter((m) => !list.slice(0, 3).includes(m))];
  modelCache = { at: Date.now(), list };
  return list;
}

async function errDetail(up, key) {
  try {
    const j = await up.json();
    const m = j && j.error && j.error.message ? String(j.error.message) : '';
    return m.split(key).join('[key]').slice(0, 300);
  } catch (_) {
    return '';
  }
}

// Each provider returns { status, body } where body is { error } or the parsed meal.
async function viaGemini(key, image, text) {
  const models = await geminiModels(key);
  let last = null;
  for (const model of models) {
    let up;
    try {
      up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, maxOutputTokens: 8192 }
        }),
        signal: AbortSignal.timeout(26000)
      });
    } catch (_) {
      return { status: 502, body: { error: 'The food recognition service did not answer in time. Try again.' } };
    }
    if (!up.ok) {
      const detail = await errDetail(up, key);
      if (up.status === 404) {
        last = { status: 503, body: { error: 'No current Gemini Flash model was found for this key. Set GEMINI_MODEL in Vercel to a model name from aistudio.google.com.', detail } };
        modelCache = { at: 0, list: null };
        continue;
      }
      if (up.status === 429) return { status: 429, body: { error: 'The free daily limit for photo reading is used up or the service is busy. Try again later, or add food by searching.', detail } };
      if (up.status === 400 || up.status === 401 || up.status === 403) return { status: 503, body: { error: 'Google rejected the request. Check the key in Vercel, then try again.', detail } };
      return { status: 502, body: { error: 'The food recognition service had a problem. Try again.', detail } };
    }
    let data;
    try {
      data = await up.json();
    } catch (_) {
      return { status: 502, body: { error: 'The answer was not readable. Try again.' } };
    }
    const out = readGemini(data);
    if (!out) return { status: 502, body: { error: 'Could not make sense of that photo. Try a clearer one.', detail: JSON.stringify(data).slice(0, 300) } };
    return { status: 200, body: { ...out, model } };
  }
  return last || { status: 503, body: { error: 'No Gemini model available.' } };
}

async function viaClaude(key, image, text) {
  let up;
  try {
    up = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: 1500,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'log_meal' },
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text }] }]
      }),
      signal: AbortSignal.timeout(28000)
    });
  } catch (_) {
    return { status: 502, body: { error: 'The food recognition service did not answer in time. Try again.' } };
  }
  if (up.status === 401 || up.status === 403) return { status: 503, body: { error: 'The API key was rejected. Check ANTHROPIC_API_KEY in Vercel.' } };
  if (up.status === 429) return { status: 429, body: { error: 'The recognition service is busy. Try again in a minute.' } };
  if (!up.ok) return { status: 502, body: { error: 'The food recognition service had a problem. Try again.' } };
  let data;
  try {
    data = await up.json();
  } catch (_) {
    return { status: 502, body: { error: 'The answer was not readable. Try again.' } };
  }
  const out = readTool(data);
  if (!out) return { status: 502, body: { error: 'Could not make sense of that photo. Try a clearer one.' } };
  return { status: 200, body: out };
}

// Be forgiving about the variable name: any variable that starts with "gemini" and holds a key works.
function envLike(re) {
  const name = Object.keys(process.env).find((k) => re.test(k) && process.env[k]);
  return name ? process.env[name] : '';
}

// GET reports whether a key is set and accepted. It asks the provider to list models, which is free and uses no quota.
async function health(res) {
  const gKey = process.env.GEMINI_API_KEY || envLike(/^gemini.*key|^gemini.*kalorie/i);
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (!gKey && !aKey) return send(res, 200, { configured: false, hint: 'No Gemini or Anthropic key was found in the Vercel environment variables.' });
  const provider = gKey ? 'gemini' : 'claude';
  try {
    const r = gKey
      ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': gKey }, signal: AbortSignal.timeout(10000) })
      : await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(10000) });
    const model = gKey && r.ok ? (await geminiModels(gKey))[0] : undefined;
    return send(res, 200, { configured: true, provider, keyValid: r.ok, providerStatus: r.status, model, accessCodeSet: !!process.env.ACCESS_CODE });
  } catch (_) {
    return send(res, 200, { configured: true, provider, keyValid: null, hint: 'Could not reach the provider to test the key.' });
  }
}

const TINY_JPEG = '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';

// GET ?selftest=1 sends a tiny dummy picture through the real recognition call and reports what happened.
async function selftest(req, res) {
  const gKey = process.env.GEMINI_API_KEY || envLike(/^gemini.*key|^gemini.*kalorie/i);
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (!gKey && !aKey) return send(res, 200, { ok: false, error: 'No key found.' });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (limited('selftest:' + ip, Date.now(), 10)) return send(res, 429, { ok: false, error: 'Too many self tests this hour.' });
  const t0 = Date.now();
  const r = gKey ? await viaGemini(gKey, TINY_JPEG, 'Identify this meal.') : await viaClaude(aKey, TINY_JPEG, 'Identify this meal.');
  return send(res, 200, { ok: r.status === 200, ms: Date.now() - t0, status: r.status, model: r.body.model, error: r.body.error, detail: r.body.detail, parsedItems: r.body.items ? r.body.items.length : undefined });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    let q = '';
    try {
      q = new URL(req.url || '/', 'http://x').searchParams.get('selftest') || '';
    } catch (_) {}
    return q ? selftest(req, res) : health(res);
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'Use POST.' });
  }
  const gKey = process.env.GEMINI_API_KEY || envLike(/^gemini.*key|^gemini.*kalorie/i);
  const aKey = process.env.ANTHROPIC_API_KEY;
  if (!gKey && !aKey) return send(res, 503, { error: 'Photo logging is not switched on yet. Add GEMINI_API_KEY (free) in your Vercel project settings.' });

  const need = process.env.ACCESS_CODE;
  if (need && !safeEqual(req.headers['x-tally-code'] || '', need)) return send(res, 401, { error: 'That photo logging code is not right. Check it in the Me tab.' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: 'That is a lot of photos in an hour. Try again a little later.' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = null;
    }
  }
  const image = body && typeof body.image === 'string' ? body.image : '';
  if (!image) return send(res, 400, { error: 'No picture arrived.' });
  if (image.length > 4_000_000) return send(res, 413, { error: 'That picture is too large. Try again.' });
  if (!image.startsWith('/9j/') || !/^[A-Za-z0-9+/=]+$/.test(image)) return send(res, 400, { error: 'The picture was not a JPEG.' });

  const hint = typeof body.hint === 'string' ? body.hint.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  const meal = MEALS.includes(body.meal) ? body.meal : '';
  const text = `Identify and estimate this ${meal ? meal.toLowerCase() : 'meal'}.${hint ? `\nNote from the person eating it: ${hint}` : ''}`;

  const r = gKey ? await viaGemini(gKey, image, text) : await viaClaude(aKey, image, text);
  return send(res, r.status, r.body);
}
