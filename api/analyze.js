// Vercel serverless function: looks at one meal photo and returns what is on the plate.
// The Anthropic key lives only in the ANTHROPIC_API_KEY environment variable, never in the app.
//
// Optional environment variables
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'Use POST.' });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 503, { error: 'Photo logging is not switched on yet. Add ANTHROPIC_API_KEY in your Vercel project settings.' });

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
  } catch (e) {
    return send(res, 502, { error: 'The food recognition service did not answer in time. Try again.' });
  }

  if (up.status === 401 || up.status === 403) return send(res, 503, { error: 'The API key was rejected. Check ANTHROPIC_API_KEY in Vercel.' });
  if (up.status === 429) return send(res, 429, { error: 'The recognition service is busy. Try again in a minute.' });
  if (!up.ok) return send(res, 502, { error: 'The food recognition service had a problem. Try again.' });

  let data;
  try {
    data = await up.json();
  } catch (_) {
    return send(res, 502, { error: 'The answer was not readable. Try again.' });
  }
  const out = readTool(data);
  if (!out) return send(res, 502, { error: 'Could not make sense of that photo. Try a clearer one.' });
  return send(res, 200, out);
}
