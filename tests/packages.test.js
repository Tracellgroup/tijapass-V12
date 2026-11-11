// Business package benefits (decided 11 Nov 2026): each package unlocks exactly what its card says, enforced by the rules.
import assert from "node:assert/strict";
import test from "node:test";
import { keyRatios, monthlySeries, trendFindings } from "../src/core/analysis.js";
import { PACKAGE_FEATURES, TEAM_MAX, activePackage, hasFeature } from "../src/core/billing.js";
import { initialState } from "../src/core/seed.js";
import { verifyQueue } from "../src/core/verify.js";
import { addDays, today } from "../src/core/util.js";
import * as A from "../src/lib/actions.js";
import { MEMBER_ROUTES, menuFor, routeAllowedFor } from "../src/ui/menus.js";

const ADMIN = { id: "U-DATA", name: "Data Admin", role: "dataAdmin" };
const SYS = { id: "U-SYS", name: "System Admin", role: "systemAdmin" };
const B = { id: "UB1", name: "Neema", role: "business", businessId: "B1" };
const refuses = (fn, re) => assert.throws(fn, re);
const owner = { id: "O1", name: "Neema Juma Mushi", phone: "+255712345678", nida: "19940512111110000121", dob: "1994-05-12", gender: "female", sharePct: 100, role: "owner", main: true };
const PROFILE = { businessName: "Neema Shop", legalForm: "sole", businessType: "shop", sector: "produce", region: "Dar es Salaam", address: "Kariakoo market, stall 12", owners: [owner] };
const OPEN = { channels: { C1: 50000, C2: 20000 }, inventory: 0, receivables: 0, equipment: 0, groupSavings: 0, payables: 0, loansShort: 0, loansLong: 0, groupLoans: 0 };
function world() {
  const d = initialState(today(null));
  A.createBusiness(d, null, { id: "B1", userId: "UB1", pin: "4826", phoneVerified: true, channels: [{ id: "C1", type: "cash", name: "Cash" }, { id: "C2", type: "mobile", name: "M-Pesa" }], baseline: { bank: "none", mobile: "personal", borrowed: "never", sources: ["vicoba"], needFinance: "no" }, profile: PROFILE });
  A.assignOfficer(d, ADMIN, "B1", "U-OFF1", "Same region");
  A.saveOpening(d, B, "B1", OPEN, true);
  return d;
}
const pay = (d, packageId, ref = `R-${packageId}-${Math.random()}`) => A.payPackage(d, B, { ownerId: "B1", packageId, method: "mobile", outcome: "success", reference: ref });
const biz = (d) => d.businesses.find((b) => b.id === "B1");
const E = (d, o) => ({ id: `E${Math.random()}`, businessId: "B1", date: today(d), kind: "sale_cash", amount: 1000, channelId: "C1", ...o });

test("PKG-02: Basic gives no paid benefit; Day, Week and Month give PDF, upload and trend; Premium adds the rest", () => {
  assert.deepEqual(PACKAGE_FEATURES.basic, []);
  for (const p of ["day", "week", "month"]) assert.deepEqual(PACKAGE_FEATURES[p], ["pdf", "upload", "trend"]);
  assert.deepEqual(PACKAGE_FEATURES.premium, ["pdf", "upload", "trend", "analysis", "team", "fastCheck", "prioritySupport"]);
  const d = world();
  const t = today(d);
  assert.equal(hasFeature(d, biz(d), "pdf", t), false);
  pay(d, "day");
  assert.equal(activePackage(d, biz(d), t), "day");
  assert.equal(hasFeature(d, biz(d), "pdf", t), true);
  assert.equal(hasFeature(d, biz(d), "analysis", t), false);
  // A Day pass ends after one day: back to Basic.
  assert.equal(hasFeature(d, biz(d), "pdf", addDays(t, 1)), false);
});

test("PKG-05: a failed payment unlocks nothing", () => {
  const d = world();
  assert.equal(A.payPackage(d, B, { ownerId: "B1", packageId: "premium", method: "mobile", outcome: "failed", reference: "R1" }), "failed");
  assert.equal(hasFeature(d, biz(d), "team", today(d)), false);
});

test("Statement upload needs Day pass or more; typing stays free; earlier upload lines can still be explained", () => {
  const d = world();
  refuses(() => A.addEntry(d, B, E(d, { source: "import", importId: "I1" })), /paid packages/);
  A.addEntry(d, B, E(d, { source: "typed" }));
  A.addEntry(d, B, E(d, { source: "import", importId: "I1", importLineId: "L1", amount: 1200 }));
  pay(d, "day");
  A.addEntry(d, B, E(d, { source: "import", importId: "I2", amount: 1300 }));
});

