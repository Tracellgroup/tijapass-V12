// Daily close (DAY-01 to DAY-09).
import { channelBalances } from "./accounting.js";
import { flowOf } from "./kinds.js";
import { addDays, dateRange, round, sum } from "./util.js";

// Guided reasons (DAY-06). Each creates its entry.
export const REASONS = {
  higher: [
    { key: "customer_paid", kind: "debtor_receipt", en: "A customer paid what they owed", sw: "Mteja alilipa deni lake" },
    { key: "family", kind: "capital", en: "Family support", sw: "Msaada wa familia" },
    { key: "contribution", kind: "capital", en: "A contribution received (e.g. for a wedding or funeral)", sw: "Mchango uliopokelewa (k.m. harusi au msiba)" }
  ],
  lower: [
    { key: "unrecorded_expense", kind: "other_expense", en: "An expense I did not record", sw: "Matumizi ambayo sikuandika" },
    { key: "personal_use", kind: "drawings", en: "I used it personally", sw: "Nimetumia kwa mambo binafsi" },
    { key: "credit_sale", kind: "sale_credit_fix", en: "A sale was on credit, not paid", sw: "Mauzo yalikuwa kwa mkopo, hayakulipwa" },
    { key: "loss", kind: "loss", en: "Money was lost or stolen", sw: "Pesa ilipotea au kuibiwa" }
  ]
};

export const closesFor = (state, businessId) => (state.closes || []).filter((c) => c.businessId === businessId);

// Every date that is covered by a close (a catch-up close covers a range).
export function closedDates(state, businessId) {
  const set = new Set();
  for (const c of closesFor(state, businessId)) for (const d of dateRange(c.from || c.date, c.to || c.date)) set.add(d);
  return set;
}

export function isClosed(state, businessId, date) {
  return closedDates(state, businessId).has(date);
}

// Days before today that still need closing (DAY-08). The business's first day is its start date.
export function unclosedPastDays(state, business, todayISO) {
  const start = business.startDate;
  if (!start || start >= todayISO) return [];
  const closed = closedDates(state, business.id);
  return dateRange(start, addDays(todayISO, -1)).filter((d) => !closed.has(d));
}

// True when today's entries must wait until earlier days are closed.
export const blockedForToday = (state, business, todayISO) => unclosedPastDays(state, business, todayISO).length > 0;

export function daySummary(state, businessId, from, to = from) {
  const list = (state.entries || []).filter((e) => e.businessId === businessId && e.date >= from && e.date <= to && e.status !== "declined");
  const inn = list.filter((e) => flowOf(e.kind) === "in");
  const out = list.filter((e) => flowOf(e.kind) === "out");
  return {
    countIn: inn.length,
    totalIn: sum(inn, (e) => e.amount),
    countOut: out.length,
    totalOut: sum(out, (e) => e.amount),
    entries: list
  };
}

export function tolerance(settings, book) {
  return Math.max(settings.closeToleranceAbs ?? 1000, ((settings.closeTolerancePct ?? 1) / 100) * Math.abs(book));
}

// Compare counts with book balances per channel at the end of `asAt` (DAY-04).
export function compareCounts(state, businessId, counts, asAt) {
  const rows = channelBalances(state, businessId, asAt).filter((x) => !x.channel.archived).map(({ channel, balance }) => {
    const counted = Number(counts[channel.id]) || 0;
    const diff = round(counted - balance, 2);
    return { channelId: channel.id, name: channel.name, book: balance, counted, diff, withinTolerance: Math.abs(diff) <= tolerance(state.settings, balance) };
  });
  return { rows, totalDiff: round(sum(rows, (r) => r.diff), 2), allWithin: rows.every((r) => r.withinTolerance) };
}

// On time = closed on the same day, or before 09:00 the next morning.
export function isOnTime(closeDate, closedAtISO) {
  const closed = new Date(closedAtISO);
  const [y, m, d] = closeDate.split("-").map(Number);
  const deadline = new Date(y, m - 1, d + 1, 9, 0, 0);
  return closed <= deadline;
}

// Days closed on time within [from, to] (DAY-09, RAT-03 timeliness).
export function onTimeDays(state, businessId, from, to) {
  const days = new Set();
  for (const c of closesFor(state, businessId)) {
    if ((c.from || c.date) !== (c.to || c.date)) continue; // catch-up ranges are late by definition
    if (c.date >= from && c.date <= to && c.onTime) days.add(c.date);
  }
  return days.size;
}

export function closingDue(state, business, todayISO, hhmm) {
  return !isClosed(state, business.id, todayISO) && hhmm >= (business.closingTime || "17:00");
}

// Differences flagged to the officer: large, or repeated (DAY-07).
export function shouldFlag(state, businessId, remainder, date) {
  const big = Math.abs(remainder) >= (state.settings.differenceFlagLevel ?? 10000);
  const since = addDays(date, -7);
  const recent = closesFor(state, businessId).filter((c) => c.date >= since && Math.abs(c.remainder || 0) > 0).length;
  return big || recent >= 2;
}
