// TijaPass Records Rating (RAT-01 to RAT-14). A monthly verification check by the officer, NOT an audit.
import { balancesAt, bookEntries } from "./accounting.js";
import { onTimeDays, tolerance } from "./dailyClose.js";
import { addDays, addMonths, dateRange, daysBetween, round, seeded } from "./util.js";

export const CHECKS = {
  cash: { max: 25, en: "Cash accuracy", sw: "Usahihi wa pesa" },
  completeness: { max: 25, en: "Completeness", sw: "Ukamilifu" },
  correctness: { max: 20, en: "Correctness", sw: "Usahihi wa kumbukumbu" },
  timeliness: { max: 15, en: "Timeliness", sw: "Kwa wakati" },
  stock: { max: 15, en: "Stock and assets", sw: "Stoku na mali" }
};

export const BANDS = [
  { key: "excellent", min: 90, en: "Excellent", sw: "Bora sana", color: "#0f6b3a" },
  { key: "good", min: 70, en: "Good", sw: "Nzuri", color: "#5cb85c" },
  { key: "okay", min: 50, en: "Okay", sw: "Wastani", color: "#e0a100" },
  { key: "poor", min: 0, en: "Poor", sw: "Dhaifu", color: "#c62828" }
];
export const GREY = "#8a94a6";

export const bandFor = (score) => BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];

// Cash accuracy: counted total vs book total at the visit (25 / 15 / 8 / 0).
export function scoreCash(counted, book, settings) {
  const diff = Math.abs(Number(counted) - Number(book));
  if (diff <= tolerance(settings, book)) return 25;
  const base = Math.abs(Number(book)) || 1;
  const p = diff / base;
  if (p <= 0.05) return 15;
  if (p <= 0.1) return 8;
  return 0;
}

// Each check is rounded to whole points, so the total shown always equals the sum of the five checks (RAT-03).
export const scoreCompleteness = (found, sampled) => (sampled > 0 ? round((found / sampled) * 25) : 0);
export const scoreCorrectness = (correct, sampled) => (sampled > 0 ? round((correct / sampled) * 20) : 0);
export const scoreTimeliness = (onTime, tradingDays) => (tradingDays > 0 ? round(Math.min(1, onTime / tradingDays) * 15) : 0);

export function scoreStock(estimate, book) {
  const b = Math.abs(Number(book)) || 0;
  const e = Math.abs(Number(estimate)) || 0;
  if (!b && !e) return 15;
  if (!b) return 0;
  const p = Math.abs(e - b) / b;
  if (p <= 0.1) return 15;
  if (p <= 0.25) return 8;
  return 0;
}

export function totalScore(points) {
  return Math.round(Object.keys(CHECKS).reduce((t, k) => t + (Number(points[k]) || 0), 0));
}

// The 30 days before the visit (or since onboarding, if shorter) define the period checked.
export function ratingPeriod(business, visitDate) {
  const from = business.startDate > addDays(visitDate, -30) ? business.startDate : addDays(visitDate, -30);
  return { from, to: addDays(visitDate, -1) };
}

export function timelinessFor(state, business, visitDate) {
  const { from, to } = ratingPeriod(business, visitDate);
  const tradingDays = from <= to ? dateRange(from, to).length : 0;
  const onTime = tradingDays ? onTimeDays(state, business.id, from, to) : 0;
  return { tradingDays, onTime, points: scoreTimeliness(onTime, tradingDays) };
}

// The app, not the officer, picks the recorded entries to test (RAT-06). Risk-based: half from the riskiest
// entries (largest amounts, self-declared, read with low confidence or chosen from the ready list), half at random.
export function riskOf(e, largeFrom) {
  let r = 0;
  if (Number(e.amount) >= largeFrom) r += 2;
  if (e.evidence !== "supported" && !e.photoId && e.source !== "import") r += 1;
  if (e.source === "ready" || (e.ai && e.ai.confidence < 0.6) || (e.ai && e.ai.suggested && e.ai.suggested !== e.kind)) r += 1;
  return r;
}

export function pickSample(state, business, visitDate, seed, size = 10) {
  const { from, to } = ratingPeriod(business, visitDate);
  const pool = bookEntries(state, business.id, to, from).filter((e) => !e.contra && !["cash_over", "cash_short", "suspense_resolve", "stock_adjust"].includes(e.kind));
  const rnd = seeded(seed);
  const shuffle = (a) => [...a].map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const amounts = pool.map((e) => Number(e.amount)).sort((a, b) => a - b);
  const largeFrom = amounts.length ? amounts[Math.floor(amounts.length * 0.75)] : Infinity;
  const risky = shuffle(pool.filter((e) => riskOf(e, largeFrom) >= 2));
  const half = Math.ceil(size / 2);
  const picked = risky.slice(0, half);
  const rest = shuffle(pool.filter((e) => !picked.includes(e)));
  return [...picked, ...rest].slice(0, size).map((e) => e.id);
}

