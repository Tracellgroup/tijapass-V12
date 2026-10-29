// Controls agreed on 29 Oct 2026: every gap found in the pre-live scenario testing must now be refused by the
// rules themselves (not only by the screens), plus sign-in, registration, profile-change and approval controls.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { channelBalances, incomeStatement, trialBalance } from "../src/core/accounting.js";
import { gates, linkedExposure } from "../src/core/credit.js";
import { findDuplicate } from "../src/core/posting.js";
import { dobBounds, dobProblem, linkedBusinesses, ownershipGender, pinProblem, validNida } from "../src/core/people.js";
import { initialState } from "../src/core/seed.js";
import { addDays, daysInMonth, today, tzDateOf, tzMoment } from "../src/core/util.js";
import { buildTestData, loadTestData, TEST_PIN } from "../src/lib/testData.js";
import * as A from "../src/lib/actions.js";

const ADMIN = { id: "U-DATA", name: "Data Admin", role: "dataAdmin" };
const OFF = { id: "U-OFF1", name: "Officer", role: "officer" };
const OFF2 = { id: "U-OFF2", name: "Officer 2", role: "officer" };
const SYS = { id: "U-SYS", name: "System Admin", role: "systemAdmin" };
const SUPER = { id: "U-SUPER", name: "Super", role: "super" };
const SUPER2 = { id: "U-SUPER2", name: "Super 2", role: "super" };
const FI = { id: "U-FI1", name: "FI", role: "fi", orgId: "FI-1" };
const B = { id: "UB1", name: "Neema", role: "business", businessId: "B1" };

const owner = (o = {}) => ({ id: "O1", name: "Neema Juma Mushi", phone: "+255712345678", nida: "19940512111110000121", dob: "1994-05-12", gender: "female", sharePct: 100, role: "owner", main: true, ...o });
const reg = (o = {}) => ({
  id: "B1", userId: "UB1", pin: "4826", phoneVerified: true,
  profile: { businessName: "Neema Shop", legalForm: "sole", sector: "produce", region: "Dar es Salaam", owners: [owner()] },
  channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }],
  baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["vicoba"], needFinance: "no" }, ...o
});
function world() {
  const d = initialState(today(null));
  A.createBusiness(d, null, reg());
  A.assignOfficer(d, ADMIN, "B1", "U-OFF1", "Same region");
  A.saveOpening(d, B, "B1", { channels: { C1: 50000, C2: 20000 } }, true);
  A.decideOpening(d, ADMIN, "B1", true, "Checked against stock and SMS");
  return d;
}
function testWorld() {
  const d = initialState(today(null));
  const dir = new URL("../public/samples/test-data/", import.meta.url);
  const read = (f) => fs.readFileSync(new URL(f, dir), "utf8");
  loadTestData(d, SUPER, buildTestData({ profilesCsv: read("profiles.csv"), transactionsCsv: read("transactions.csv"), ratingsCsv: read("ratings.csv") }, { history: true, closes: true, todayISO: today(d) }));
  return d;
}
const E = (d, o) => ({ id: `E${Math.random()}`, businessId: "B1", date: today(d), kind: "sale_cash", amount: 1000, channelId: "C1", ...o });
const refuses = (fn, re) => assert.throws(fn, re);

// ---------------------------------------------------------------- Registration and identity
test("only the business itself can register; officers and admins cannot", () => {
  const d = initialState(today(null));
  for (const staff of [OFF, ADMIN, SYS, SUPER]) refuses(() => A.createBusiness(d, staff, reg()), /Only the business itself/);
  refuses(() => A.createBusiness(d, null, reg({ phoneVerified: false })), /code sent to it/);
  A.createBusiness(d, null, reg());
  assert.equal(d.businesses[0].kyc.status, "pending");
  assert.equal(d.businesses[0].officerId, null);
});

