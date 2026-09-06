/* scaffolding1A — exploratory parsers & matchers that fed 97A (pure) */
(() => {
'use strict';
const ROOT = (typeof window !== 'undefined') ? window : globalThis;
const NS = (ROOT.__scaffold1A = ROOT.__scaffold1A || { v:'1A' });

/* --- price: unit-explicit $¢ /M /K ; no magnitude guessing --- */
const parsePrice = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim(); if (!s) return NaN;
  const cents = /¢/.test(s) || /cents?$/i.test(s);
  const m = s.match(/[$¢]?\s*(-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)/i); if (!m) return NaN;
  let n = parseFloat(m[1]); if (cents) n /= 100;
  const r = s.replace(m[0], '').toLowerCase();
  if (/\/1?m\b|million|per\s*1m|1m\s*tokens?/.test(r)) n /= 1e6;
  else if (/\/1?k\b|thousand|per\s*1k/.test(r)) n /= 1e3;
  return n;
};

/* --- schedule shorthand + circular range containment + composition --- */
const UMS = { ms:1, sec:1e3, min:6e4, hour:36e5, day:864e5, week:6048e5, month:26298e5, year:315576e5 };
const parseSch = src => String(src).split(/\s*[x×*]\s*/i).filter(Boolean).map(g => {
  const m = g.match(/^\s*(?:\[([^\]]*)\])?\s*\/\s*(\d+)\s*([a-z]+)\s*$/i);
  if (!m) return { error: g };
  const l = m[1], p = m[2], u = m[3];
  return { unit: u.toLowerCase(), period: +p, ranges: l ? l.split(',').map(x => { const q = x.trim().split('-').map(parseFloat); return q.length === 2 ? q : [q[0], q[0] + 1]; }) : null };
});
const inRange = (v,a,b,P) => { const a0 = ((a%P)+P)%P; let len = b-a; if (len <= 0) len += P; len = Math.min(len,P); return ((v-a0+P)%P) < len; };
const valIn = (g,ts) => { const d = new Date(ts), u = g.unit, P = g.period;
  if (u === 'day') return d.getUTCDay();
  if (u === 'hour'){ if (P === 24) return d.getUTCHours(); if (P === 168) return d.getUTCDay()*24 + d.getUTCHours(); return d.getUTCHours() % P; }
  const um = UMS[u]; if (!um) return NaN; return Math.floor((ts % (P*um)) / um); };
const schedMatch = (gs, ts) => !!gs && !gs.some(g => g.error) && gs.every(g => {
  const v = valIn(g, ts); if (!Number.isFinite(v)) return false; if (!g.ranges) return true;
  return g.ranges.some(([a,b]) => inRange(v, a, b, g.period));
});

/* --- references: multipliers + /// paths --- */
const parseRef = s => { s = String(s).trim(); let mult = 1;
  const m = s.match(/^\s*(?:(\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*[x×*]\s*|÷\s*(\d+(?:\.\d+)?(?:e[-+]?\d+)?)\s*)/i);
  if (m){ mult = m[1] != null ? +m[1] : 1/+m[2]; s = s.slice(m[0].length); }
  s = s.replace(/^of\s+/i, '');
  return { mult, path: s.split('///').map(x => x.trim()).filter(Boolean) };
};

/* --- quick selfTest --- */
const t = []; const T = (n, ok) => t.push({ n, ok });
const ap = (a,b) => Math.abs(a-b) < 1e-18 || Math.abs(a-b)/Math.max(Math.abs(a), 1e-300) < 1e-6;
T('$50/M', ap(parsePrice('$50/M'), 5e-5));
T('$0.22/M', ap(parsePrice('$0.22/M'), 2.2e-7));
T('bare small per-token', ap(parsePrice('0.00000022'), 2.2e-7));
T('0.14 stays 0.14 (no guess)', ap(parsePrice('0.14'), 0.14));
T('50¢/1K', ap(parsePrice('50¢/1K'), 5e-4));
const MON8 = Date.UTC(2026, 8, 7, 8), SAT10 = Date.UTC(2026, 8, 5, 10);
T('weekday hours match', schedMatch(parseSch('[1-4,6-10]/24hour × [1-5]/7day'), MON8));
T('weekend hours no match', !schedMatch(parseSch('[1-4,6-10]/24hour × [1-5]/7day'), SAT10));
T('wrap 160-2', (() => { const g = parseSch('[160-2]/168hour'); return schedMatch(g, Date.UTC(2026,8,5,17)); })());
T('ref mult/path', (() => { const r = parseRef('2x deepseek-v4-flash///peak'); return r.mult === 2 && r.path.length === 2; })());
const fails = t.filter(x => !x.ok);
NS.selfTest = { total: t.length, passed: t.length - fails.length, failed: fails.length, fails: fails.map(x => x.n) };
NS.api = { parsePrice, parseSch, schedMatch, inRange, valIn, parseRef };
})();
