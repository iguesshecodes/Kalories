import assert from 'node:assert/strict';
import { computeTargets, bmr, ymd, addDays, daysBetween, smoothWeights, streak, impliedMaintenance, linreg, sum, paceWarning, bmi } from '../js/calc.js';
import { FOODS, matches, dietAllows } from '../js/foods.js';
import { toFood } from '../js/off.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// Mifflin St Jeor reference: 30y male 80kg 180cm = 10*80 + 6.25*180 - 150 + 5 = 1780
t('bmr male', () => assert.equal(bmr({ sex: 'm', weightKg: 80, heightCm: 180, age: 30 }), 1780));
// female 60kg 165cm 25y = 600 + 1031.25 - 125 - 161 = 1345.25
t('bmr female', () => assert.equal(Math.round(bmr({ sex: 'f', weightKg: 60, heightCm: 165, age: 25 }) * 100) / 100, 1345.25));

t('targets steady loss', () => {
  const p = { sex: 'm', age: 30, heightCm: 180, weightKg: 80, goalKg: 74, activity: 'light', pace: 0.5 };
  const T = computeTargets(p);
  assert.equal(T.tdee, Math.round(1780 * 1.375));        // 2448
  assert.equal(T.deficit, Math.round(2447.5 - T.kcal));
  assert.ok(Math.abs(T.kcal - (2447.5 - 550)) <= 10);     // 0.5 kg/week = 550 kcal/day
  assert.equal(T.protein, Math.round(1.8 * 77));          // 139
  const back = T.protein * 4 + T.carbs * 4 + T.fat * 9;
  assert.ok(Math.abs(back - T.kcal) <= 12, 'macros add up to calories, got ' + back + ' vs ' + T.kcal);
  assert.ok(Math.abs(T.weeklyLoss - 0.5) < 0.03);
  assert.ok(Math.abs(T.weeksToGoal - 12) < 1);
});

t('calorie floor', () => {
  const p = { sex: 'f', age: 30, heightCm: 150, weightKg: 48, goalKg: 42, activity: 'sedentary', pace: 0.75 };
  const T = computeTargets(p);
  assert.ok(T.floored);
  assert.equal(T.kcal, 1200);
});

t('minor stays at maintenance', () => {
  const p = { sex: 'm', age: 17, heightCm: 175, weightKg: 80, goalKg: 70, activity: 'light', pace: 0.5 };
  const T = computeTargets(p);
  assert.equal(T.wantsLoss, false);
  assert.equal(T.deficit, 0);
  assert.ok(paceWarning(p).includes('adults'));
});

t('goal above weight means maintain', () => {
  const T = computeTargets({ sex: 'm', age: 25, heightCm: 175, weightKg: 70, goalKg: 72, activity: 'moderate', pace: 0.5 });
  assert.equal(T.wantsLoss, false);
  assert.equal(T.weeksToGoal, null);
});

t('bmi', () => assert.equal(Math.round(bmi(70, 175) * 10) / 10, 22.9));

