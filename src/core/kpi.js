// BOT and other report users (BOT-01 to BOT-08): aggregated, de-identified, small groups hidden.
import { incomeStatement } from "./accounting.js";
import { gates } from "./credit.js";
import { bandFor, latestRating } from "./rating.js";
import { addDays, monthKey, round, sum, yearsBetween } from "./util.js";
import { ownershipGender } from "./people.js";

export function ageGroup(business, todayISO, youthMax = 35) {
  const dob = business.profile?.dob;
  if (!dob) return "unknown";
  return yearsBetween(dob, todayISO) <= youthMax ? "youth" : "adult";
}

export function filterBusinesses(state, f, todayISO) {
  return (state.businesses || []).filter((b) => {
    if (b.status === "archived") return false;
    if (f.region && b.profile?.region !== f.region) return false;
    if (f.sector && b.profile?.sector !== f.sector) return false;
    if (f.gender && ownershipGender(b.profile) !== f.gender) return false;
    if (f.age && ageGroup(b, todayISO, state.settings.youthMaxAge) !== f.age) return false;
    if (f.to && b.startDate > f.to) return false;
    return true;
  });
}

const share = (n, d) => (d ? n / d : 0);

export function computeKpis(state, filters, todayISO) {
  const from = filters.from || addDays(todayISO, -90);
  const to = filters.to || todayISO;
  const pop = filterBusinesses(state, filters, todayISO);
  const minGroup = state.settings.minGroupSize ?? 10;
  const minCell = state.settings.minCellSize ?? 3;
  if (pop.length < minGroup) return { hidden: true, reason: "small", count: pop.length, minGroup, from, to };
  // Complementary suppression: a filtered group whose complement is small could be found by subtraction.
  const filtered = Boolean(filters.region || filters.sector || filters.gender || filters.age);
  if (filtered) {
    const all = filterBusinesses(state, { to: filters.to }, todayISO).length;
    const rest = all - pop.length;
    if (rest > 0 && rest < minGroup) return { hidden: true, reason: "complement", count: pop.length, minGroup, from, to };
  }
  const ids = new Set(pop.map((b) => b.id));
  const entries = (state.entries || []).filter((e) => ids.has(e.businessId) && e.status === "posted" && !e.contra);
  const loans = (state.loans || []).filter((l) => ids.has(l.businessId));
  const inPeriod = (d) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;

  // 1 Registered and active
  const activeDays = state.settings.activeMinDays ?? 10;
  const since30 = addDays(todayISO, -30);
  const active = pop.filter((b) => new Set(entries.filter((e) => e.businessId === b.id && e.date >= since30).map((e) => e.date)).size >= activeDays);
  // 2 Inclusion baseline (ONB-06)
  const withBaseline = pop.filter((b) => b.baseline);
  const noBank = withBaseline.filter((b) => b.baseline.bank === "none").length;
  const neverBorrowed = withBaseline.filter((b) => b.baseline.borrowed === "never").length;
  // 3 Credit readiness
  const ready = pop.filter((b) => gates(state, b, todayISO).passed).length;
  // 4 & 5 Financing
  const requested = loans.filter((l) => inPeriod(l.requestedAt));
  const approved = loans.filter((l) => ["offered", "accepted", "disbursed", "repaid"].includes(l.status) && inPeriod(l.offeredAt || l.requestedAt));
  const disbursed = loans.filter((l) => ["disbursed", "repaid"].includes(l.status) && inPeriod(l.disbursedAt));
  const reqValue = sum(requested, (l) => l.amount);
  const apprValue = sum(approved, (l) => l.offer?.principal || l.amount);
  const statedNeed = sum(withBaseline.filter((b) => b.baseline.needFinance === "yes"), (b) => Number(b.baseline.needAmount) || 0);
  const outside = (state.quarterly || []).filter((q) => ids.has(q.businessId) && inPeriod(q.at) && q.outsideLoan === "yes");
  // 6 Portfolio quality
  const live = loans.filter((l) => l.status === "disbursed");
  const outstanding = (l) => sum((l.schedule || []).filter((i) => !i.paidAt), (i) => i.principal);
  const totalOut = sum(live, outstanding);
  const par30 = sum(live.filter((l) => (l.schedule || []).some((i) => !i.paidAt && i.due < addDays(todayISO, -30))), outstanding);
  const dueInst = loans.flatMap((l) => (l.schedule || []).filter((i) => i.due <= todayISO));
  const paidOnTime = dueInst.filter((i) => i.paidAt && i.paidAt.slice(0, 10) <= i.due).length;
  // 7 Digital adoption
  const recording = pop.filter((b) => entries.some((e) => e.businessId === b.id && inPeriod(e.date))).length;
  const importing = pop.filter((b) => entries.some((e) => e.businessId === b.id && e.source === "import" && inPeriod(e.date))).length;
  const mobileUse = withBaseline.filter((b) => b.baseline.mobile && b.baseline.mobile !== "none").length;
  // 8 Women and youth
  const women = pop.filter((b) => ownershipGender(b.profile) === "female"); // women-owned: 51%+ of shares (29 Oct)
  const youth = pop.filter((b) => ageGroup(b, todayISO, state.settings.youthMaxAge) === "youth");
  const fundedIds = new Set(disbursed.map((l) => l.businessId));
  // 9 Productive assets
  const assetLoans = disbursed.filter((l) => l.type === "asset");
  // 10 Business growth: first vs last month of the period
  const firstM = monthKey(from);
  const lastM = monthKey(to);
  const monthTotals = (mk) => {
    const s = `${mk}-01`;
    const e = `${mk}-31`;
    let revenue = 0;
    let profit = 0;
    for (const b of pop) {
      const is = incomeStatement(state, b.id, s, e);
      revenue += is.sales;
      profit += is.profit;
    }
    return { revenue, profit };
  };
  const g1 = monthTotals(firstM);
  const g2 = monthTotals(lastM);
  const staff = sum(pop, (b) => Number(b.profile?.staffTotal) || 0);
  // Extra tiles (BOT-05)
  const offers = approved.filter((l) => l.offer);
  const avgCost = offers.length ? sum(offers, (l) => annualCostPct(l)) / offers.length : 0;
  const complaints = (state.queries || []).filter((q) => q.complaint && inPeriod(q.createdAt) && (!q.businessId || ids.has(q.businessId)));
  const bands = { excellent: 0, good: 0, okay: 0, poor: 0, not_checked: 0 };
  for (const b of pop) {
    const r = latestRating(state, b.id);
    bands[r ? bandFor(r.score).key : "not_checked"]++;
  }
  return {
    hidden: false, count: pop.length, from, to, minGroup, minCell, filtered,
    k1: { registered: pop.length, active: active.length },
    k2: { noBank: share(noBank, withBaseline.length), neverBorrowed: share(neverBorrowed, withBaseline.length), answered: withBaseline.length, noBankN: noBank, neverBorrowedN: neverBorrowed },
    k3: { ready: share(ready, pop.length), readyCount: ready },
    k4: { requested: reqValue, approved: apprValue, gap: reqValue - apprValue, statedNeed },
    k5: { approvedCount: approved.length, approvedValue: apprValue, disbursedCount: disbursed.length, disbursedValue: sum(disbursed, (l) => l.offer?.principal || l.amount), outsideCount: outside.length, outsideValue: sum(outside, (q) => Number(q.outsideAmount) || 0) },
    k6: { par30: share(par30, totalOut), repaymentRate: share(paidOnTime, dueInst.length), outstanding: totalOut },
    k7: { recording: share(recording, pop.length), importing: share(importing, pop.length), mobileMoney: share(mobileUse, withBaseline.length) },
    k8: { womenShare: share(women.length, pop.length), youthShare: share(youth.length, pop.length), womenFunded: share(women.filter((b) => fundedIds.has(b.id)).length, women.length), youthFunded: share(youth.filter((b) => fundedIds.has(b.id)).length, youth.length), womenN: women.length, youthN: youth.length, womenFundedN: women.filter((b) => fundedIds.has(b.id)).length, youthFundedN: youth.filter((b) => fundedIds.has(b.id)).length },
    k9: { count: assetLoans.length, value: sum(assetLoans, (l) => l.offer?.principal || l.amount) },
    k10: { revenueFirst: g1.revenue, revenueLast: g2.revenue, profitFirst: g1.profit, profitLast: g2.profit, staff },
    extra: { avgCostPct: avgCost, complaints: complaints.length, complaintsResolved: complaints.filter((q) => q.status === "answered").length, bands }
  };
}

