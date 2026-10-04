import { MEALS, computeTargets, sum, burnedOf, streak, ymd, addDays, parseYmd } from './calc.js';
import { get, getDay, mutate, ensureDay, upsertWeight, latestWeight, subscribe, uid, exportJSON, importJSON, resetAll, askPersist, didSaveFail } from './store.js';
import { esc, icon, fmt, fmt1, pct, qtyText, handlers, inputs, forms, ui, bus, toast, dayLabel, reducedMotion, $, $$ } from './util.js';
import { setupActive, startSetup, setupView } from './setup.js';
import { trendsView } from './trends.js';
import { openAdd, openEdit, openWorkout, openSaveMeal, openPhoto, closeSheet } from './sheet.js';

ui.date = ymd();
let lastToday = ymd();
let lastKey = '';
let introDone = false;
let confirmReset = false;

/* ---------- shell ---------- */
function applyTheme() {
  const t = get().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function tabsHTML() {
  const b = (k, l, ic) => `<button type="button" data-act="tab" data-t="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${l}</span></button>`;
  return `${b('today', 'Today', 'notebook')}${b('trends', 'Trends', 'chart-line-up')}<button type="button" class="add" data-act="snap" aria-label="Snap your meal">${icon('camera')}</button>${b('me', 'Me', 'user-circle')}`;
}

function render() {
  const s = get();
  applyTheme();
  const view = $('#view');
  const tabs = $('#tabs');
  if (!s.profile && !setupActive()) return startSetup(false);
  const inSetup = setupActive();
  const key = inSetup ? 'setup' : ui.tab + ui.date;
  const keep = key === lastKey ? window.scrollY : 0;
  tabs.hidden = inSetup;
  let html;
  if (inSetup) html = setupView();
  else if (ui.tab === 'trends') html = trendsView();
  else if (ui.tab === 'me') html = meView();
  else html = todayView();
  view.innerHTML = html;
  if (!inSetup) tabs.innerHTML = tabsHTML();
  lastKey = key;
  window.scrollTo(0, keep);
  afterRender();
}
bus.render = render;
subscribe(render);

function afterRender() {
  const hero = $('.budget .num');
  if (hero && !introDone) {
    introDone = true;
    if (!reducedMotion()) {
      const to = Number(hero.dataset.v);
      const small = hero.querySelector('small').outerHTML;
      const bar = $('.budget .bar > i');
      const w = bar ? bar.style.width : '0%';
      if (bar) bar.style.width = '0%';
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 700);
        const e = 1 - Math.pow(1 - p, 4);
        hero.innerHTML = fmt(to * e) + small;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      requestAnimationFrame(() => bar && (bar.style.width = w));
    }
  }
}

/* ---------- today ---------- */
const greet = () => {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 22 ? 'Good evening' : 'Hello';
};

function proteinIdeas(diet) {
  return diet === 'veg' ? 'paneer, dal, curd or soya chunks' : diet === 'egg' ? 'eggs, paneer, dal or curd' : 'chicken, eggs, fish or dal';
}

function nudge(t, T, count, isToday, diet, budget) {
  if (!isToday) return count ? `You logged ${fmt(t.k)} kcal this day, ${Math.round((t.k / budget) * 100)} percent of your budget.` : 'Nothing was logged on this day.';
  const h = new Date().getHours();
  if (!count) return h < 11 ? 'Any start is a good start. Log breakfast whenever you have it.' : 'Nothing logged yet. A rough guess is better than nothing, and you can fix it later.';
  const ratio = t.k / budget;
  if (ratio > 1.1) return 'A bit over today. One day barely moves your trend, so just carry on tomorrow.';
  if (ratio >= 0.92) return 'Right around your budget. This is what steady looks like.';
  const pLeft = T.protein - t.p;
  if (h >= 15 && pLeft > T.protein * 0.4) return `Protein is a little behind. ${proteinIdeas(diet).replace(/^./, (c) => c.toUpperCase())} would help close the gap.`;
  if (h >= 19 && ratio < 0.6) return 'Plenty of room left. Make dinner a proper meal, eating too little tends to backfire.';
  return `${fmt(budget - t.k)} kcal and ${fmt(Math.max(0, pLeft))} g of protein still to go.`;
}

