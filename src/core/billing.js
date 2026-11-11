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

// ---------------------------------------------------------------- What each business package gives (decided 11 Nov 2026)
// Recording, the daily close, on-screen reports, the credit passport, loan requests and supplier quotes stay free so
// every business can join; paid packages add things that save time or produce a document someone else asks for.
// The benefits are fixed here, in the rules, so a package always unlocks exactly what its card says.
export const FREE_BENEFITS = [
  { en: "Record money in and out by typing or voice, with no limit", sw: "Andika pesa zinazoingia na kutoka kwa kuandika au sauti, bila kikomo" },
  { en: "Close your day and see your reports on screen", sw: "Funga siku yako na uone ripoti zako kwenye skrini" },
  { en: "Credit passport, loan requests and supplier quotes", sw: "Pasipoti ya mkopo, maombi ya mkopo na nukuu za wasambazaji" },
  { en: "Help by WhatsApp, phone and questions", sw: "Msaada kwa WhatsApp, simu na maswali" }
];
export const FEATURES = {
  pdf: { en: "Download or print your statements as PDF", sw: "Pakua au chapisha taarifa zako kama PDF", note: { en: "Income statement, balance sheet and cash flow for a bank, TRA, a tender or a landlord", sw: "Taarifa ya mapato, mali na madeni, na mtiririko wa pesa kwa benki, TRA, zabuni au mwenye nyumba" } },
  upload: { en: "Upload bank and mobile money statements", sw: "Pakia taarifa za benki na pesa ya simu", note: { en: "The lines are read for you instead of typed one by one", sw: "Mistari inasomwa kwa ajili yako badala ya kuandikwa moja moja" } },
  trend: { en: "12-month trend and month comparison", sw: "Mwenendo wa miezi 12 na kulinganisha miezi", note: { en: "Sales, costs, profit and money at the end of each month", sw: "Mauzo, gharama, faida na pesa mwishoni mwa kila mwezi" } },
  analysis: { en: "Financial analysis: key ratios and trends", sw: "Uchambuzi wa fedha: uwiano muhimu na mwenendo", note: { en: "Margins, stock, customer and cash days, debt, growth, explained in plain words with what to do", sw: "Faida kwa mauzo, stoku, siku za wateja na pesa, madeni, ukuaji, kwa maneno rahisi na cha kufanya" } },
  team: { en: "Up to 3 staff sign-ins", sw: "Hadi wafanyakazi 3 kuingia" },
  fastCheck: { en: "Faster TijaPass check of your records", sw: "Ukaguzi wa haraka wa kumbukumbu zako na TijaPass", note: { en: "You move up the list to be checked; it never changes your rating", sw: "Unapanda kwenye orodha ya kukaguliwa; haibadilishi kiwango chako" } },
  prioritySupport: { en: "Priority support, answered the same day", sw: "Msaada wa kipaumbele, unajibiwa siku hiyohiyo" }
};
FEATURES.team.note = { en: "Each has their own phone and PIN and can record and close the day; only the owner changes the profile, money accounts, loans and packages", sw: "Kila mmoja ana simu na PIN yake na anaweza kuandika na kufunga siku; mmiliki pekee ndiye hubadilisha wasifu, akaunti za pesa, mikopo na vifurushi" };
// Short names for the package cards ("Everything in Basic, plus …").
const SHORT = { pdf: ["PDF statements", "taarifa za PDF"], upload: ["statement upload", "kupakia taarifa"], trend: ["the 12-month trend", "mwenendo wa miezi 12"], analysis: ["financial analysis", "uchambuzi wa fedha"], team: ["3 staff sign-ins", "wafanyakazi 3 kuingia"], fastCheck: ["a faster TijaPass check", "ukaguzi wa haraka wa TijaPass"], prioritySupport: ["priority support", "msaada wa kipaumbele"] };
for (const [k, [en, sw]] of Object.entries(SHORT)) FEATURES[k].short = { en, sw };
const PAID = ["pdf", "upload", "trend"];
export const PACKAGE_FEATURES = { basic: [], day: PAID, week: PAID, month: PAID, premium: [...PAID, "analysis", "team", "fastCheck", "prioritySupport"] };
export const TEAM_MAX = 3;

export const featuresOf = (packageId) => PACKAGE_FEATURES[packageId] || [];
export const hasFeature = (state, business, feature, todayISO) => !!business && featuresOf(activePackage(state, business, todayISO)).includes(feature);
// The cheapest package that gives a feature (for "Get a Day pass" or "See Premium").
export const cheapestWith = (state, feature) => (state.packages?.business || []).filter((p) => p.price > 0 && featuresOf(p.id).includes(feature)).sort((a, b) => a.price - b.price)[0] || null;
// The active subscription (to show its end date).
export function activeSubscription(state, business, todayISO) {
  const subs = (state.subscriptions || []).filter((s) => s.ownerId === business?.id && s.status === "active" && s.from <= todayISO && s.to >= todayISO);
  return subs[subs.length - 1] || null;
}
