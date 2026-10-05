// Bottom sheet flows: add food, edit entry, log workout, save a meal.
import { FOODS, CATS, matches, dietAllows } from './foods.js';
import { MEALS, WORKOUTS, exerciseKcal, entryTotals } from './calc.js';
import { get, getDay, mutate, ensureDay, uid, pushRecent, latestWeight } from './store.js';
import { searchOnline, lookupBarcode } from './off.js';
import { prepareImage, analyzePhoto, itemTotals, sumItems, toEntry, VisionError } from './vision.js';
import { esc, icon, fmt, fmt1, qtyText, handlers, inputs, forms, toast, $, $$ } from './util.js';

const dlg = document.getElementById('sheet');
let sh = null;
let lookup = new Map();
let stream = null;
let scanTimer = null;
let onlineToken = 0;
let photoToken = 0;

const guessMeal = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 18 ? 'Snacks' : 'Dinner';
};

/* ---------- open and close ---------- */
function show() {
  render();
  if (!dlg.open) dlg.showModal();
}
export function closeSheet() {
  photoToken++;
  stopCam();
  if (dlg.open) dlg.close();
  sh = null;
}
dlg.addEventListener('close', () => {
  photoToken++;
  stopCam();
  sh = null;
});
dlg.addEventListener('click', (e) => {
  if (e.target === dlg) closeSheet();
});

export function openAdd(meal, date) {
  sh = { mode: 'add', meal: meal || guessMeal(), date, tab: 'foods', q: '', cat: 'all', detail: null, flash: '', online: { q: '', status: 'idle', list: [], err: '' }, scan: { status: 'idle', msg: '' } };
  show();
}
export function openPhoto(file, date) {
  sh = { mode: 'photo', date, meal: guessMeal(), photo: { status: 'reading', thumb: '', b64: '', items: [], notes: '', err: '', code: '', hint: '' } };
  show();
  runPhoto(file);
}
export function openEdit(id, date) {
  const e = getDay(date).entries.find((x) => x.id === id);
  if (!e) return;
  sh = { mode: 'edit', date, id, n: e.n, meal: e.meal };
  show();
}
export function openWorkout(date) {
  const w = latestWeight(date) || { kg: get().profile.weightKg };
  sh = { mode: 'workout', date, type: WORKOUTS[0], mins: 30, kcal: exerciseKcal(WORKOUTS[0].met, w.kg, 30), kg: w.kg, dirty: false, name: '' };
  show();
}
export function openSaveMeal(meal, date) {
  sh = { mode: 'savemeal', meal, date };
  show();
}

/* ---------- rendering ---------- */
function head(title, back) {
  return `<div class="sh-head">${back ? `<button type="button" class="ib" data-act="sheet-back" aria-label="Back">${icon('caret-left')}</button>` : ''}<h2 id="sheet-title" style="flex:1">${esc(title)}</h2><button type="button" class="ib" data-act="sheet-close" aria-label="Close">${icon('x')}</button></div>`;
}

function render() {
  if (!sh) return;
  if (sh.mode === 'add') return sh.detail ? renderDetail() : renderAdd();
  if (sh.mode === 'photo') return renderPhoto();
  if (sh.mode === 'edit') return renderEdit();
  if (sh.mode === 'workout') return renderWorkout();
  if (sh.mode === 'savemeal') return renderSaveMeal();
}

const mealChips = (cur) =>
  `<div class="chips" role="group" aria-label="Meal">${MEALS.map((m) => `<button type="button" data-act="set-meal" data-m="${m}" aria-pressed="${m === cur}">${m}</button>`).join('')}</div>`;

/* ----- add: tabs ----- */
const TABS = [['foods', 'Foods'], ['online', 'Online'], ['scan', 'Scan'], ['meals', 'My meals'], ['quick', 'Quick add']];

function renderAdd() {
  dlg.innerHTML =
    head('Add food') +
    `<div class="sh-body">
      ${mealChips(sh.meal)}
      <div class="tabrow" role="tablist" aria-label="Where to find food">${TABS.map(([k, l]) => `<button type="button" role="tab" id="tab-${k}" data-act="add-tab" data-t="${k}" aria-selected="${sh.tab === k}">${l}</button>`).join('')}</div>
      ${sh.flash ? `<p class="err" role="status">${esc(sh.flash)}</p>` : ''}
      <div id="tabc" role="tabpanel" aria-labelledby="tab-${sh.tab}">${tabBody()}</div>
    </div>`;
  if (sh.tab !== 'scan') stopCam();
}

function tabBody() {
  if (sh.tab === 'foods') return foodsTab();
  if (sh.tab === 'online') return onlineTab();
  if (sh.tab === 'scan') return scanTab();
  if (sh.tab === 'meals') return mealsTab();
  return quickTab();
}

