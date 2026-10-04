// Trends: weight trend, calorie history, streak and the real-maintenance insight.
import { smoothWeights, linreg, daysBetween, addDays, parseYmd, ymd, sum, streak, impliedMaintenance, computeTargets } from './calc.js';
import { get, mutate } from './store.js';
import { esc, fmt, fmt1, handlers, ui, toast, bus } from './util.js';

const short = (d) => parseYmd(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function weightChart(ws, goal, range, today) {
  let pts = ws;
  if (range > 0) pts = ws.filter((w) => w.d >= addDays(today, -range * 7));
  if (pts.length < 2) {
    return `<p class="empty">${ws.length ? 'One weigh-in so far.' : 'No weigh-ins yet.'} Log your weight a few times a week and your trend will draw itself here. Day to day numbers jump around with water and salt, so the smoothed line is the one to watch.</p>`;
  }
  const W = 340, H = 190, L = 40, R = 10, T = 12, B = 26;
  const first = pts[0].d;
  const last = pts[pts.length - 1].d;
  const span = Math.max(6, daysBetween(first, last));
  const vals = pts.flatMap((p) => [p.kg, p.avg]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const showGoal = goal && goal > lo - 5 && goal < hi + 5;
  if (showGoal) {
    lo = Math.min(lo, goal);
    hi = Math.max(hi, goal);
  }
  lo = Math.floor((lo - 0.5) * 2) / 2;
  hi = Math.ceil((hi + 0.5) * 2) / 2;
  const x = (d) => L + (daysBetween(first, d) / span) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)} ${y(p.avg).toFixed(1)}`).join(' ');
  const lp = pts[pts.length - 1];
  const label = `Weight trend from ${fmt1(pts[0].avg)} kilograms on ${short(first)} to ${fmt1(lp.avg)} kilograms on ${short(last)}`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt1(t)}</text>`).join('')}
    ${showGoal ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/><text x="${W - R}" y="${(y(goal) - 5).toFixed(1)}" text-anchor="end" style="fill:var(--fg)">Goal ${fmt1(goal)}</text>` : ''}
    ${pts.map((p) => `<circle class="dot" cx="${x(p.d).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3"><title>${short(p.d)}: ${fmt1(p.kg)} kg</title></circle>`).join('')}
    <path class="avg" d="${path}"/>
    <circle class="last" cx="${x(lp.d).toFixed(1)}" cy="${y(lp.avg).toFixed(1)}" r="5"/>
    <text x="${L}" y="${H - 6}">${short(first)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${short(last)}</text>
  </svg>`;
}

