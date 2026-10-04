// First-run setup and "edit my details". Four short steps, then your plan.
import { ACTIVITY, PACES, computeTargets, paceWarning, bmi, ymd, addDays, parseYmd } from './calc.js';
import { get, mutate, upsertWeight, latestWeight } from './store.js';
import { esc, fmt, fmt1, handlers, inputs, ui, bus } from './util.js';

let su = null;

export const setupActive = () => !!su;

export function startSetup(editing) {
  const s = get();
  const p = s.profile;
  const lw = latestWeight();
  su = {
    step: 0,
    editing,
    error: '',
    adjust: editing ? s.settings.kcalAdjust : 0,
    draft: p
      ? { ...p, age: String(p.age), heightCm: String(p.heightCm), weightKg: String(lw ? lw.kg : p.weightKg), goalKg: String(p.goalKg) }
      : { name: '', sex: 'm', age: '', heightCm: '', weightKg: '', goalKg: '', activity: 'light', pace: 0.5, diet: 'veg' }
  };
  bus.render();
}

const n = (v) => {
  const x = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};

function numeric(d) {
  return { ...d, name: (d.name || '').trim(), age: n(d.age), heightCm: n(d.heightCm), weightKg: n(d.weightKg), goalKg: n(d.goalKg) };
}

function validate(step) {
  const d = numeric(su.draft);
  if (step === 0) {
    if (!(d.age >= 14 && d.age <= 90)) return 'Enter your age, between 14 and 90.';
    if (!(d.heightCm >= 120 && d.heightCm <= 220)) return 'Enter your height in centimetres, between 120 and 220.';
    if (!(d.weightKg >= 30 && d.weightKg <= 250)) return 'Enter your weight in kilograms, between 30 and 250.';
  }
  if (step === 1) {
    if (!(d.goalKg >= 30 && d.goalKg <= 250)) return 'Enter your goal weight in kilograms, between 30 and 250.';
  }
  return '';
}

