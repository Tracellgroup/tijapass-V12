// Credit passport and scoring (CRD-01 to CRD-07), affordability and repayment schedules (FIN-04, FIN-05).
import { balancesAt, bookEntries, cashFlowDirect, incomeStatement } from "./accounting.js";
import { unclosedPastDays } from "./dailyClose.js";
import { linkedBusinesses, ownersOf } from "./people.js";
import { ratingStatus } from "./rating.js";
import { addDays, addMonths, clamp, daysBetween, monthKey, round, sum } from "./util.js";

export const LOAN_TYPES = {
  working_capital: { en: "Working capital", sw: "Mtaji wa kufanyia kazi" },
  asset: { en: "Asset finance (from a supplier quote)", sw: "Mkopo wa mali (kutoka nukuu ya msambazaji)" },
  term: { en: "Term loan", sw: "Mkopo wa muda" }
};

export const FREQUENCIES = {
  daily: { perYear: 365, en: "Daily", sw: "Kila siku", firstMax: 90, laterMax: 90 },
  weekly: { perYear: 52, en: "Weekly", sw: "Kila wiki", firstMax: 26, laterMax: 52 },
  monthly: { perYear: 12, en: "Monthly", sw: "Kila mwezi", firstMax: 12, laterMax: 36 }
};

const KYC_FIELDS = ["ownerName", "phone", "nida", "dob", "gender", "photoId", "idPhotoId", "businessName", "sector", "region"];

export function kycCompleteness(business) {
  const p = business.profile || {};
  const have = KYC_FIELDS.filter((f) => p[f]).length + (business.consent?.at ? 1 : 0) + (p.gps || p.address ? 1 : 0);
  return have / (KYC_FIELDS.length + 2);
}

export const loansFor = (state, businessId) => (state.loans || []).filter((l) => l.businessId === businessId);