test("age rules: owners 12+, no future or impossible birth dates; under 18 needs a guardian and cannot borrow", () => {
  const t = today(null);
  const { max, min } = dobBounds(t);
  assert.equal(max.slice(0, 4), String(Number(t.slice(0, 4)) - 12));
  assert.ok(dobProblem("2021-05-01", t) && dobProblem(addDays(t, 30), t) && dobProblem("1890-01-01", t) && dobProblem("2001-02-30", t));
  assert.equal(dobProblem("1994-05-12", t), null);
  assert.ok(min > "1900-01-01");
  const d = initialState(t);
  refuses(() => A.createBusiness(d, null, reg({ profile: { businessName: "X", owners: [owner({ dob: "2021-05-01" })] } })), /at least 12/);
  const teen = `${Number(t.slice(0, 4)) - 15}-01-15`;
  refuses(() => A.createBusiness(d, null, reg({ profile: { businessName: "X", owners: [owner({ dob: teen, nida: "" })] } })), /guardian/);
  A.createBusiness(d, null, reg({ profile: { businessName: "Teen Shop", owners: [owner({ dob: teen, nida: "", guardianName: "Mama Juma", guardianPhone: "0713000111" })] } }));
  refuses(() => A.requestLoan(d, B, { id: "L1", businessId: "B1", amount: 100000, purpose: "stock" }), /18 or older/);
});

test("date picker rules: real days only, including leap years", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
});

test("NIDA: 20 digits; owners in one business cannot share one; one person's businesses are linked", () => {
  assert.equal(validNida("19940512-11111-00001-21"), true);
  assert.equal(validNida("123"), false);
  const d = initialState(today(null));
  refuses(() => A.createBusiness(d, null, reg({ profile: { businessName: "X", owners: [owner({ nida: "123" })] } })), /20 digits/);
  A.createBusiness(d, null, reg());
  A.createBusiness(d, null, reg({ id: "B2", userId: "UB2", profile: { businessName: "Neema Second Shop", owners: [owner({ phone: "+255712345679" })] } }));
  assert.deepEqual(linkedBusinesses(d, d.businesses[0]).map((b) => b.id), ["B2"]);
  assert.ok(d.notifications.some((n) => n.title.en === "Same owner, several businesses"));
  // Lenders see what the same owner owes through the other business (counts and amounts, no names).
  d.loans.push({ id: "L9", businessId: "B2", status: "disbursed", frequency: "monthly", schedule: [{ due: addDays(today(d), -3), amount: 40000 }, { due: addDays(today(d), 27), amount: 40000 }] });
  const lx = linkedExposure(d, d.businesses[0], today(d));
  assert.equal(lx.count, 1);
  assert.equal(lx.openLoans, 1);
  assert.equal(lx.overdue, 40000);
  assert.equal(lx.monthly, 40000);
});

test("several owners: shares must total 100%; co-owners confirm by their own phone code; women-owned is 51%+", () => {
  const d = initialState(today(null));
  const two = (a, b2) => [owner({ sharePct: a }), owner({ id: "O2", name: "Juma Ali Mushi", phone: "+255713111222", nida: "19900101222220000222", dob: "1990-01-01", gender: "male", sharePct: b2, main: false })];
  refuses(() => A.createBusiness(d, null, reg({ profile: { businessName: "X", legalForm: "partnership", owners: two(60, 30) } })), /100%/);
  A.createBusiness(d, null, reg({ profile: { businessName: "Partners", legalForm: "partnership", owners: two(60, 40) } }));
  const b = d.businesses[0];
  assert.equal(ownershipGender(b.profile), "female");
  assert.equal(b.profile.owners[1].confirmed, false);
  b.kyc = { status: "verified" };
  assert.equal(gates(d, b, today(d)).results.kyc, false, "unconfirmed co-owner keeps the identity gate closed");
  A.confirmOwner(d, B, "B1", "O2", true);
  assert.equal(b.profile.owners[1].confirmed, true);
});

test("identity is verified by Data Admin only", () => {
  const d = world();
  refuses(() => A.verifyIdentity(d, OFF, "B1", true, "ok"), /not allowed/);
  A.verifyIdentity(d, ADMIN, "B1", true, "NIDA photo and number match");
  assert.equal(d.businesses[0].kyc.status, "verified");
});