function foodRow(f) {
  lookup.set(f.id, f);
  const p = f.portions[0];
  const k = (f.per100.k * p.g) / 100;
  return `<button type="button" class="food" data-act="pick" data-id="${esc(f.id)}"><span style="flex:1;min-width:0"><b>${esc(f.name)}${f.src === 'my' ? '<i class="tag">Mine</i>' : ''}</b><span>${esc(p.l)}</span></span><span class="k">${fmt(k)} kcal</span></button>`;
}

function foodsTab() {
  return `<label class="sr" for="q">Search foods</label>
    <input id="q" class="input" type="search" enterkeyhint="search" placeholder="Search roti, dal, paneer, chai" autocomplete="off" data-input="q" value="${esc(sh.q)}">
    <div class="chips" id="cats" style="margin-top:12px">${CATS.map(([k, l]) => `<button type="button" data-act="cat" data-c="${k}" aria-pressed="${sh.cat === k}">${l}</button>`).join('')}</div>
    <div id="results">${foodResults()}</div>`;
}

function foodResults() {
  const s = get();
  const q = sh.q.trim();
  const mine = s.custom;
  if (q) {
    const list = [...mine, ...FOODS].filter((f) => matches(f, q)).slice(0, 60);
    if (!list.length) return `<p class="empty" style="padding-top:16px">Nothing matches "${esc(q)}". Try the Online tab for packaged food, or Quick add to enter numbers yourself.</p>`;
    return list.map(foodRow).join('');
  }
  const diet = s.profile ? s.profile.diet : 'non';
  let out = '';
  if (sh.cat === 'all' && s.recent.length) {
    out += `<p class="label group-t">Recent</p>` + s.recent.map(foodRow).join('');
    out += `<p class="label group-t">All foods</p>`;
  }
  const pool = [...(sh.cat === 'all' ? mine : []), ...FOODS.filter((f) => (sh.cat === 'all' || f.cat === sh.cat) && dietAllows(diet, f.diet))];
  out += pool.map(foodRow).join('');
  return out;
}

function onlineBody() {
  const o = sh.online;
  if (o.status === 'loading') return `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  if (o.status === 'error') return `<p class="err" role="alert"><b>Could not reach the food database.</b> ${esc(o.err)} Check your connection and try again.</p><button type="button" class="btn quiet sm" data-act="online-go">Try again</button>`;
  if (o.status === 'done') return o.list.length ? o.list.map(foodRow).join('') : `<p class="empty" style="padding-top:16px">No packaged foods found for "${esc(o.q)}". Try fewer words, or use Quick add with the numbers from the label.</p>`;
  return `<p class="empty" style="padding-top:16px">Search the Open Food Facts database for packaged and branded food. Needs an internet connection.</p>`;
}

function onlineTab() {
  const o = sh.online;
  const body = onlineBody();
  return `<form data-form="online" style="display:flex;gap:8px">
      <label class="sr" for="oq">Search packaged food</label>
      <input id="oq" class="input" type="search" enterkeyhint="search" placeholder="Brand or product" autocomplete="off" data-input="oq" value="${esc(o.q)}">
      <button class="btn dark" type="submit" style="min-height:52px" aria-label="Search">${icon('magnifying-glass')}</button>
    </form><div id="oresults">${body}</div>`;
}

function scanTab() {
  const sc = sh.scan;
  const supported = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  let cam = '';
  if (sc.status === 'active') cam = `<div class="cam"><video id="cam" playsinline muted></video><div class="frame"></div></div><button type="button" class="btn quiet block" data-act="scan-stop">Stop camera</button>`;
  else if (sc.status === 'loading') cam = `<div class="skel"></div><p class="hint">Looking up that barcode</p>`;
  else if (supported) cam = `<button type="button" class="btn primary block" data-act="scan-start">${icon('camera')} Scan a barcode</button>`;
  else cam = `<p class="hint">Camera scanning is not available in this browser. It works in Chrome on Android and desktop. You can still type the number printed under the barcode.</p>`;
  return `${cam}
    ${sc.msg ? `<p class="err" role="alert" style="margin-top:14px">${esc(sc.msg)}</p>` : ''}
    <form data-form="barcode" style="margin-top:18px">
      <label class="field"><span class="label">Or type the barcode number</span>
      <span style="display:flex;gap:8px"><input class="input mono" id="bc" inputmode="numeric" autocomplete="off" placeholder="8901058000290" data-input="bc"><button class="btn dark" type="submit">Find</button></span></label>
    </form>`;
}

function mealsTab() {
  const ms = get().meals;
  if (!ms.length) return `<p class="empty" style="padding-top:16px">Save a combination you eat often, like your usual breakfast, and add it in one tap. Use "Save as meal" under any meal on the Today screen.</p>`;
  return ms
    .map((m) => {
      const k = m.items.reduce((a, i) => a + i.per.k * i.n, 0);
      return `<div class="food" style="cursor:default"><span style="flex:1;min-width:0"><b>${esc(m.name)}</b><span>${m.items.length} item${m.items.length === 1 ? '' : 's'}, ${esc(m.items.map((i) => i.name).join(', ').slice(0, 70))}</span></span><span class="k">${fmt(k)} kcal</span><button type="button" class="btn sm primary" data-act="add-meal" data-id="${esc(m.id)}">Add</button><button type="button" class="ib sm" data-act="del-meal" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">${icon('trash')}</button></div>`;
    })
    .join('');
}

