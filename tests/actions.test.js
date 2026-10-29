// Domain action tests: daily close, holds and decisions, Records Rating gate on offers, packages, assessments, consent.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { balanceSheet, balancesAt, channelBalances, incomeStatement, trialBalance } from "../src/core/accounting.js";
import { evidenceMix, reconciliation, score, DEFAULT_WEIGHTS } from "../src/core/credit.js";
import { computeKpis } from "../src/core/kpi.js";
import { fiBill } from "../src/core/billing.js";
import { buildTestData, loadTestData, removeTestData } from "../src/lib/testData.js";
import { activePackage } from "../src/core/billing.js";
import { initialState } from "../src/core/seed.js";
import { addDays, today } from "../src/core/util.js";
import { addEntry, assignOfficer, closeDay, createBusiness, decideHeld, disburse, logAssessment, makeOffer, payPackage, requestLoan, resolveSuspense, respondOffer, reverseEntry, reviewPosted, correctBaseline, saveOpening, decideOpening, setConsent } from "../src/lib/actions.js";
import { businessesInScope } from "../src/lib/access.js";

const ADMIN = { id: "U-DATA", name: "Data Admin", role: "dataAdmin" };
const OFF = { id: "U-OFF1", name: "Officer", role: "officer" };
const SUPER = { id: "U-SUPER", name: "Super user", role: "super" };
const BIZ = { id: "UB1", name: "Neema Juma Mushi", role: "business", businessId: "B1" };
const bizActor = (bid) => ({ id: `U-${bid}`, name: bid, role: "business", businessId: bid });

// The business registers itself (29 Oct): code to its own phone, its own 4-digit PIN.
export function world() {
  const d = initialState(today(null));
  createBusiness(d, null, {
    id: "B1", userId: "UB1", pin: "4826", phoneVerified: true,
    profile: {
      businessName: "Neema Shop", legalForm: "sole", sector: "produce", region: "Dar es Salaam", gps: { lat: -6.8, lng: 39.28 }, monthsOperating: 24,
      owners: [{ id: "O1", name: "Neema Juma Mushi", phone: "+255712345678", nida: "19940512111110000121", dob: "1994-05-12", gender: "female", sharePct: 100, role: "owner", main: true, photoId: "p", idPhotoId: "i" }]
    },
    channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }],
    baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["vicoba"], needFinance: "no" }
  });
  assignOfficer(d, ADMIN, "B1", "U-OFF1", "Same region");
  saveOpening(d, BIZ, "B1", { channels: { C1: 50000, C2: 20000 }, inventory: 300000 }, true);
  decideOpening(d, ADMIN, "B1", true, "Checked");
  return d;
}
const biz = (d) => d.businesses.find((b) => b.id === "B1");
const entry = (over) => ({ id: `E${Math.random()}`, businessId: "B1", date: over.date, kind: "sale_cash", amount: 1000, channelId: "C1", ...over });

test("daily close: a guided reason creates its entry and the rest goes to cash difference", () => {
  const d = world();
  const t = today(d);
  addEntry(d, BIZ, entry({ date: t, amount: 20000 }));
  closeDay(d, BIZ, { businessId: "B1", from: t, to: t, counts: { C1: 85000, C2: 20000 }, reasons: [{ kind: "debtor_receipt", amount: 10000, channelId: "C1", label: "A customer paid" }] });
  assert.ok(d.entries.some((e) => e.kind === "debtor_receipt" && e.amount === 10000 && e.source === "close"));
  assert.ok(d.entries.some((e) => e.kind === "cash_over" && e.amount === 5000));
  const cash = channelBalances(d, "B1", t).find((x) => x.channel.id === "C1").balance;
  assert.equal(cash, 85000, "after the close the books match the count");
  const tb = trialBalance(d, "B1", t);
  assert.ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.01);
});

test("held entry: Admin decline keeps it out of the books; reversal balances", () => {
  const d = world();
  const t = today(d);
  const ev = addEntry(d, BIZ, entry({ id: "BIG", date: t, kind: "rent", amount: 999000, channelId: "C2" }));
  assert.equal(ev.action, "hold");
  assert.deepEqual(ev.reasons, ["overdraw"]);
  decideHeld(d, ADMIN, "BIG", "decline", { reason: "Wrong account" });
  assert.equal(d.entries.find((e) => e.id === "BIG").status, "declined");
  addEntry(d, BIZ, entry({ id: "S1", date: t, amount: 7000 }));
  const before = balanceSheet(d, "B1", t).totalAssets;
  reverseEntry(d, ADMIN, "S1", "Entered twice by mistake");
  assert.equal(balanceSheet(d, "B1", t).totalAssets, before - 7000);
  assert.ok(d.audit.some((a) => a.action === "Entry reversed" && a.reason));
});