// ---------------------------------------------------------------- PIN and sign-in
test("4-digit PIN: easy PINs refused", () => {
  for (const p of ["0000", "1111", "1234", "4321", "6789", "2580", "123", "12345"]) assert.ok(pinProblem(p), p);
  assert.ok(pinProblem("1994", { dob: "1994-05-12" }));
  assert.ok(pinProblem("5678", { phones: ["+255712345678"] }));
  assert.equal(pinProblem("4826", { dob: "1994-05-12", phones: ["+255712345678"] }), null);
  const d = initialState(today(null));
  refuses(() => A.createBusiness(d, null, reg({ pin: "1234" })), /too easy/);
});

test("an old 6-digit PIN cannot sign in and points to Forgot my PIN", () => {
  const d = world();
  d.users.find((u) => u.id === "UB1").pin = "482613";
  assert.match(A.pinSignIn(d, "0712345678", "4826").error, /4-digit/);
});

test("5 wrong PINs lock for 15 minutes; 10 block until an officer unlocks; the count survives failed sign-ins", () => {
  const d = world();
  const u = d.users.find((x) => x.id === "UB1");
  for (let i = 0; i < 4; i++) assert.ok(A.pinSignIn(d, "0712345678", "9999").error);
  assert.match(A.pinSignIn(d, "0712345678", "9999").error, /Try again after/);
  assert.match(A.pinSignIn(d, "0712345678", "4826").error, /Try again after/, "even the right PIN waits during the lock");
  d.clock.offsetMs = 16 * 60000;
  assert.equal(A.pinSignIn(d, "0712345678", "4826").id, "UB1");
  for (let i = 0; i < 5; i++) A.pinSignIn(d, "0712345678", "9999");
  assert.equal(u.pinBlocked, undefined, "five wrong: locked, not yet blocked");
  d.clock.offsetMs = 40 * 60000;
  for (let i = 0; i < 5; i++) A.pinSignIn(d, "0712345678", "9999");
  assert.equal(u.pinBlocked, true, "ten wrong in a row: blocked");
  refuses(() => A.resetPinWithCode(d, "0712345678", "5917", true), /blocked/);
  refuses(() => A.unlockPin(d, OFF2, "UB1", "Checked NIDA in person"), /own officer/);
  A.unlockPin(d, OFF, "UB1", "Checked NIDA card in person at the stall");
  assert.equal(A.pinSignIn(d, "0712345678", "4826").id, "UB1");
});

test("staff passwords lock too; pending staff cannot sign in", () => {
  const d = world();
  A.proposeStaff(d, SYS, { id: "U-NEW", role: "officer", name: "New Officer", login: "new@tijapass.test", password: "longpass1" });
  assert.match(A.passwordSignIn(d, "new@tijapass.test", "longpass1").error, /waiting for approval/);
});

// ---------------------------------------------------------------- Recording
test("recording: amounts, dates, accounts and types are checked by the rules", () => {
  const d = world();
  const t = today(d);
  refuses(() => A.addEntry(d, B, E(d, { amount: -5000 })), /above zero/);
  refuses(() => A.addEntry(d, B, E(d, { amount: 0 })), /above zero/);
  refuses(() => A.addEntry(d, B, E(d, { amount: 1500.75 })), /whole shillings/);
  refuses(() => A.addEntry(d, B, E(d, { date: addDays(t, 30) })), /future/);
  refuses(() => A.addEntry(d, B, E(d, { date: addDays(t, -10) })), /before the business joined/);
  refuses(() => A.addEntry(d, B, E(d, { kind: "transfer", toChannelId: "C1" })), /different account/);
  refuses(() => A.addEntry(d, B, E(d, { kind: "no_such_kind" })), /from the list/);
  refuses(() => A.addEntry(d, B, E(d, { channelId: "NOPE" })), /money accounts/);
  refuses(() => A.addEntry(d, OFF, E(d, {})), /staff do not record/);
});

