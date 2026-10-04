// Open Food Facts lookups (free, open database of packaged foods).
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
const BASE = 'https://world.openfoodfacts.org';

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function toFood(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let k = n['energy-kcal_100g'];
  if (k == null && n['energy_100g'] != null) k = num(n['energy_100g']) / 4.184;
  if (k == null || !Number.isFinite(Number(k))) return null;
  const name = (p.product_name || '').trim();
  if (!name || !p.code) return null;
  const brand = (p.brands || '').split(',')[0].trim();
  const portions = [];
  const sq = num(p.serving_quantity);
  if (sq > 0 && sq < 2000) portions.push({ l: `1 serving (${(p.serving_size || sq + ' g').trim()})`, g: sq });
  portions.push({ l: '100 g', g: 100 });
  return {
    id: 'off:' + p.code,
    src: 'off',
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
    cat: 'snack',
    diet: 'v',
    per100: { k: num(k), p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g) },
    portions,
    alias: ''
  };
}

export async function searchOnline(q) {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
  const data = await getJSON(url);
  return (data.products || []).map(toFood).filter(Boolean);
}

export async function lookupBarcode(code) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length < 8 || clean.length > 14) throw new Error('A barcode has 8 to 14 digits.');
  const data = await getJSON(`${BASE}/api/v2/product/${clean}?fields=${FIELDS}`);
  if (data.status !== 1) return null;
  return toFood(data.product);
}
