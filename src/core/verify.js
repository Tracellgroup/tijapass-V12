// "To verify" list (decided 9 Nov 2026). With a million businesses, TijaPass cannot visit or approve each one
// before it starts. Businesses work at once with figures marked "not verified"; Data Admin, Super users and
// officers see how many are not verified and which to check first: those who asked for a check or want a loan.
import { ownersOf } from "./people.js";
import { daysBetween } from "./util.js";

// What still needs checking for one business.
export function verifyNeeds(state, b) {
  const out = [];
  if (b.opening?.status === "submitted") out.push(b.opening.returned ? "openingReturned" : "opening");
  if (!b.opening || b.opening.status === "draft") out.push("noOpening");
  if (b.kyc?.status !== "verified") out.push("identity");
  if (ownersOf(b.profile).some((o) => o.confirmed === false)) out.push("coOwners");
  const accounts = (state.changeRequests || []).filter((c) => c.businessId === b.id && c.type === "channelOpening" && c.status === "pending").length;
  if (accounts) out.push("accounts");
  if (!(state.ratings || []).some((r) => r.businessId === b.id && r.status !== "void")) out.push("neverRated");
  return out;
}

// Why a business should be checked first, strongest first. Weights add up to its priority.
export const SIGNALS = {
  askedCheck: { weight: 100, en: "Asked for a check", sw: "Ameomba ukaguzi" },
  loanRequest: { weight: 80, en: "Has a loan request", sw: "Ana ombi la mkopo" },
  lenderConsent: { weight: 50, en: "Shared records with a lender", sw: "Ameshiriki kumbukumbu na mkopeshaji" },
  needsFinance: { weight: 30, en: "Said they need finance", sw: "Amesema anahitaji mkopo" },
  bigPosition: { weight: 10, en: "Large starting position", sw: "Hali kubwa ya kuanzia" }
};
const LOAN_OPEN = ["requested", "offered", "accepted"];

export function verifySignals(state, b) {
  const out = [];
  if (b.checkRequest && !b.checkRequest.doneAt) out.push("askedCheck");
  if ((state.loans || []).some((l) => l.businessId === b.id && LOAN_OPEN.includes(l.status))) out.push("loanRequest");
  if (Object.values(b.consent?.fis || {}).some((c) => c.granted)) out.push("lenderConsent");
  const lastQ = (state.quarterly || []).filter((q) => q.businessId === b.id).sort((x, y) => String(x.at).localeCompare(String(y.at))).pop();
  if ((lastQ ? lastQ.needFinance : b.baseline?.needFinance) === "yes") out.push("needsFinance");
  const v = b.opening?.values || {};
  const total = Object.values(v.channels || {}).reduce((t, x) => t + Number(x || 0), 0) + ["inventory", "receivables", "equipment", "groupSavings"].reduce((t, k) => t + Number(v[k] || 0), 0);
  if (total >= 10000000) out.push("bigPosition");
  return out;
}

// The list itself: only businesses with something to check, highest priority first, then the longest waiting.
// Officers see their own businesses; Data Admin, System Admin and Super users see all.
export function verifyQueue(state, user, todayISO) {
  const rank = { officer: 1, dataAdmin: 2, systemAdmin: 3, super: 4 }[user?.role] || 0;
  const live = (state.businesses || []).filter((b) => b.status !== "archived" && (rank >= 2 || b.officerId === user?.id));
  const rows = live.map((b) => {
    const needs = verifyNeeds(state, b);
    const signals = verifySignals(state, b);
    const since = b.checkRequest && !b.checkRequest.doneAt ? b.checkRequest.at : b.opening?.firstSavedAt || b.createdAt || b.startDate;
    const waiting = Math.max(0, daysBetween(String(since || todayISO).slice(0, 10), todayISO));
    const priority = signals.reduce((t, k) => t + SIGNALS[k].weight, 0) + Math.min(30, waiting);
    return { business: b, needs, signals, waiting, priority };
  }).filter((r) => r.needs.some((n) => n !== "neverRated" && n !== "noOpening") || r.signals.includes("askedCheck"));
  rows.sort((a, b) => b.priority - a.priority || b.waiting - a.waiting);
  const count = (k) => live.filter((b) => verifyNeeds(state, b).includes(k)).length;
  return {
    rows,
    counts: {
      businesses: live.length,
      opening: count("opening") + count("openingReturned"),
      noOpening: count("noOpening"),
      identity: count("identity"),
      accounts: count("accounts"),
      neverRated: count("neverRated"),
      asked: live.filter((b) => b.checkRequest && !b.checkRequest.doneAt).length,
      loanInterest: rows.filter((r) => r.signals.includes("loanRequest") || r.signals.includes("lenderConsent")).length
    }
  };
}