test("a repeated transaction reference is a duplicate even without a payer", () => {
  const d = world();
  A.addEntry(d, B, E(d, { amount: 45000, reference: "MP123ABC" }));
  const ev = A.addEntry(d, B, E(d, { amount: 45000, reference: "mp123abc" }));
  assert.deepEqual(ev.reasons, ["duplicate"]);
  assert.ok(findDuplicate(d, E(d, { amount: 999, reference: "MP123ABC" })));
});

test("a new entry on a closed, counted day goes to Data Admin as a correction", () => {
  const d = world();
  const t = today(d);
  A.closeDay(d, B, { businessId: "B1", from: t, to: t, counts: { C1: 50000, C2: 20000 }, reasons: [] });
  const ev = A.addEntry(d, B, E(d, { id: "LATE", amount: 7777 }));
  assert.deepEqual(ev.reasons, ["closedDay"]);
  A.decideHeld(d, ADMIN, "LATE", "approve", { reason: "Owner forgot a cash sale" });
  assert.equal(d.closes.at(-1).adjustments.length, 1);
});

test("loan repayment splits principal and interest", () => {
  const d = world();
  const t = today(d);
  A.addEntry(d, B, E(d, { kind: "loan_received", amount: 100000 }));
  refuses(() => A.addEntry(d, B, E(d, { kind: "loan_repayment", amount: 10000, interest: 10000 })), /less than the whole/);
  refuses(() => A.addEntry(d, B, E(d, { kind: "sale_cash", amount: 10000, interest: 100 })), /Only a loan repayment/);
  const before = incomeStatement(d, "B1", t, t).profit;
  A.addEntry(d, B, E(d, { kind: "loan_repayment", amount: 12000, interest: 2000 }));
  assert.equal(incomeStatement(d, "B1", t, t).profit, before - 2000, "interest is a cost");
  assert.ok(d.entries.some((e) => e.kind === "loan_repayment" && e.amount === 10000) && d.entries.some((e) => e.kind === "loan_interest" && e.amount === 2000));
  const tb = trialBalance(d, "B1", t);
  assert.ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.01);
});

// ---------------------------------------------------------------- Daily close
test("daily close: no double close, no future close, every account counted, no negative counts", () => {
  const d = world();
  const t = today(d);
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: addDays(t, 3), to: addDays(t, 3), counts: { C1: 0, C2: 0 } }), /before it happens/);
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: t, to: t, counts: { C1: 50000 } }), /Count every account/);
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: t, to: t, counts: { C1: -50000, C2: 0 } }), /negative/);
  refuses(() => A.closeDay(d, OFF, { businessId: "B1", from: t, to: t, counts: { C1: 50000, C2: 20000 } }), /Only the business/);
  A.closeDay(d, B, { businessId: "B1", from: t, to: t, counts: { C1: 50000, C2: 20000 } });
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: t, to: t, counts: { C1: 50000, C2: 20000 } }), /Already closed/);
  refuses(() => A.resolveSuspense(d, OFF, d.closes[0].id, "sales", 10, "x"), /not allowed/);
});

// ---------------------------------------------------------------- Starting position
test("starting position: entered by the business, never negative, approved by someone else", () => {
  const d = initialState(today(null));
  A.createBusiness(d, null, reg());
  refuses(() => A.saveOpening(d, OFF, "B1", { channels: { C1: 1000 } }, true), /Only the business enters/);
  refuses(() => A.saveOpening(d, B, "B1", { channels: { C1: -900000 }, inventory: -5 }, true), /negative/);
  A.saveOpening(d, B, "B1", { channels: { C1: 1000 } }, true);
  refuses(() => A.decideOpening(d, OFF, "B1", true, "ok ok"), /not allowed/);
  d.businesses[0].opening.by = { id: "U-DATA" };
  refuses(() => A.decideOpening(d, ADMIN, "B1", true, "Checked"), /cannot approve/);
});

