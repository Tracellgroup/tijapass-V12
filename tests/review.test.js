// Issues found in the 9 Nov 2026 review (REG, PRO, OPN, REC, DAY, FIN, SUP, ADM, ORG, PKG, GEN) and the confirmed
// findings of the outside audit (VF-..). Each test shows the rules refuse the bad case on their own, without screens.
import assert from "node:assert/strict";
import test from "node:test";
import { balancesAt, channelBalance } from "../src/core/accounting.js";
import { isOnTime } from "../src/core/dailyClose.js";
import { computeKpis } from "../src/core/kpi.js";
import { nidaDob, typeNida, validEmail, validName } from "../src/core/people.js";
import { findDuplicate } from "../src/core/posting.js";
import { initialState } from "../src/core/seed.js";
import { addDays, today, tzMoment } from "../src/core/util.js";
import * as A from "../src/lib/actions.js";

const ADMIN = { id: "U-DATA", name: "Data Admin", role: "dataAdmin" };
const SYS = { id: "U-SYS", name: "System Admin", role: "systemAdmin" };
const SUPER = { id: "U-SUPER", name: "Super", role: "super" };
const SUPER2 = { id: "U-SUPER2", name: "Super 2", role: "super" };
const FI = { id: "U-FI1", name: "FI", role: "fi", orgId: "FI-1" };
const SUP = { id: "U-SUP1", name: "Sup", role: "supplier", orgId: "SUP-1" };
const B = { id: "UB1", name: "Neema", role: "business", businessId: "B1" };
const B2 = { id: "UB2", name: "Other", role: "business", businessId: "B2" };
const refuses = (fn, re) => assert.throws(fn, re);
const owner = (o = {}) => ({ id: "O1", name: "Neema Juma Mushi", phone: "+255712345678", nida: "19940512111110000121", dob: "1994-05-12", gender: "female", sharePct: 100, role: "owner", main: true, ...o });
const PROFILE = { businessName: "Neema Shop", legalForm: "sole", businessType: "shop", sector: "produce", region: "Dar es Salaam", address: "Kariakoo market, stall 12", owners: [owner()] };
const reg = (o = {}) => ({ id: "B1", userId: "UB1", pin: "4826", phoneVerified: true, channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }], baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["vicoba"], needFinance: "no" }, ...o, profile: { ...PROFILE, ...(o.profile || {}) } });
const OPEN = (channels, more = {}) => ({ channels, inventory: 0, receivables: 0, equipment: 0, groupSavings: 0, payables: 0, loansShort: 0, loansLong: 0, groupLoans: 0, ...more });
function world() {
  const d = initialState(today(null));
  A.createBusiness(d, null, reg());
  A.assignOfficer(d, ADMIN, "B1", "U-OFF1", "Same region");
  A.saveOpening(d, B, "B1", OPEN({ C1: 50000, C2: 20000 }), true);
  A.decideOpening(d, ADMIN, "B1", true, "Checked against stock and SMS");
  return d;
}
const E = (d, o) => ({ id: `E${Math.random()}`, businessId: "B1", date: today(d), kind: "sale_cash", amount: 1000, channelId: "C1", ...o });
const second = (d) => A.createBusiness(d, null, reg({ id: "B2", userId: "UB2", profile: { businessName: "Juma Hardware", owners: [owner({ id: "O9", name: "Juma Ali Hassan", phone: "+255713222333", nida: "19880303333330000333", dob: "1988-03-03", gender: "male" })] } }));

// ---------------------------------------------------------------- Registration and identity
test("REG-1/2, VF-01/03: NIDA is 20 digits only, typed as 8-5-5-2, and its birth date must match", () => {
  assert.equal(typeNida("1994051211111000012199999abc"), "19940512-11111-00001-21");
  assert.equal(nidaDob("19940512111110000121"), "1994-05-12");
  const d = initialState(today(null));
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ nida: "19850101111110000121" })] } })), /does not match the date of birth/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ nida: "19940512111110000121X" })] } })), /exactly 20 digits/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ nida: "1994051211111000012199" })] } })), /exactly 20 digits/);
  A.createBusiness(d, null, reg());
});

