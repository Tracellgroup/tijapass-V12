import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/core/seed.js";
import { parseAmount, readDescription, wordsToNumber } from "../src/core/reader.js";
import { balanceSheet, cashFlowDirect, incomeStatement, journal, isBalanced, openingEquity, trialBalance } from "../src/core/accounting.js";
import { evaluateEntry } from "../src/core/posting.js";
import { compareCounts, isOnTime, unclosedPastDays } from "../src/core/dailyClose.js";
import { bandFor, pickSample, scoreCash, scoreCompleteness, scoreCorrectness, scoreStock, scoreTimeliness, totalScore, ratingStatus } from "../src/core/rating.js";
import { gates, schedule, maxPrincipal } from "../src/core/credit.js";
import { annualFromMonthly, sponsorDiscountPct, canAssignTier } from "../src/core/billing.js";
import { computeKpis } from "../src/core/kpi.js";
import { pdfTextToLines, rowsToLines, parseDelimited, nameMatches, runningBalanceOk } from "../src/core/statements.js";

const T = "2026-10-27";

function world() {
  const s = initialState(T);
  const b = {
    id: "B-1", status: "active", startDate: "2026-10-01", closingTime: "17:00",
    profile: { ownerName: "Amina Juma", businessName: "Amina Fresh Produce", phone: "+255754000001", nida: "1990", dob: "1995-04-01", gender: "female", photoId: "p", idPhotoId: "i", sector: "produce", region: "Dar es Salaam", address: "Kariakoo", monthsOperating: 24 },
    channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }],
    opening: { status: "approved", date: "2026-10-01", values: { channels: { C1: 50000, C2: 100000 }, inventory: 200000, equipment: 300000, payables: 50000, loansShort: 100000 } },
    consent: { at: "2026-10-01T08:00:00Z" }
  };
  s.businesses.push(b);
  return { s, b };
}

let n = 0;
const entry = (s, over) => {
  const e = { id: `E-${++n}`, businessId: "B-1", date: "2026-10-02", channelId: "C1", status: "posted", source: "typed", createdAt: `2026-10-02T10:${String(n % 60).padStart(2, "0")}:00Z`, ...over };
  s.entries.push(e);
  return e;
};

test("reads Kiswahili and English amounts", () => {
  assert.equal(wordsToNumber("elfu ishirini"), 20000);
  assert.equal(wordsToNumber("elfu ishirini na tano"), 25000);
  assert.equal(wordsToNumber("laki mbili na elfu hamsini"), 250000);
  assert.equal(wordsToNumber("elfu kumi na mia tano"), 10500);
  assert.equal(wordsToNumber("elfu mia tano"), 500000);
  assert.equal(wordsToNumber("milioni moja na laki tano"), 1500000);
  assert.equal(wordsToNumber("twenty thousand"), 20000);
  assert.equal(wordsToNumber("two hundred thousand"), 200000);
  assert.equal(parseAmount("nimeuza mboga 20,000 cash"), 20000);
  assert.equal(parseAmount("20k"), 20000);
});

test("REC-03: 'nimeuza mboga elfu ishirini cash' is a cash sale of 20,000", () => {
  const r = readDescription("nimeuza mboga elfu ishirini cash", "in");
  assert.equal(r.kind, "sale_cash");
  assert.equal(r.amount, 20000);
  assert.equal(r.channelType, "cash");
  assert.equal(r.conflict, false);
});

test("reader recognises personal and group money", () => {
  assert.equal(readDescription("nimechukua pesa kwa matumizi ya nyumbani", "out").kind, "drawings");
  assert.equal(readDescription("nimechangia mchezo wa wiki", "out").kind, "group_contribution");
  assert.equal(readDescription("paid electricity luku", "out").kind, "utilities");
});

test("REC-08: description contradicting money in/out is a conflict", () => {
  const r = readDescription("nimeuza mboga elfu kumi", "out");
  assert.equal(r.conflict, true);
});

test("ACC-01/ACC-03: books balance and opening equity is calculated", () => {
  const { s, b } = world();
  assert.equal(openingEquity(b), 50000 + 100000 + 200000 + 300000 - 50000 - 100000);
  entry(s, { kind: "sale_cash", amount: 20000 });
  entry(s, { kind: "stock_cash", amount: 8000 });
  entry(s, { kind: "transfer", amount: 5000, toChannelId: "C2" });
  for (const j of journal(s, "B-1")) assert.ok(isBalanced(j.lines), `unbalanced ${j.id}`);
  const tb = trialBalance(s, "B-1", T);
  assert.equal(Math.round(tb.totalDebit), Math.round(tb.totalCredit));
  const bs = balanceSheet(s, "B-1", T);
  assert.equal(bs.difference, 0);
});