// ---------------------------------------------------------------- Records Rating
test("Records Rating: only the assigned officer, points within each maximum, one per period, first one re-checked", () => {
  const d = testWorld();
  const b = d.businesses.find((x) => x.id === "TPDEMO-B09");
  const r = (o = {}) => ({ id: `R${Math.random()}`, businessId: b.id, date: today(d), points: { cash: 20, completeness: 20, correctness: 15, timeliness: 10, stock: 10 }, score: 75, details: {}, ...o });
  const own = { id: b.officerId, name: "Officer", role: "officer" };
  const other = { id: b.officerId === "U-OFF1" ? "U-OFF2" : "U-OFF1", name: "Other", role: "officer" };
  refuses(() => A.saveRating(d, other, r()), /officer assigned/);
  refuses(() => A.saveRating(d, ADMIN, r()), /officer assigned/);
  refuses(() => A.saveRating(d, own, r({ points: { cash: 99, completeness: 25, correctness: 20, timeliness: 15, stock: 15 }, score: 174 })), /0 to 25/);
  refuses(() => A.saveRating(d, own, r({ score: 90 })), /sum of the five/);
  A.saveRating(d, own, r({ id: "RFIRST" }));
  assert.equal(d.ratings.find((x) => x.id === "RFIRST").recheck.selected, true, "first rating always re-checked");
  refuses(() => A.saveRating(d, own, r()), /One Records Rating per period/);
  refuses(() => A.recordRecheck(d, own, "RFIRST", 70, "Visited again"), /different person/);
  A.recordRecheck(d, other, "RFIRST", 72, "Second visit by another officer");
});

// ---------------------------------------------------------------- Lending
test("lending: request, offer, acceptance, payout and instalments follow their order and consent", () => {
  const d = testWorld();
  const bz = { id: "U-TPDEMO-B01", role: "business", businessId: "TPDEMO-B01" };
  const ask = (id, o = {}) => A.requestLoan(d, bz, { id, businessId: "TPDEMO-B01", fiId: "FI-1", productId: "P-1", type: "working_capital", amount: 200000, purpose: "stock", frequency: "monthly", ...o });
  const offer = (id) => A.makeOffer(d, FI, id, { fiId: "FI-1", product: d.fis[0].products[0], principal: 200000, frequency: "monthly", instalments: 6 });
  refuses(() => ask("LN", { amount: -100000 }), /above zero/);
  ask("L1");
  refuses(() => ask("L2"), /already have an open loan request/);
  refuses(() => A.respondOffer(d, bz, "L1", true, "TPDEMO-B01-cash"), /no offer/);
  refuses(() => A.disburse(d, FI, "L1"), /Only an accepted offer/);
  A.setConsent(d, bz, "TPDEMO-B01", "FI-1", false);
  refuses(() => offer("L1"), /withdrawn consent/);
  A.setConsent(d, bz, "TPDEMO-B01", "FI-1", true);
  offer("L1");
  refuses(() => A.respondOffer(d, OFF, "L1", true, "TPDEMO-B01-cash"), /Only the business/);
  A.respondOffer(d, bz, "L1", true, "TPDEMO-B01-cash");
  A.setConsent(d, bz, "TPDEMO-B01", "FI-1", false);
  refuses(() => A.disburse(d, FI, "L1"), /withdrawn consent/);
  A.setConsent(d, bz, "TPDEMO-B01", "FI-1", true);
  A.disburse(d, FI, "L1");
  refuses(() => A.disburse(d, FI, "L1"), /Only an accepted offer/);
  assert.equal(d.entries.filter((e) => e.loanId === "L1" && e.kind === "loan_received").length, 1);
  const l = d.loans.find((x) => x.id === "L1");
  refuses(() => A.payInstalment(d, bz, "L1", l.schedule.length, "TPDEMO-B01-cash"), /Pay instalment 1 first/);
  refuses(() => A.declareExternalLoan(d, bz, { id: "X1", businessId: "TPDEMO-B01", lender: "Moneylender", balance: -500000, instalment: -10000, frequency: "monthly" }), /above zero/);
});