function quickTab() {
  const q = sh.quick || {};
  return `<form data-form="quick">
    <label class="field"><span class="label">Name (optional)</span><input class="input" id="qa-n" maxlength="60" placeholder="Restaurant biryani" value="${esc(q.name || '')}"></label>
    <label class="field"><span class="label">Calories</span><span class="unit" data-u="kcal"><input class="input mono" id="qa-k" inputmode="decimal" required placeholder="450" value="${esc(q.k || '')}"></span></label>
    <div class="grid3">
      <label class="field"><span class="label">Protein</span><span class="unit" data-u="g"><input class="input mono" id="qa-p" inputmode="decimal" placeholder="0"></span></label>
      <label class="field"><span class="label">Carbs</span><span class="unit" data-u="g"><input class="input mono" id="qa-c" inputmode="decimal" placeholder="0"></span></label>
      <label class="field"><span class="label">Fat</span><span class="unit" data-u="g"><input class="input mono" id="qa-f" inputmode="decimal" placeholder="0"></span></label>
    </div>
    <label class="toggle" style="border:0"><span>Save to my foods<small>Adds it to the Foods tab for next time</small></span><input type="checkbox" id="qa-s" style="width:22px;height:22px;accent-color:var(--acc)"></label>
    <div id="qa-err"></div>
    <button class="btn primary block" type="submit" style="margin-top:8px">Add to ${esc(sh.meal)}</button>
  </form>`;
}

/* ----- detail (choose portion and amount) ----- */
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

function perUnit(d) {
  const f = d.food;
  if (d.grams) return { unit: 'g', per: { k: f.per100.k / 100, p: f.per100.p / 100, c: f.per100.c / 100, f: f.per100.f / 100 } };
  const p = f.portions[d.pi];
  const x = p.g / 100;
  return { unit: p.l, per: { k: f.per100.k * x, p: f.per100.p * x, c: f.per100.c * x, f: f.per100.f * x } };
}

function liveHTML(per, n) {
  const t = entryTotals({ per, n });
  return `<div><b>${fmt(t.k)}</b><span>kcal</span></div><div><b>${fmt1(t.p)}</b><span>protein</span></div><div><b>${fmt1(t.c)}</b><span>carbs</span></div><div><b>${fmt1(t.f)}</b><span>fat</span></div>`;
}

function renderDetail() {
  const d = sh.detail;
  const f = d.food;
  const { per } = perUnit(d);
  const src = f.src === 'off' ? 'From Open Food Facts. Check it against the pack if it matters.' : f.src === 'in' ? 'Typical home-style values. Weigh your portion when you can.' : '';
  dlg.innerHTML =
    head(f.name, true) +
    `<div class="sh-body">
      ${mealChips(sh.meal)}
      <label class="field"><span class="label">Portion</span>
        <select class="select" id="portion" data-input="portion">${f.portions.map((p, i) => `<option value="${i}" ${!d.grams && d.pi === i ? 'selected' : ''}>${esc(p.l)}</option>`).join('')}<option value="g" ${d.grams ? 'selected' : ''}>Grams or ml (exact)</option></select></label>
      <div class="field"><span class="label" id="ql">${d.grams ? 'Amount in g or ml' : 'How many'}</span>
        <div class="stepper"><button type="button" class="ib" data-act="qty" data-d="-1" aria-label="Less">${icon('minus')}</button><input class="input" id="qty" inputmode="decimal" aria-labelledby="ql" data-input="qty" value="${d.qty}"><button type="button" class="ib" data-act="qty" data-d="1" aria-label="More">${icon('plus')}</button></div></div>
      <div class="live" id="live" aria-live="polite">${liveHTML(per, d.qty)}</div>
      ${src ? `<p class="hint" style="margin:-4px 0 16px">${esc(src)}</p>` : ''}
      <button type="button" class="btn primary block" data-act="add-entry">Add to ${esc(sh.meal)}</button>
    </div>`;
}

function refreshLive() {
  const d = sh.detail;
  const live = $('#live');
  if (!live) return;
  const { per } = perUnit(d);
  live.innerHTML = liveHTML(per, Number.isFinite(d.qty) ? d.qty : 0);
}


/* ----- photo ----- */
const GRAM_STEP = (g) => (g >= 300 ? 25 : 10);

function logLabel() {
  const n = sh.photo.items.length;
  return n ? `Log ${n === 1 ? 'this item' : `all ${n} items`} to ${sh.meal}` : 'Nothing to log';
}

