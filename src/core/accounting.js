// Double-entry accounting engine (ACC-01 to ACC-04, REP-01, REP-04).
// The AI only suggests a kind; this engine decides the journal lines. Every journal balances.
import { ACCOUNTS, KINDS } from "./kinds.js";
import { addDays, round, sum } from "./util.js";

const OPENING_ASSETS = ["inventory", "receivables", "equipment", "groupSavings"];
const OPENING_LIABS = ["payables", "loansShort", "loansLong", "groupLoans"];

export const channelAccount = (id) => `ch:${id}`;
export const isChannelAccount = (acc) => String(acc).startsWith("ch:");

export function accountGroup(acc) {
  if (isChannelAccount(acc)) return "asset";
  return ACCOUNTS[acc]?.group || "expense";
}

export function accountLabel(acc, business, lang = "en") {
  if (isChannelAccount(acc)) {
    const ch = business?.channels?.find((c) => channelAccount(c.id) === acc);
    return ch ? ch.name : acc;
  }
  return ACCOUNTS[acc]?.[lang] || acc;
}

// Entries that affect the books, in posting order.
export function bookEntries(state, businessId, to = null, from = null) {
  return (state.entries || [])
    .filter((e) => e.businessId === businessId && e.status === "posted" && (!to || e.date <= to) && (!from || e.date >= from))
    .sort((a, b) => (a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date.localeCompare(b.date)));
}

export function openingLines(business) {
  const o = business?.opening;
  if (!o || !o.values) return [];
  const v = o.values;
  const lines = [];
  for (const ch of business.channels || []) {
    const amt = Number(v.channels?.[ch.id]) || 0;
    if (amt) lines.push({ acc: channelAccount(ch.id), dr: amt, cr: 0 });
  }
  for (const k of OPENING_ASSETS) if (Number(v[k])) lines.push({ acc: k, dr: Number(v[k]), cr: 0 });
  for (const k of OPENING_LIABS) if (Number(v[k])) lines.push({ acc: k, dr: 0, cr: Number(v[k]) });
  const net = sum(lines, (l) => l.dr - l.cr);
  if (net > 0) lines.push({ acc: "openingEquity", dr: 0, cr: net });
  if (net < 0) lines.push({ acc: "openingEquity", dr: -net, cr: 0 });
  return lines;
}

// Opening equity is calculated, never typed (ACC-03, ONB-07).
export function openingEquity(business) {
  const l = openingLines(business).find((x) => x.acc === "openingEquity");
  return l ? l.cr - l.dr : 0;
}

// Journal lines for one entry, given running balances (needed for group payouts and loan repayments).
export function linesFor(entry, balances = {}) {
  const def = KINDS[entry.kind];
  if (!def) throw new Error(`Unknown entry type: ${entry.kind}`);
  const amt = Math.abs(Number(entry.amount) || 0);
  const resolve = (a) => (a === "CH" ? channelAccount(entry.channelId) : a === "TO" ? channelAccount(entry.toChannelId) : a);
  let lines;
  if (entry.kind === "group_payout") {
    // Payout first returns what the owner saved. Any excess is a share-out (other income) only when the owner
    // has finished contributing for the round; an early rotating payout is money owed back to the group.
    const saved = Math.max(0, balances.groupSavings || 0);
    const fromSavings = Math.min(saved, amt);
    lines = [{ acc: resolve("CH"), dr: amt, cr: 0 }];
    if (fromSavings) lines.push({ acc: "groupSavings", dr: 0, cr: fromSavings });
    if (amt - fromSavings) lines.push({ acc: entry.groupMode === "early" ? "groupLoans" : "otherIncome", dr: 0, cr: amt - fromSavings });
  } else if (entry.kind === "group_contribution" && entry.groupMode === "afterPayout") {
    // Contributions after an early payout repay what the owner owes the group.
    lines = [{ acc: "groupLoans", dr: amt, cr: 0 }, { acc: resolve("CH"), dr: 0, cr: amt }];
  } else if (entry.kind === "suspense_resolve") {
    // Over: suspense (credit balance) is cleared to the account chosen; short: the account chosen takes the debit.
    lines = entry.side === "over"
      ? [{ acc: "suspense", dr: amt, cr: 0 }, { acc: entry.resolveTo, dr: 0, cr: amt }]
      : [{ acc: entry.resolveTo, dr: amt, cr: 0 }, { acc: "suspense", dr: 0, cr: amt }];
  } else if (entry.kind === "loan_repayment") {
    const shortBal = Math.max(0, -(balances.loansShort || 0));
    const longBal = Math.max(0, -(balances.loansLong || 0));
    const fromShort = shortBal >= amt || !longBal ? amt : shortBal;
    lines = [{ acc: resolve("CH"), dr: 0, cr: amt }];
    if (fromShort) lines.push({ acc: "loansShort", dr: fromShort, cr: 0 });
    if (amt - fromShort) lines.push({ acc: "loansLong", dr: amt - fromShort, cr: 0 });
  } else if (entry.kind === "stock_adjust") {
    const signed = Number(entry.amount) || 0;
    lines = signed >= 0
      ? [{ acc: "inventory", dr: signed, cr: 0 }, { acc: "stockChange", dr: 0, cr: signed }]
      : [{ acc: "stockChange", dr: -signed, cr: 0 }, { acc: "inventory", dr: 0, cr: -signed }];
  } else {
    let cr = resolve(def.cr);
    if (entry.longTerm && cr === "loansShort") cr = "loansLong";
    lines = [{ acc: resolve(def.dr), dr: amt, cr: 0 }, { acc: cr, dr: 0, cr: amt }];
  }
  if (entry.contra) lines = lines.map((l) => ({ acc: l.acc, dr: l.cr, cr: l.dr }));
  return lines;
}