// ---------------------------------------------------------------- Profile changes
test("profile changes: fitting updates apply at once; contradicting ones wait for Data Admin", () => {
  const d = world();
  const r1 = A.changeProfile(d, B, "B1", { email: "neema@example.com", staffTotal: 3, closingTime: "18:00" });
  assert.deepEqual(r1.requested, []);
  assert.equal(d.businesses[0].closingTime, "18:00");
  const r2 = A.changeProfile(d, B, "B1", { businessName: "Neema Fresh Produce", region: "Arusha" }, { note: "Renamed and moved" });
  assert.deepEqual(r2.requested.sort(), ["businessName", "region"]);
  assert.equal(d.businesses[0].profile.businessName, "Neema Shop", "unchanged until approved");
  refuses(() => A.changeProfile(d, B, "B1", { phone: "0754000111" }), /code sent to it/);
  A.changeProfile(d, B, "B1", { phone: "0754000111" }, { phoneCodeOk: true });
  refuses(() => A.changeProfile(d, OFF, "B1", { email: "x@y.z" }), /Only the business/);
  const cr = d.changeRequests.find((c) => c.fields?.businessName);
  refuses(() => A.decideChange(d, OFF, cr.id, true, "ok"), /not allowed/);
  A.decideChange(d, ADMIN, cr.id, true, "Licence shows the new name");
  assert.equal(d.businesses[0].profile.businessName, "Neema Fresh Produce");
  const ph = d.changeRequests.find((c) => c.fields?.phone);
  A.decideChange(d, ADMIN, ph.id, true, "Owner called from the new number");
  assert.equal(d.users.find((u) => u.id === "UB1").login, "+255754000111");
});

test("owners: changing people or shares needs every owner's code, then Data Admin; identity is checked again", () => {
  const d = world();
  d.businesses[0].kyc = { status: "verified" };
  const owners = [owner({ sharePct: 70 }), owner({ id: "O2", name: "Juma Ali Mushi", phone: "+255713111222", nida: "19900101222220000222", dob: "1990-01-01", gender: "male", sharePct: 30, main: false })];
  refuses(() => A.changeProfile(d, B, "B1", { owners }), /must confirm/);
  A.changeProfile(d, B, "B1", { owners }, { ownersConfirmed: true });
  const cr = d.changeRequests.find((c) => c.fields?.owners);
  A.decideChange(d, ADMIN, cr.id, true, "Partnership deed seen");
  assert.equal(d.businesses[0].profile.owners.length, 2);
  assert.equal(d.businesses[0].kyc.status, "pending");
});

test("money accounts: added at once; starting balance and closure wait for Data Admin", () => {
  const d = world();
  const id = A.addChannel(d, B, "B1", { type: "bank", name: "NMB", number: "4321", openingBalance: 150000 });
  assert.ok(d.businesses[0].channels.some((c) => c.id === id));
  const t = today(d);
  assert.equal(channelBalances(d, "B1", t).find((x) => x.channel.id === id).balance, 0);
  const cr = d.changeRequests.find((c) => c.type === "channelOpening");
  A.decideChange(d, ADMIN, cr.id, true, "Bank statement seen");
  assert.equal(channelBalances(d, "B1", t).find((x) => x.channel.id === id).balance, 150000);
  A.requestCloseChannel(d, B, "B1", id);
  refuses(() => A.decideChange(d, ADMIN, d.changeRequests.find((c) => c.type === "closeChannel").id, true, "Owner asked"), /still holds/);
});