test("REG-3: the same NIDA on another business must be the same person", () => {
  const d = world();
  refuses(() => A.createBusiness(d, null, reg({ id: "B2", userId: "UB2", profile: { businessName: "Other", owners: [owner({ name: "Juma Ali", phone: "+255713000000", nida: "19940512111110000121" })] } })), /different name, birth date or gender/);
  A.createBusiness(d, null, reg({ id: "B2", userId: "UB2", profile: { businessName: "Neema Second Shop", owners: [owner({ name: "Mushi Neema Juma", phone: "+255713000000" })] } }));
});

test("REG-5/6/7, VF-15: shares 1-100%, ownership type fits the owners, real names, required details", () => {
  const d = initialState(today(null));
  const co = owner({ id: "O2", name: "Asha Ali Omari", phone: "+255713000001", nida: "", dob: "1990-01-01", main: false });
  refuses(() => A.createBusiness(d, null, reg({ profile: { legalForm: "partnership", owners: [owner(), { ...co, sharePct: 0 }] } })), /1% to 100%/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ sharePct: 50 }), { ...co, sharePct: 50 }] } })), /exactly one owner/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { legalForm: "partnership" } })), /at least two owners/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { legalForm: "company" } })), /BRELA/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ name: "N3ema Juma" })] } })), /letters only/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ name: "Neema" })] } })), /two names/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { legalForm: "" } })), /type of ownership/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { sector: "" } })), /sector/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { region: "Atlantis" } })), /region/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { address: "" } })), /address/);
  assert.equal(validName("Neema Juma"), true);
});

test("REG-8/9/13/16: email, staff counts, months operating, managers and guardians", () => {
  const d = initialState(today(null));
  assert.equal(validEmail("abc"), false);
  refuses(() => A.createBusiness(d, null, reg({ profile: { email: "abc" } })), /email/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { staffTotal: 2, staffWomen: 9 } })), /cannot be more than the total/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { monthsOperating: 9999 } })), /0 to 600/);
  refuses(() => A.createBusiness(d, null, reg({ profile: { management: { managedBy: "manager", managers: [{ name: "Ali Said", phone: "+255712345678" }] } } })), /not an owner's/);
  const teen = `${Number(today(null).slice(0, 4)) - 15}-01-15`;
  refuses(() => A.createBusiness(d, null, reg({ profile: { owners: [owner({ dob: teen, nida: "", guardianName: "Mama Juma", guardianPhone: "+255712345678" })] } })), /their own phone/);
});

