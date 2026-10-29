// Pieces shared by several user types: statements, passport, rating detail, loan tracker, message threads.
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, Printer, Send, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CASHFLOW_LINES, balanceSheet, cashFlowDirect, incomeStatement } from "../core/accounting.js";
import { activePackage } from "../core/billing.js";
import { FREQUENCIES, GATES, LOAN_TYPES, affordability, gates, kycCompleteness, linkedExposure, maxInstalments, maxPrincipal, overdueAmount, reconciliation } from "../core/credit.js";
import { closedDates } from "../core/dailyClose.js";
import { ACCOUNTS, KINDS, flowOf } from "../core/kinds.js";
import { CHECKS, bandFor, ratingsFor, tips } from "../core/rating.js";
import { addDays, dateRange, daysBetween, money, round, today, uid } from "../core/util.js";
import { acknowledgeRating, disputeRating, payInstalment, sendMessage } from "../lib/actions.js";
import { targets } from "../lib/access.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useAction, useStore } from "../lib/store.jsx";
import { Area, Card, DateRange, Empty, Field, Meter, Modal, Money, Pill, RatingBadge, RatingTrend, Select, StatusPill, StoredImage, Tabs, fmtDate, fmtDateTime, useRange } from "../ui/components.jsx";

export const kindLabel = (kind) => tl(KINDS[kind]) || kind;
export const kindPlain = (kind) => (getLang() === "sw" ? KINDS[kind]?.plainSw : KINDS[kind]?.plainEn) || kind;
export const channelName = (business, id) => business?.channels?.find((c) => c.id === id)?.name || "";

export function FlowIcon({ kind, size = 18 }) {
  const f = flowOf(kind);
  if (f === "in") return <ArrowDownLeft size={size} className="green" />;
  if (f === "out") return <ArrowUpRight size={size} className="amber" />;
  return <ArrowLeftRight size={size} className="muted" />;
}

const SOURCE = {
  typed: { en: "Typed", sw: "Imeandikwa" }, voice: { en: "Voice", sw: "Sauti" }, import: { en: "Statement upload", sw: "Taarifa iliyopakiwa" }, close: { en: "Daily close", sw: "Kufunga siku" },
  admin: { en: "Admin", sw: "Msimamizi" }, loan: { en: "Loan", sw: "Mkopo" }, ready: { en: "Ready phrase", sw: "Sentensi tayari" }
};
export const sourceLabel = (s) => tl(SOURCE[s]) || s || "";
export const SOURCES = SOURCE;

// One plain-language line per entry (REP-01 "My activity"; no accounting words).
export function EntryLine({ e, business, right }) {
  const f = flowOf(e.kind);
  return (
    <div className="item">
      <FlowIcon kind={e.kind} />
      <div className="grow">
        <b>{e.contra ? `${L("Corrected", "Imesahihishwa")}: ` : ""}{kindPlain(e.kind)}</b>
        <div className="small muted">
          {[e.description, e.payer && `${L("with", "na")} ${e.payer}`, channelName(business, e.channelId), e.toChannelId && `→ ${channelName(business, e.toChannelId)}`, sourceLabel(e.source)].filter(Boolean).join(" · ")}
        </div>
        {e.status === "held" && <div className="small amber">{(e.heldReasons || []).map((r) => holdText(r)).join(" ")}</div>}
      </div>
      <div className="right">
        <b className={`mono ${e.contra ? "" : f === "in" ? "green" : f === "out" ? "amber" : ""}`}>{f === "out" && !e.contra ? "−" : ""}{money(e.amount)}</b>
        <div>{e.status !== "posted" ? <StatusPill status={e.status} /> : right}</div>
      </div>
    </div>
  );
}

export const holdText = (code) => tl({
  duplicate: { en: "It looks like a repeat of an entry you already recorded.", sw: "Inaonekana kurudia muamala ulioandika tayari." },
  direction: { en: "Your words say the opposite of money in or out.", sw: "Maneno yako yanasema kinyume cha pesa kuingia au kutoka." },
  unusual: { en: "The amount is much bigger than usual for your business.", sw: "Kiasi ni kikubwa sana kuliko kawaida ya biashara yako." },
  closedDay: { en: "This day was already closed and counted, so the entry goes to TijaPass Admin as a correction.", sw: "Siku hii ilishafungwa na kuhesabiwa, hivyo muamala unakwenda kwa TijaPass Admin kama marekebisho." },
  overdraw: { en: "More money goes out than this account holds.", sw: "Pesa inayotoka ni zaidi ya iliyopo kwenye akaunti hii." }
}[code]);