function testWorld(history = true) {
  const d = initialState(today(null));
  const dir = new URL("../public/samples/test-data/", import.meta.url);
  const built = buildTestData({ profilesCsv: fs.readFileSync(new URL("profiles.csv", dir), "utf8"), transactionsCsv: fs.readFileSync(new URL("transactions.csv", dir), "utf8"), ratingsCsv: fs.readFileSync(new URL("ratings.csv", dir), "utf8") }, { history, closes: true, todayISO: today(d) });
  loadTestData(d, SUPER, built);
  return d;
}
const FI = { id: "U-FI1", name: "FI", role: "fi", orgId: "FI-1" };
const offer = (d, loanId, extra = {}) => makeOffer(d, FI, loanId, { fiId: "FI-1", product: d.fis[0].products[0], principal: 200000, frequency: "monthly", instalments: 6, ...extra });
const ask = (d, id, bid) => requestLoan(d, bizActor(bid), { id, businessId: bid, fiId: "FI-1", productId: "P-1", type: "working_capital", amount: 200000, purpose: "stock", frequency: "monthly" });

test("test data: 10 businesses, 100 transactions, 8 ratings load and are removed in one step", () => {
  const d = testWorld(false);
  assert.equal(d.businesses.filter((b) => b.testData).length, 10);
  assert.equal(d.entries.filter((e) => e.testData).length, 100);
  assert.equal(d.ratings.length, 8);
  for (const b of d.businesses) { const tb = trialBalance(d, b.id, today(d)); assert.ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.01); }
  assert.equal(removeTestData(d, SUPER), 10);
  assert.equal(d.businesses.length + d.entries.length + d.ratings.length + d.closes.length, 0);
});

test("credit gate (revised): Good is automatic, Okay needs the lender's recorded review, Poor is blocked", () => {
  const d = testWorld(true);
  ask(d, "L1", "TPDEMO-B01"); ask(d, "L4", "TPDEMO-B04"); ask(d, "L8", "TPDEMO-B08");
  offer(d, "L1");
  assert.equal(d.loans.find((l) => l.id === "L1").status, "offered");
  assert.throws(() => offer(d, "L4"), /own review/);
  offer(d, "L4", { manualReview: { reason: "Checked October statements and receipts with the officer" } });
  assert.ok(d.loans.find((l) => l.id === "L4").offer.manualReview);
  assert.throws(() => offer(d, "L8"), /Records Rating/);
});

test("daily close (revised): unexplained difference waits in suspense, not profit, until resolved", () => {
  const d = world();
  const t = today(d);
  addEntry(d, BIZ, entry({ date: t, amount: 20000 }));
  const before = incomeStatement(d, "B1", t, t).profit;
  const c = closeDay(d, BIZ, { businessId: "B1", from: t, to: t, counts: { C1: 95000, C2: 20000 }, reasons: [] });
  assert.equal(c.open, 25000);
  assert.equal(incomeStatement(d, "B1", t, t).profit, before, "profit unchanged");
  assert.equal(balancesAt(d, "B1", t).suspense, -25000);
  assert.equal(reconciliation(d, biz(d), t).ok, false);
  resolveSuspense(d, ADMIN, c.id, "sales", 25000, "Owner confirmed an unrecorded sale");
  assert.equal(Math.round(balancesAt(d, "B1", t).suspense || 0), 0);
  assert.equal(incomeStatement(d, "B1", t, t).profit, before + 25000);
});

test("group money (revised): early rotating payout is owed back, not income", () => {
  const d = world();
  const t = today(d);
  addEntry(d, BIZ, entry({ date: t, kind: "group_contribution", amount: 10000, channelId: "C1", groupMode: "savings" }));
  addEntry(d, BIZ, entry({ date: t, kind: "group_payout", amount: 50000, channelId: "C1", groupMode: "early" }));
  const bal = balancesAt(d, "B1", t);
  assert.equal(bal.groupLoans, -40000);
  assert.equal(incomeStatement(d, "B1", t, t).profit + 0, 0);
  addEntry(d, BIZ, entry({ date: t, kind: "group_contribution", amount: 10000, channelId: "C1", groupMode: "afterPayout" }));
  assert.equal(balancesAt(d, "B1", t).groupLoans, -30000);
});

test("credit score: first-loan weights apply until a repeat borrower's first instalment falls due", () => {
  const d = testWorld(true);
  ask(d, "L1", "TPDEMO-B01");
  offer(d, "L1");
  respondOffer(d, bizActor("TPDEMO-B01"), "L1", true, "TPDEMO-B01-cash");
  disburse(d, FI, "L1");
  const b = d.businesses.find((x) => x.id === "TPDEMO-B01");
  const sc = score(d, b, today(d));
  assert.deepEqual(sc.weights, d.settings.scoreWeights?.first || DEFAULT_WEIGHTS.first);
  assert.equal(sc.parts.repayment ?? null, null);
});

