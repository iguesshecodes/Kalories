// Local-first storage. Everything lives on the device in localStorage.
const KEY = 'tally.v1';

const EMPTY_DAY = Object.freeze({ entries: [], water: 0, steps: 0, workouts: [] });

function defaults() {
  return {
    v: 1,
    profile: null,
    targets: null,
    settings: { eatBack: 0, stepsGoal: 8000, theme: 'system', kcalAdjust: 0, accessCode: '' },
    days: {},
    weights: [],
    custom: [],
    meals: [],
    recent: []
  };
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = JSON.parse(raw);
    const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch (e) {
    // Keep a copy of anything unreadable so nothing is lost silently.
    try {
      if (raw) localStorage.setItem(KEY + '.corrupt', raw);
    } catch (_) {}
    return defaults();
  }
}

let state = load();
const subs = new Set();
let saveFailed = false;

export const get = () => state;
export const getDay = (d) => state.days[d] || EMPTY_DAY;
export const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const didSaveFail = () => saveFailed;

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch (e) {
    saveFailed = true;
  }
}

export function mutate(fn) {
  fn(state);
  save();
  subs.forEach((f) => f());
}

export function ensureDay(d) {
  if (!state.days[d]) state.days[d] = { entries: [], water: 0, steps: 0, workouts: [] };
  const day = state.days[d];
  day.entries ||= [];
  day.workouts ||= [];
  day.water ||= 0;
  day.steps ||= 0;
  return day;
}

export function upsertWeight(d, kg) {
  const i = state.weights.findIndex((w) => w.d === d);
  if (i >= 0) state.weights[i].kg = kg;
  else state.weights.push({ d, kg });
  state.weights.sort((a, b) => (a.d < b.d ? -1 : 1));
}

export function latestWeight(upTo) {
  const ws = state.weights.filter((w) => !upTo || w.d <= upTo);
  return ws.length ? ws[ws.length - 1] : null;
}

export function pushRecent(food) {
  const snap = {
    id: food.id,
    src: food.src,
    name: food.name,
    cat: food.cat,
    diet: food.diet,
    per100: food.per100,
    portions: food.portions,
    alias: food.alias || ''
  };
  state.recent = [snap, ...state.recent.filter((r) => r.id !== food.id)].slice(0, 12);
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || s.v !== 1 || typeof s.days !== 'object' || !Array.isArray(s.weights)) {
    throw new Error('This file does not look like a Tally backup.');
  }
  const d = defaults();
  state = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  save();
  subs.forEach((f) => f());
}

export function resetAll() {
  state = defaults();
  save();
  subs.forEach((f) => f());
}

export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (_) {}
  return false;
}