export const isBalanced = (lines) => Math.abs(sum(lines, (l) => l.dr - l.cr)) < 0.005;

// Full journal: opening + every posted entry, each with its lines.
export function journal(state, businessId, to = null) {
  const business = state.businesses.find((b) => b.id === businessId);
  const out = [];
  const bal = {};
  const apply = (lines) => lines.forEach((l) => (bal[l.acc] = (bal[l.acc] || 0) + l.dr - l.cr));
  const ol = openingLines(business);
  if (ol.length) {
    const d = business.opening.date || business.startDate;
    if (!to || d <= to) {
      out.push({ id: "OPENING", date: d, kind: "opening", description: "Opening balances", lines: ol });
      apply(ol);
    }
  }
  for (const e of bookEntries(state, businessId, to)) {
    const lines = linesFor(e, bal);
    apply(lines);
    out.push({ ...e, lines });
  }
  return out;
}

export function balancesAt(state, businessId, asAt = null) {
  const bal = {};
  for (const j of journal(state, businessId, asAt)) j.lines.forEach((l) => (bal[l.acc] = (bal[l.acc] || 0) + l.dr - l.cr));
  return bal;
}

export function channelBalance(state, businessId, channelId, asAt = null) {
  return balancesAt(state, businessId, asAt)[channelAccount(channelId)] || 0;
}

export function channelBalances(state, businessId, asAt = null) {
  const business = state.businesses.find((b) => b.id === businessId);
  const bal = balancesAt(state, businessId, asAt);
  return (business?.channels || []).map((c) => ({ channel: c, balance: bal[channelAccount(c.id)] || 0 }));
}

// Period totals per account (only journal lines dated within [from, to]).
export function periodMovements(state, businessId, from, to) {
  const mv = {};
  for (const j of journal(state, businessId, to)) {
    if (j.kind === "opening" || j.date < from) continue;
    j.lines.forEach((l) => (mv[l.acc] = (mv[l.acc] || 0) + l.dr - l.cr));
  }
  return mv;
}

export function incomeStatement(state, businessId, from, to) {
  const mv = periodMovements(state, businessId, from, to);
  const credit = (a) => -(mv[a] || 0);
  const debit = (a) => mv[a] || 0;
  const sales = credit("sales");
  const costOfSales = debit("purchases") + debit("stockChange");
  const grossProfit = sales - costOfSales;
  const expenseKeys = ["rent", "utilities", "transport", "wages", "otherExpenses", "loss", "interest", "cashDifference"];
  const expenses = expenseKeys.map((k) => ({ acc: k, amount: debit(k) })).filter((x) => x.amount);
  const totalExpenses = sum(expenses, (x) => x.amount);
  const otherIncome = credit("otherIncome");
  const profit = grossProfit - totalExpenses + otherIncome;
  return { from, to, sales, costOfSales, grossProfit, expenses, totalExpenses, otherIncome, profit };
}