function calChart(days, target, today) {
  const N = 14;
  const list = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const day = days[d];
    const k = day && day.entries && day.entries.length ? sum(day.entries).k : 0;
    list.push({ d, k });
  }
  const W = 340, H = 170, L = 8, R = 8, T = 22, B = 22;
  const max = Math.max(target * 1.25, ...list.map((l) => l.k));
  const bw = (W - L - R) / N;
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const logged = list.filter((l) => l.k > 0);
  const label = `Calories for the last 14 days against a target of ${fmt(target)}. ${logged.length} days logged.`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${list.map((l, i) => {
      const bx = L + i * bw + bw * 0.16;
      const w = bw * 0.68;
      const isToday = l.d === today;
      const dl = parseYmd(l.d).toLocaleDateString('en-IN', { weekday: 'narrow' });
      const bar = l.k > 0
        ? `<rect class="${isToday ? 'bar-t' : 'bar-d'}" x="${bx.toFixed(1)}" y="${y(l.k).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y(l.k)).toFixed(1)}" rx="3"><title>${short(l.d)}: ${fmt(l.k)} kcal</title></rect>`
        : `<rect class="bar-n" x="${bx.toFixed(1)}" y="${H - B - 3}" width="${w.toFixed(1)}" height="3" rx="1.5"><title>${short(l.d)}: nothing logged</title></rect>`;
      return bar + `<text x="${(bx + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${dl}</text>`;
    }).join('')}
    <line class="goal" x1="${L}" x2="${W - R}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/>
    <text x="${L}" y="${(y(target) - 6).toFixed(1)}" style="fill:var(--fg)">Target ${fmt(target)}</text>
  </svg>`;
}

export function trendsView() {
  const s = get();
  const T = s.targets;
  const today = ymd();
  const ws = smoothWeights(s.weights);
  const range = ui.range;
  const st = streak(s.days, today);

  // last 7 days of logged food
  const logged = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const day = s.days[d];
    if (day && day.entries.length && d !== today) logged.push({ d, t: sum(day.entries) });
  }
  const week = logged.filter((l) => daysBetween(l.d, today) <= 7);
  const avgK = week.length ? week.reduce((a, l) => a + l.t.k, 0) / week.length : 0;
  const avgP = week.length ? week.reduce((a, l) => a + l.t.p, 0) / week.length : 0;
  const onTarget = logged.filter((l) => Math.abs(l.t.k - T.kcal) <= T.kcal * 0.1).length;

  // weight stats
  const recent = ws.filter((w) => w.d >= addDays(today, -28));
  const reg = recent.length >= 3 ? linreg(recent.map((w) => ({ x: daysBetween(recent[0].d, w.d), y: w.kg }))) : null;
  const span = recent.length >= 2 ? daysBetween(recent[0].d, recent[recent.length - 1].d) : 0;
  const perWeek = reg && span >= 10 ? reg.slope * 7 : null;
  const cur = ws.length ? ws[ws.length - 1] : null;
  const startW = ws.length ? ws[0] : null;
  const goal = s.profile.goalKg;
  let eta = '';
  if (perWeek !== null && cur && perWeek < -0.05 && cur.avg > goal) {
    const weeks = (cur.avg - goal) / -perWeek;
    if (weeks < 156) eta = parseYmd(addDays(today, Math.round(weeks * 7))).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  const imp = impliedMaintenance(s, today);
  let insight;
  if (imp) {
    const base = computeTargets(s.profile, 0);
    const wanted = Math.round((imp.maintenance - T.deficit) / 10) * 10;
    const diff = Math.abs(imp.maintenance - T.tdee);
    insight = `<p class="label" style="margin-bottom:8px">What your body is telling us</p>
      <p>Over the last ${imp.span} days you averaged about <b>${fmt(imp.avgIn)} kcal</b> a day and your weight moved about <b>${fmt1(Math.abs(imp.kgPerWeek))} kg a week ${imp.kgPerWeek < 0 ? 'down' : 'up'}</b>. That points to a real maintenance near <b>${fmt(imp.maintenance)} kcal</b>, against ${fmt(T.tdee)} from the formula.</p>
      ${diff >= 150 ? `<p class="muted">Worth acting on. Moving your target to ${fmt(wanted)} kcal keeps your planned pace.</p><button type="button" class="btn dark sm" data-act="apply-implied" data-adj="${wanted - base.kcal}">Set my target to ${fmt(wanted)}</button>` : `<p class="muted">Close to the formula, so your plan is well calibrated. Keep going.</p>`}
      <p class="hint">An estimate from your own logs, so it is only as good as the logging.</p>`;
  } else {
    const have = Object.values(s.days).filter((d) => d.entries && d.entries.length).length;
    insight = `<p class="label" style="margin-bottom:8px">What your body is telling us</p>
      <p>Once you have about 10 days of food logs and two weeks of weigh-ins, Tally compares what you ate with how your weight moved and works out your real maintenance calories. That is how the plan becomes truly yours.</p>
      <p class="hint">So far: ${have} day${have === 1 ? '' : 's'} of food logged, ${s.weights.length} weigh-in${s.weights.length === 1 ? '' : 's'}.</p>`;
  }

  return `<header class="top"><div><h1>Trends</h1><p class="sub">The long view matters more than any single day.</p></div></header>
  <section class="sec">
    <div class="sec-h"><h2>Weight</h2>
      <div class="seg" role="group" aria-label="Range">${[[4, '4w'], [12, '12w'], [0, 'All']].map(([v, l]) => `<button type="button" data-act="range" data-v="${v}" aria-pressed="${range === v}" style="min-height:36px;padding:0 12px">${l}</button>`).join('')}</div></div>
    ${weightChart(ws, goal, range, today)}
    <div class="kpis" style="margin-top:14px">
      <div><span class="label">Trend weight</span><b>${cur ? fmt1(cur.avg) : 'No data'}${cur ? ' kg' : ''}</b><small>${cur ? 'Smoothed over 7 days' : 'Log your first weight'}</small></div>
      <div><span class="label">Pace</span><b>${perWeek === null ? 'Not yet' : (perWeek > 0 ? '+' : '') + fmt1(perWeek) + ' kg'}</b><small>${perWeek === null ? 'Needs two weeks of data' : 'Per week, last 4 weeks'}</small></div>
      <div><span class="label">Since you started</span><b>${cur && startW ? (cur.avg - startW.kg > 0 ? '+' : '') + fmt1(cur.avg - startW.kg) + ' kg' : 'No data'}</b><small>${startW ? 'From ' + fmt1(startW.kg) + ' kg' : ''}</small></div>
      <div><span class="label">To goal</span><b>${cur ? fmt1(Math.max(0, cur.avg - goal)) + ' kg' : 'No data'}</b><small>${eta ? 'At this pace, around ' + eta : 'Goal ' + fmt1(goal) + ' kg'}</small></div>
    </div>
    <form data-form="weight" style="display:flex;gap:8px;margin-top:18px">
      <label class="sr" for="wt-in">Today's weight in kilograms</label>
      <span class="unit" data-u="kg" style="flex:1"><input class="input mono" id="wt-in" inputmode="decimal" autocomplete="off" placeholder="${cur ? fmt1(cur.kg) : '70.0'}"></span>
      <button class="btn dark" type="submit">Log weight</button></form>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Calories, last 14 days</h2></div>
    ${calChart(s.days, T.kcal, today)}
    <p class="hint" style="margin-top:8px">Today is in blue. Grey ticks are days with nothing logged. A single high or low day does not change your trend.</p>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Consistency</h2></div>
    <div class="kpis" style="margin-top:0">
      <div><span class="label">Logging streak</span><b>${st.current} day${st.current === 1 ? '' : 's'}</b><small>Best ${st.best}</small></div>
      <div><span class="label">Avg calories</span><b>${week.length ? fmt(avgK) : 'No data'}</b><small>${week.length ? `Target ${fmt(T.kcal)}, ${week.length} day${week.length === 1 ? '' : 's'}` : 'Log a full day first'}</small></div>
      <div><span class="label">Avg protein</span><b>${week.length ? fmt(avgP) + ' g' : 'No data'}</b><small>Target ${fmt(T.protein)} g</small></div>
      <div><span class="label">Days on target</span><b>${onTarget} of ${logged.length}</b><small>Within 10 percent, last 14 days</small></div>
    </div>
  </section>
  <section class="sec"><div class="insight">${insight}</div></section>`;
}

handlers['range'] = (el) => {
  ui.range = Number(el.dataset.v);
  bus.render();
};

handlers['apply-implied'] = (el) => {
  const adj = Number(el.dataset.adj);
  mutate((s) => {
    s.settings.kcalAdjust = adj;
    s.targets = computeTargets(s.profile, adj);
  });
  toast('Target updated to ' + fmt(get().targets.kcal) + ' kcal');
};