function itemRow(it, i) {
  const t = itemTotals(it);
  return `<div class="pitem" data-i="${i}">
    <div class="pi-top"><input class="input pi-name" data-input="photo-name" data-i="${i}" maxlength="60" aria-label="Food name" value="${esc(it.name)}"><button type="button" class="ib sm" data-act="photo-rm" data-i="${i}" aria-label="Remove ${esc(it.name)}">${icon('x')}</button></div>
    <div class="pi-mid"><span class="stepper"><button type="button" class="ib" data-act="photo-g" data-i="${i}" data-d="-1" aria-label="Less ${esc(it.name)}">${icon('minus')}</button><span class="unit" data-u="g"><input class="input mono" inputmode="numeric" data-input="photo-grams" data-i="${i}" aria-label="Grams of ${esc(it.name)}" value="${it.grams}"></span><button type="button" class="ib" data-act="photo-g" data-i="${i}" data-d="1" aria-label="More ${esc(it.name)}">${icon('plus')}</button></span><span class="pi-k"><b>${fmt(t.k)}</b> kcal</span></div>
    <p class="pi-m">${it.portion ? esc(it.portion) + '. ' : ''}Protein ${fmt1(t.p)} g, carbs ${fmt1(t.c)} g, fat ${fmt1(t.f)} g</p>
    ${it.conf === 'low' ? `<p class="pi-low">I am less sure about this one. Check the grams.</p>` : ''}
  </div>`;
}

function photoActions(extra) {
  return `<div class="pa">${extra || ''}<button type="button" class="btn quiet" data-act="photo-retake">${icon('camera')} Retake photo</button><button type="button" class="btn quiet" data-act="photo-gallery">Choose from gallery</button><button type="button" class="btn quiet" data-act="photo-manual">Search foods instead</button></div>`;
}

const PHOTO_ERR = {
  offline: ['No connection.', 'Photo logging needs the internet to read your photo. You can still add food by searching.'],
  timeout: ['That took too long.', 'Try once more, or add the food by searching.'],
  setup: ['Setup needed.', ''],
  code: ['Photo logging code needed.', 'Add the code in the Me tab, under Photo logging.'],
  nofood: ['That does not look like food.', 'Take the photo again with the plate in view.'],
  empty: ['I could not pick out any food.', 'Try a closer photo in good light, or add the food by searching.']
};

function renderPhoto() {
  const ph = sh.photo;
  let body = '';
  if (ph.status === 'reading' || ph.status === 'analyzing') {
    body = `${ph.thumb ? `<div class="shot"><img src="${ph.thumb}" alt="Your meal"></div>` : `<div class="skel" style="height:180px"></div>`}
      <p class="hint" role="status" style="margin:14px 0">${ph.status === 'reading' ? 'Getting your photo ready' : 'Looking at your plate. A few seconds.'}</p>
      <div class="skel"></div><div class="skel"></div>`;
  } else if (ph.status === 'error') {
    const m = PHOTO_ERR[ph.code];
    const title = m ? m[0] : 'Could not read that photo.';
    const text = m && m[1] ? m[1] : ph.err || 'Try again, or add the food by searching.';
    body = `${ph.thumb ? `<div class="shot"><img src="${ph.thumb}" alt="Your meal"></div>` : ''}
      <p class="err" role="alert" style="margin-top:14px"><b>${esc(title)}</b> ${esc(text)}</p>
      ${ph.detail ? `<p class="hint" style="word-break:break-word">Technical detail: ${esc(ph.detail)}</p>` : ''}
      ${photoActions(ph.b64 && ph.code !== 'nofood' ? `<button type="button" class="btn primary" data-act="photo-retry">Try again</button>` : '')}`;
  } else {
    const items = ph.items;
    body = `<div class="shot"><img src="${ph.thumb}" alt="Your meal"></div>
      ${mealChips(sh.meal)}
      <p class="muted" style="margin:0 0 6px">${items.length ? 'Here is what I can see. Fix any name or amount before you log it.' : 'Everything was removed.'}</p>
      <div id="pitems">${items.map(itemRow).join('')}</div>
      ${ph.notes ? `<p class="hint" style="margin:10px 0 0">${esc(ph.notes)}</p>` : ''}
      <div class="pfoot"><div class="live" id="plive" aria-live="polite">${liveHTML(sumItems(items), 1)}</div>
      <button type="button" class="btn primary block" data-act="photo-log" ${items.length ? '' : 'disabled'}>${esc(logLabel())}</button></div>
      <form data-form="photo-hint" class="field" style="margin-top:22px"><label class="label" for="ph-hint">Something off? Add a note and check again</label>
        <span style="display:flex;gap:8px"><input class="input" id="ph-hint" data-input="photo-hint" maxlength="300" placeholder="Restaurant, extra ghee, 2 rotis" value="${esc(ph.hint)}"><button class="btn dark" type="submit">Check</button></span></form>
      ${photoActions()}
      <p class="hint" style="margin-top:14px">Photo estimates are a good guess, not a measurement. Weighing at home makes them sharper.</p>`;
  }
  dlg.innerHTML = head('Your meal') + `<div class="sh-body">${body}</div>`;
}

