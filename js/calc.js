// Pure calculation helpers. No DOM access, so they can be tested in Node.

export const MEALS = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];

export const ACTIVITY = {
  sedentary: { f: 1.2, t: 'Mostly seated', d: 'Classes, desk work, little walking' },
  light: { f: 1.375, t: 'Lightly active', d: 'On your feet some, exercise 1 to 3 days a week' },
  moderate: { f: 1.55, t: 'Moderately active', d: 'Regular training 3 to 5 days a week' },
  high: { f: 1.725, t: 'Very active', d: 'Hard training most days or a physical job' }
};

export const PACES = [
  { v: 0.25, t: 'Gentle', d: 'Easiest to stick to' },
  { v: 0.5, t: 'Steady', d: 'The usual sweet spot' },
  { v: 0.75, t: 'Faster', d: 'Needs more discipline' }
];

export const KCAL_PER_KG = 7700;

export function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

export function bmr(p) {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'm' ? 5 : -161);
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function computeTargets(p, kcalAdjust = 0) {
  const b = bmr(p);
  const tdee = b * (ACTIVITY[p.activity] || ACTIVITY.light).f;
  const wantsLoss = p.goalKg < p.weightKg - 0.4 && p.age >= 18;
  const pace = wantsLoss ? p.pace : 0;
  const floor = p.sex === 'm' ? 1500 : 1200;
  let kcal = tdee - (pace * KCAL_PER_KG) / 7;
  let floored = false;
  if (wantsLoss && kcal < floor) {
    kcal = floor;
    floored = true;
  }
  kcal = Math.round((kcal + kcalAdjust) / 10) * 10;
  const refW = wantsLoss ? (p.weightKg + p.goalKg) / 2 : p.weightKg;
  const protein = Math.round(1.8 * refW);
  const fat = Math.max(Math.round((0.27 * kcal) / 9), Math.round(0.6 * refW));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const water = Math.max(6, Math.min(14, Math.round((0.035 * p.weightKg * 1000) / 250)));
  const deficit = wantsLoss ? Math.round(tdee - kcal) : 0;
  const weeklyLoss = Math.max(0, (deficit * 7) / KCAL_PER_KG);
  const weeksToGoal = wantsLoss && weeklyLoss > 0 ? (p.weightKg - p.goalKg) / weeklyLoss : null;
  return {
    bmr: Math.round(b),
    tdee: Math.round(tdee),
    kcal,
    protein,
    fat,
    carbs,
    water,
    deficit,
    floored,
    weeklyLoss,
    weeksToGoal,
    wantsLoss
  };
}

export function paceWarning(p) {
  if (p.age < 18) return 'This calculator is made for adults, so your plan keeps you at maintenance. Please speak to a doctor or dietitian about weight goals.';
  if (p.goalKg >= p.weightKg - 0.4) return '';
  const rate = p.pace / p.weightKg;
  if (rate > 0.0125) return 'That pace is quick for your body weight. The gentle option is easier to keep up.';
  return '';
}

export function sum(entries) {
  const t = { k: 0, p: 0, c: 0, f: 0 };
  for (const e of entries) {
    t.k += e.per.k * e.n;
    t.p += e.per.p * e.n;
    t.c += e.per.c * e.n;
    t.f += e.per.f * e.n;
  }
  return t;
}

export function entryTotals(e) {
  return { k: e.per.k * e.n, p: e.per.p * e.n, c: e.per.c * e.n, f: e.per.f * e.n };
}

export function burnedOf(day) {
  return (day.workouts || []).reduce((a, w) => a + (Number(w.kcal) || 0), 0);
}

// Weight smoothing: average of every weigh-in in the 7 days up to and including each date.
export function smoothWeights(weights) {
  const ws = [...weights].sort((a, b) => (a.d < b.d ? -1 : 1));
  return ws.map((w) => {
    const from = addDays(w.d, -6);
    const win = ws.filter((x) => x.d >= from && x.d <= w.d);
    const avg = win.reduce((a, x) => a + x.kg, 0) / win.length;
    return { d: w.d, kg: w.kg, avg };
  });
}

export function linreg(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

// Compare what you ate with what your weight did, to estimate real maintenance calories.
// Needs at least 10 logged days and a weight span of 14 days inside the last 28 days.
export function impliedMaintenance(state, today) {
  const from = addDays(today, -27);
  const ws = state.weights.filter((w) => w.d >= from && w.d <= today);
  if (ws.length < 4) return null;
  const sorted = [...ws].sort((a, b) => (a.d < b.d ? -1 : 1));
  const span = daysBetween(sorted[0].d, sorted[sorted.length - 1].d);
  if (span < 14) return null;
  const reg = linreg(sorted.map((w) => ({ x: daysBetween(sorted[0].d, w.d), y: w.kg })));
  if (!reg) return null;
  const logged = [];
  for (let i = 0; i <= daysBetween(from, today); i++) {
    const d = addDays(from, i);
    const day = state.days[d];
    if (!day || !day.entries || !day.entries.length) continue;
    const k = sum(day.entries).k;
    if (k >= 800 && d !== today) logged.push(k);
  }
  if (logged.length < 10) return null;
  const avgIn = logged.reduce((a, b) => a + b, 0) / logged.length;
  const kgPerWeek = reg.slope * 7;
  const maintenance = Math.round(avgIn - reg.slope * KCAL_PER_KG);
  return { avgIn: Math.round(avgIn), kgPerWeek, maintenance, loggedDays: logged.length, span };
}

export function streak(days, today) {
  const has = (d) => days[d] && days[d].entries && days[d].entries.length > 0;
  let cur = 0;
  let d = has(today) ? today : addDays(today, -1);
  while (has(d)) {
    cur++;
    d = addDays(d, -1);
  }
  const keys = Object.keys(days).filter(has).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return { current: cur, best };
}

export function exerciseKcal(met, weightKg, minutes) {
  return Math.round((met * weightKg * minutes) / 60);
}

export const WORKOUTS = [
  { n: 'Walk', met: 3.5 },
  { n: 'Run', met: 9.8 },
  { n: 'Gym', met: 5 },
  { n: 'Cycling', met: 7.5 },
  { n: 'Cricket', met: 5 },
  { n: 'Yoga', met: 3 },
  { n: 'Swim', met: 6 },
  { n: 'HIIT', met: 8 }
];