test("REG-10/11/12, VF-17: joining answers match the accounts; wallet and bank numbers; no duplicates", () => {
  const d = initialState(today(null));
  refuses(() => A.createBusiness(d, null, reg({ channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C3", type: "bank", name: "CRDB Bank" }] })), /No bank account/);
  refuses(() => A.createBusiness(d, null, reg({ baseline: { bank: "none", mobile: "none", borrowed: "never", sources: ["vicoba"], needFinance: "no" } })), /mobile money/);
  refuses(() => A.createBusiness(d, null, reg({ baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["none", "vicoba"], needFinance: "no" } })), /"None"/);
  refuses(() => A.createBusiness(d, null, reg({ channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa", number: "12" }] })), /phone number/);
  refuses(() => A.createBusiness(d, null, reg({ channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }, { id: "C3", type: "mobile", name: "M-Pesa" }] })), /give each one its number/);
  const w = world();
  refuses(() => A.addChannel(w, B, "B1", { type: "bank", name: "NMB Bank", number: "12345" }), /exactly the last 4 digits/);
  A.addChannel(w, B, "B1", { type: "bank", name: "NMB Bank", number: "4321" });
  refuses(() => A.addChannel(w, B, "B1", { type: "bank", name: "NMB Bank", number: "4321" }), /listed twice/);
});

test("ADM-F: identity is verified only when NIDA, photos and co-owners are complete", () => {
  const d = world();
  refuses(() => A.verifyIdentity(d, ADMIN, "B1", true, "looks right"), /main owner's photo/);
  d.businesses[0].profile.owners[0].nida = "";
  assert.ok(A.identityMissing(d.businesses[0]).includes("a NIDA number for every owner"));
});

// ---------------------------------------------------------------- Profile, accounts, starting position
test("PRO-4/VF-06: a new account's balance is counted once, never also in the starting position", () => {
  const d = initialState(today(null));
  A.createBusiness(d, null, reg());
  refuses(() => A.addChannel(d, B, "B1", { type: "bank", name: "CRDB Bank", openingBalance: 100000 }), /enter its balance in your Starting position/);
  const id = A.addChannel(d, B, "B1", { type: "bank", name: "CRDB Bank" });
  A.saveOpening(d, B, "B1", OPEN({ C1: 1000, C2: 0, [id]: 100000 }), true);
  assert.equal(channelBalance(d, "B1", id, today(d)), 100000);
  const id2 = A.addChannel(d, B, "B1", { type: "bank", name: "NMB Bank", openingBalance: 50000 });
  refuses(() => A.saveOpening(d, B, "B1", OPEN({ C1: 1000, C2: 0, [id]: 100000, [id2]: 50000 }), true), /sent separately/);
  assert.equal(channelBalance(d, "B1", id2, today(d)), 50000);
});

test("PRO-5/6/7: closing needs an empty account; one pending request per detail; months need approval", () => {
  const d = world();
  refuses(() => A.requestCloseChannel(d, B, "B1", "C2"), /still holds TZS 20,000/);
  A.changeProfile(d, B, "B1", { businessName: "A Shop" });
  refuses(() => A.changeProfile(d, B, "B1", { businessName: "B Shop" }), /already waiting/);
  const r = A.changeProfile(d, B, "B1", { monthsOperating: 1 });
  assert.deepEqual(r.requested, ["monthsOperating"]);
  refuses(() => A.changeProfile(d, B, "B1", { address: "" }), /address/);
  refuses(() => A.changeProfile(d, B, "B1", { email: "abc" }), /email/);
});

test("OPN-2/3, VF-05/07: drafts never count, every box answered, Data Admin edits checked too", () => {
  const d = initialState(today(null));
  A.createBusiness(d, null, reg());
  A.saveOpening(d, B, "B1", { channels: { C1: 70000 } }, false);
  assert.equal(channelBalance(d, "B1", "C1", today(d)), 0, "a draft is not in the books");
  refuses(() => A.saveOpening(d, B, "B1", { channels: { C1: 70000 } }, true), /Answer every box/);
  refuses(() => A.saveOpening(d, B, "B1", OPEN({ C1: 1, C2: 1 }, { cars: 5 }), true), /Unknown/);
  const w = world();
  refuses(() => A.adminEditOpening(w, ADMIN, "B1", OPEN({ C1: 1, C2: 1 }, { inventory: -500000 }), "correction made"), /negative/);
});

// ---------------------------------------------------------------- Recording, transfers, close
test("REC-A/B, VF-04: money out or moved above the balance is refused, and Admin cannot approve it either", () => {
  const d = world();
  refuses(() => A.addEntry(d, B, E(d, { kind: "transfer", channelId: "C2", toChannelId: "C1", amount: 20001 })), /only TZS 20,000 available/);
  A.addEntry(d, B, E(d, { kind: "transfer", channelId: "C2", toChannelId: "C1", amount: 20000 }));
  assert.equal(channelBalance(d, "B1", "C2", today(d)), 0);
  refuses(() => A.addEntry(d, B, E(d, { kind: "rent", amount: 400000 })), /available/);
  // A held entry (duplicate) whose money is no longer there cannot be pushed through by Data Admin.
  A.addEntry(d, B, E(d, { kind: "rent", amount: 60000, reference: "RC12345" }));
  const ev = A.addEntry(d, B, E(d, { id: "DUP", kind: "rent", amount: 10000, reference: "RC12345" }));
  assert.deepEqual(ev.reasons, ["duplicate"]);
  A.addEntry(d, B, E(d, { kind: "drawings", amount: 10000 }));
  refuses(() => A.decideHeld(d, ADMIN, "DUP", "approve", { reason: "Owner says it is real" }), /Cannot post/);
});

test("REC-C: a back-dated payment cannot make a later day negative", () => {
  const d = world();
  d.businesses[0].startDate = addDays(today(d), -3);
  d.businesses[0].opening.date = d.businesses[0].startDate;
  A.addEntry(d, B, E(d, { kind: "drawings", amount: 45000 }));
  refuses(() => A.addEntry(d, B, E(d, { kind: "rent", amount: 40000, date: addDays(today(d), -1) })), /from .* to today/);
});

test("REC-D/DAY-D: nobody pays back more than is owed", () => {
  const d = world();
  refuses(() => A.addEntry(d, B, E(d, { kind: "debtor_receipt", amount: 30000 })), /no customer owes|nothing that customers owe you/i);
  refuses(() => A.addEntry(d, B, E(d, { kind: "supplier_payment", amount: 10000 })), /you owe suppliers/);
  refuses(() => A.addEntry(d, B, E(d, { kind: "loan_repayment", amount: 10000 })), /Record the loan first/);
  A.addEntry(d, B, E(d, { kind: "sale_credit", amount: 30000, channelId: null }));
  refuses(() => A.addEntry(d, B, E(d, { kind: "debtor_receipt", amount: 30001 })), /only TZS 30,000/);
  A.addEntry(d, B, E(d, { kind: "debtor_receipt", amount: 30000 }));
  assert.equal(balancesAt(d, "B1", today(d)).receivables || 0, 0);
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: today(d), to: today(d), counts: { C1: 100000, C2: 20000 }, reasons: [{ kind: "debtor_receipt", amount: 20000, channelId: "C1" }] }), /Customers owe you only TZS 0/);
});

test("REC-F/H/I, VF-12: amount cap, real references only, text limits, own business only", () => {
  const d = world();
  refuses(() => A.addEntry(d, B, E(d, { kind: "capital", amount: 12345678901234567 })), /too large/);
  A.addEntry(d, B, E(d, { reference: "cash" }));
  assert.equal(findDuplicate(d, E(d, { reference: "cash" })), null, "words are not transaction codes");
  refuses(() => A.addEntry(d, B, E(d, { payer: "x".repeat(61) })), /too long/);
  second(d);
  refuses(() => A.addEntry(d, B2, E(d, {})), /only for your own business/);
});

test("DAY-B/E: on-time uses Tanzania time; close reasons are checked", () => {
  const t = "2026-11-08";
  assert.equal(isOnTime(t, new Date(tzMoment("2026-11-09", 8, 59)).toISOString()), true);
  assert.equal(isOnTime(t, new Date(tzMoment("2026-11-09", 11, 30)).toISOString()), false);
  const d = world();
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: today(d), to: today(d), counts: { C1: 60000, C2: 20000 }, reasons: [{ kind: "loss", amount: 10000, channelId: "C1" }] }), /from the list/);
  refuses(() => A.closeDay(d, B, { businessId: "B1", from: today(d), to: today(d), counts: { C1: 60000, C2: 20000 }, reasons: [{ kind: "capital", amount: 15000, channelId: "C1" }] }), /more than the difference/);
});