test("REC-09: personal expense and mchezo contribution leave profit unchanged", () => {
  const { s } = world();
  entry(s, { kind: "sale_cash", amount: 30000 });
  const before = incomeStatement(s, "B-1", "2026-10-01", T).profit;
  entry(s, { kind: "drawings", amount: 5000 });
  entry(s, { kind: "group_contribution", amount: 10000 });
  const after = incomeStatement(s, "B-1", "2026-10-01", T).profit;
  assert.equal(after, before);
  const bs = balanceSheet(s, "B-1", T);
  assert.equal(bs.assets.find((a) => a.acc === "groupSavings").amount, 10000);
  assert.equal(bs.equity.find((a) => a.acc === "drawings").amount, -5000);
});

test("group payout beyond savings is other income", () => {
  const { s } = world();
  entry(s, { kind: "group_contribution", amount: 10000 });
  entry(s, { kind: "group_payout", amount: 25000, date: "2026-10-03" });
  const is = incomeStatement(s, "B-1", "2026-10-01", T);
  assert.equal(is.otherIncome, 15000);
});

test("direct cash flow reconciles opening to closing cash", () => {
  const { s } = world();
  entry(s, { kind: "sale_cash", amount: 40000 });
  entry(s, { kind: "rent", amount: 10000 });
  entry(s, { kind: "transfer", amount: 5000, toChannelId: "C2" });
  const cf = cashFlowDirect(s, "B-1", "2026-10-01", T);
  assert.equal(cf.check, 0);
  assert.equal(cf.lines.sales, 40000);
  assert.equal(cf.lines.expenses, -10000);
});

test("REC-07: two TZS 20,000 sales minutes apart with no payer both post", () => {
  const { s } = world();
  const a = entry(s, { kind: "sale_cash", amount: 20000, createdAt: "2026-10-02T10:00:00Z" });
  const b = { id: "NEW", businessId: "B-1", date: "2026-10-02", kind: "sale_cash", amount: 20000, channelId: "C1", createdAt: "2026-10-02T10:03:00Z" };
  assert.ok(a);
  assert.equal(evaluateEntry(s, b).action, "post");
  // Same payer and reference = duplicate
  s.entries[0].payer = "Juma";
  s.entries[0].reference = "R1";
  assert.equal(evaluateEntry(s, { ...b, payer: "juma", reference: "r1" }).action, "hold");
});

test("REC-08: money out larger than the channel holds is held", () => {
  const { s } = world();
  const r = evaluateEntry(s, { id: "X", businessId: "B-1", date: "2026-10-02", kind: "rent", amount: 60000, channelId: "C1", createdAt: "2026-10-02T11:00:00Z" });
  assert.equal(r.action, "hold");
  assert.deepEqual(r.reasons, ["overdraw"]);
});

test("DAY-03/04/05: counts compared per channel with tolerance", () => {
  const { s } = world();
  entry(s, { kind: "sale_cash", amount: 20000 });
  const c = compareCounts(s, "B-1", { C1: 70500, C2: 90000 }, "2026-10-02");
  const cash = c.rows.find((r) => r.channelId === "C1");
  const mob = c.rows.find((r) => r.channelId === "C2");
  assert.equal(cash.diff, 500);
  assert.equal(cash.withinTolerance, true);
  assert.equal(mob.diff, -10000);
  assert.equal(mob.withinTolerance, false);
});

test("DAY-08: unclosed past days and on-time rule", () => {
  const { s, b } = world();
  s.closes.push({ id: "K1", businessId: "B-1", date: "2026-10-01", from: "2026-10-01", to: "2026-10-01", onTime: true });
  assert.deepEqual(unclosedPastDays(s, b, "2026-10-04"), ["2026-10-02", "2026-10-03"]);
  assert.equal(isOnTime("2026-10-02", new Date(2026, 9, 3, 8, 59).toISOString()), true);
  assert.equal(isOnTime("2026-10-02", new Date(2026, 9, 3, 9, 1).toISOString()), false);
});

test("RAT-03/08: points and bands follow the specification", () => {
  const settings = initialState(T).settings;
  assert.equal(scoreCash(100500, 100000, settings), 25);
  assert.equal(scoreCash(96000, 100000, settings), 15);
  assert.equal(scoreCash(91000, 100000, settings), 8);
  assert.equal(scoreCash(80000, 100000, settings), 0);
  assert.equal(scoreCompleteness(7, 10), 18); // 17.5 rounded to whole points
  assert.equal(scoreCorrectness(9, 10), 18);
  assert.equal(scoreTimeliness(20, 30), 10);
  assert.equal(scoreStock(105000, 100000), 15);
  assert.equal(scoreStock(120000, 100000), 8);
  assert.equal(scoreStock(140000, 100000), 0);
  assert.equal(totalScore({ cash: 25, completeness: 17.5, correctness: 18, timeliness: 10, stock: 8 }), 79);
  assert.equal(bandFor(90).key, "excellent");
  assert.equal(bandFor(89).key, "good");
  assert.equal(bandFor(70).key, "good");
  assert.equal(bandFor(69).key, "okay");
  assert.equal(bandFor(50).key, "okay");
  assert.equal(bandFor(49).key, "poor");
});