export function balanceSheet(state, businessId, asAt) {
  const business = state.businesses.find((b) => b.id === businessId);
  const bal = balancesAt(state, businessId, asAt);
  const dr = (a) => bal[a] || 0;
  const crb = (a) => -(bal[a] || 0);
  const channels = (business?.channels || []).map((c) => ({ acc: channelAccount(c.id), label: c.name, amount: dr(channelAccount(c.id)) }));
  const assets = [
    ...channels,
    ...["receivables", "inventory", "groupSavings", "equipment", "suspense"].map((a) => ({ acc: a, amount: dr(a) }))
  ];
  const liabilities = ["payables", "loansShort", "loansLong", "groupLoans"].map((a) => ({ acc: a, amount: crb(a) }));
  const pnlKeys = Object.keys(ACCOUNTS).filter((k) => ["income", "cos", "expense"].includes(ACCOUNTS[k].group));
  const retained = -sum(pnlKeys, (k) => bal[k] || 0);
  const equity = [
    { acc: "openingEquity", amount: crb("openingEquity") },
    { acc: "capital", amount: crb("capital") },
    { acc: "drawings", amount: crb("drawings") },
    { acc: "retained", amount: retained }
  ];
  const totalAssets = sum(assets, (x) => x.amount);
  const totalLiabilities = sum(liabilities, (x) => x.amount);
  const totalEquity = sum(equity, (x) => x.amount);
  return { asAt, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, difference: round(totalAssets - totalLiabilities - totalEquity, 2) };
}

// Direct-method cash flow (REP-01): cash received and paid, by purpose. Transfers between own channels are excluded.
export const CASHFLOW_LINES = {
  sales: { en: "Cash from sales", sw: "Pesa kutokana na mauzo" },
  customers: { en: "Cash from customers who owed you", sw: "Pesa kutoka kwa wateja waliokuwa wanadaiwa" },
  otherIn: { en: "Other income received", sw: "Mapato mengine yaliyopokelewa" },
  suppliers: { en: "Paid to suppliers for stock", sw: "Malipo kwa wasambazaji wa bidhaa" },
  expenses: { en: "Paid for business costs", sw: "Malipo ya gharama za biashara" },
  assets: { en: "Paid for equipment", sw: "Malipo ya vifaa" },
  loans: { en: "Loans received less repaid", sw: "Mikopo iliyopokelewa ukiondoa iliyorejeshwa" },
  owner: { en: "Owner money in less taken out", sw: "Pesa ya mmiliki iliyowekwa ukiondoa iliyochukuliwa" },
  groups: { en: "Group savings received less paid in", sw: "Akiba ya kikundi iliyopokelewa ukiondoa iliyochangwa" },
  difference: { en: "Unexplained cash difference", sw: "Tofauti ya pesa isiyoelezeka" }
};

export function cashFlowDirect(state, businessId, from, to) {
  const business = state.businesses.find((b) => b.id === businessId);
  const chAccs = new Set((business?.channels || []).map((c) => channelAccount(c.id)));
  const lines = {};
  for (const j of journal(state, businessId, to)) {
    if (j.kind === "opening" || j.date < from || j.kind === "transfer") continue;
    const cash = sum(j.lines.filter((l) => chAccs.has(l.acc)), (l) => l.dr - l.cr);
    if (!cash) continue;
    const key = KINDS[j.kind]?.cf || "expenses";
    lines[key] = (lines[key] || 0) + cash;
  }
  let openingCash = sum(channelBalances(state, businessId, addDays(from, -1)), (x) => x.balance);
  // Opening balances dated inside the period count as opening cash, not as a cash flow.
  const od = business?.opening?.date || business?.startDate;
  if (od && od >= from && od <= to) openingCash += sum(openingLines(business).filter((l) => chAccs.has(l.acc)), (l) => l.dr - l.cr);
  const closingCash = sum(channelBalances(state, businessId, to), (x) => x.balance);
  const net = sum(Object.values(lines));
  return { from, to, lines, openingCash, net, closingCash, check: round(openingCash + net - closingCash, 2) };
}

export function trialBalance(state, businessId, asAt) {
  const business = state.businesses.find((b) => b.id === businessId);
  const bal = balancesAt(state, businessId, asAt);
  const rows = Object.keys(bal)
    .filter((a) => Math.abs(bal[a]) > 0.004)
    .map((a) => ({ acc: a, label: accountLabel(a, business), group: accountGroup(a), debit: bal[a] > 0 ? bal[a] : 0, credit: bal[a] < 0 ? -bal[a] : 0 }));
  return { rows, totalDebit: sum(rows, (r) => r.debit), totalCredit: sum(rows, (r) => r.credit) };
}

// Ledger for one account (REP-04).
export function ledger(state, businessId, acc, asAt = null) {
  let running = 0;
  const rows = [];
  for (const j of journal(state, businessId, asAt)) {
    for (const l of j.lines) {
      if (l.acc !== acc) continue;
      running += l.dr - l.cr;
      rows.push({ date: j.date, id: j.id, description: j.description, source: j.source, debit: l.dr, credit: l.cr, balance: running });
    }
  }
  return rows;
}

export function monthlyProfit(state, businessId, monthStart, monthEnd) {
  return incomeStatement(state, businessId, monthStart, monthEnd).profit;
}
