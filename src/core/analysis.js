// 12-month trend (paid packages) and financial analysis (Premium), decided 11 Nov 2026.
// Everything is worked out from the business's own posted records, in plain words, with what to do next.
import { balanceSheet, cashFlowDirect, incomeStatement } from "./accounting.js";
import { addDays, addMonths, endOfMonth, monthKey, round, startOfMonth } from "./util.js";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_SW = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"];
export const monthLabel = (key, lang = "en") => `${(lang === "sw" ? MONTHS_SW : MONTHS_EN)[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

// One row per month, oldest first, ending with the current month (partial, up to today).
// Months before the business joined are left out.
export function monthlySeries(state, businessId, todayISO, n = 12) {
  const b = state.businesses.find((x) => x.id === businessId);
  const joined = b?.startDate || todayISO;
  const rows = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = startOfMonth(addMonths(startOfMonth(todayISO), -i));
    const fullTo = endOfMonth(from);
    const to = fullTo > todayISO ? todayISO : fullTo;
    if (to < joined) continue;
    const start = from < joined ? joined : from;
    const is = incomeStatement(state, businessId, start, to);
    const cf = cashFlowDirect(state, businessId, start, to);
    const costs = is.costOfSales + is.totalExpenses;
    rows.push({ month: monthKey(from), from: start, to, partial: to < fullTo || start > from, sales: is.sales, costOfSales: is.costOfSales, expenses: is.totalExpenses, costs, grossProfit: is.grossProfit, otherIncome: is.otherIncome, profit: is.profit, cashEnd: cf.closingCash });
  }
  return rows;
}

const change = (now, before) => (before > 0 ? (now - before) / before : null);
const pctText = (x) => `${Math.abs(round(x * 100))}%`;

// This month so far against the same days of last month, and last full month against the one before.
export function monthComparison(series) {
  const full = series.filter((r) => !r.partial);
  const last = full[full.length - 1] || null;
  const prev = full[full.length - 2] || null;
  if (!last || !prev) return null;
  return { last, prev, sales: change(last.sales, prev.sales), costs: change(last.costs, prev.costs), profit: prev.profit > 0 ? change(last.profit, prev.profit) : null };
}

// Simple traffic lights: good, watch, act. Thresholds are deliberately plain for small traders.
const light = (v, good, watch, higherIsBetter = true) => {
  if (v == null || !Number.isFinite(v)) return "none";
  if (higherIsBetter) return v >= good ? "good" : v >= watch ? "watch" : "act";
  return v <= good ? "good" : v <= watch ? "watch" : "act";
};

// Key ratios over the last 90 days (or since joining), with the balance sheet as at today.
export function keyRatios(state, businessId, todayISO) {
  const b = state.businesses.find((x) => x.id === businessId);
  const joined = b?.startDate || todayISO;
  const from = addDays(todayISO, -89) < joined ? joined : addDays(todayISO, -89);
  const days = Math.max(1, Math.round((Date.parse(todayISO) - Date.parse(from)) / 86400000) + 1);
  const is = incomeStatement(state, businessId, from, todayISO);
  const bs = balanceSheet(state, businessId, todayISO);
  const get = (list, acc) => list.find((x) => x.acc === acc)?.amount || 0;
  const cash = bs.assets.filter((x) => x.acc.startsWith("ch:")).reduce((t, x) => t + x.amount, 0);
  const stock = get(bs.assets, "inventory");
  const owedToYou = get(bs.assets, "receivables");
  const owedShort = get(bs.liabilities, "payables") + get(bs.liabilities, "loansShort") + get(bs.liabilities, "groupLoans");
  const debt = bs.totalLiabilities;
  const stake = bs.totalEquity;
  const salesDay = is.sales / days;
  const cosDay = is.costOfSales / days;
  const spendDay = (is.costOfSales + is.totalExpenses) / days;
  const r = (x) => (x == null || !Number.isFinite(x) ? null : x);
  const gm = is.sales > 0 ? is.grossProfit / is.sales : null;
  const nm = is.sales > 0 ? is.profit / is.sales : null;
  const cover = owedShort > 0 ? (cash + stock + owedToYou) / owedShort : null;
  const dte = stake > 0 ? debt / stake : debt > 0 ? Infinity : 0;
  const cashDays = spendDay > 0 ? cash / spendDay : null;
  const stockDays = cosDay > 0 ? stock / cosDay : null;
  const custDays = salesDay > 0 ? owedToYou / salesDay : null;
  const T = (en, sw) => ({ en, sw });
  const n0 = (x) => Math.round(x).toLocaleString("en-US");
  const dd = (x) => (x > 365 ? "365+" : String(Math.round(x)));
  const list = [
    gm == null ? null : { id: "grossMargin", value: r(gm), shown: pctText(gm), status: light(gm, 0.25, 0.1),
      name: T("Gross margin", "Faida ghafi kwa mauzo"),
      says: T(`Of every TZS 100 of sales, TZS ${n0(gm * 100)} is left after paying for the goods sold.`, `Kwa kila TZS 100 ya mauzo, TZS ${n0(gm * 100)} inabaki baada ya kulipia bidhaa zilizouzwa.`),
      todo: T("If this is low, check your selling prices and where you buy stock.", "Ikiwa ni ndogo, angalia bei zako za kuuza na unaponunua bidhaa.") },
    nm == null ? null : { id: "netMargin", value: r(nm), shown: `${nm < 0 ? "−" : ""}${pctText(nm)}`, status: light(nm, 0.1, 0.02),
      name: T("Profit margin", "Faida kwa mauzo"),
      says: nm >= 0 ? T(`Of every TZS 100 of sales, TZS ${n0(nm * 100)} is profit after all business costs.`, `Kwa kila TZS 100 ya mauzo, TZS ${n0(nm * 100)} ni faida baada ya gharama zote za biashara.`) : T(`Costs are higher than what sales leave: you lose TZS ${n0(-nm * 100)} on every TZS 100 of sales.`, `Gharama ni kubwa kuliko kinachobaki kwa mauzo: unapoteza TZS ${n0(-nm * 100)} kwa kila TZS 100 ya mauzo.`),
      todo: T("Look at your biggest costs first: rent, transport and wages.", "Anza kuangalia gharama zako kubwa: kodi, usafiri na mishahara.") },
    cover == null ? null : { id: "cover", value: r(cover), shown: `${round(cover, 1)}×`, status: light(cover, 1.5, 1),
      name: T("Can you pay what is due?", "Unaweza kulipa yanayodaiwa?"),
      says: T(`Your money, stock and what customers owe cover ${round(cover, 1)} times what you owe suppliers and on short loans.`, `Pesa, stoku na madeni ya wateja wako yanatosha mara ${round(cover, 1)} ya unachodaiwa na wasambazaji na mikopo mifupi.`),
      todo: T("Below 1 means you could struggle to pay: collect from customers and avoid new short loans.", "Chini ya 1 inamaanisha unaweza kushindwa kulipa: kusanya kwa wateja na epuka mikopo mipya mifupi.") },
    { id: "debt", value: r(dte), shown: dte === Infinity ? "—" : `${round(dte * 100)}%`, status: dte === Infinity ? "act" : light(dte, 0.5, 1, false),
      name: T("Debt compared with your stake", "Madeni ukilinganisha na hisa yako"),
      says: dte === Infinity ? T("The business owes more than everything it has: the owner's stake is below zero.", "Biashara inadaiwa zaidi ya kila kitu ilichonacho: hisa ya mmiliki iko chini ya sifuri.") : T(`For every TZS 100 of your own stake in the business, it owes TZS ${n0(dte * 100)}.`, `Kwa kila TZS 100 ya hisa yako kwenye biashara, inadaiwa TZS ${n0(dte * 100)}.`),
      todo: T("Above 100% means lenders carry more risk than you: pay down debt before borrowing more.", "Zaidi ya 100% inamaanisha wakopeshaji wanabeba hatari kuliko wewe: punguza madeni kabla ya kukopa zaidi.") },
    cashDays == null ? null : { id: "cashDays", value: r(cashDays), shown: `${dd(cashDays)}`, unit: T("days", "siku"), status: light(cashDays, 30, 7),
      name: T("Days your money lasts", "Siku pesa yako inadumu"),
      says: T(`The money you have now pays about ${dd(cashDays)} days of your usual costs and stock buying.`, `Pesa uliyonayo sasa inalipa takriban siku ${dd(cashDays)} za gharama zako za kawaida na manunuzi ya bidhaa.`),
      todo: T("Under a week is risky: keep some money aside for rent and stock.", "Chini ya wiki ni hatari: weka pesa kando kwa kodi na bidhaa.") },
    stockDays == null || !stock ? null : { id: "stockDays", value: r(stockDays), shown: `${dd(stockDays)}`, unit: T("days", "siku"), status: light(stockDays, 30, 60, false),
      name: T("Days your stock lasts", "Siku stoku yako inadumu"),
      says: T(`At your current pace, the stock you hold sells in about ${dd(stockDays)} days.`, `Kwa kasi yako ya sasa, stoku uliyonayo itauzika kwa takriban siku ${dd(stockDays)}.`),
      todo: T("Many days means money is stuck on the shelf: buy less of what sells slowly.", "Siku nyingi inamaanisha pesa imekwama kwenye rafu: nunua kidogo bidhaa zinazouzika polepole.") },
    custDays == null || !owedToYou ? null : { id: "custDays", value: r(custDays), shown: `${dd(custDays)}`, unit: T("days", "siku"), status: light(custDays, 14, 30, false),
      name: T("Days customers take to pay", "Siku wateja wanachukua kulipa"),
      says: T(`What customers owe you equals about ${dd(custDays)} days of sales.`, `Madeni ya wateja wako ni sawa na takriban siku ${dd(custDays)} za mauzo.`),
      todo: T("Over a month is long: remind customers and give credit only to those who pay on time.", "Zaidi ya mwezi ni muda mrefu: wakumbushe wateja na toa mkopo kwa wanaolipa kwa wakati tu.") }
  ].filter(Boolean);
  return { from, to: todayISO, days, sales: is.sales, ratios: list };
}

// Plain-language findings from the 12-month series: growth, costs against sales, money on hand, best and worst months.
export function trendFindings(series) {
  const full = series.filter((r) => !r.partial);
  const out = [];
  const T = (tone, en, sw) => out.push({ tone, en, sw });
  const sumOf = (rows, k) => rows.reduce((t, r) => t + r[k], 0);
  if (full.length >= 2) {
    const n = full.length >= 6 ? 3 : 1;
    const recent = full.slice(-n);
    const before = full.slice(-2 * n, -n);
    const what = n === 3 ? { en: "the last 3 months compared with the 3 before", sw: "miezi 3 iliyopita ukilinganisha na 3 kabla yake" } : { en: "the last month compared with the month before", sw: "mwezi uliopita ukilinganisha na mwezi kabla yake" };
    const s = change(sumOf(recent, "sales"), sumOf(before, "sales"));
    const c = change(sumOf(recent, "costs"), sumOf(before, "costs"));
    if (s != null) {
      if (s >= 0.05) T("good", `Sales rose ${pctText(s)} in ${what.en}.`, `Mauzo yalipanda ${pctText(s)} katika ${what.sw}.`);
      else if (s <= -0.05) T("act", `Sales fell ${pctText(s)} in ${what.en}.`, `Mauzo yalishuka ${pctText(s)} katika ${what.sw}.`);
      else T("watch", `Sales stayed about the same in ${what.en}.`, `Mauzo yalibaki karibu sawa katika ${what.sw}.`);
    }
    if (s != null && c != null && c - s >= 0.05) T("act", `Costs grew faster than sales (${c >= 0 ? "+" : "−"}${pctText(c)} against ${s >= 0 ? "+" : "−"}${pctText(s)}): check your prices and your biggest costs.`, `Gharama zilikua haraka kuliko mauzo (${c >= 0 ? "+" : "−"}${pctText(c)} dhidi ya ${s >= 0 ? "+" : "−"}${pctText(s)}): angalia bei zako na gharama zako kubwa.`);
    const mNow = sumOf(recent, "sales") > 0 ? sumOf(recent, "profit") / sumOf(recent, "sales") : null;
    const mBefore = sumOf(before, "sales") > 0 ? sumOf(before, "profit") / sumOf(before, "sales") : null;
    if (mNow != null && mBefore != null && Math.abs(mNow - mBefore) >= 0.03) {
      const pts = Math.abs(round((mNow - mBefore) * 100));
      if (mNow > mBefore) T("good", `You keep more of each sale: profit went up by ${pts} shillings in every 100.`, `Unabakiza zaidi kwa kila mauzo: faida ilipanda kwa shilingi ${pts} katika kila 100.`);
      else T("act", `You keep less of each sale: profit went down by ${pts} shillings in every 100.`, `Unabakiza kidogo kwa kila mauzo: faida ilishuka kwa shilingi ${pts} katika kila 100.`);
    }
  }
  const losses = full.filter((r) => r.profit < 0).length;
  if (losses) T(losses >= 3 ? "act" : "watch", `${losses} of the last ${full.length} full months made a loss.`, `Miezi ${losses} kati ya ${full.length} kamili iliyopita ilileta hasara.`);
  const cashTail = series.slice(-4).map((r) => r.cashEnd);
  if (cashTail.length >= 4 && cashTail.every((v, i) => i === 0 || v < cashTail[i - 1])) T("act", "Your money at the end of the month has fallen 3 months in a row.", "Pesa yako mwishoni mwa mwezi imeshuka miezi 3 mfululizo.");
  else if (cashTail.length >= 4 && cashTail.every((v, i) => i === 0 || v > cashTail[i - 1])) T("good", "Your money at the end of the month has grown 3 months in a row.", "Pesa yako mwishoni mwa mwezi imekua miezi 3 mfululizo.");
  if (full.length >= 3) {
    const best = [...full].sort((a, b) => b.profit - a.profit)[0];
    const worst = [...full].sort((a, b) => a.profit - b.profit)[0];
    const fm = (x) => Math.round(x).toLocaleString("en-US");
    T("info", `Best month: ${monthLabel(best.month)}, profit TZS ${fm(best.profit)}. Weakest month: ${monthLabel(worst.month)}, ${worst.profit < 0 ? "loss" : "profit"} TZS ${fm(Math.abs(worst.profit))}.`, `Mwezi bora: ${monthLabel(best.month, "sw")}, faida TZS ${fm(best.profit)}. Mwezi dhaifu: ${monthLabel(worst.month, "sw")}, ${worst.profit < 0 ? "hasara" : "faida"} TZS ${fm(Math.abs(worst.profit))}.`);
  }
  return out;
}

// Enough to say something useful: at least one full month with sales.
export const enoughHistory = (series) => series.filter((r) => !r.partial && r.sales > 0).length >= 1;