// ---------------------------------------------------------------- Loans, quotes
test("FIN-A/B/C/E: product limits, withdrawing a request, outside loans, expired quotes", () => {
  const d = world();
  const fi = d.fis[0];
  d.businesses[0].consent.fis[fi.id] = { granted: true };
  const p = fi.products[0];
  refuses(() => A.requestLoan(d, B, { id: "L1", businessId: "B1", fiId: fi.id, productId: p.id, amount: p.max + 1, purpose: "stock" }), /This product lends/);
  A.requestLoan(d, B, { id: "L1", businessId: "B1", fiId: fi.id, productId: p.id, amount: p.min, purpose: "stock", frequency: p.frequencies[0] });
  A.withdrawLoan(d, B, "L1");
  assert.equal(d.loans[0].status, "withdrawn");
  refuses(() => A.declareExternalLoan(d, B, { id: "X1", businessId: "B1", lender: "Bank", balance: 10000, instalment: 90000, remaining: 3, nextDue: today(d) }), /cannot be more than the amount still owed/);
  d.quoteRequests.push({ id: "Q1", supplierId: "SUP-1", status: "quoted", quote: { total: 100000, validUntil: addDays(today(d), -1) }, requester: { type: "business", id: "B1" }, history: [] });
  refuses(() => A.quoteStep(d, B, "Q1", "accepted"), /expired/);
});