function entRow(e) {
  const t = { k: e.per.k * e.n };
  return `<button type="button" class="ent" data-act="edit" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.name)}"><span class="t"><b>${esc(e.name)}</b><span>${esc(qtyText(e.n, e.unit))}</span></span><span class="k">${fmt(t.k)}</span></button>`;
}

function mealBlock(m, day, d) {
  const es = day.entries.filter((e) => e.meal === m);
  const k = sum(es).k;
  const prev = getDay(addDays(d, -1)).entries.filter((e) => e.meal === m);
  const foot = [];
  if (!es.length && prev.length) foot.push(`<button type="button" class="link" data-act="copy-prev" data-meal="${m}">Copy yesterday's ${m.toLowerCase()}</button>`);
  if (es.length >= 2) foot.push(`<button type="button" class="link" data-act="save-meal" data-meal="${m}">Save as meal</button>`);
  return `<div class="meal">
    <div class="meal-h"><h3>${m}<span class="kc">${es.length ? fmt(k) + ' kcal' : ''}</span></h3><button type="button" class="ib sm ring" data-act="add-open" data-meal="${m}" aria-label="Add food to ${m}">${icon('plus')}</button></div>
    ${es.length ? es.map(entRow).join('') : `<p class="empty">Nothing yet.</p>`}
    ${foot.length ? `<div class="meal-foot">${foot.join('')}</div>` : ''}
  </div>`;
}