// ------------------------------------------------------------------ Statements (REP-01 to REP-03)
const label = (acc, business) => (acc.startsWith("ch:") ? business.channels.find((c) => `ch:${c.id}` === acc)?.name : acc === "retained" ? L("Profit kept in the business", "Faida iliyobaki kwenye biashara") : tl(ACCOUNTS[acc]));

export function Statements({ business, initial = "is", hideTabs = false, minDate = null }) {
  const { state } = useStore();
  const [tab, setTab] = useState(initial);
  const [rawRange, setRange] = useRange("month");
  const range = useMemo(() => (minDate && rawRange.from < minDate ? { ...rawRange, from: minDate, to: rawRange.to < minDate ? minDate : rawRange.to } : rawRange), [rawRange, minDate]);
  const is = useMemo(() => incomeStatement(state, business.id, range.from, range.to), [state, business.id, range]);
  const bs = useMemo(() => balanceSheet(state, business.id, range.to), [state, business.id, range]);
  const cf = useMemo(() => cashFlowDirect(state, business.id, range.from, range.to), [state, business.id, range]);
  const titles = { is: L("Income statement", "Taarifa ya mapato na matumizi"), bs: L("Balance sheet", "Taarifa ya mali na madeni"), cf: L("Cash flow statement", "Taarifa ya mtiririko wa pesa") };
  return (
    <div className="stack">
      {!hideTabs && <Tabs value={tab} onChange={setTab} tabs={["is", "bs", "cf"].map((v) => ({ value: v, label: titles[v] }))} />}
      <DateRange value={rawRange} onChange={setRange} />
      <Card className="stmt">
        <div className="between">
          <div>
            <h2>{titles[tab]}</h2>
            <p className="small muted">{business.profile.businessName} · {tab === "bs" ? `${L("as at", "hadi")} ${fmtDate(range.to)}` : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}</p>
          </div>
          <button className="btn no-print" onClick={() => window.print()}><Printer size={18} />{L("Download PDF", "Pakua PDF")}</button>
        </div>
        <div className="table-wrap mt">
          {tab === "is" && (
            <table className="t">
              <tbody>
                <tr><td>{L("Sales", "Mauzo")}</td><td className="num">{money(is.sales)}</td></tr>
                <tr><td>{L("Cost of goods sold", "Gharama ya bidhaa zilizouzwa")}</td><td className="num">−{money(is.costOfSales)}</td></tr>
                <tr className="sub"><td>{L("Gross profit", "Faida ghafi")}</td><td className="num">{money(is.grossProfit)}</td></tr>
                {is.expenses.map((x) => <tr key={x.acc}><td>{tl(ACCOUNTS[x.acc])}</td><td className="num">−{money(x.amount)}</td></tr>)}
                {!is.expenses.length && <tr><td className="muted">{L("Business costs", "Gharama za biashara")}</td><td className="num">{money(0)}</td></tr>}
                <tr><td>{L("Other income", "Mapato mengine")}</td><td className="num">{money(is.otherIncome)}</td></tr>
                <tr className="total"><td>{is.profit >= 0 ? L("Profit", "Faida") : L("Loss", "Hasara")}</td><td className="num">{money(is.profit)}</td></tr>
              </tbody>
            </table>
          )}
          {tab === "bs" && (
            <table className="t">
              <tbody>
                <tr className="sub"><td colSpan={2}>{L("What the business has", "Vitu biashara inavyomiliki")}</td></tr>
                {bs.assets.filter((x) => x.amount || x.acc.startsWith("ch:")).map((x) => <tr key={x.acc}><td>{label(x.acc, business)}</td><td className="num">{money(x.amount)}</td></tr>)}
                <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{money(bs.totalAssets)}</td></tr>
                <tr className="sub"><td colSpan={2}>{L("What the business owes", "Madeni ya biashara")}</td></tr>
                {bs.liabilities.filter((x) => x.amount).map((x) => <tr key={x.acc}><td>{label(x.acc, business)}</td><td className="num">{money(x.amount)}</td></tr>)}
                <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{money(bs.totalLiabilities)}</td></tr>
                <tr className="sub"><td colSpan={2}>{L("Owner's stake", "Hisa ya mmiliki")}</td></tr>
                <tr><td>{L("Starting stake", "Mtaji wa kuanzia")}</td><td className="num">{money(bs.equity[0].amount)}</td></tr>
                <tr><td>{L("Own money put in", "Pesa binafsi iliyowekwa")}</td><td className="num">{money(bs.equity[1].amount)}</td></tr>
                <tr><td>{L("Money taken for home use", "Pesa iliyochukuliwa kwa matumizi ya nyumbani")}</td><td className="num">{money(bs.equity[2].amount)}</td></tr>
                <tr><td>{L("Profit kept in the business", "Faida iliyobaki kwenye biashara")}</td><td className="num">{money(bs.equity[3].amount)}</td></tr>
                <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{money(bs.totalEquity)}</td></tr>
              </tbody>
            </table>
          )}
          {tab === "cf" && (
            <table className="t">
              <tbody>
                <tr className="sub"><td>{L("Money at the start", "Pesa mwanzoni")}</td><td className="num">{money(cf.openingCash)}</td></tr>
                {Object.keys(CASHFLOW_LINES).filter((k) => cf.lines[k]).map((k) => <tr key={k}><td>{tl(CASHFLOW_LINES[k])}</td><td className="num">{money(cf.lines[k])}</td></tr>)}
                <tr className="sub"><td>{L("Change in money", "Mabadiliko ya pesa")}</td><td className="num">{money(cf.net)}</td></tr>
                <tr className="total"><td>{L("Money at the end", "Pesa mwishoni")}</td><td className="num">{money(cf.closingCash)}</td></tr>
              </tbody>
            </table>
          )}
        </div>
        {tab === "bs" && Math.abs(bs.difference) > 1 && <p className="notice bad mt">{L("Figures do not balance; TijaPass Admin has been told.", "Takwimu hazilingani; TijaPass Admin wamearifiwa.")}</p>}
        <p className="tiny muted mt">{L("Prepared by TijaPass from the business's own records.", "Imeandaliwa na TijaPass kutoka kumbukumbu za biashara yenyewe.")}</p>
      </Card>
    </div>
  );
}