// Approximate annual cost of credit (interest + fees) as a % of principal.
export function annualCostPct(loan) {
  const o = loan.offer;
  if (!o || !o.principal) return 0;
  const per = { daily: 365, weekly: 52, monthly: 12 }[o.frequency] || 12;
  const years = o.instalments / per;
  return round(((o.costOfCredit / o.principal) / Math.max(years, 1 / 12)) * 100, 1);
}

// CSV export follows the same suppression as the screen and says so in its header (BOT-01, BOT-07).
export function kpiCsv(k, lang = "en") {
  const c = (n) => (n > 0 && n < (k.minCell || 3) ? `fewer than ${k.minCell || 3}` : n);
  const p = (x, n) => (n != null && n > 0 && n < (k.minCell || 3) ? "suppressed" : round(x * 100, 1) + "%");
  const rows = [
    ["TijaPass KPI export", "Aggregated and de-identified", `Groups under ${k.minGroup} businesses and cells under ${k.minCell} are suppressed`],
    ["Period", k.from, k.to], ["Businesses in group", k.count, ""],
    ["KPI", "Measure", "Value"],
    ["1", "Registered", k.k1.registered], ["1", "Active", c(k.k1.active)],
    ["2", "No bank account at joining (share of TijaPass businesses)", p(k.k2.noBank, k.k2.noBankN)], ["2", "Never borrowed formally (share of TijaPass businesses)", p(k.k2.neverBorrowed, k.k2.neverBorrowedN)],
    ["3", "Credit-ready (share)", p(k.k3.ready, k.k3.readyCount)],
    ["4", "Requested (TZS)", k.k4.requested], ["4", "Approved (TZS)", k.k4.approved], ["4", "Gap (TZS)", k.k4.gap], ["4", "Stated need (TZS)", k.k4.statedNeed],
    ["5", "Loans approved", c(k.k5.approvedCount)], ["5", "Loans disbursed", c(k.k5.disbursedCount)], ["5", "Value disbursed (TZS)", k.k5.disbursedCount > 0 && k.k5.disbursedCount < (k.minCell || 3) ? "suppressed" : k.k5.disbursedValue], ["5", "Loans outside TijaPass", c(k.k5.outsideCount)],
    ["6", "PAR30", round(k.k6.par30 * 100, 1) + "%"], ["6", "On-time repayment rate", round(k.k6.repaymentRate * 100, 1) + "%"],
    ["7", "Recording (share)", round(k.k7.recording * 100, 1) + "%"], ["7", "Importing statements (share)", round(k.k7.importing * 100, 1) + "%"], ["7", "Use mobile money (share)", round(k.k7.mobileMoney * 100, 1) + "%"],
    ["8", "Women (share)", round(k.k8.womenShare * 100, 1) + "%"], ["8", "Youth (share)", round(k.k8.youthShare * 100, 1) + "%"], ["8", "Women funded (share)", p(k.k8.womenFunded, k.k8.womenFundedN)], ["8", "Youth funded (share)", p(k.k8.youthFunded, k.k8.youthFundedN)],
    ["9", "Asset loans", c(k.k9.count)], ["9", "Asset loan value (TZS)", k.k9.count > 0 && k.k9.count < (k.minCell || 3) ? "suppressed" : k.k9.value],
    ["10", "Revenue first month (TZS)", k.k10.revenueFirst], ["10", "Revenue last month (TZS)", k.k10.revenueLast], ["10", "Staff", k.k10.staff],
    ["Extra", "Average annual cost of credit", k.extra.avgCostPct + "%"], ["Extra", "Complaints received", c(k.extra.complaints)], ["Extra", "Complaints resolved", c(k.extra.complaintsResolved)],
    ...Object.entries(k.extra.bands).map(([b, n]) => ["Extra", `Records Rating: ${b}`, c(n)])
  ];
  void lang;
  return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
}