function todayView() {
  const s = get();
  const T = s.targets;
  const d = ui.date;
  const today = ymd();
  const isToday = d === today;
  const day = getDay(d);
  const t = sum(day.entries);
  const burned = burnedOf(day);
  const budget = T.kcal + Math.round(burned * s.settings.eatBack);
  const left = budget - t.k;
  const over = left < 0;
  const name = s.profile.name;
  const lw = latestWeight(d);
  const dr = Math.max(T.water, day.water);
  const drops = Array.from({ length: Math.min(16, dr) }, (_, i) => `<span>${icon('drop', i < day.water ? 'on' : '')}</span>`).join('');
  const st = streak(s.days, today);
  const dateStr = parseYmd(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const macro = (label, v, tg, fg) => `<div class="macro"><span class="name">${label}</span><div class="bar ${fg ? 'fg' : ''}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${tg}" aria-valuenow="${Math.round(v)}"><i style="width:${pct(v, tg)}%"></i></div><span class="val"><b>${fmt(v)}</b> / ${fmt(tg)} g</span></div>`;

  return `<header class="top">
      <div><h1>${isToday ? `${greet()}${name ? `, <span class="accent-i">${esc(name)}</span>` : ''}` : esc(dayLabel(d, today, parseYmd))}</h1><p class="sub">${dateStr}${isToday && st.current > 1 ? `. ${st.current} day logging streak.` : ''}</p></div>
      <div class="daynav"><button type="button" class="ib" data-act="day" data-d="-1" aria-label="Previous day">${icon('caret-left')}</button><button type="button" class="ib" data-act="day" data-d="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>${icon('caret-right')}</button></div>
    </header>
    ${!isToday ? `<p style="margin:-8px 0 16px"><button type="button" class="link" data-act="day-today">Back to today</button></p>` : ''}
    <section class="sec budget" aria-labelledby="bh">
      <p class="label" id="bh">${over ? 'Over today by' : 'Left today'}</p>
      <p class="num" data-v="${Math.abs(Math.round(left))}">${fmt(Math.abs(left))}<small>kcal</small></p>
      <div class="bar ${over ? 'fg' : ''}" role="progressbar" aria-label="Calories eaten" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.round(t.k)}"><i style="width:${pct(t.k, budget)}%"></i></div>
      <dl class="stats"><div><dt>Eaten</dt><dd>${fmt(t.k)}</dd></div><div><dt>Budget</dt><dd>${fmt(budget)}</dd></div><div><dt>Burned</dt><dd>${fmt(burned)}</dd></div></dl>
      <p class="nudge" role="status">${esc(nudge(t, T, day.entries.length, isToday, s.profile.diet, budget))}</p>
    </section>
    <section class="sec" aria-label="Macros">
      ${macro('Protein', t.p, T.protein, false)}${macro('Carbs', t.c, T.carbs, true)}${macro('Fat', t.f, T.fat, true)}
    </section>
    <section class="sec"><div class="sec-h"><h2>Meals</h2></div>${MEALS.map((m) => mealBlock(m, day, d)).join('')}</section>
    <section class="sec">
      <div class="sec-h"><h2>Water</h2><span class="label">${day.water} of ${T.water} glasses</span></div>
      <div class="drops" aria-hidden="true">${drops}</div>
      <div class="line-ctl"><span class="muted mono">${fmt(day.water * 250)} ml</span><span style="display:flex;gap:8px"><button type="button" class="btn quiet sm" data-act="water" data-d="-1" aria-label="Remove a glass" ${day.water ? '' : 'disabled'}>${icon('minus')}</button><button type="button" class="btn dark sm" data-act="water" data-d="1">${icon('plus')} Glass</button></span></div>
    </section>
    <section class="sec">
      <div class="sec-h"><h2>Movement</h2><button type="button" class="btn quiet sm" data-act="workout">${icon('barbell')} Log workout</button></div>
      <label class="field"><span class="label">Steps</span><span class="unit" data-u="of ${fmt(s.settings.stepsGoal)}"><input class="input mono" inputmode="numeric" autocomplete="off" data-change="steps" value="${day.steps || ''}" placeholder="0" aria-label="Steps today"></span></label>
      ${day.workouts.length ? day.workouts.map((w) => `<div class="ent" style="cursor:default"><span class="t"><b>${esc(w.name)}</b><span>${w.min} min</span></span><span style="display:flex;align-items:center;gap:6px"><span class="k">${fmt(w.kcal)} kcal</span><button type="button" class="ib sm" data-act="del-workout" data-id="${esc(w.id)}" aria-label="Delete ${esc(w.name)}">${icon('trash')}</button></span></div>`).join('') : `<p class="empty">No workout logged. Walking counts.</p>`}
    </section>
    <section class="sec">
      <div class="sec-h"><h2>Weight</h2>${lw ? `<span class="label">Last ${fmt1(lw.kg)} kg</span>` : ''}</div>
      <form data-form="weight" style="display:flex;gap:8px"><label class="sr" for="wt-in">Weight in kilograms</label><span class="unit" data-u="kg" style="flex:1"><input class="input mono" id="wt-in" inputmode="decimal" autocomplete="off" placeholder="${lw ? fmt1(lw.kg) : '70.0'}"></span><button class="btn dark" type="submit">Log</button></form>
      <p class="hint">Weigh at the same time each morning if you can. The trend matters, not the number.</p>
    </section>`;
}

/* ---------- me ---------- */
function meView() {
  const s = get();
  const T = s.targets;
  const P = s.profile;
  const seg = (name, cur, opts) => `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-act="${name === 'Theme' ? 'theme' : 'eatback'}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  return `<header class="top"><div><h1>${P.name ? esc(P.name) : 'Me'}</h1><p class="sub">${fmt1(P.heightCm)} cm, goal ${fmt1(P.goalKg)} kg</p></div></header>
    <section class="sec">
      <div class="sec-h"><h2>Your daily plan</h2><button type="button" class="btn quiet sm" data-act="edit-profile">${icon('pencil-simple')} Edit</button></div>
      <dl class="plan" style="margin:0 0 12px">
        <div class="big"><dt>Calories</dt><dd>${fmt(T.kcal)}</dd></div>
        <div><dt>Protein</dt><dd>${fmt(T.protein)} g</dd></div><div><dt>Carbs</dt><dd>${fmt(T.carbs)} g</dd></div><div><dt>Fat</dt><dd>${fmt(T.fat)} g</dd></div><div><dt>Water</dt><dd>${T.water} glasses</dd></div>
        <div><dt>Resting burn</dt><dd>${fmt(T.bmr)}</dd></div><div><dt>With activity</dt><dd>${fmt(T.tdee)}</dd></div>
      </dl>
      <p class="why">Based on the Mifflin St Jeor formula, your activity level and your chosen pace. These are estimates, not medical advice. If you have a health condition, take medication or are pregnant, check your plan with a doctor or dietitian.</p>
      <button type="button" class="btn quiet block" data-act="recalc">Recalculate from my latest weight</button>
    </section>
    <section class="sec">
      <div class="sec-h"><h2>Settings</h2></div>
      <div class="setrow"><span class="label" style="display:block;margin-bottom:10px">Appearance</span>${seg('Theme', s.settings.theme, [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="setrow"><span class="label" style="display:block;margin-bottom:10px">Add exercise calories to my budget</span>${seg('Eat back', s.settings.eatBack, [[0, 'Off'], [0.5, 'Half'], [1, 'All']])}
        <p class="hint">Off is best for most people. Your plan already counts normal activity, so adding workouts on top can double count. Choose Half if you train hard on some days.</p></div>
      <label class="setrow field" style="margin:0;display:block"><span class="label">Daily steps goal</span><span class="unit" data-u="steps"><input class="input mono" inputmode="numeric" data-change="stepsgoal" value="${s.settings.stepsGoal}"></span></label>
    </section>
    <section class="sec">
      <div class="sec-h"><h2>Photo logging</h2></div>
      <p class="why">Tap the camera button, take a photo of your plate and Tally lists each food with a portion and calories. You check it, then log it in one tap. The photo is sent to your own Tally server to be read and is not stored.</p>
      <label class="setrow field" style="margin:0;display:block"><span class="label">Photo logging code (only if you set one)</span><input class="input" type="password" autocomplete="off" data-change="code" value="${esc(s.settings.accessCode || '')}" placeholder="Leave empty if none"></label>
      <p style="margin-top:12px"><button type="button" class="btn quiet" data-act="check-photo">Check photo logging</button></p>
    </section>
    <section class="sec">
      <div class="sec-h"><h2>Your data</h2></div>
      <p class="why">Everything lives on this device only. Nothing is uploaded and there is no account. Clearing your browser data would erase it, so download a backup now and then.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn quiet" data-act="export">${icon('download-simple')} Download backup</button><button type="button" class="btn quiet" data-act="import">${icon('upload-simple')} Restore backup</button></div>
      <input type="file" id="import-file" accept="application/json,.json" hidden data-change="import">
      <p style="margin-top:18px"><button type="button" class="link danger" data-act="reset">${confirmReset ? 'Tap again to erase everything for good' : 'Erase all my data'}</button></p>
    </section>
    <section class="sec"><p class="hint">Tally keeps food values from IFCT 2017 and USDA ranges plus the open Open Food Facts database for packaged items. Values are estimates, so weigh when accuracy matters.</p></section>`;
}

/* ---------- handlers ---------- */
const dateNow = () => (ui.tab === 'today' ? ui.date : ymd());

handlers['tab'] = (el) => {
  ui.tab = el.dataset.t;
  render();
};
handlers['day'] = (el) => {
  const next = addDays(ui.date, Number(el.dataset.d));
  if (next > ymd()) return;
  ui.date = next;
  render();
};
handlers['day-today'] = () => {
  ui.date = ymd();
  render();
};
handlers['add-open'] = (el) => openAdd(el.dataset.meal || null, dateNow());
handlers['check-photo'] = async () => {
  toast('Checking photo logging');
  try {
    const r = await fetch('/api/analyze', { cache: 'no-store' });
    const j = await r.json();
    if (!j.configured) toast('Not set up yet. No key was found in Vercel.');
    else if (j.keyValid) toast('Photo logging is ready' + (j.accessCodeSet ? '. Remember your code.' : ''));
    else if (j.keyValid === false) toast('Google or Anthropic rejected the key. Paste a fresh one in Vercel.');
    else toast('Key found, but I could not test it right now.');
  } catch (e) {
    toast('Could not reach the server. Check your connection.');
  }
};
handlers['snap'] = () => {
  const i = document.getElementById('snap');
  if (i) i.click();
};
document.getElementById('snap').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) openPhoto(f, dateNow());
});
handlers['edit'] = (el) => openEdit(el.dataset.id, ui.date);
handlers['workout'] = () => openWorkout(ui.date);
handlers['save-meal'] = (el) => openSaveMeal(el.dataset.meal, ui.date);
handlers['copy-prev'] = (el) => {
  const m = el.dataset.meal;
  const prev = getDay(addDays(ui.date, -1)).entries.filter((e) => e.meal === m);
  const d = ui.date;
  mutate(() => {
    for (const e of prev) ensureDay(d).entries.push({ ...e, per: { ...e.per }, id: uid(), t: Date.now() });
  });
  toast(`Copied ${prev.length} item${prev.length === 1 ? '' : 's'} to ${m.toLowerCase()}`);
};
handlers['water'] = (el) => {
  const d = ui.date;
  const dir = Number(el.dataset.d);
  mutate(() => {
    const day = ensureDay(d);
    day.water = Math.max(0, Math.min(30, day.water + dir));
  });
};
handlers['del-workout'] = (el) => {
  const d = ui.date;
  const day = getDay(d);
  const idx = day.workouts.findIndex((w) => w.id === el.dataset.id);
  const w = day.workouts[idx];
  mutate(() => ensureDay(d).workouts.splice(idx, 1));
  toast('Removed ' + w.name, 'Undo', () => mutate(() => ensureDay(d).workouts.splice(idx, 0, w)));
};
forms['weight'] = () => {
  const el = $('#wt-in');
  const kg = parseFloat(String(el.value).replace(',', '.'));
  if (!(kg >= 30 && kg <= 250)) return toast('Enter your weight in kg, like 72.4');
  const d = dateNow();
  mutate(() => upsertWeight(d, Math.round(kg * 10) / 10));
  toast(`Logged ${fmt1(kg)} kg`);
};

handlers['theme'] = (el) => mutate((s) => (s.settings.theme = el.dataset.v));
handlers['eatback'] = (el) => mutate((s) => (s.settings.eatBack = Number(el.dataset.v)));
handlers['edit-profile'] = () => startSetup(true);
handlers['recalc'] = () => {
  const s = get();
  const lw = latestWeight();
  if (!lw) return toast('Log your weight first');
  mutate((st) => {
    st.profile.weightKg = lw.kg;
    st.targets = computeTargets(st.profile, st.settings.kcalAdjust);
  });
  toast(`Updated for ${fmt1(lw.kg)} kg. Target is ${fmt(get().targets.kcal)} kcal.`);
};
handlers['export'] = () => {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tally-backup-${ymd()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
handlers['import'] = () => $('#import-file').click();
handlers['reset'] = () => {
  if (!confirmReset) {
    confirmReset = true;
    render();
    setTimeout(() => {
      confirmReset = false;
      if (ui.tab === 'me') render();
    }, 5000);
    return;
  }
  confirmReset = false;
  resetAll();
  ui.tab = 'today';
  toast('All data erased');
};

const changes = {
  steps: (el) => {
    const v = Math.max(0, Math.min(200000, Math.round(Number(String(el.value).replace(/[^\d.]/g, '')) || 0)));
    const d = ui.date;
    mutate(() => (ensureDay(d).steps = v));
  },
  code: (el) => {
    const v = el.value.trim().slice(0, 80);
    mutate((s) => (s.settings.accessCode = v));
    toast(v ? 'Photo logging code saved' : 'Photo logging code cleared');
  },
  stepsgoal: (el) => {
    const v = Math.max(1000, Math.min(50000, Math.round(Number(el.value) || 8000)));
    mutate((s) => (s.settings.stepsGoal = v));
  },
  import: async (el) => {
    const f = el.files && el.files[0];
    if (!f) return;
    try {
      importJSON(await f.text());
      toast('Backup restored');
    } catch (e) {
      toast(e.message || 'Could not read that file');
    }
    el.value = '';
  }
};

/* ---------- global events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const h = handlers[el.dataset.act];
  if (h) h(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const h = inputs[el.dataset.input];
  if (h) h(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const h = changes[el.dataset.change];
  if (h) h(el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const h = forms[f.dataset.form];
  if (h) h(f, e);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = ymd();
  if (now !== lastToday) {
    if (ui.date === lastToday) ui.date = now;
    lastToday = now;
    render();
  }
});

/* ---------- boot ---------- */
render();
if (get().profile) {
  askPersist();
  if (new URLSearchParams(location.search).get('add')) openAdd(null, ymd());
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('pagehide', () => closeSheet());
if (didSaveFail()) toast('Storage is full or blocked, so changes may not be kept. Download a backup.');