// "My activity" (REP-01): plain-language entries by day.
export function ActivityList({ business, from, to, showHeld = true }) {
  const { state } = useStore();
  const list = state.entries.filter((e) => e.businessId === business.id && e.date >= from && e.date <= to && (showHeld || e.status === "posted"));
  const days = [...new Set(list.map((e) => e.date))].sort().reverse();
  if (!days.length) return <Empty text={L("Nothing recorded in this period.", "Hakuna kilichoandikwa katika kipindi hiki.")} />;
  return days.map((d) => {
    const items = list.filter((e) => e.date === d).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const inn = items.filter((e) => flowOf(e.kind) === "in" && e.status === "posted" && !e.contra).reduce((t, e) => t + e.amount, 0);
    const out = items.filter((e) => flowOf(e.kind) === "out" && e.status === "posted" && !e.contra).reduce((t, e) => t + e.amount, 0);
    return (
      <Card key={d}>
        <div className="between"><h3>{fmtDate(d)}</h3><span className="small"><span className="green">+{money(inn)}</span> · <span className="amber">−{money(out)}</span></span></div>
        <div className="list mt">{items.map((e) => <EntryLine key={e.id} e={e} business={business} />)}</div>
      </Card>
    );
  });
}

// ------------------------------------------------------------------ Credit passport (CRD-06, CRD-07)
export function daysClosed30(state, business) {
  const t = today(state);
  const from = business.startDate > addDays(t, -30) ? business.startDate : addDays(t, -30);
  const to = addDays(t, -1);
  if (from > to) return { closed: 0, days: 0 };
  const set = closedDates(state, business.id);
  const days = dateRange(from, to);
  return { closed: days.filter((d) => set.has(d)).length, days: days.length };
}

export function proposedLimits(state, business, products) {
  const t = today(state);
  const a = affordability(state, business, t);
  return products.filter((p) => p.active).map((p) => {
    const freq = p.frequencies.includes("monthly") ? "monthly" : p.frequencies[0];
    const n = Math.min(p.maxInstalments || 12, maxInstalments(state, business.id, freq));
    const max = Math.min(p.max, maxPrincipal(a.capacity, p.annualRate, freq, n));
    return { product: p, frequency: freq, instalments: n, limit: max >= p.min ? Math.floor(max / 1000) * 1000 : 0 };
  });
}