function refreshPhoto() {
  const ph = sh.photo;
  const btn = $('[data-act="photo-log"]');
  if (btn) {
    btn.textContent = logLabel();
    btn.disabled = !ph.items.length;
  }
  const live = $('#plive');
  if (live) live.innerHTML = liveHTML(sumItems(ph.items), 1);
}

function refreshItem(i) {
  const it = sh.photo.items[i];
  const row = $(`.pitem[data-i="${i}"]`);
  if (!row || !it) return;
  const t = itemTotals(it);
  row.querySelector('.pi-k b').textContent = fmt(t.k);
  row.querySelector('.pi-m').textContent = `${it.portion ? it.portion + '. ' : ''}Protein ${fmt1(t.p)} g, carbs ${fmt1(t.c)} g, fat ${fmt1(t.f)} g`;
  refreshPhoto();
}

async function runPhoto(file) {
  const token = ++photoToken;
  const ph = sh.photo;
  const live = () => sh && sh.mode === 'photo' && token === photoToken;
  try {
    if (file) {
      const img = await prepareImage(file);
      if (!live()) return;
      ph.b64 = img.base64;
      ph.thumb = img.thumb;
    }
    ph.status = 'analyzing';
    render();
    const r = await analyzePhoto({ base64: ph.b64, hint: ph.hint, meal: sh.meal, code: get().settings.accessCode });
    if (!live()) return;
    if (!r.food) return failPhoto('nofood');
    if (!r.items.length) return failPhoto('empty');
    ph.items = r.items;
    ph.notes = r.notes;
    ph.status = 'review';
    render();
  } catch (e) {
    if (!live()) return;
    if (e instanceof VisionError) return failPhoto(e.code, e.message, e.detail);
    failPhoto('server', e && e.message);
  }
}

function failPhoto(code, msg, detail) {
  const ph = sh.photo;
  ph.status = 'error';
  ph.code = code;
  ph.err = msg || '';
  ph.detail = detail || '';
  render();
}

function pickImage(capture) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  if (capture) inp.setAttribute('capture', 'environment');
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (!f || !sh || sh.mode !== 'photo') return;
    sh.photo = { status: 'reading', thumb: '', b64: '', items: [], notes: '', err: '', code: '', hint: '' };
    render();
    runPhoto(f);
  });
  inp.click();
}

handlers['photo-retake'] = () => pickImage(true);
handlers['photo-gallery'] = () => pickImage(false);
handlers['photo-retry'] = () => {
  sh.photo.status = 'analyzing';
  render();
  runPhoto(null);
};
handlers['photo-manual'] = () => openAdd(sh.meal, sh.date);
handlers['photo-rm'] = (el) => {
  const i = Number(el.dataset.i);
  sh.photo.items.splice(i, 1);
  render();
};
handlers['photo-g'] = (el) => {
  const i = Number(el.dataset.i);
  const it = sh.photo.items[i];
  if (!it) return;
  const step = GRAM_STEP(it.grams);
  it.grams = Math.min(2000, Math.max(5, it.grams + Number(el.dataset.d) * step));
  it.portion = '';
  const inp = $(`.pitem[data-i="${i}"] [data-input="photo-grams"]`);
  if (inp) inp.value = it.grams;
  refreshItem(i);
};
inputs['photo-grams'] = (el) => {
  const i = Number(el.dataset.i);
  const it = sh.photo.items[i];
  const v = Math.round(num(el.value));
  if (!it || !Number.isFinite(v)) return;
  if (it.grams !== Math.min(2000, Math.max(5, v))) it.portion = '';
  it.grams = Math.min(2000, Math.max(5, v));
  refreshItem(i);
};
inputs['photo-name'] = (el) => {
  const it = sh.photo.items[Number(el.dataset.i)];
  if (it) it.name = el.value.slice(0, 60);
};
inputs['photo-hint'] = (el) => {
  sh.photo.hint = el.value;
};
forms['photo-hint'] = () => {
  sh.photo.status = 'analyzing';
  render();
  runPhoto(null);
};
handlers['photo-log'] = () => {
  const ph = sh.photo;
  const items = ph.items.filter((i) => i.grams > 0);
  if (!items.length) return;
  const { date, meal } = sh;
  const ids = items.map(() => uid());
  mutate(() => {
    const day = ensureDay(date);
    items.forEach((it, n) => day.entries.push(toEntry({ ...it, name: it.name.trim() || 'Food' }, meal, ids[n])));
  });
  const t = sumItems(items);
  closeSheet();
  toast(`Logged ${items.length} item${items.length === 1 ? '' : 's'} to ${meal}, ${fmt(t.k)} kcal`, 'Undo', () =>
    mutate(() => {
      const day = ensureDay(date);
      day.entries = day.entries.filter((e) => !ids.includes(e.id));
    })
  );
};