export function bookFigures(state, business, asAt) {
  const bal = balancesAt(state, business.id, asAt);
  const cash = (business.channels || []).reduce((t, c) => t + (bal[`ch:${c.id}`] || 0), 0);
  return { cash, inventory: bal.inventory || 0, equipment: bal.equipment || 0 };
}

export const ratingsFor = (state, businessId) =>
  (state.ratings || []).filter((r) => r.businessId === businessId).sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date.localeCompare(b.date)));

export const latestRating = (state, businessId) => {
  const list = ratingsFor(state, businessId).filter((r) => r.status !== "draft");
  return list[list.length - 1] || null;
};

// Status shown on badges (RAT-09): band, "not_checked", "overdue" (with last band), "under_review".
export function ratingStatus(state, business, todayISO) {
  const r = latestRating(state, business.id);
  if (!r) return { state: "not_checked", color: GREY, rating: null };
  const band = bandFor(r.score);
  const age = daysBetween(r.date, todayISO);
  if (r.status === "disputed") return { state: "under_review", color: GREY, rating: r, band };
  if (age > (state.settings.ratingOverdueDays ?? 45)) return { state: "overdue", color: GREY, rating: r, band };
  return { state: "rated", color: band.color, rating: r, band };
}

// Next due date (RAT-02): first check ~30 days after onboarding; then by band frequency (months).
export function nextDue(state, business) {
  const r = latestRating(state, business.id);
  if (!r) return addDays(business.startDate, state.settings.firstCheckDays ?? 30);
  const months = state.settings.ratingFrequency?.[bandFor(r.score).key] ?? 1;
  return addMonths(r.date, months);
}

export function dueList(state, businesses, todayISO) {
  const overdueDays = state.settings.ratingOverdueDays ?? 45;
  return businesses
    .map((b) => {
      const due = nextDue(state, b);
      const last = latestRating(state, b.id);
      const overdue = last ? daysBetween(last.date, todayISO) > overdueDays : daysBetween(b.startDate, todayISO) > overdueDays;
      return { business: b, due, isDue: due <= todayISO, overdue };
    })
    .filter((x) => x.isDue || x.overdue)
    .sort((a, b) => (a.overdue === b.overdue ? a.due.localeCompare(b.due) : a.overdue ? -1 : 1));
}

// Quality control (RAT-11): about 1 in 10 checks are picked for a re-check.
export const pickForRecheck = (rate = 0.1, rnd = Math.random) => rnd() < rate;

export const recheckFlag = (original, recheck, settings) => Math.abs(original - recheck) > (settings.recheckGapFlag ?? 15);

// Improvement tips for weak checks (RAT-10).
export function tips(rating) {
  const out = [];
  const p = rating.points || {};
  const d = rating.details || {};
  if (p.cash < 25) out.push({ en: `Cash counted differed from the books by TZS ${Math.round(Math.abs((d.cash?.counted || 0) - (d.cash?.book || 0))).toLocaleString("en-US")}. Close every day and explain differences.`, sw: `Pesa iliyohesabiwa ilitofautiana na vitabu kwa TZS ${Math.round(Math.abs((d.cash?.counted || 0) - (d.cash?.book || 0))).toLocaleString("en-US")}. Funga kila siku na eleza tofauti.` });
  if (p.completeness < 25) {
    const missing = (d.completeness?.sampled || 0) - (d.completeness?.found || 0);
    out.push({ en: `${missing} of ${d.completeness?.sampled || 0} real transactions checked were not recorded. Record every sale and payment, including mobile money.`, sw: `Miamala ${missing} kati ya ${d.completeness?.sampled || 0} iliyokaguliwa haikuandikwa. Andika kila mauzo na malipo, pamoja na ya simu.` });
  }
  if (p.correctness < 20) {
    const wrong = (d.correctness?.sampled || 0) - (d.correctness?.correct || 0);
    out.push({ en: `${wrong} recorded entries had a wrong amount, date or purpose. Check each entry before you post it.`, sw: `Kumbukumbu ${wrong} zilikuwa na kiasi, tarehe au madhumuni yasiyo sahihi. Hakiki kila muamala kabla ya kuuthibitisha.` });
  }
  if (p.timeliness < 15) out.push({ en: `Days closed on time: ${d.timeliness?.onTime || 0} of ${d.timeliness?.tradingDays || 0}. Close your day every evening.`, sw: `Siku zilizofungwa kwa wakati: ${d.timeliness?.onTime || 0} kati ya ${d.timeliness?.tradingDays || 0}. Funga siku yako kila jioni.` });
  if (p.stock < 15) out.push({ en: "Stock or equipment on the books did not match what was seen. Ask your officer to update your stock value.", sw: "Stoku au vifaa kwenye vitabu havikulingana na vilivyoonekana. Mwombe afisa wako asahihishe thamani ya stoku." });
  return out;
}