test("accountant review: an uncertain material entry posts at once, then is confirmed or re-posted with a reason", () => {
  const d = world();
  const t = today(d);
  addEntry(d, BIZ, entry({ id: "EB", date: t, kind: "sale_cash", amount: 90000, ai: { confidence: 0.4, suggested: "sale_cash" } }));
  addEntry(d, BIZ, entry({ id: "EA", date: t, kind: "other_expense", amount: 60000, source: "ready" }));
  addEntry(d, BIZ, entry({ id: "EC", date: t, kind: "sale_cash", amount: 5000, source: "ready" }));
  const get = (id) => d.entries.find((e) => e.id === id);
  assert.equal(get("EA").status, "posted");
  assert.equal(get("EA").review.status, "open");
  assert.equal(get("EB").review.status, "open");
  assert.equal(get("EC").review, undefined, "below the review floor");
  reviewPosted(d, ADMIN, "EA", "change", { kind: "drawings", reason: "Owner confirmed this was school fees" });
  assert.equal(get("EA").reversedBy !== undefined, true);
  assert.ok(d.entries.some((e) => e.correctionOf === "EA" && e.kind === "drawings" && e.evidence === "supported"));
  reviewPosted(d, ADMIN, "EB", "confirm", { reason: "Matches the M-Pesa message" });
  assert.equal(get("EB").review.status, "confirmed");
  assert.ok(d.audit.some((a) => a.action === "Entry treatment changed") && d.audit.some((a) => a.action === "Posted entry confirmed by accountant"));
});

test("baseline: a correction keeps the original answers and records who and why", () => {
  const d = world();
  correctBaseline(d, ADMIN, "B1", "bank", "unused", "Owner showed a dormant NMB account");
  const bl = biz(d).baseline;
  assert.equal(bl.bank, "unused");
  assert.equal(bl.original.bank, "none");
  assert.equal(bl.corrections[0].reason, "Owner showed a dormant NMB account");
});

test("evidence: self-declared entries count half for credit", () => {
  assert.equal(evidenceMix([{ evidence: "supported" }, { evidence: "declared" }]).reliability, 0.75);
  assert.equal(evidenceMix([{ photoId: "p" }, { source: "import", importGrade: "A" }]).supported, 2);
});

test("BOT privacy (revised): complementary suppression hides a filter whose remainder is small", () => {
  const d = testWorld(false);
  d.settings.minGroupSize = 5;
  assert.equal(computeKpis(d, {}, today(d)).hidden, false);
  const women = computeKpis(d, { gender: "female" }, today(d));
  assert.equal(women.hidden, false);
  const dsm = computeKpis(d, { region: "Dar es Salaam" }, today(d));
  assert.equal(dsm.hidden, true);
});

test("FI services: disbursement and collection fees appear only when switched on", () => {
  const d = testWorld(true);
  ask(d, "L1", "TPDEMO-B01");
  offer(d, "L1");
  respondOffer(d, bizActor("TPDEMO-B01"), "L1", true, "TPDEMO-B01-cash");
  disburse(d, FI, "L1");
  const mk = today(d).slice(0, 7);
  assert.equal(fiBill(d, d.fis[0], mk, today(d)).disbursementTotal, 0);
  d.settings.fiFees.disbursementOn = true;
  assert.equal(fiBill(d, d.fis[0], mk, today(d)).disbursementTotal, 3000);
});

test("packages: a failed payment never unlocks; a repeated confirmation never charges twice", () => {
  const d = world();
  const b = biz(d);
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "failed", reference: "R1" }), "failed");
  assert.equal(activePackage(d, b, today(d)), "basic");
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "success", reference: "R2" }), "success");
  assert.equal(payPackage(d, OFF, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "success", reference: "R2" }), "duplicate");
  assert.equal(d.payments.filter((p) => p.status === "success").length, 1);
  assert.equal(activePackage(d, b, today(d)), "week");
  assert.equal(activePackage(d, b, addDays(today(d), 7)), "basic");
});

test("assessments: billed once per FI per business per day", () => {
  const d = world();
  const fi = { id: "U-FI1", name: "FI", role: "fi" };
  assert.equal(logAssessment(d, fi, "FI-1", "B1"), true);
  assert.equal(logAssessment(d, fi, "FI-1", "B1"), false);
  assert.equal(d.assessments.length, 1);
  assert.equal(d.assessments[0].fee, 3000);
});

test("consent: withdrawing removes the FI's access at once", () => {
  const d = world();
  const fiUser = d.users.find((u) => u.id === "U-FI1");
  assert.equal(businessesInScope(d, fiUser).length, 0);
  setConsent(d, BIZ, "B1", "FI-1", true);
  assert.equal(businessesInScope(d, fiUser).length, 1);
  setConsent(d, BIZ, "B1", "FI-1", false);
  assert.equal(businessesInScope(d, fiUser).length, 0);
});

test("officers see only their own businesses; suppliers and reports users see none", () => {
  const d = world();
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-OFF1")).length, 1);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-OFF2")).length, 0);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-SUP1")).length, 0);
  assert.equal(businessesInScope(d, d.users.find((u) => u.id === "U-BOT")).length, 0);
});