/* ----- edit ----- */
function renderEdit() {
  const e = getDay(sh.date).entries.find((x) => x.id === sh.id);
  if (!e) return closeSheet();
  dlg.innerHTML =
    head(e.name) +
    `<div class="sh-body">
      <p class="muted" style="margin-bottom:14px">Currently ${esc(qtyText(e.n, e.unit))}. Change how much you had, or move it to another meal.</p>
      ${mealChips(sh.meal)}
      <div class="field"><span class="label" id="ql">${e.unit === 'g' ? 'Amount in g or ml' : 'How many'}</span>
        <div class="stepper"><button type="button" class="ib" data-act="qty" data-d="-1" aria-label="Less">${icon('minus')}</button><input class="input" id="qty" inputmode="decimal" aria-labelledby="ql" data-input="qty" value="${sh.n}"><button type="button" class="ib" data-act="qty" data-d="1" aria-label="More">${icon('plus')}</button></div></div>
      <div class="live" id="live" aria-live="polite">${liveHTML(e.per, sh.n)}</div>
      <button type="button" class="btn primary block" data-act="save-edit">Save changes</button>
      <p style="text-align:center;margin-top:8px"><button type="button" class="link danger" data-act="del-entry">Remove from today</button></p>
    </div>`;
}

/* ----- workout ----- */
function renderWorkout() {
  const w = sh;
  dlg.innerHTML =
    head('Log a workout') +
    `<div class="sh-body">
      <div class="chips" role="group" aria-label="Type">${WORKOUTS.map((t) => `<button type="button" data-act="wk-type" data-n="${t.n}" aria-pressed="${!w.name && w.type.n === t.n}">${t.n}</button>`).join('')}</div>
      <form data-form="workout">
        <label class="field"><span class="label">Or name it yourself</span><input class="input" id="wk-name" maxlength="40" placeholder="Badminton" data-input="wk-name" value="${esc(w.name)}"></label>
        <div class="grid2">
          <label class="field"><span class="label">Minutes</span><span class="unit" data-u="min"><input class="input mono" id="wk-min" inputmode="numeric" data-input="wk-min" value="${w.mins}"></span></label>
          <label class="field"><span class="label">Calories burned</span><span class="unit" data-u="kcal"><input class="input mono" id="wk-k" inputmode="numeric" data-input="wk-k" value="${w.kcal}"></span></label>
        </div>
        <p class="hint" style="margin:-6px 0 18px">An estimate from your weight and the activity. Your watch or machine may know better, so edit it freely.</p>
        <div id="wk-err"></div>
        <button class="btn primary block" type="submit">Save workout</button>
      </form>
    </div>`;
}

/* ----- save meal ----- */
function renderSaveMeal() {
  const es = getDay(sh.date).entries.filter((e) => e.meal === sh.meal);
  dlg.innerHTML =
    head('Save as meal') +
    `<div class="sh-body">
      <p class="muted" style="margin-bottom:16px">${es.length} item${es.length === 1 ? '' : 's'} from ${esc(sh.meal.toLowerCase())} will be saved so you can add them together next time.</p>
      <form data-form="savemeal">
        <label class="field"><span class="label">Name</span><input class="input" id="sm-n" maxlength="50" placeholder="Usual ${esc(sh.meal.toLowerCase())}" value="Usual ${esc(sh.meal.toLowerCase())}"></label>
        <button class="btn primary block" type="submit">Save meal</button>
      </form>
    </div>`;
  setTimeout(() => $('#sm-n') && $('#sm-n').select(), 50);
}