test("RAT-06: the app picks the sample, reproducibly", () => {
  const { s, b } = world();
  for (let i = 0; i < 25; i++) entry(s, { kind: "sale_cash", amount: 1000 + i, date: "2026-10-1" + (i % 9) });
  const a = pickSample(s, b, "2026-10-27", "R-1");
  const c = pickSample(s, b, "2026-10-27", "R-1");
  assert.equal(a.length, 10);
  assert.deepEqual(a, c);
});

test("RAT-09: not checked, then overdue after 45 days", () => {
  const { s, b } = world();
  assert.equal(ratingStatus(s, b, T).state, "not_checked");
  s.ratings.push({ id: "R1", businessId: "B-1", date: "2026-08-01", score: 78, status: "final", createdAt: "x" });
  assert.equal(ratingStatus(s, b, "2026-09-10").state, "rated");
  assert.equal(ratingStatus(s, b, "2026-09-20").state, "overdue");
});

test("CRD-03 (revised): Good 70+ is automatic, Okay 50-69 needs lender review, Poor is blocked", () => {
  const { s, b } = world();
  s.ratings.push({ id: "R1", businessId: "B-1", date: "2026-10-20", score: 45, status: "final", createdAt: "x" });
  assert.equal(gates(s, b, T).results.rating, false);
  s.ratings.push({ id: "R2", businessId: "B-1", date: "2026-10-25", score: 55, status: "final", createdAt: "y" });
  assert.equal(gates(s, b, T).results.rating, "review");
  s.ratings.push({ id: "R3", businessId: "B-1", date: "2026-10-26", score: 78, status: "final", createdAt: "z" });
  assert.equal(gates(s, b, T).results.rating, true);
});

test("schedules: instalments repay principal, fees on the first instalment", () => {
  const sc = schedule({ principal: 1000000, annualRate: 24, frequency: "monthly", instalments: 6, feePct: 2, start: "2026-11-01" });
  assert.equal(sc.rows.length, 6);
  assert.equal(Math.round(sc.rows.reduce((t, r) => t + r.principal, 0)), 1000000);
  assert.equal(sc.rows[0].fee, 20000);
  assert.ok(sc.costOfCredit > 20000);
  assert.ok(maxPrincipal(100000, 24, "monthly", 6) > 500000);
});

test("PKG-03/04: annual price and sponsor discounts", () => {
  assert.equal(annualFromMonthly(500000), 5400000);
  assert.equal(annualFromMonthly(2000000), 21600000);
  assert.equal(annualFromMonthly(6000000), 64800000);
  const s = initialState(T);
  const fi = { ...s.fis[0], sponsorTier: "vip", joinedAt: "2026-01-01" };
  assert.equal(sponsorDiscountPct(s, fi, "2026-10-27"), 100);
  assert.equal(sponsorDiscountPct(s, fi, "2028-06-01"), 50);
  assert.equal(sponsorDiscountPct(s, fi, "2030-01-02"), 0);
  s.fis[0].sponsorTier = "vip";
  assert.equal(canAssignTier(s, { id: "FI-2", sponsorTier: "standard" }, "vip"), false);
  assert.equal(canAssignTier(s, { id: "FI-2", sponsorTier: "standard" }, "partner"), true);
});

test("BOT-01: small groups are hidden", () => {
  const { s } = world();
  const k = computeKpis(s, {}, T);
  assert.equal(k.hidden, true);
});

test("IMP: CSV and PDF text become dated lines; checks run", () => {
  const rows = parseDelimited("Date,Details,Paid In,Withdrawn,Balance\n2026-10-02,Payment from John Mushi for goods,20000,,120000\n2026-10-03,Pay bill LUKU,,5000,115000\n");
  const lines = rowsToLines(rows);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].amountIn, 20000);
  assert.equal(runningBalanceOk([{ balance: 100000, amountIn: 0, amountOut: 0 }, ...lines]), true);
  const p = pdfTextToLines("02/10/2026 Received from JOHN 20,000.00 120,000.00\n03/10/2026 Paid LUKU 5,000.00 115,000.00");
  assert.equal(p.length, 2);
  assert.equal(p[1].amountOut, 5000);
  const { b } = world();
  assert.equal(nameMatches("AMINA JUMA", b), true);
  assert.equal(nameMatches("PETER MWITA", b), false);
});