const bar = (step) => `<div class="prog" aria-label="Step ${step + 1} of 4">${[0, 1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
const val = (v) => esc(v == null ? '' : v);
const errBox = () => (su.error ? `<p class="err" role="alert"><b>One thing.</b> ${esc(su.error)}</p>` : '');

function stepAbout() {
  const d = su.draft;
  return `${bar(0)}
    <h1 class="hero-t">${su.editing ? 'Your details' : 'Let us set this up around you'}</h1>
    <p class="lead">${su.editing ? 'Update anything and your daily targets will be recalculated.' : 'Four quick steps. Everything stays on your device, nothing is uploaded.'}</p>
    ${errBox()}
    <label class="field"><span class="label">What should I call you</span><input class="input" data-input="su" data-f="name" autocomplete="given-name" maxlength="30" placeholder="Your name" value="${val(d.name)}"></label>
    <div class="field"><span class="label" id="sx">Sex used for the calorie formula</span>
      <div class="seg fill" role="group" aria-labelledby="sx"><button type="button" data-act="su-set" data-f="sex" data-v="m" aria-pressed="${d.sex === 'm'}">Male</button><button type="button" data-act="su-set" data-f="sex" data-v="f" aria-pressed="${d.sex === 'f'}">Female</button></div></div>
    <div class="grid3">
      <label class="field"><span class="label">Age</span><input class="input mono" inputmode="numeric" autocomplete="off" data-input="su" data-f="age" value="${val(d.age)}"></label>
      <label class="field"><span class="label">Height</span><span class="unit" data-u="cm"><input class="input mono" inputmode="decimal" autocomplete="off" data-input="su" data-f="heightCm" value="${val(d.heightCm)}"></span></label>
      <label class="field"><span class="label">Weight</span><span class="unit" data-u="kg"><input class="input mono" inputmode="decimal" autocomplete="off" data-input="su" data-f="weightKg" value="${val(d.weightKg)}"></span></label>
    </div>
    <div class="nav-row">${su.editing ? `<button type="button" class="btn quiet" data-act="su-cancel">Cancel</button>` : ''}<button type="button" class="btn primary" data-act="su-next">Continue</button></div>`;
}

function stepGoal() {
  const d = numeric(su.draft);
  const loss = d.goalKg < d.weightKg - 0.4;
  const warn = paceWarning({ ...d, pace: d.pace });
  const low = d.goalKg > 0 && d.heightCm > 0 && bmi(d.goalKg, d.heightCm) < 18.5;
  const cards = PACES.map((p) => {
    const wk = loss ? Math.round((d.weightKg - d.goalKg) / p.v) : null;
    return `<button type="button" class="opt" data-act="su-set" data-f="pace" data-v="${p.v}" aria-pressed="${d.pace === p.v}"><b>${p.t}, ${p.v} kg a week</b><span>${p.d}${wk ? `. About ${wk} week${wk === 1 ? '' : 's'} to goal.` : ''}</span></button>`;
  }).join('');
  return `${bar(1)}
    <h1 class="hero-t">Where are you headed</h1>
    <p class="lead">Pick a goal weight and a pace you could really keep up. Slower is kinder and usually lasts longer.</p>
    ${errBox()}
    <label class="field"><span class="label">Goal weight</span><span class="unit" data-u="kg"><input class="input mono" inputmode="decimal" autocomplete="off" data-input="su" data-f="goalKg" value="${val(su.draft.goalKg)}"></span>
      <span class="hint">Same as your weight? Then your plan will be maintenance.</span></label>
    <div class="field"><span class="label">Pace</span>${cards}</div>
    ${warn ? `<p class="err">${esc(warn)}</p>` : ''}
    ${low ? `<p class="err"><b>A gentle check.</b> That goal puts your BMI under 18.5, which is below the healthy range. You can continue, but a slightly higher goal may suit you better.</p>` : ''}
    <div class="nav-row"><button type="button" class="btn quiet" data-act="su-back">Back</button><button type="button" class="btn primary" data-act="su-next">Continue</button></div>`;
}

function stepLife() {
  const d = su.draft;
  const acts = Object.entries(ACTIVITY).map(([k, a]) => `<button type="button" class="opt" data-act="su-set" data-f="activity" data-v="${k}" aria-pressed="${d.activity === k}"><b>${a.t}</b><span>${a.d}</span></button>`).join('');
  const diets = [['veg', 'Vegetarian'], ['egg', 'Eggetarian'], ['non', 'Non vegetarian']];
  return `${bar(2)}
    <h1 class="hero-t">A normal day for you</h1>
    <p class="lead">Be honest about how active a usual week is, not your best week. This sets how much you burn.</p>
    <div class="field"><span class="label">Activity</span>${acts}</div>
    <div class="field"><span class="label" id="dt">How you eat</span>
      <div class="seg" role="group" aria-labelledby="dt">${diets.map(([k, l]) => `<button type="button" data-act="su-set" data-f="diet" data-v="${k}" aria-pressed="${d.diet === k}">${l}</button>`).join('')}</div>
      <span class="hint">Used to tailor food suggestions. You can still search everything.</span></div>
    <div class="nav-row"><button type="button" class="btn quiet" data-act="su-back">Back</button><button type="button" class="btn primary" data-act="su-next">See my plan</button></div>`;
}

function stepPlan() {
  const d = numeric(su.draft);
  const T = computeTargets(d, su.adjust);
  const floor = d.sex === 'm' ? 1500 : 1200;
  const canDown = !(T.wantsLoss && T.kcal - 50 < floor);
  const goalDate = T.weeksToGoal ? parseYmd(addDays(ymd(), Math.round(T.weeksToGoal * 7))).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  const why = T.wantsLoss
    ? `At rest your body uses about ${fmt(T.bmr)} kcal a day, and about ${fmt(T.tdee)} once your activity is counted. Eating ${fmt(T.kcal)} leaves you roughly ${fmt(T.deficit)} below that, which works out to about ${fmt1(T.weeklyLoss)} kg a week. ${goalDate ? `At that pace you would reach ${fmt1(d.goalKg)} kg around ${goalDate}.` : ''} This is an estimate, and Tally will compare it with your real weight trend after a few weeks.`
    : `At rest your body uses about ${fmt(T.bmr)} kcal a day, and about ${fmt(T.tdee)} once your activity is counted. Eating around that keeps your weight steady.`;
  return `${bar(3)}
    <h1 class="hero-t">${su.editing ? 'Your plan' : `Here is your plan${d.name ? ', <span class="accent-i">' + esc(d.name) + '</span>' : ''}`}</h1>
    <dl class="plan">
      <div class="big"><dt>Daily calories</dt><dd>${fmt(T.kcal)}</dd></div>
      <div><dt>Protein</dt><dd>${fmt(T.protein)} g</dd></div>
      <div><dt>Carbs</dt><dd>${fmt(T.carbs)} g</dd></div>
      <div><dt>Fat</dt><dd>${fmt(T.fat)} g</dd></div>
      <div><dt>Water</dt><dd>${T.water} glasses</dd></div>
    </dl>
    <p class="why">${why}</p>
    ${T.floored ? `<p class="err"><b>Held at a safe minimum.</b> Your pace would have gone below ${fmt(floor)} kcal, so I stopped there. It will take a little longer, which is fine.</p>` : ''}
    <div class="line-ctl" style="margin-bottom:6px"><span class="label">Fine tune</span>
      <span class="stepper"><button type="button" class="ib" data-act="su-adj" data-d="-50" aria-label="50 fewer calories" ${canDown ? '' : 'disabled'}>-</button><span class="mono" style="min-width:90px;text-align:center">${su.adjust > 0 ? '+' : ''}${su.adjust} kcal</span><button type="button" class="ib" data-act="su-adj" data-d="50" aria-label="50 more calories">+</button></span></div>
    <p class="why">Protein is set at 1.8 g per kg of the average of your current and goal weight, to help protect muscle while you lose fat.</p>
    <div class="nav-row"><button type="button" class="btn quiet" data-act="su-back">Back</button><button type="button" class="btn primary" data-act="su-done">${su.editing ? 'Save changes' : 'Start tracking'}</button></div>`;
}

export function setupView() {
  const html = [stepAbout, stepGoal, stepLife, stepPlan][su.step]();
  return `<div class="setup">${html}</div>`;
}

inputs['su'] = (el) => {
  su.draft[el.dataset.f] = el.value;
  su.error = '';
};

handlers['su-set'] = (el) => {
  const f = el.dataset.f;
  su.draft[f] = f === 'pace' ? Number(el.dataset.v) : el.dataset.v;
  su.error = '';
  bus.render();
};
handlers['su-adj'] = (el) => {
  su.adjust += Number(el.dataset.d);
  bus.render();
};
handlers['su-back'] = () => {
  su.step = Math.max(0, su.step - 1);
  su.error = '';
  bus.render();
};
handlers['su-cancel'] = () => {
  su = null;
  ui.tab = 'me';
  bus.render();
};
handlers['su-next'] = () => {
  su.error = validate(su.step);
  if (!su.error) su.step++;
  bus.render();
  const v = document.getElementById('view');
  window.scrollTo(0, 0);
  v.focus({ preventScroll: true });
};
handlers['su-done'] = () => {
  const d = numeric(su.draft);
  const err = validate(0) || validate(1);
  if (err) {
    su.error = err;
    su.step = 0;
    return bus.render();
  }
  const T = computeTargets(d, su.adjust);
  const profile = { name: d.name, sex: d.sex, age: d.age, heightCm: d.heightCm, weightKg: d.weightKg, goalKg: d.goalKg, activity: d.activity, pace: d.pace, diet: d.diet };
  const adjust = su.adjust;
  mutate((s) => {
    s.profile = profile;
    s.targets = T;
    s.settings.kcalAdjust = adjust;
    upsertWeight(ymd(), d.weightKg);
  });
  su = null;
  ui.tab = 'today';
  window.scrollTo(0, 0);
  bus.render();
};