/* ---------- camera ---------- */
function stopCam() {
  clearInterval(scanTimer);
  scanTimer = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

async function startCam() {
  sh.scan = { status: 'active', msg: '' };
  render();
  const video = $('#cam');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = stream;
    await video.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    scanTimer = setInterval(async () => {
      try {
        const r = await det.detect(video);
        if (r && r[0]) {
          stopCam();
          handleCode(r[0].rawValue);
        }
      } catch (_) {}
    }, 300);
  } catch (e) {
    stopCam();
    sh.scan = { status: 'idle', msg: e && e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow it in your browser settings, or type the number instead.' : 'Could not start the camera. You can type the number instead.' };
    render();
  }
}

async function handleCode(code) {
  sh.scan = { status: 'loading', msg: '' };
  render();
  try {
    const food = await lookupBarcode(code);
    if (!sh) return;
    if (!food) {
      sh.scan = { status: 'idle', msg: 'That barcode is not in the database yet. Use Quick add with the numbers from the pack.' };
      return render();
    }
    sh.scan = { status: 'idle', msg: '' };
    lookup.set(food.id, food);
    chooseFood(food);
  } catch (e) {
    if (!sh) return;
    sh.scan = { status: 'idle', msg: e && e.message && e.message.startsWith('A barcode') ? e.message : 'Could not look that up. Check your connection and try again.' };
    render();
  }
}

/* ---------- actions ---------- */
function chooseFood(food) {
  sh.detail = { food, pi: 0, grams: false, qty: 1 };
  sh.flash = '';
  render();
  const sel = $('#portion');
  if (sel) sel.focus({ preventScroll: true });
}

handlers['sheet-close'] = closeSheet;
handlers['sheet-back'] = () => {
  if (sh && sh.detail) {
    sh.detail = null;
    render();
  } else closeSheet();
};
handlers['set-meal'] = (el) => {
  sh.meal = el.dataset.m;
  $$('[data-act="set-meal"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === sh.meal)));
  const add = $('[data-act="add-entry"]');
  if (add) add.textContent = 'Add to ' + sh.meal;
  const f = $('form[data-form="quick"] button[type="submit"]');
  if (f) f.textContent = 'Add to ' + sh.meal;
  if (sh.mode === 'photo') refreshPhoto();
};
handlers['add-tab'] = (el) => {
  sh.tab = el.dataset.t;
  sh.flash = '';
  render();
};
handlers['cat'] = (el) => {
  sh.cat = el.dataset.c;
  $$('#cats button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === sh.cat)));
  $('#results').innerHTML = foodResults();
};
handlers['pick'] = (el) => {
  const f = lookup.get(el.dataset.id);
  if (f) chooseFood(f);
};
inputs['q'] = (el) => {
  sh.q = el.value;
  $('#results').innerHTML = foodResults();
};
inputs['oq'] = (el) => {
  sh.online.q = el.value;
};
inputs['portion'] = (el) => {
  const d = sh.detail;
  if (el.value === 'g') {
    const g = d.food.portions[d.pi].g;
    d.grams = true;
    d.qty = Math.round(g * (Number.isFinite(d.qty) ? d.qty : 1));
  } else {
    d.grams = false;
    d.pi = Number(el.value);
    d.qty = 1;
  }
  renderDetail();
  $('#portion').focus({ preventScroll: true });
};
inputs['qty'] = (el) => {
  const v = num(el.value);
  if (sh.mode === 'edit') sh.n = Number.isFinite(v) && v > 0 ? v : 0;
  else if (sh.detail) sh.detail.qty = Number.isFinite(v) && v > 0 ? v : 0;
  if (sh.mode === 'edit') {
    const e = getDay(sh.date).entries.find((x) => x.id === sh.id);
    $('#live').innerHTML = liveHTML(e.per, sh.n);
  } else refreshLive();
};
handlers['qty'] = (el) => {
  const dir = Number(el.dataset.d);
  let cur, step, min;
  if (sh.mode === 'edit') {
    const e = getDay(sh.date).entries.find((x) => x.id === sh.id);
    cur = sh.n;
    step = e.unit === 'g' ? 10 : 0.5;
    min = e.unit === 'g' ? 5 : 0.5;
  } else {
    cur = sh.detail.qty;
    step = sh.detail.grams ? 10 : 0.5;
    min = sh.detail.grams ? 5 : 0.5;
  }
  const next = Math.max(min, Math.round(((Number.isFinite(cur) ? cur : 0) + dir * step) * 100) / 100);
  if (sh.mode === 'edit') sh.n = next;
  else sh.detail.qty = next;
  $('#qty').value = next;
  inputs['qty']($('#qty'));
};

handlers['add-entry'] = () => {
  const d = sh.detail;
  if (!(d.qty > 0)) return toast('Enter an amount first');
  const { unit, per } = perUnit(d);
  const date = sh.date;
  const meal = sh.meal;
  const label = `${qtyText(d.qty, unit)} ${d.food.name}`;
  mutate((s) => {
    ensureDay(date).entries.push({ id: uid(), meal, name: d.food.name, unit, per, n: d.qty, src: d.food.src, t: Date.now() });
    pushRecent(d.food);
  });
  const kcal = fmt(per.k * d.qty);
  sh.detail = null;
  sh.flash = `Added to ${meal}: ${label}, ${kcal} kcal.`;
  sh.q = '';
  render();
  const q = $('#q');
  if (q) q.focus({ preventScroll: true });
};

handlers['save-edit'] = () => {
  if (!(sh.n > 0)) return toast('Enter an amount first');
  const { id, date, n, meal } = sh;
  mutate((s) => {
    const e = ensureDay(date).entries.find((x) => x.id === id);
    if (e) {
      e.n = n;
      e.meal = meal;
    }
  });
  closeSheet();
};

handlers['del-entry'] = () => {
  const { id, date } = sh;
  const day = getDay(date);
  const idx = day.entries.findIndex((x) => x.id === id);
  const removed = day.entries[idx];
  mutate((s) => {
    s.days[date].entries.splice(idx, 1);
  });
  closeSheet();
  toast('Removed ' + removed.name, 'Undo', () => mutate((s) => ensureDay(date).entries.splice(Math.min(idx, ensureDay(date).entries.length), 0, removed)));
};

/* online search */
async function runOnline() {
  const o = sh.online;
  const q = o.q.trim();
  if (q.length < 2) return;
  const token = ++onlineToken;
  o.status = 'loading';
  $('#oresults').innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  try {
    const list = await searchOnline(q);
    if (!sh || token !== onlineToken) return;
    o.list = list;
    o.status = 'done';
  } catch (e) {
    if (!sh || token !== onlineToken) return;
    o.status = 'error';
    o.err = e && e.name === 'AbortError' ? 'The request timed out.' : '';
  }
  const box = $('#oresults');
  if (box) box.innerHTML = onlineBody();
}
forms['online'] = runOnline;
handlers['online-go'] = runOnline;

/* scan */
handlers['scan-start'] = startCam;
handlers['scan-stop'] = () => {
  stopCam();
  sh.scan = { status: 'idle', msg: '' };
  render();
};
forms['barcode'] = () => {
  const v = $('#bc').value;
  handleCode(v);
};

/* saved meals */
handlers['add-meal'] = (el) => {
  const m = get().meals.find((x) => x.id === el.dataset.id);
  if (!m) return;
  const { date, meal } = sh;
  mutate((s) => {
    const day = ensureDay(date);
    for (const i of m.items) day.entries.push({ id: uid(), meal, name: i.name, unit: i.unit, per: { ...i.per }, n: i.n, src: 'meal', t: Date.now() });
  });
  const k = m.items.reduce((a, i) => a + i.per.k * i.n, 0);
  sh.flash = `Added "${m.name}" to ${meal}, ${fmt(k)} kcal.`;
  render();
};
handlers['del-meal'] = (el) => {
  mutate((s) => {
    s.meals = s.meals.filter((x) => x.id !== el.dataset.id);
  });
  render();
};
forms['savemeal'] = () => {
  const name = $('#sm-n').value.trim() || 'My meal';
  const { date, meal } = sh;
  const es = getDay(date).entries.filter((e) => e.meal === meal);
  if (!es.length) return closeSheet();
  mutate((s) => {
    s.meals.push({ id: uid(), name, items: es.map((e) => ({ name: e.name, unit: e.unit, per: { ...e.per }, n: e.n })) });
  });
  closeSheet();
  toast(`Saved "${name}". Find it under My meals when adding food.`);
};

/* quick add */
forms['quick'] = () => {
  const name = $('#qa-n').value.trim() || 'Quick add';
  const k = num($('#qa-k').value);
  const p = num($('#qa-p').value) || 0;
  const c = num($('#qa-c').value) || 0;
  const f = num($('#qa-f').value) || 0;
  const err = $('#qa-err');
  if (!Number.isFinite(k) || k < 0 || k > 6000) {
    err.innerHTML = `<p class="err" role="alert"><b>Enter the calories.</b> A number between 0 and 6000.</p>`;
    $('#qa-k').focus();
    return;
  }
  const date = sh.date;
  const meal = sh.meal;
  const save = $('#qa-s').checked;
  mutate((s) => {
    ensureDay(date).entries.push({ id: uid(), meal, name, unit: 'quick', per: { k, p, c, f }, n: 1, src: 'quick', t: Date.now() });
    if (save)
      s.custom.unshift({ id: 'my:' + uid(), src: 'my', name, cat: 'snack', diet: 'v', per100: { k, p, c, f }, portions: [{ l: '1 serving', g: 100 }], alias: '' });
  });
  sh.quick = null;
  sh.tab = 'foods';
  sh.flash = `Added to ${meal}: ${name}, ${fmt(k)} kcal.${save ? ' Saved to your foods.' : ''}`;
  render();
};

/* workout */
function recalcKcal() {
  const w = sh;
  const met = w.name ? 5 : w.type.met;
  if (!w.dirty) {
    w.kcal = exerciseKcal(met, w.kg, Number(w.mins) || 0);
    const k = $('#wk-k');
    if (k) k.value = w.kcal;
  }
}
handlers['wk-type'] = (el) => {
  sh.type = WORKOUTS.find((t) => t.n === el.dataset.n);
  sh.name = '';
  sh.dirty = false;
  $$('[data-act="wk-type"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === sh.type.n)));
  const n = $('#wk-name');
  if (n) n.value = '';
  recalcKcal();
};
inputs['wk-name'] = (el) => {
  sh.name = el.value;
  if (sh.name) $$('[data-act="wk-type"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  recalcKcal();
};
inputs['wk-min'] = (el) => {
  sh.mins = el.value;
  recalcKcal();
};
inputs['wk-k'] = (el) => {
  sh.dirty = true;
  sh.kcal = el.value;
};
forms['workout'] = () => {
  const mins = Math.round(num($('#wk-min').value));
  const kcal = Math.round(num($('#wk-k').value));
  const err = $('#wk-err');
  if (!(mins > 0 && mins <= 600) || !(kcal >= 0 && kcal <= 5000)) {
    err.innerHTML = `<p class="err" role="alert"><b>Check the numbers.</b> Minutes up to 600 and calories up to 5000.</p>`;
    return;
  }
  const name = sh.name.trim() || sh.type.n;
  const date = sh.date;
  mutate(() => {
    ensureDay(date).workouts.push({ id: uid(), name, min: mins, kcal });
  });
  closeSheet();
};