const FACTOR_NAMES = {
  kyc: { en: "Profile and ID", sw: "Wasifu na kitambulisho" }, coverage: { en: "Reliable records (evidence-weighted)", sw: "Kumbukumbu za kuaminika (kwa uzito wa ushahidi)" },
  records: { en: "Number of records", sw: "Idadi ya kumbukumbu" }, months: { en: "Months of records", sw: "Miezi ya kumbukumbu" },
  rating: { en: "Records Rating", sw: "Kiwango cha Kumbukumbu" }, repayment: { en: "Repayment record", sw: "Rekodi ya marejesho" }
};

export function Passport({ business, products, viewer = "business" }) {
  const { state } = useStore();
  const t = today(state);
  const g = useMemo(() => gates(state, business, t), [state, business, t]);
  const a = useMemo(() => affordability(state, business, t), [state, business, t]);
  const dc = daysClosed30(state, business);
  const ext = state.externalLoans.filter((x) => x.businessId === business.id && !x.archived);
  const limits = proposedLimits(state, business, products);
  const rep = g.score.repayment;
  const s = g.score.value;
  const rc = useMemo(() => reconciliation(state, business, t), [state, business, t]);
  const lx = useMemo(() => linkedExposure(state, business, t), [state, business, t]);
  return (
    <div className="stack">
      <div className="grid g3">
        <div className="card">
          <small className="muted bold">{L("Indicative credit score", "Alama ya mkopo (makadirio)")}</small>
          <div className="row mt"><strong style={{ fontSize: 34, fontFamily: "Manrope, Inter, sans-serif" }}>{s}</strong><span className="muted">/ 100</span></div>
          <Meter value={s / 100} color={s >= (state.settings.qualifyScore ?? 70) ? "#0c7a52" : "#f86c12"} />
          <p className="tiny muted mt">{L("Indicative only. The lender makes the credit decision.", "Ni makadirio tu. Mkopeshaji ndiye anayeamua.")}</p>
        </div>
        <div className="card">
          <small className="muted bold">{L("TijaPass Records Rating", "Kiwango cha Kumbukumbu cha TijaPass")}</small>
          <div className="mt"><RatingBadge business={business} big /></div>
          <div className="mt"><RatingTrend businessId={business.id} /></div>
        </div>
        <div className="card">
          <small className="muted bold">{L("Days closed (last 30)", "Siku zilizofungwa (30 zilizopita)")}</small>
          <div className="mt"><strong style={{ fontSize: 28, fontFamily: "Manrope, Inter, sans-serif" }}>{dc.closed} {L("of", "kati ya")} {dc.days}</strong></div>
          <p className="small muted mt">{L("Profile and ID complete", "Wasifu na kitambulisho kamili")}: {Math.round(kycCompleteness(business) * 100)}%</p>
          <p className="small muted">{L("Package", "Kifurushi")}: {activePackage(state, business, t)}</p>
        </div>
      </div>
      <Card title={L("Checks before a loan offer", "Vigezo kabla ya ofa ya mkopo")}>
        <div className="list">
          {Object.keys(GATES).map((k) => (
            <div className="item" key={k}>
              {g.results[k] === true ? <CheckCircle2 size={20} className="green" /> : g.results[k] === "review" ? <CheckCircle2 size={20} className="amber" /> : <XCircle size={20} className="red" />}
              <div className="grow">
                {tl(GATES[k])}
                {g.results[k] === "review" && <div className="small amber">{L("Okay rating: a lender may offer only after its own review of the records.", "Kiwango cha Wastani: mkopeshaji anaweza kutoa ofa baada ya kukagua kumbukumbu mwenyewe.")}</div>}
                {k === "reconciled" && g.results[k] !== true && <div className="small muted">{[rc.unclosed && `${rc.unclosed} ${L("days not closed", "siku hazijafungwa")}`, Math.abs(rc.suspense) > 0.5 && `${money(Math.abs(rc.suspense))} ${L("cash difference to resolve", "tofauti ya pesa ya kutatua")}`, rc.corrections && `${rc.corrections} ${L("corrections open", "marekebisho yanasubiri")}`, !rc.opening && L("starting position not approved", "hali ya kuanzia haijaidhinishwa")].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("How reliable the records are", "Uaminifu wa kumbukumbu")}>
        <div className="kv">
          <span>{L("Entries with supporting evidence (receipt, statement, checked by officer, approved)", "Miamala yenye ushahidi (risiti, taarifa, imekaguliwa na afisa, imeidhinishwa)")}</span><span>{g.score.evidence.supported}</span>
          <span>{L("Entries declared by the business only (count half for credit)", "Miamala iliyotajwa na biashara pekee (inahesabiwa nusu kwa mkopo)")}</span><span>{g.score.evidence.declared}</span>
          <span>{L("Open corrections from records checks", "Marekebisho yanayosubiri kutoka ukaguzi")}</span><span>{rc.corrections}</span>
        </div>
      </Card>
      <Card title={L("Proposed limits", "Viwango vya mkopo vinavyopendekezwa")}>
        <div className="kv mb">
          <span>{L("Average monthly profit (last 3 months)", "Wastani wa faida kwa mwezi (miezi 3)")}</span><Money v={a.profit} />
          <span>{L("Average monthly cash from operations", "Wastani wa pesa kutoka biashara kwa mwezi")}</span><Money v={a.cash} />
          <span>{L("Base used (the lower of the two)", "Msingi uliotumika (kidogo kati ya hivyo viwili)")}</span><Money v={a.base} />
          <span>{L("Share for repayments", "Sehemu ya marejesho")}</span><span>{Math.round(a.share * 100)}% × {Math.round(a.buffer * 100)}%</span>
          <span>{L("Existing instalments per month", "Marejesho yaliyopo kwa mwezi")}</span><Money v={a.existing.total} />
          <span>{L("Can repay per month", "Uwezo wa kurejesha kwa mwezi")}</span><Money v={a.capacity} />
        </div>
        {!limits.length && <p className="muted small">{L("No loan products available yet.", "Bado hakuna bidhaa za mikopo.")}</p>}
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>{L("Product", "Bidhaa")}</th><th>{L("Type", "Aina")}</th><th className="num">{L("Up to", "Hadi")}</th></tr></thead>
            <tbody>
              {limits.map((x) => (
                <tr key={x.product.id}><td>{x.product.name}<div className="tiny muted">{x.product.annualRate}% · {x.instalments} × {tl(FREQUENCIES[x.frequency])}</div></td><td>{tl(LOAN_TYPES[x.product.type])}</td><td className="num">{money(x.limit)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid g2">
        <Card title={L("Declared loans outside TijaPass", "Mikopo ya nje iliyotajwa")}>
          {!ext.length && <p className="muted small">{L("None declared.", "Hakuna iliyotajwa.")}</p>}
          {ext.map((x) => (
            <div className="item" key={x.id}>
              <div className="grow"><b>{x.lender}</b><div className="small muted">{money(x.instalment)} · {tl(FREQUENCIES[x.frequency])} · {x.remaining} {L("left", "zimebaki")}</div></div>
              <div className="right"><Money v={x.balance} /><div><StatusPill status={x.status} /></div></div>
            </div>
          ))}
        </Card>
        <Card title={L("Repayment record", "Rekodi ya marejesho")}>
          <div className="kv">
            <span>{L("Instalments due so far", "Marejesho yaliyofika muda")}</span><span>{rep.dueCount}</span>
            <span>{L("Paid on time", "Yaliyolipwa kwa wakati")}</span><span>{rep.dueCount ? `${rep.onTime} (${Math.round((rep.share || 0) * 100)}%)` : "—"}</span>
            <span>{L("Loans fully repaid", "Mikopo iliyolipwa yote")}</span><span>{rep.repaidLoans}</span>
            <span>{L("Overdue now", "Iliyochelewa sasa")}</span><Money v={overdueAmount(state, business.id, t)} />
          </div>
          {g.score.firstTime && <p className="tiny muted mt">{L("First-time borrower: no repayment record yet.", "Mkopaji wa mara ya kwanza: bado hakuna rekodi ya marejesho.")}</p>}
        </Card>
      </div>
      {viewer !== "business" && lx.count > 0 && (
        <Card title={L("Same owner, other businesses", "Mmiliki huyo huyo, biashara nyingine")}>
          <p className="small muted mb">{L("An owner of this business (same NIDA) also owns other businesses on TijaPass. Their names stay private; the amounts below are what those businesses already owe through TijaPass.", "Mmiliki wa biashara hii (NIDA ile ile) ana biashara nyingine kwenye TijaPass. Majina yao ni siri; kiasi hapa chini ni wanachodaiwa kupitia TijaPass.")}</p>
          <div className="kv">
            <span>{L("Other businesses", "Biashara nyingine")}</span><span>{lx.count}</span>
            <span>{L("Open loans", "Mikopo inayoendelea")}</span><span>{lx.openLoans}</span>
            <span>{L("Their instalments per month", "Marejesho yao kwa mwezi")}</span><Money v={lx.monthly} />
            <span>{L("Overdue now", "Iliyochelewa sasa")}</span><Money v={lx.overdue} />
          </div>
        </Card>
      )}
      {viewer !== "business" && (
        <Card title={L("How the score was worked out", "Jinsi alama ilivyokokotolewa")}>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>{L("Factor", "Kipengele")}</th><th className="num">{L("Weight", "Uzito")}</th><th className="num">{L("Result", "Matokeo")}</th></tr></thead>
              <tbody>
                {Object.entries(g.score.parts).map(([k, v]) => <tr key={k}><td>{tl(FACTOR_NAMES[k]) || k}</td><td className="num">{g.score.weights[k]}</td><td className="num">{v == null ? "—" : `${round(v * 100)}%`}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Records Rating detail (RAT-10, RAT-12)
export function RatingDetail({ rating, business, mode = "business" }) {
  const { state, user } = useStore();
  const act = useAction();
  const [dispute, setDispute] = useState(false);
  const [why, setWhy] = useState("");
  const band = bandFor(rating.score);
  const disputeOpen = mode === "business" && rating.status === "final" && !rating.dispute && daysBetween(rating.date, today(state)) <= (state.settings.disputeDays ?? 7);
  return (
    <Card>
      <div className="between">
        <div>
          <h2>{L("TijaPass Records Rating", "Kiwango cha Kumbukumbu cha TijaPass")}</h2>
          <p className="small muted">{fmtDate(rating.date)} · {L("Officer", "Afisa")}: {rating.officer?.name}</p>
        </div>
        <span className="badge big" style={{ background: rating.status === "disputed" ? "#8a94a6" : band.color }}><i className="sw" />{tl(band)}, {rating.score}%{rating.status === "disputed" ? ` · ${L("under review", "inapitiwa")}` : ""}</span>
      </div>
      <div className="table-wrap mt">
        <table className="t">
          <thead><tr><th>{L("Check", "Kipimo")}</th><th className="num">{L("Points", "Alama")}</th></tr></thead>
          <tbody>
            {Object.keys(CHECKS).map((k) => <tr key={k}><td>{tl(CHECKS[k])}</td><td className="num">{rating.points[k]} / {CHECKS[k].max}</td></tr>)}
            <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{rating.score} / 100</td></tr>
          </tbody>
        </table>
      </div>
      {mode !== "fi" && tips(rating).length > 0 && (
        <div className="notice warn mt">
          <b>{L("How to improve", "Jinsi ya kuboresha")}</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{tips(rating).map((x, i) => <li key={i}>{tl(x)}</li>)}</ul>
        </div>
      )}
      {mode === "admin" && (
        <div className="stack mt">
          <div className="kv">
            <span>{L("Where", "Mahali")}</span><span>{rating.gps ? `${rating.gps.lat.toFixed(5)}, ${rating.gps.lng.toFixed(5)}` : L("Location not available", "Mahali haipatikani")}{rating.distanceM != null ? ` (${rating.distanceM} m)` : ""}</span>
            <span>{L("When", "Lini")}</span><span>{fmtDateTime(rating.visitAt)}</span>
            <span>{L("Re-check", "Kukagua upya")}</span><span>{rating.recheck?.done ? `${rating.recheck.score}% (${L("gap", "tofauti")} ${rating.recheck.gap})` : rating.recheck?.selected ? L("Picked, not done", "Imechaguliwa, bado") : L("Not picked", "Haikuchaguliwa")}</span>
          </div>
          {rating.locationFlag && <p className="notice bad">{L("Visit was far from the business's recorded location.", "Ziara ilikuwa mbali na eneo la biashara lililosajiliwa.")}</p>}
          <div className="row">{(rating.evidence || []).map((id) => <StoredImage key={id} id={id} />)}</div>
        </div>
      )}
      {rating.dispute && (
        <div className="notice mt">
          <b>{L("Dispute", "Pingamizi")}</b>
          {rating.dispute.reason}
          {rating.dispute.decision && <p className="mt"><b>{L("Decision", "Uamuzi")}:</b> {rating.dispute.decision} ({rating.dispute.before}% → {rating.dispute.after}%)</p>}
        </div>
      )}
      {mode === "business" && (
        <div className="row mt">
          {!rating.acknowledgedAt ? <button className="btn primary" onClick={() => act((d) => acknowledgeRating(d, user, rating.id), L("Thank you", "Asante"))}>{L("I have seen my rating", "Nimeona kiwango changu")}</button> : <Pill tone="green">{L("Seen", "Imeonwa")} {fmtDate(rating.acknowledgedAt)}</Pill>}
          {disputeOpen && <button className="btn" onClick={() => setDispute(true)}>{L("I disagree", "Sikubaliani")}</button>}
        </div>
      )}
      {dispute && (
        <Modal title={L("Disagree with this rating", "Pinga kiwango hiki")} onClose={() => setDispute(false)} actions={<><button className="btn" onClick={() => setDispute(false)}>{L("Cancel", "Ghairi")}</button><button className="btn primary" disabled={why.trim().length < 5} onClick={() => { act((d) => disputeRating(d, user, rating.id, why.trim()), L("Sent to TijaPass Admin", "Imetumwa kwa TijaPass Admin")); setDispute(false); }}>{L("Send", "Tuma")}</button></>}>
          <Field label={L("Tell us what is wrong", "Tueleze kilichokosewa")}><Area value={why} onChange={setWhy} /></Field>
        </Modal>
      )}
      <p className="tiny muted mt">{L("A monthly check of how complete, correct and on time the records are.", "Ukaguzi wa kila mwezi wa ukamilifu, usahihi na wakati wa kumbukumbu.")}</p>
    </Card>
  );
}

export function RatingHistory({ business, mode }) {
  const { state } = useStore();
  const list = ratingsFor(state, business.id).filter((r) => r.status !== "draft").reverse();
  const [open, setOpen] = useState(list[0]?.id);
  if (!list.length) return <Card><RatingBadge business={business} big /><p className="muted mt">{L("The first check comes about 30 days after joining.", "Ukaguzi wa kwanza unakuja takriban siku 30 baada ya kujiunga.")}</p></Card>;
  const shown = mode === "fi" ? list.filter((r) => daysBetween(r.date, today(state)) <= 186) : list;
  return (
    <div className="stack">
      <Card title={L("Monthly trend", "Mwenendo wa kila mwezi")}><RatingTrend businessId={business.id} /></Card>
      {shown.map((r) => (open === r.id ? <RatingDetail key={r.id} rating={r} business={business} mode={mode} /> : (
        <button key={r.id} className="card item" style={{ width: "100%" }} onClick={() => setOpen(r.id)}>
          <div className="grow"><b>{fmtDate(r.date)}</b></div>
          <span className="badge" style={{ background: bandFor(r.score).color }}><i className="sw" />{tl(bandFor(r.score))}, {r.score}%</span>
        </button>
      )))}
    </div>
  );
}

// ------------------------------------------------------------------ Loan tracker (FIN-05)
export function LoanTracker({ loan, business, canPay }) {
  const { state, user } = useStore();
  const act = useAction();
  const [ch, setCh] = useState(business.channels[0]?.id);
  const t = today(state);
  const rows = loan.schedule || loan.offer?.rows || [];
  const paid = rows.filter((r) => r.paidAt).reduce((x, r) => x + r.amount, 0);
  const next = rows.find((r) => !r.paidAt);
  const arrears = rows.filter((r) => !r.paidAt && r.due < t).reduce((x, r) => x + r.amount, 0);
  return (
    <div className="stack">
      <div className="grid g4 keep2">
        <div className="stat"><small>{L("Borrowed", "Kilichokopwa")}</small><strong>{money(loan.offer?.principal || loan.amount)}</strong></div>
        <div className="stat"><small>{L("Total to repay", "Jumla ya kurejesha")}</small><strong>{money(loan.offer?.totalRepay)}</strong></div>
        <div className="stat"><small>{L("Paid", "Kilicholipwa")}</small><strong>{money(paid)}</strong></div>
        <div className="stat"><small>{L("In arrears", "Kilichochelewa")}</small><strong className={arrears ? "red" : ""}>{money(arrears)}</strong></div>
      </div>
      {next && <p className="small">{L("Next due", "Linalofuata")}: <b>{fmtDate(next.due)}</b> · {money(next.amount)}</p>}
      {canPay && next && loan.status === "disbursed" && (
        <div className="row">
          <div style={{ flex: "1 1 180px" }}><Select value={ch} onChange={setCh} options={business.channels.map((c) => ({ value: c.id, label: c.name }))} /></div>
          <button className="btn primary" onClick={() => act((d) => payInstalment(d, user, loan.id, next.n, ch), L("Instalment paid", "Rejesho limelipwa"))}>{L("Pay next instalment", "Lipa rejesho linalofuata")} {money(next.amount)}</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>#</th><th>{L("Due", "Tarehe")}</th><th className="num">{L("Amount", "Kiasi")}</th><th>{L("Status", "Hali")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n}><td>{r.n}</td><td>{fmtDate(r.due)}</td><td className="num">{money(r.amount)}</td><td>{r.paidAt ? <Pill tone={r.paidAt.slice(0, 10) <= r.due ? "green" : "orange"}>{L("Paid", "Imelipwa")} {fmtDate(r.paidAt)}</Pill> : r.due < t ? <Pill tone="red">{L("Overdue", "Imechelewa")}</Pill> : <Pill tone="grey">{L("Due", "Inasubiri")}</Pill>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {loan.type === "asset" && <SupplierDelivery loan={loan} />}
    </div>
  );
}

function SupplierDelivery({ loan }) {
  const { state } = useStore();
  const q = state.quoteRequests.find((x) => x.id === loan.quoteId);
  if (!q) return null;
  const delivered = q.history.find((h) => h.event === "delivered");
  return <p className="notice">{L("Supplier delivery", "Usafirishaji wa msambazaji")}: {delivered ? `${L("confirmed", "umethibitishwa")} ${fmtDateTime(delivered.at)}` : L("waiting for the supplier to confirm delivery", "inasubiri msambazaji athibitishe kufikisha")}</p>;
}

// ------------------------------------------------------------------ Message thread tied to an item (MSG-01)
export function Thread({ threadKey, title, participants }) {
  const { state, user } = useStore();
  const act = useAction();
  const [text, setText] = useState("");
  const list = state.messages.filter((m) => m.threadKey === threadKey);
  const send = () => {
    if (!text.trim()) return;
    act((d) => sendMessage(d, user, { threadKey, title, text: text.trim(), participants }));
    setText("");
  };
  return (
    <div className="stack">
      {!list.length && <p className="small muted">{L("No messages yet.", "Bado hakuna ujumbe.")}</p>}
      {list.map((m) => (
        <div key={m.id} className="notice" style={m.from.id === user.id ? { background: "#fff4ec", borderColor: "#f6d3a8", marginLeft: 30 } : { marginRight: 30 }}>
          <b>{m.from.name}</b>
          {m.text}
          <div className="tiny muted mt">{fmtDateTime(m.at)}</div>
        </div>
      ))}
      <div className="row">
        <div style={{ flex: 1, minWidth: 180 }}><input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={L("Write a message", "Andika ujumbe")} /></div>
        <button className="btn primary" onClick={send}><Send size={18} />{L("Send", "Tuma")}</button>
      </div>
    </div>
  );
}

export const myThreads = (state, user) => {
  const keys = new Map();
  for (const m of state.messages) if (m.participants.some((p) => targets(user, p)) || m.from.id === user.id) keys.set(m.threadKey, m);
  return [...keys.values()].sort((a, b) => b.at.localeCompare(a.at));
};

export const newId = uid;

export const crType = (t) => tl({ profile: { en: "Profile change", sw: "Mabadiliko ya wasifu" }, correction: { en: "Correction", sw: "Marekebisho" }, stock: { en: "Stock update", sw: "Sasisho la stoku" }, channelOpening: { en: "New account's starting balance", sw: "Salio la kuanzia la akaunti mpya" }, closeChannel: { en: "Close a money account", sw: "Kufunga akaunti ya pesa" } }[t]) || t;
export const eventLabel = (e) => tl({
  requested: { en: "requested", sw: "imeombwa" }, quoted: { en: "quoted", sw: "nukuu imetolewa" }, accepted: { en: "accepted", sw: "imekubaliwa" }, declined: { en: "declined", sw: "imekataliwa" },
  invoiced: { en: "invoiced", sw: "ankara imetolewa" }, paid: { en: "paid", sw: "imelipwa" }, "paid by lender": { en: "paid by lender", sw: "imelipwa na mkopeshaji" }, delivered: { en: "delivered", sw: "imefikishwa" }, received: { en: "received", sw: "imepokelewa" }
}[e]) || e;
