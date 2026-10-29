// Packages and payments (PKG-01 to PKG-06) and FI assessment billing (FIW-05).
import { round, yearsBetween } from "./util.js";

export const annualFromMonthly = (monthly, discountPct = 10) => round(monthly * 12 * (1 - discountPct / 100));

// Sponsor discount for a given FI on a given date (PKG-04). Year 1 = first 12 months after joining.
export function sponsorDiscountPct(state, fi, todayISO) {
  const tier = state.packages.sponsorTiers.find((t) => t.id === (fi.sponsorTier || "standard"));
  if (!tier) return 0;
  const yearIndex = yearsBetween(fi.joinedAt || todayISO, todayISO) + 1;
  if (yearIndex <= 1) return tier.year1;
  if (yearIndex <= 3) return tier.years23;
  return 0;
}

export function fiPackage(state, fi) {
  return state.packages.fi.find((p) => p.id === fi.packageId) || null;
}

export function assessmentFee(state, fi, todayISO) {
  const pkg = fiPackage(state, fi);
  if (!pkg) return 0;
  return round(pkg.perAssessment * (1 - sponsorDiscountPct(state, fi, todayISO) / 100));
}

// One assessment per FI per business per day (an FI reopening the same business the same day is not billed twice).
export function needsAssessment(state, fiId, businessId, todayISO) {
  return !(state.assessments || []).some((a) => a.fiId === fiId && a.businessId === businessId && a.date === todayISO);
}

export function fiBill(state, fi, monthKeyStr, todayISO) {
  const pkg = fiPackage(state, fi);
  const discount = sponsorDiscountPct(state, fi, todayISO);
  const subscriptionFull = !pkg ? 0 : fi.billing === "annual" ? round(pkg.annual / 12) : pkg.monthly;
  const subscription = round(subscriptionFull * (1 - discount / 100));
  const assessments = (state.assessments || []).filter((a) => a.fiId === fi.id && a.date.startsWith(monthKeyStr));
  const assessmentTotal = assessments.reduce((t, a) => t + a.fee, 0);
  // Optional services, off unless System Admin switches them on after partner agreement.
  const fees = state.settings.fiFees || {};
  const mine = (state.loans || []).filter((l) => l.fiId === fi.id);
  const disbursements = fees.disbursementOn ? mine.filter((l) => l.disbursedAt && l.disbursedAt.startsWith(monthKeyStr)).map((l) => ({ loanId: l.id, businessId: l.businessId, amount: l.offer.principal, fee: round((l.offer.principal * fees.disbursementPct) / 100) })) : [];
  const collections = fees.collectionOn ? mine.flatMap((l) => (l.schedule || []).filter((i) => i.paidAt && i.paidAt.startsWith(monthKeyStr)).map((i) => ({ loanId: l.id, businessId: l.businessId, n: i.n, amount: i.amount, fee: round((i.amount * fees.collectionPct) / 100) }))) : [];
  const disbursementTotal = disbursements.reduce((t, x) => t + x.fee, 0);
  const collectionTotal = collections.reduce((t, x) => t + x.fee, 0);
  return { pkg, discount, subscriptionFull, subscription, assessments, assessmentTotal, disbursements, disbursementTotal, collections, collectionTotal, total: subscription + assessmentTotal + disbursementTotal + collectionTotal };
}

export function sponsorCounts(state) {
  const c = { vip: 0, partner: 0 };
  for (const fi of state.fis || []) if (c[fi.sponsorTier] != null) c[fi.sponsorTier]++;
  return c;
}

export function canAssignTier(state, fi, tierId) {
  if (tierId === "standard") return true;
  const tier = state.packages.sponsorTiers.find((t) => t.id === tierId);
  const counts = sponsorCounts(state);
  const already = fi.sponsorTier === tierId ? 1 : 0;
  return counts[tierId] - already < tier.max;
}

// Business package active on a date (PKG-02). Basic is always active.
export function activePackage(state, business, todayISO) {
  const subs = (state.subscriptions || []).filter((s) => s.ownerId === business.id && s.status === "active" && s.from <= todayISO && s.to >= todayISO);
  return subs.length ? subs[subs.length - 1].packageId : "basic";
}
