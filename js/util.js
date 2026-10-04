export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const fmt = (n) => Math.round(n).toLocaleString('en-IN');
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('en-IN', { maximumFractionDigits: 1 });
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const pct = (v, t) => (t > 0 ? clamp((v / t) * 100, 0, 100) : 0);

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="icons.svg#${name}"/></svg>`;
}

export function qtyText(n, unit) {
  const q = Math.round(n * 100) / 100;
  if (unit === 'g') return `${q} g`;
  if (unit === 'quick') return q === 1 ? 'Quick add' : `${q} × quick add`;
  return `${q} × ${unit}`;
}

// Shared plumbing so each module can register its own click, input and form handlers.
export const handlers = {};
export const inputs = {};
export const forms = {};
export const ui = { tab: 'today', date: null, range: 12 };
export const bus = { render() {} };

export function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function dayLabel(d, today, parse) {
  const diff = Math.round((parse(today) - parse(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return parse(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

let toastTimer;
export function toast(msg, actionLabel, onAction) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button" class="toast-act">${esc(actionLabel)}</button>` : ''}`;
  t.classList.add('show');
  const btn = t.querySelector('.toast-act');
  if (btn)
    btn.addEventListener('click', () => {
      t.classList.remove('show');
      onAction && onAction();
    });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 3200);
}