test("FIN-F: lender products are checked", () => {
  const d = world();
  const base = { name: "Biashara Loan", type: "working_capital", annualRate: 24, feePct: 2, feeFixed: 0, min: 100000, max: 3000000, frequencies: ["monthly"], maxInstalments: 12, active: true };
  refuses(() => A.saveProduct(d, FI, "FI-1", { ...base, annualRate: 500 }), /0% to 100%/);
  refuses(() => A.saveProduct(d, FI, "FI-1", { ...base, min: 0 }), /at least TZS 10,000/);
  refuses(() => A.saveProduct(d, FI, "FI-1", { ...base, maxInstalments: 0 }), /1 to 60/);
  refuses(() => A.saveProduct(d, { ...FI, orgId: "FI-2" }, "FI-1", base), /own products/);
  A.saveProduct(d, FI, "FI-1", base);
});

test("SUP-A/B, VF-18: each quote step belongs to one side; requests are checked", () => {
  const d = world();
  refuses(() => A.requestQuote(d, null, { id: "Q0", supplierId: "SUP-1", item: "Fridge", qty: 1, requester: { type: "business", id: "B1" } }), /own business/);
  refuses(() => A.requestQuote(d, B, { id: "Q0", supplierId: "SUP-1", item: "Fridge", qty: 99999, requester: { type: "business", id: "B1" } }), /1 to 10,000/);
  A.requestQuote(d, B, { id: "Q1", supplierId: "SUP-1", item: "Fridge", qty: 1, requester: { type: "business", id: "B1" } });
  refuses(() => A.quoteStep(d, B, "Q1", "quoted", { quote: { total: 1000 } }), /Only the supplier/);
  A.quoteStep(d, SUP, "Q1", "quoted", { quote: { unitPrice: 400000, total: 400000, validUntil: addDays(today(d), 7) } });
  refuses(() => A.quoteStep(d, SUP, "Q1", "accepted"), /one who asked/);
  A.quoteStep(d, B, "Q1", "accepted");
});

// ---------------------------------------------------------------- Admin, roles, settings, sign-up, packages
test("ADM-A, VF-13/14: consent, baseline, disputes, queries, quarterly answers by the right person only", () => {
  const d = world();
  second(d);
  refuses(() => A.setConsent(d, B2, "B1", "FI-1", true), /Only the business/);
  refuses(() => A.correctBaseline(d, B, "B1", "bank", "used", "x"), /not allowed/);
  d.ratings.push({ id: "R1", businessId: "B1", score: 80, status: "final", date: today(d) });
  refuses(() => A.disputeRating(d, B2, "R1", "This is not right at all"), /own rating/);
  refuses(() => A.disputeRating(d, B, "R1", "no"), /reason/);
  A.disputeRating(d, B, "R1", "The officer counted the wrong drawer");
  refuses(() => A.disputeRating(d, B, "R1", "The officer counted the wrong drawer"), /already disputed/);
  d.queries.push({ id: "Q1", by: { id: "UB1" }, status: "open" });
  refuses(() => A.answerQuery(d, B2, "Q1", "anything"), /not allowed/);
  refuses(() => A.saveQuarterly(d, B2, { businessId: "B1", outsideLoan: "no", needFinance: "no" }), /its own check-in/);
});

