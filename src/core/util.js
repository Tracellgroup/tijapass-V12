// Shared helpers. Plain JavaScript, no browser or React dependencies,
// so these modules can move to a server unchanged (native build, tab 3).

export const uid = (prefix = "ID") =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();

export const round = (n, dp = 0) => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

export const sum = (arr, fn = (x) => x) => arr.reduce((t, x) => t + (Number(fn(x)) || 0), 0);

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const money = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

export const num = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

export const pct = (n, dp = 0) => `${round((Number(n) || 0) * 100, dp)}%`;

// Deterministic string hash (used for seeded sampling so results are reproducible).
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Seeded pseudo-random generator (mulberry32).
export function seeded(seed) {
  let a = typeof seed === "number" ? seed : hash(String(seed));
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Dates: all business dates are ISO strings "YYYY-MM-DD" in local time ----------
const pad = (n) => String(n).padStart(2, "0");

export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

export const addMonths = (s, n) => {
  const d = parseISO(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDate(d);
};

export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

export const monthKey = (s) => String(s).slice(0, 7);

export const startOfMonth = (s) => `${monthKey(s)}-01`;

export const endOfMonth = (s) => {
  const d = parseISO(startOfMonth(s));
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export function dateRange(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const yearsBetween = (a, b) => {
  const da = parseISO(a);
  const db = parseISO(b);
  let y = db.getFullYear() - da.getFullYear();
  if (db.getMonth() < da.getMonth() || (db.getMonth() === da.getMonth() && db.getDate() < da.getDate())) y--;
  return y;
};

// Clock with a tester offset (web MVP). `state.clock.offsetMs` moves "now" forward.
// Business days always follow Tanzania time (East Africa Time, UTC+3, no daylight saving), whatever the
// phone's own time zone, so a phone set to another zone never records the wrong day (V11 improvement).
export const TZ_OFFSET_MS = 3 * 3600000;
export const nowMs = (state) => Date.now() + (state?.clock?.offsetMs || 0);
export const nowDate = (state) => new Date(nowMs(state));
const tzParts = (ms) => {
  const d = new Date(ms + TZ_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
};
export const tzDateOf = (ms) => { const p = tzParts(ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
export const tzTimeOf = (ms) => { const p = tzParts(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
export const today = (state) => tzDateOf(nowMs(state));
export const timeHM = (state) => tzTimeOf(nowMs(state));
// The moment (ms since 1970) when Tanzania's clock shows dateISO at hh:mm.
export const tzMoment = (dateISO, h = 0, m = 0) => {
  const [y, mo, d] = String(dateISO).split("-").map(Number);
  return Date.UTC(y, mo - 1, d, h, m) - TZ_OFFSET_MS;
};
export const daysInMonth = (y, m) => new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
export const validISODate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return false;
  const [y, m, d] = s.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};
export const nowISO = (state) => nowDate(state).toISOString();

// Great-circle distance in metres between two {lat, lng} points.
export function distanceM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