t('dates are local and DST safe', () => {
  assert.equal(addDays('2026-10-05', 1), '2026-10-06');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(daysBetween('2026-10-01', '2026-10-05'), 4);
  assert.equal(ymd(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
  assert.equal(ymd(new Date(2026, 9, 5, 0, 1)), '2026-10-05');
});

t('weight smoothing', () => {
  const s = smoothWeights([{ d: '2026-10-01', kg: 80 }, { d: '2026-10-03', kg: 79 }, { d: '2026-10-10', kg: 78 }]);
  assert.equal(s[0].avg, 80);
  assert.equal(s[1].avg, 79.5);
  assert.equal(s[2].avg, 78); // only the 10th is inside its own 7 day window
});

t('streak', () => {
  const e = [{ per: { k: 1, p: 0, c: 0, f: 0 }, n: 1 }];
  const days = { '2026-10-03': { entries: e }, '2026-10-04': { entries: e }, '2026-10-05': { entries: e }, '2026-09-30': { entries: e } };
  assert.deepEqual(streak(days, '2026-10-05'), { current: 3, best: 3 });
  // today not logged yet keeps yesterday's streak alive
  delete days['2026-10-05'];
  assert.equal(streak(days, '2026-10-05').current, 2);
  assert.equal(streak(days, '2026-10-07').current, 0);
});

t('linreg', () => {
  const r = linreg([{ x: 0, y: 10 }, { x: 1, y: 9 }, { x: 2, y: 8 }]);
  assert.ok(Math.abs(r.slope + 1) < 1e-9);
});

t('implied maintenance', () => {
  // Eat 2000 kcal a day for 28 days while losing 0.5 kg a week => maintenance about 2550
  const state = { weights: [], days: {} };
  const today = '2026-10-28';
  for (let i = 0; i < 28; i++) {
    const d = addDays('2026-10-01', i);
    state.days[d] = { entries: [{ per: { k: 2000, p: 0, c: 0, f: 0 }, n: 1 }] };
    if (i % 3 === 0) state.weights.push({ d, kg: 80 - (0.5 / 7) * i });
  }
  const r = impliedMaintenance(state, today);
  assert.ok(r, 'result exists');
  assert.ok(Math.abs(r.maintenance - 2550) < 40, 'got ' + r.maintenance);
  assert.equal(impliedMaintenance({ weights: [{ d: '2026-10-27', kg: 80 }], days: {} }, today), null);
});

t('sum of entries', () => {
  const s = sum([{ per: { k: 100, p: 5, c: 10, f: 2 }, n: 2.5 }]);
  assert.deepEqual([s.k, s.p, s.c, s.f], [250, 12.5, 25, 5]);
});

t('food database sanity', () => {
  assert.ok(FOODS.length >= 150, 'has ' + FOODS.length + ' foods');
  const ids = new Set();
  for (const f of FOODS) {
    assert.ok(!ids.has(f.id), 'duplicate id ' + f.id);
    ids.add(f.id);
    assert.ok(f.portions.length >= 1, f.name + ' needs a portion');
    // calories should roughly agree with macros (alcohol, fibre and rounding allow slack)
    const calc = f.per100.p * 4 + f.per100.c * 4 + f.per100.f * 9;
    if (f.per100.k > 30 && !/whisky|beer/i.test(f.name)) {
      const diff = Math.abs(calc - f.per100.k) / f.per100.k;
      assert.ok(diff < 0.28, `${f.name}: ${f.per100.k} kcal vs ${Math.round(calc)} from macros`);
    }
  }
  const roti = FOODS.find((f) => f.name.startsWith('Roti'));
  assert.equal(Math.round((roti.per100.k * 40) / 100), 116);
});

t('search and diet filter', () => {
  const dal = FOODS.filter((f) => matches(f, 'dal'));
  assert.ok(dal.length >= 6);
  assert.ok(FOODS.filter((f) => matches(f, 'anda')).length >= 3);
  assert.equal(dietAllows('veg', 'e'), false);
  assert.equal(dietAllows('egg', 'e'), true);
  assert.equal(dietAllows('egg', 'n'), false);
  assert.equal(dietAllows('non', 'n'), true);
});

t('open food facts mapping', () => {
  const f = toFood({ code: '8901058000290', product_name: 'Masala Noodles', brands: 'Maggi,Nestle', serving_quantity: '70', serving_size: '70 g', nutriments: { 'energy-kcal_100g': 427, proteins_100g: '9.1', carbohydrates_100g: 60, fat_100g: 16 } });
  assert.equal(f.name, 'Masala Noodles (Maggi)');
  assert.equal(f.per100.k, 427);
  assert.equal(f.portions[0].g, 70);
  const kj = toFood({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4 } });
  assert.ok(Math.abs(kj.per100.k - 100) < 0.01);
  assert.equal(toFood({ code: '2', product_name: '', nutriments: { 'energy-kcal_100g': 10 } }), null);
  assert.equal(toFood({ code: '3', product_name: 'No energy', nutriments: {} }), null);
});

console.log(`\n${n} test groups passed`);