test("ADM-B/C/D/E, D6: staff roles only; settings and prices need a second person; reversals once; evidence kept", () => {
  const d = world();
  refuses(() => A.proposeRoleChange(d, SYS, "UB1", "super", "test reason"), /staff accounts/);
  const s = { ...d.settings, scoreWeights: { ...d.settings.scoreWeights, first: { ...d.settings.scoreWeights.first, kyc: 50 } } };
  refuses(() => A.proposeConfig(d, SYS, "settings", s, "more weight on KYC"), /add up to 100/);
  A.proposeConfig(d, SYS, "settings", { ...d.settings, disputeDays: 10 }, "Owners asked for more time");
  assert.equal(d.settings.disputeDays, 7, "not applied until approved");
  refuses(() => A.decideConfig(d, SYS, d.pendingConfig[0].id, true, "ok ok"), /Super user approves/);
  A.decideConfig(d, SUPER, d.pendingConfig[0].id, true, "Agreed at the meeting");
  assert.equal(d.settings.disputeDays, 10);
  A.proposeConfig(d, SUPER, "prices", { ...structuredClone(d.packages), fees: d.settings.fiFees }, "Same prices, check flow");
  refuses(() => A.decideConfig(d, SUPER, d.pendingConfig[0].id, true, "self approve"), /proposed this/);
  A.decideConfig(d, SUPER2, d.pendingConfig[0].id, true, "Checked");
  A.addEntry(d, B, E(d, { id: "EX" }));
  A.reverseEntry(d, ADMIN, "EX", "wrong entry");
  refuses(() => A.reverseEntry(d, ADMIN, "EX", "wrong entry again"), /already reversed/);
  A.addEntry(d, B, E(d, { id: "EY", source: "ready" }));
  A.changeTreatment(d, ADMIN, "EY", "other_income", "was not a sale");
  assert.equal(d.entries.find((e) => e.correctionOf === "EY").evidence, "declared");
});

test("ORG-A/B/C: unique sign-in emails; organisations wait for approval before signing in", () => {
  const d = world();
  refuses(() => A.registerOrg(d, null, "supplier", { id: "S9", name: "Dup Supplies", licence: "LIC-9", phone: "0712000111", email: "dataadmin@tijapass.test", password: "longpass1" }), /already used/);
  refuses(() => A.registerOrg(d, null, "fi", { id: "F9", name: "New FI", licence: "BOT-9", phone: "0712000111", email: "new@fi.test", password: "short" }), /8 characters/);
  A.registerOrg(d, null, "fi", { id: "F9", name: "New FI", licence: "BOT-9", phone: "0712000111", email: "new@fi.test", password: "longpass1" });
  assert.match(A.passwordSignIn(d, "new@fi.test", "longpass1").error, /waiting for approval/);
  A.checkOrg(d, ADMIN, "fi", "F9", true, "Licence on the BOT list");
  A.decideOrg(d, { id: "U-SYS", name: "Sys", role: "systemAdmin" }, "fi", "F9", true, "Licence confirmed");
  assert.ok(A.passwordSignIn(d, "new@fi.test", "longpass1").id);
});

test("PKG-A: a new package starts when the current one ends", () => {
  const d = world();
  A.payPackage(d, B, { ownerId: "B1", packageId: "month", method: "mobile", outcome: "success", reference: "R1" });
  A.payPackage(d, B, { ownerId: "B1", packageId: "week", method: "mobile", outcome: "success", reference: "R2" });
  const [m, w] = d.subscriptions.filter((x) => x.ownerId === "B1");
  assert.equal(w.from, addDays(m.to, 1));
});

test("VF-19: BOT report amounts from fewer than the minimum number of loans are hidden", () => {
  const d = world();
  d.settings.minGroupSize = 1;
  d.loans.push({ id: "L1", businessId: "B1", status: "requested", amount: 777000, requestedAt: `${today(d)}T08:00:00Z`, history: [] });
  const k = computeKpis(d, {}, today(d));
  assert.equal(k.k4.requested, null);
});