// ---------------------------------------------------------------- Staff and organisations
test("staff accounts: proposed by System Admin, approved by Super user; powerful roles need two approvers", () => {
  const d = world();
  refuses(() => A.proposeStaff(d, ADMIN, { id: "U-X", role: "officer", name: "X Y Z", login: "x@t.test", password: "longpass1" }), /not allowed/);
  A.proposeStaff(d, SYS, { id: "U-O3", role: "officer", name: "New Officer", login: "o3@t.test", password: "longpass1" });
  refuses(() => A.approveStaff(d, SYS, "U-O3", "Interviewed"), /Super user must approve first/);
  A.approveStaff(d, SUPER, "U-O3", "Interviewed and trained");
  assert.equal(d.users.find((u) => u.id === "U-O3").active, true);
  A.proposeStaff(d, SYS, { id: "U-S2", role: "systemAdmin", name: "Second Sys", login: "s2@t.test", password: "longpass1" });
  A.approveStaff(d, SUPER, "U-S2", "Board minute 12");
  assert.equal(d.users.find((u) => u.id === "U-S2").active, false, "one approval is not enough");
  refuses(() => A.approveStaff(d, SUPER, "U-S2", "again"), /already approved/);
  A.approveStaff(d, SUPER2, "U-S2", "Board minute 12, second signature");
  assert.equal(d.users.find((u) => u.id === "U-S2").active, true);
  refuses(() => A.proposeRoleChange(d, SYS, "U-SYS", "super", "promote me"), /own role/);
});

test("lenders and suppliers: Data Admin checks the licence, a different System Admin approves", () => {
  const d = world();
  A.registerOrg(d, null, "fi", { id: "FI-9", name: "New Bank", licence: "BOT-123", email: "nb@t.test", password: "longpass1" });
  refuses(() => A.decideOrg(d, SYS, "fi", "FI-9", true, "looks fine"), /check the licence first/);
  refuses(() => A.decideOrg(d, ADMIN, "fi", "FI-9", false, ""), /reason/);
  A.checkOrg(d, ADMIN, "fi", "FI-9", true, "Found on the BOT licensed list");
  refuses(() => A.decideOrg(d, ADMIN, "fi", "FI-9", true, "ok go"), /not allowed/);
  A.decideOrg(d, SYS, "fi", "FI-9", true, "Licence confirmed by Data Admin");
  assert.equal(d.fis.find((f) => f.id === "FI-9").status, "approved");
});

test("supplier quotes follow their steps; no negative prices", () => {
  const d = world();
  const SUP = { id: "U-SUP1", role: "supplier", orgId: "SUP-1" };
  A.requestQuote(d, B, { id: "Q1", supplierId: "SUP-1", item: "Fridge", requester: { type: "business", id: "B1" } });
  refuses(() => A.quoteStep(d, B, "Q1", "received"), /cannot be marked/);
  refuses(() => A.quoteStep(d, SUP, "Q1", "quoted", { quote: { unitPrice: -1, total: -40000 } }), /above zero/);
  A.quoteStep(d, SUP, "Q1", "quoted", { quote: { unitPrice: 400000, total: 400000 } });
  assert.equal(d.quoteRequests[0].status, "quoted");
});

// ---------------------------------------------------------------- Time zone and test data
test("business days follow Tanzania time, whatever the phone's zone", () => {
  assert.equal(tzDateOf(Date.UTC(2026, 9, 29, 22, 30)), "2026-10-30", "22:30 UTC is 01:30 next day in Tanzania");
  assert.equal(tzDateOf(tzMoment("2026-10-29", 17, 0)), "2026-10-29");
  assert.equal(new Date(tzMoment("2026-10-29", 17, 0)).getUTCHours(), 14);
});

test("test data loads with 4-digit PINs, valid NIDAs, verified identity, and still balances", () => {
  const d = testWorld();
  assert.equal(TEST_PIN.length, 4);
  assert.ok(d.users.filter((u) => u.testData).every((u) => u.pin === TEST_PIN));
  assert.ok(d.businesses.every((b) => b.kyc.status === "verified" && b.profile.owners[0].nida && validNida(b.profile.owners[0].nida)));
  assert.equal(A.pinSignIn(d, "0700001001", TEST_PIN).id, "U-TPDEMO-B01");
  for (const b of d.businesses) {
    const tb = trialBalance(d, b.id, today(d));
    assert.ok(Math.abs(tb.totalDebit - tb.totalCredit) < 0.01, b.id);
  }
});
