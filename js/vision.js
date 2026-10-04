// Photo logging helpers: shrink the picture, ask the server what is on the plate,
// and clean up the answer so a wild guess can never reach your diary unchecked.

export const MAX_SIDE = 1280;

const clampNum = (v, lo, hi, d = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, n));
};

/* ---------- pure cleaning, unit tested ---------- */
export function cleanItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, 12)) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) continue;
    const grams = Math.round(clampNum(r.grams, 5, 2000, 100));
    const p = clampNum(r.protein_g ?? r.p, 0, 300);
    const c = clampNum(r.carbs_g ?? r.c, 0, 500);
    const f = clampNum(r.fat_g ?? r.f, 0, 300);
    let k = clampNum(r.kcal ?? r.k, 0, 4000);
    const atwater = 4 * p + 4 * c + 9 * f;
    let adjusted = false;
    // If the calories and the macros disagree by a lot, trust the macros.
    if (atwater > 20 && Math.abs(k - atwater) / Math.max(k, atwater) > 0.3) {
      k = atwater;
      adjusted = true;
    }
    const conf = ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'medium';
    out.push({
      name,
      portion: String(r.portion || '').slice(0, 60),
      grams,
      conf,
      adjusted,
      // macros per single gram, so changing the grams rescales everything
      base: { k: k / grams, p: p / grams, c: c / grams, f: f / grams }
    });
  }
  return out;
}

export const itemTotals = (it) => ({ k: it.base.k * it.grams, p: it.base.p * it.grams, c: it.base.c * it.grams, f: it.base.f * it.grams });

export function sumItems(items) {
  return items.reduce(
    (a, it) => {
      const t = itemTotals(it);
      return { k: a.k + t.k, p: a.p + t.p, c: a.c + t.c, f: a.f + t.f };
    },
    { k: 0, p: 0, c: 0, f: 0 }
  );
}

// Diary entry in the same shape the rest of the app uses (unit 'g', macros per gram).
export const toEntry = (it, meal, id) => ({ id, meal, name: it.name, unit: 'g', per: { ...it.base }, n: it.grams, src: 'photo', t: Date.now() });

/* ---------- image preparation (browser only) ---------- */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function draw(src, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return cv;
}

export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('That file is not a picture.');
  let src;
  try {
    src = await decode(file);
  } catch (_) {
    throw new Error('Could not open that picture. Try taking it again.');
  }
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  if (!sw || !sh) throw new Error('Could not open that picture. Try taking it again.');
  const s = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const big = draw(src, Math.round(sw * s), Math.round(sh * s));
  const ts = Math.min(1, 480 / Math.max(sw, sh));
  const small = draw(src, Math.round(sw * ts), Math.round(sh * ts));
  if (src.close) src.close();
  const data = big.toDataURL('image/jpeg', 0.82);
  return { base64: data.slice(data.indexOf(',') + 1), thumb: small.toDataURL('image/jpeg', 0.7) };
}

/* ---------- talking to the server ---------- */
export class VisionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function analyzePhoto({ base64, hint, meal, code }, { signal, endpoint = '/api/analyze' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(code ? { 'x-tally-code': code } : {}) },
      body: JSON.stringify({ image: base64, hint: hint || '', meal: meal || '' }),
      signal: ctl.signal
    });
  } catch (e) {
    if (signal && signal.aborted) throw new VisionError('cancelled', 'Cancelled');
    if (e && e.name === 'AbortError') throw new VisionError('timeout', 'That took too long.');
    throw new VisionError('offline', 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const map = { 401: 'code', 413: 'big', 429: 'busy', 503: 'setup' };
    throw new VisionError(map[res.status] || 'server', (body && body.error) || 'Something went wrong on the server.');
  }
  if (!body || typeof body !== 'object') throw new VisionError('server', 'The answer was not readable.');
  return {
    food: body.is_food !== false,
    items: cleanItems(body.items),
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 240) : ''
  };
}