function repaymentRecord(state, businessId, todayISO) {
  const due = [];
  for (const l of loansFor(state, businessId)) for (const i of l.schedule || []) if (i.due <= todayISO) due.push(i);
  const onTime = due.filter((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due).length;
  const repaidLoans = loansFor(state, businessId).filter((l) => l.status === "repaid");
  const repaidOnTime = repaidLoans.filter((l) => (l.schedule || []).every((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due));
  const allPaid = sum(repaidLoans, (l) => (l.schedule || []).length);
  const allOnTime = sum(repaidLoans, (l) => (l.schedule || []).filter((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due).length);
  return { dueCount: due.length, onTime, share: due.length ? onTime / due.length : null, repaidLoans: repaidLoans.length, repaidOnTime: repaidOnTime.length, onTimeShareRepaid: allPaid ? allOnTime / allPaid : 0 };
}

export function overdueAmount(state, businessId, todayISO) {
  let total = 0;
  for (const l of loansFor(state, businessId).filter((x) => x.status === "disbursed")) for (const i of l.schedule || []) if (!i.paidAt && i.due < todayISO) total += i.amount;
  return total;
}

// Evidence (feedback 27 Oct): every valid entry counts in the accounts, but self-declared entries carry less
// credit-evidence weight than independently supported ones.
export function isSupported(e) {
  return e.evidence === "supported" || Boolean(e.photoId) || Boolean(e.decidedBy) || Boolean(e.verifiedInRating) || (e.source === "import" && ["A", "B"].includes(e.importGrade));
}

export function evidenceMix(entries) {
  const supported = entries.filter(isSupported).length;
  const declared = entries.length - supported;
  return { supported, declared, total: entries.length, reliability: entries.length ? (supported + 0.5 * declared) / entries.length : 0 };
}

// V9's five qualification factors are kept (KYC, reliable records, number of records, months of records,
// repayment record); the Records Rating is added at a small, visible weight so reliability is not counted twice.
export const DEFAULT_WEIGHTS = {
  first: { kyc: 20, coverage: 25, records: 25, months: 20, rating: 10, repayment: 0 },
  repeat: { kyc: 15, coverage: 20, records: 15, months: 10, rating: 5, repayment: 35 }
};

const recordPoints = (n) => (n >= 300 ? 1 : n >= 100 ? 0.8 : n >= 30 ? 0.5 : (n / 30) * 0.5);

export function score(state, business, todayISO) {
  const entries = bookEntries(state, business.id, todayISO).filter((e) => !e.contra && !["cash_over", "cash_short", "suspense_resolve", "stock_adjust", "loan_interest", "asset_financed"].includes(e.kind));
  const rep = repaymentRecord(state, business.id, todayISO);
  // Repeat-borrower weights apply once at least one instalment has fallen due; until then the first-loan weights apply.
  const repeat = loansFor(state, business.id).some((l) => l.disbursedAt) && rep.dueCount > 0;
  const sets = state.settings.scoreWeights?.first ? state.settings.scoreWeights : DEFAULT_WEIGHTS;
  const w = repeat ? sets.repeat : sets.first;
  const months = new Set(entries.map((e) => monthKey(e.date))).size;
  const rs = ratingStatus(state, business, todayISO);
  const ev = evidenceMix(entries);
  const parts = {
    kyc: kycCompleteness(business),
    coverage: ev.reliability,
    records: recordPoints(entries.length),
    months: clamp(months / 12, 0, 1),
    rating: rs.state === "rated" ? rs.rating.score / 100 : 0,
    repayment: repeat ? (rep.share ?? 0) : null
  };
  const keys = Object.keys(parts).filter((k) => parts[k] != null && (w[k] || 0) > 0);
  const totalW = sum(keys, (k) => w[k] || 0);
  const value = totalW ? (sum(keys, (k) => (w[k] || 0) * parts[k]) / totalW) * 100 : 0;
  return { value: Math.round(value), parts, weights: w, firstTime: !repeat, repayment: rep, entries: entries.length, months, evidence: ev };
}

export const GATES = {
  score: { en: "Score at least the qualifying level (70)", sw: "Alama angalau kiwango cha kufuzu (70)" },
  kyc: { en: "Profile at least 80% complete, identity verified by Data Admin, every owner confirmed, with consent", sw: "Wasifu angalau 80%, utambulisho umehakikiwa na Msimamizi wa Data, kila mmiliki amethibitisha, pamoja na ridhaa" },
  records: { en: "At least 30 entries over at least 3 months", sw: "Angalau kumbukumbu 30 kwa miezi 3 au zaidi" },
  overdue: { en: "No overdue TijaPass repayments", sw: "Hakuna marejesho ya TijaPass yaliyochelewa" },
  external: { en: "Declared outside loans verified by Admin", sw: "Mikopo ya nje iliyotajwa imethibitishwa na Msimamizi" },
  cash: { en: "Cash available for repayments after existing loans", sw: "Pesa ya kurejesha baada ya mikopo iliyopo" },
  reconciled: { en: "Records reconciled: days closed, cash differences resolved, corrections done", sw: "Kumbukumbu zimelinganishwa: siku zimefungwa, tofauti zimetatuliwa, marekebisho yamefanyika" },
  rating: { en: "Records Rating Good (70+) for automatic eligibility; Okay (50–69) needs the lender's own review", sw: "Kiwango Nzuri (70+) kwa ustahiki wa moja kwa moja; Wastani (50–69) unahitaji mapitio ya mkopeshaji" }
};

// Average monthly profit and operating cash flow over the last 90 days (or since joining).
export function monthlyBase(state, business, todayISO) {
  const from = business.startDate > addDays(todayISO, -90) ? business.startDate : addDays(todayISO, -90);
  const days = Math.max(1, daysBetween(from, todayISO) + 1);
  const profit = (incomeStatement(state, business.id, from, todayISO).profit / days) * 30;
  const cf = cashFlowDirect(state, business.id, from, todayISO).lines;
  const operating = ["sales", "customers", "otherIn", "suppliers", "expenses"].reduce((t, k) => t + (cf[k] || 0), 0);
  const cash = (operating / days) * 30;
  return { profit, cash, base: Math.min(profit, cash), from, days };
}

export function avgMonthlyProfit(state, business, todayISO) {
  return monthlyBase(state, business, todayISO).profit;
}

// Records are reconciled when every past day is closed, cash differences in suspense are resolved,
// the starting position is approved and no correction request is open.
export function reconciliation(state, business, todayISO) {
  const unclosed = unclosedPastDays(state, business, todayISO).length;
  const suspense = balancesAt(state, business.id, todayISO).suspense || 0;
  const corrections = (state.changeRequests || []).filter((c) => c.businessId === business.id && c.status === "pending" && ["correction", "stock"].includes(c.type)).length;
  const opening = business.opening?.status === "approved";
  const ok = !unclosed && Math.abs(suspense) <= (state.settings.closeToleranceAbs ?? 1000) && !corrections && opening;
  return { ok, unclosed, suspense, corrections, opening };
}

export function ratingGate(state, business, todayISO) {
  const rs = ratingStatus(state, business, todayISO);
  if (rs.state !== "rated") return false;
  if (rs.rating.score >= (state.settings.ratingAutoMin ?? 70)) return true;
  if (rs.rating.score >= (state.settings.ratingReviewMin ?? 50)) return "review";
  return false;
}

export function gates(state, business, todayISO) {
  const s = score(state, business, todayISO);
  const ext = (state.externalLoans || []).filter((x) => x.businessId === business.id && !x.archived);
  const a = affordability(state, business, todayISO);
  const res = {
    score: s.value >= (state.settings.qualifyScore ?? 70),
    kyc: kycCompleteness(business) >= 0.8 && Boolean(business.consent?.at) && business.kyc?.status === "verified" && ownersOf(business.profile).every((o) => o.confirmed !== false),
    records: s.entries >= 30 && s.months >= 3,
    overdue: overdueAmount(state, business.id, todayISO) === 0,
    external: ext.every((x) => x.status === "reviewed"),
    cash: a.capacity > 0,
    reconciled: reconciliation(state, business, todayISO).ok,
    rating: ratingGate(state, business, todayISO)
  };
  const others = Object.keys(res).filter((k) => k !== "rating").every((k) => res[k] === true);
  // passed: automatic eligibility; needsReview: everything met except a rating of Okay (lender must review).
  return { results: res, passed: others && res.rating === true, needsReview: others && res.rating === "review", score: s };
}

export const toMonthly = (amount, frequency) => (frequency === "daily" ? amount * 30 : frequency === "weekly" ? (amount * 52) / 12 : amount);

export function existingMonthlyInstalments(state, businessId, todayISO) {
  const internal = loansFor(state, businessId)
    .filter((l) => l.status === "disbursed")
    .reduce((t, l) => {
      const next = (l.schedule || []).find((i) => !i.paidAt && i.due >= todayISO) || (l.schedule || []).find((i) => !i.paidAt);
      return t + (next ? toMonthly(next.amount, l.frequency) : 0);
    }, 0);
  const external = (state.externalLoans || [])
    .filter((x) => x.businessId === businessId && !x.archived && Number(x.remaining) > 0)
    .reduce((t, x) => t + toMonthly(Number(x.instalment) || 0, x.frequency), 0);
  return { internal, external, total: internal + external };
}

export function repaymentShare(state, businessId, todayISO) {
  const rep = repaymentRecord(state, businessId, todayISO);
  if (rep.repaidLoans >= 2 && rep.onTimeShareRepaid >= 0.95) return 0.35;
  if (rep.repaidOnTime >= 1) return 0.3;
  return 0.25;
}

// One person, several businesses (ONB-12): what the same owner already owes through their other businesses,
// so a lender sees the whole picture. Counts and amounts only; the other businesses' names stay private.
export function linkedExposure(state, business, todayISO) {
  const others = linkedBusinesses(state, business);
  let monthly = 0;
  let overdue = 0;
  let openLoans = 0;
  for (const b of others) {
    monthly += existingMonthlyInstalments(state, b.id, todayISO).total;
    overdue += overdueAmount(state, b.id, todayISO);
    openLoans += loansFor(state, b.id).filter((l) => l.status === "disbursed").length;
  }
  return { count: others.length, monthly: Math.round(monthly), overdue: Math.round(overdue), openLoans };
}

export function affordability(state, business, todayISO) {
  const m = monthlyBase(state, business, todayISO);
  const share = repaymentShare(state, business.id, todayISO);
  const existing = existingMonthlyInstalments(state, business.id, todayISO);
  const buffer = state.settings.cashBuffer ?? 0.8;
  // Conservative base: the lower of profit and operating cash flow (feedback 27 Oct).
  const capacity = Math.max(0, Math.max(0, m.base) * buffer * share - existing.total);
  return { profit: m.profit, cash: m.cash, base: m.base, share, buffer, existing, capacity: round(capacity) };
}

export function maxInstalments(state, businessId, frequency) {
  const later = loansFor(state, businessId).some((l) => l.status === "repaid");
  const f = FREQUENCIES[frequency];
  return later ? f.laterMax : f.firstMax;
}

const periodicRate = (annualPct, frequency) => (Number(annualPct) || 0) / 100 / FREQUENCIES[frequency].perYear;

export function payment(principal, annualPct, frequency, n) {
  const r = periodicRate(annualPct, frequency);
  if (!r) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

// Largest principal whose instalment fits the capacity (monthly capacity converted to the frequency).
export function maxPrincipal(capacityMonthly, annualPct, frequency, n) {
  const perPeriod = frequency === "daily" ? capacityMonthly / 30 : frequency === "weekly" ? (capacityMonthly * 12) / 52 : capacityMonthly;
  const r = periodicRate(annualPct, frequency);
  if (perPeriod <= 0) return 0;
  return Math.floor(r ? (perPeriod * (1 - (1 + r) ** -n)) / r : perPeriod * n);
}

export function schedule({ principal, annualRate, frequency, instalments, feePct = 0, feeFixed = 0, start }) {
  const n = Number(instalments);
  const r = periodicRate(annualRate, frequency);
  const pay = payment(principal, annualRate, frequency, n);
  const fees = round((principal * (Number(feePct) || 0)) / 100 + (Number(feeFixed) || 0));
  let balance = principal;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const interest = round(balance * r);
    let princ = round(pay - interest);
    if (i === n) princ = round(balance);
    balance = round(balance - princ);
    const due = frequency === "daily" ? addDays(start, i) : frequency === "weekly" ? addDays(start, 7 * i) : addMonths(start, i);
    const fee = i === 1 ? fees : 0;
    rows.push({ n: i, due, principal: princ, interest, fee, amount: round(princ + interest + fee), paidAt: null });
  }
  const totalRepay = sum(rows, (x) => x.amount);
  return { rows, fees, totalRepay, costOfCredit: round(totalRepay - principal), firstMaxAmount: Math.max(...rows.map((x) => x.amount)) };
}

// Each instalment must fit capacity (CRD-04): the largest one, usually the first with fees, is checked.
export function offerFits(state, business, offerSched, frequency, todayISO) {
  const a = affordability(state, business, todayISO);
  return toMonthly(offerSched.firstMaxAmount, frequency) <= a.capacity + 0.5;
}