test("Staff sign-ins: Premium only, up to 3, own phone, record and close only, paused when Premium ends", () => {
  const d = world();
  refuses(() => A.addMember(d, B, "B1", { name: "Asha Ali Omari", phone: "0713000001" }), /part of Premium/);
  pay(d, "premium");
  refuses(() => A.addMember(d, B, "B1", { name: "Asha", phone: "0713000001" }), /first and last name/);
  refuses(() => A.addMember(d, B, "B1", { name: "Asha Ali Omari", phone: "0712345678" }), /owner's phone/);
  const id = A.addMember(d, B, "B1", { name: "Asha Ali Omari", phone: "0713000001" });
  refuses(() => A.addMember(d, B, "B1", { name: "Juma Ali Hassan", phone: "0713000001" }), /already registered/);
  A.addMember(d, B, "B1", { name: "Juma Ali Hassan", phone: "0713000002" });
  A.addMember(d, B, "B1", { name: "Rehema Musa Said", phone: "0713000003" });
  refuses(() => A.addMember(d, B, "B1", { name: "Peter John Mrema", phone: "0713000004" }), new RegExp(`up to ${TEAM_MAX}`));
  const staff = d.users.find((u) => u.id === id);
  // First sign-in: set a PIN with the phone code.
  assert.match(A.pinSignIn(d, "0713000001", "4826").error, /Set your PIN first/);
  A.resetPinWithCode(d, "0713000001", "4826", true);
  assert.equal(A.pinSignIn(d, "0713000001", "4826").id, id);
  // Staff record and close the day, but cannot touch owner things.
  A.addEntry(d, staff, E(d, { amount: 2500 }));
  assert.equal(d.entries.at(-1).createdBy.name, "Asha Ali Omari");
  refuses(() => A.changeProfile(d, staff, "B1", { email: "x@y.co.tz" }), /Only the business owner/);
  refuses(() => A.payPackage(d, staff, { ownerId: "B1", packageId: "day", method: "mobile", outcome: "success", reference: "S1" }), /Only the business owner/);
  refuses(() => A.addMember(d, staff, "B1", { name: "Peter John Mrema", phone: "0713000009" }), /Only the business owner/);
  refuses(() => A.requestLoan(d, staff, { businessId: "B1" }), /Only the business owner/);
  // Menus: record, activity, close, help; reports only when allowed.
  assert.deepEqual(menuFor(staff).map((m) => m.id), ["home", "record", "activity", "help"]);
  assert.equal(routeAllowedFor(staff, "finance"), false);
  assert.equal(routeAllowedFor(staff, "close"), true);
  A.updateMember(d, B, id, { reports: true });
  assert.ok(menuFor(d.users.find((u) => u.id === id)).some((m) => m.id === "reports"));
  assert.ok(MEMBER_ROUTES.includes("close"));
  // Premium ends: staff sign-in and recording pause; nothing is deleted.
  for (const s of d.subscriptions) s.to = addDays(today(d), -1);
  assert.match(A.pinSignIn(d, "0713000001", "4826").error, /Premium package has ended/);
  refuses(() => A.addEntry(d, staff, E(d, { amount: 2600 })), /Premium package has ended/);
  assert.ok(d.entries.some((e) => e.amount === 2500));
  // The owner removes a member.
  A.removeMember(d, B, id);
  assert.equal(A.teamOf(d, "B1").length, 2);
});

test("Faster check: Premium moves a business up the To verify list", () => {
  const d = world();
  const t = today(d);
  const before = verifyQueue(d, ADMIN, t).rows.find((r) => r.business.id === "B1");
  pay(d, "premium");
  const after = verifyQueue(d, ADMIN, t).rows.find((r) => r.business.id === "B1");
  assert.ok(after.signals.includes("premium"));
  assert.equal(after.priority - before.priority, 40);
});

test("Priority support: Premium questions are marked to answer first", () => {
  const d = world();
  A.createQuery(d, B, { id: "Q1", topic: "Help", businessId: "B1" });
  pay(d, "premium");
  A.createQuery(d, B, { id: "Q2", topic: "Help", businessId: "B1" });
  assert.equal(d.queries.find((q) => q.id === "Q1").priority, false);
  assert.equal(d.queries.find((q) => q.id === "Q2").priority, true);
});

test("Prices: packages cannot be added or removed, Basic stays free, paid ones cost more than zero", () => {
  const d = world();
  const v = structuredClone(d.packages);
  refuses(() => A.proposeConfig(d, SYS, "prices", { ...v, business: v.business.slice(1) }, "Drop basic package"), /cannot be added or removed/);
  refuses(() => A.proposeConfig(d, SYS, "prices", { ...v, business: v.business.map((p) => (p.id === "basic" ? { ...p, price: 100 } : p)) }, "Charge for basic"), /Basic stays free/);
  refuses(() => A.proposeConfig(d, SYS, "prices", { ...v, business: v.business.map((p) => (p.id === "day" ? { ...p, price: 0 } : p)) }, "Free day pass"), /above zero/);
  A.proposeConfig(d, SYS, "prices", { ...v, business: v.business.map((p) => (p.id === "day" ? { ...p, price: 700 } : p)) }, "New day price");
});

test("Analysis: 12-month series, key ratios and plain findings come from the records", () => {
  const d = world();
  const b = biz(d);
  b.startDate = addDays(today(d), -100);
  const t = today(d);
  // Three months of sales and costs, falling sales in the latest months.
  for (let i = 95; i >= 1; i -= 1) {
    const date = addDays(t, -i);
    d.entries.push({ id: `S${i}`, businessId: "B1", date, kind: "sale_cash", amount: i > 45 ? 20000 : 12000, channelId: "C1", status: "posted", source: "typed" });
    d.entries.push({ id: `X${i}`, businessId: "B1", date, kind: "transport", amount: 3000, channelId: "C1", status: "posted", source: "typed" });
  }
  const s = monthlySeries(d, "B1", t);
  assert.ok(s.length >= 3 && s.length <= 5);
  assert.ok(s.at(-1).partial || s.at(-1).to === t);
  const kr = keyRatios(d, "B1", t);
  const nm = kr.ratios.find((r) => r.id === "netMargin");
  assert.ok(nm && nm.value > 0 && nm.value < 1);
  assert.ok(kr.ratios.find((r) => r.id === "debt"));
  const f = trendFindings(s);
  assert.ok(f.every((x) => x.en && x.sw));
});
