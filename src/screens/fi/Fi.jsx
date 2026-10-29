// Financial institution workspace (HOME-02, FIW-01 to FIW-06, FIN-04 to FIN-06, PKG-03, PKG-04).
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { assessmentFee, fiBill, fiPackage, needsAssessment, sponsorDiscountPct } from "../../core/billing.js";
import { FREQUENCIES, GATES, LOAN_TYPES, affordability, gates, maxInstalments, score, schedule, toMonthly } from "../../core/credit.js";
import { ageGroup as kpiAge } from "../../core/kpi.js";
import { bandFor, latestRating } from "../../core/rating.js";
import { REGIONS, SECTORS } from "../../core/seed.js";
import { addDays, money, monthKey, startOfMonth, sum, today, uid } from "../../core/util.js";
import { audit, disburse, logAssessment, makeOffer, rejectLoan, setFiPackage } from "../../lib/actions.js";
import { businessesInScope, myOrg } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, Chips, Empty, Field, Pill, RatingBadge, ReasonModal, Select, Stat, StatusPill, Tabs, Text, fmtDate } from "../../ui/components.jsx";
import { LoanTracker, Passport, RatingHistory, Statements, Thread } from "../common.jsx";
import { QuoteRequests } from "../shared.jsx";

const ACCESS = {
  starter: { en: "Passport, Records Rating and statements for the last 90 days", sw: "Pasipoti, Kiwango cha Kumbukumbu na taarifa za siku 90 zilizopita", days: 90 },
  growth: { en: "Everything in Starter, statements and cash movement for any period", sw: "Vyote vya Mwanzo, taarifa na mtiririko wa pesa kwa kipindi chochote", days: null },
  enterprise: { en: "Everything in Growth, plus custom integrations (priced separately)", sw: "Vyote vya Ukuaji, pamoja na miunganisho maalum (bei tofauti)", days: null }
};

export function FiHome() {
  const { state, user, go } = useStore();
  const fi = myOrg(state, user);
  const t = today(state);
  const biz = businessesInScope(state, user);
  const loans = state.loans.filter((l) => l.fiId === fi.id);
  const by = (s) => loans.filter((l) => l.status === s).length;
  const live = loans.filter((l) => l.status === "disbursed");
  const outstanding = sum(live, (l) => sum((l.schedule || []).filter((i) => !i.paidAt), (i) => i.principal));
  const dueSoon = sum(live, (l) => sum((l.schedule || []).filter((i) => !i.paidAt && i.due >= t && i.due <= addDays(t, 7)), (i) => i.amount));
  const overdue = sum(live, (l) => sum((l.schedule || []).filter((i) => !i.paidAt && i.due < t), (i) => i.amount));
  const used = state.assessments.filter((a) => a.fiId === fi.id && monthKey(a.date) === monthKey(t));
  return (
    <div className="stack">
      <section className="hero"><p className="eyebrow">{fi.name}</p><h1>{L("Lender dashboard", "Dashibodi ya mkopeshaji")}</h1><p>{L("Evidence-based lending to small businesses that chose to share their records with you.", "Mikopo yenye ushahidi kwa biashara ndogo zilizochagua kushiriki kumbukumbu zao nawe.")}</p></section>
      <div className="grid g4 keep2">
        <Stat label={L("Businesses that consented", "Biashara zilizotoa ridhaa")} value={biz.length} onClick={() => go("fi-directory")} />
        <Stat label={L("New requests", "Maombi mapya")} value={by("requested")} onClick={() => go("fi-loans", { status: "requested" })} />
        <Stat label={L("Offers waiting", "Ofa zinazosubiri")} value={by("offered")} onClick={() => go("fi-loans", { status: "offered" })} />
        <Stat label={L("Accepted, to disburse", "Zimekubaliwa, za kutoa")} value={by("accepted")} onClick={() => go("fi-loans", { status: "accepted" })} />
        <Stat label={L("Portfolio outstanding", "Jalada linalodaiwa")} value={money(outstanding)} note={`${live.length} ${L("loans", "mikopo")}`} onClick={() => go("fi-loans", { status: "disbursed" })} />
        <Stat label={L("Due in 7 days", "Yanadaiwa ndani ya siku 7")} value={money(dueSoon)} onClick={() => go("fi-loans", { status: "disbursed" })} />
        <Stat label={L("Overdue", "Yamechelewa")} value={money(overdue)} onClick={() => go("fi-loans", { status: "disbursed" })} />
        <Stat label={L("Assessments this month", "Tathmini mwezi huu")} value={used.length} note={money(sum(used, (a) => a.fee))} onClick={() => go("fi-billing")} />
      </div>
    </div>
  );
}

export function Directory() {
  const { state, user, go } = useStore();
  const t = today(state);
  const [f, setF] = useState({ sector: "", region: "", band: "", gender: "", age: "", minScore: "", sort: "score" });
  const rows = useMemo(() => businessesInScope(state, user).map((b) => ({ b, score: score(state, b, t).value, rating: latestRating(state, b.id) })), [state, user, t]);
  const shown = rows.filter(({ b, score: s, rating }) =>
    (!f.sector || b.profile.sector === f.sector) && (!f.region || b.profile.region === f.region) && (!f.gender || b.profile.gender === f.gender) && (!f.age || kpiAge(b, t, state.settings.youthMaxAge) === f.age) &&
    (!f.minScore || s >= Number(f.minScore)) && (!f.band || (f.band === "none" ? !rating : rating && bandFor(rating.score).key === f.band))
  ).sort((a, b) => (f.sort === "name" ? a.b.profile.businessName.localeCompare(b.b.profile.businessName) : f.sort === "rating" ? (b.rating?.score || 0) - (a.rating?.score || 0) : b.score - a.score));
  const fee = assessmentFee(state, myOrg(state, user), t);
  return (
    <div className="stack">
      <Card>
        <div className="form two">
          <Field label={L("Sector", "Sekta")}><Select value={f.sector} onChange={(v) => setF({ ...f, sector: v })} placeholder={L("All", "Zote")} options={SECTORS.map((s) => ({ value: s.id, label: tl(s) }))} /></Field>
          <Field label={L("Region", "Mkoa")}><Select value={f.region} onChange={(v) => setF({ ...f, region: v })} placeholder={L("All", "Yote")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
          <Field label={L("Records Rating", "Kiwango cha Kumbukumbu")}><Select value={f.band} onChange={(v) => setF({ ...f, band: v })} placeholder={L("All", "Vyote")} options={[...["excellent", "good", "okay", "poor"].map((k) => ({ value: k, label: k })), { value: "none", label: L("Not yet checked", "Bado haijakaguliwa") }]} /></Field>
          <Field label={L("Minimum score", "Alama ya chini")}><Text value={f.minScore} onChange={(v) => setF({ ...f, minScore: v.replace(/\D/g, "") })} inputMode="numeric" /></Field>
          <Field label={L("Gender", "Jinsia")}><Select value={f.gender} onChange={(v) => setF({ ...f, gender: v })} placeholder={L("All", "Wote")} options={[{ value: "female", label: L("Women", "Wanawake") }, { value: "male", label: L("Men", "Wanaume") }]} /></Field>
          <Field label={L("Age group", "Kundi la umri")}><Select value={f.age} onChange={(v) => setF({ ...f, age: v })} placeholder={L("All", "Wote")} options={[{ value: "youth", label: L("Youth (35 and under)", "Vijana (35 na chini)") }, { value: "adult", label: L("Over 35", "Zaidi ya 35") }]} /></Field>
          <Field label={L("Sort by", "Panga kwa")}><Chips value={f.sort} onChange={(v) => setF({ ...f, sort: v })} options={[{ value: "score", label: L("Score", "Alama") }, { value: "rating", label: L("Rating", "Kiwango") }, { value: "name", label: L("Name", "Jina") }]} /></Field>
        </div>
      </Card>
      <p className="small muted">{L("Only businesses that consented to you appear. Opening one counts as an assessment", "Biashara zilizokupa ridhaa tu ndizo zinaonekana. Kufungua moja ni tathmini")} ({money(fee)}, {L("once per business per day", "mara moja kwa biashara kwa siku")}).</p>
      <Card>
        {!shown.length && <Empty text={L("No consenting businesses match.", "Hakuna biashara zinazolingana.")} />}
        <div className="list">
          {shown.map(({ b, score: s }) => (
            <button key={b.id} className="item" onClick={() => go("fi-business", { id: b.id })} style={{ flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 180 }}><b>{b.profile.businessName}</b><div className="small muted">{tl(SECTORS.find((x) => x.id === b.profile.sector))} · {b.profile.region}</div></div>
              <Pill>{L("Score", "Alama")} {s}</Pill>
              <RatingBadge business={b} withDate={false} />
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function FiBusiness() {
  const { state, user, params, update } = useStore();
  const fi = myOrg(state, user);
  const b = businessesInScope(state, user).find((x) => x.id === params.id);
  const [tab, setTab] = useState("passport");
  const t = today(state);
  const due = b && needsAssessment(state, fi.id, b.id, t);
  useEffect(() => { if (due) update((d) => logAssessment(d, user, fi.id, b.id)); }, [due]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <Empty text={L("This business has not given you consent, or has withdrawn it.", "Biashara hii haijakupa ridhaa, au imeiondoa.")} />;
  const pkg = fi.packageId || "starter";
  const limitDays = ACCESS[pkg]?.days;
  const loans = state.loans.filter((l) => l.businessId === b.id && ["disbursed", "repaid"].includes(l.status));
  const ext = state.externalLoans.filter((x) => x.businessId === b.id && !x.archived);
  return (
    <div className="stack">
      <div className="between"><div><h2>{b.profile.businessName}</h2><p className="small muted">{b.profile.ownerName} · {b.profile.region} · {L("member since", "mwanachama tangu")} {fmtDate(b.startDate)}</p></div><RatingBadge business={b} big /></div>
      <p className="small muted">{L("Assessment logged for today", "Tathmini imeandikwa kwa leo")}: {money(state.assessments.find((a) => a.fiId === fi.id && a.businessId === b.id && a.date === t)?.fee ?? assessmentFee(state, fi, t))} · {tl(ACCESS[pkg])}</p>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "passport", label: L("Passport", "Pasipoti") }, { value: "rating", label: L("Records Rating", "Kiwango") }, { value: "statements", label: L("Statements", "Taarifa") }, { value: "cash", label: L("Cash movement", "Mtiririko wa pesa") }, { value: "loans", label: L("Existing loans", "Mikopo iliyopo") }, { value: "messages", label: L("Messages", "Ujumbe") }]} />
      {tab === "passport" && <Passport business={b} products={fi.products} viewer="fi" />}
      {tab === "rating" && <RatingHistory business={b} mode="fi" />}
      {(tab === "statements" || tab === "cash") && (limitDays ? <LimitedStatements business={b} days={limitDays} initial={tab === "cash" ? "cf" : "is"} /> : <Statements key={tab} business={b} initial={tab === "cash" ? "cf" : "is"} />)}
      {tab === "loans" && (
        <div className="stack">
          {loans.map((l) => <Card key={l.id} title={`${state.fis.find((f) => f.id === l.fiId)?.name} · ${money(l.offer.principal)}`} actions={<StatusPill status={l.status} />}><LoanTracker loan={l} business={b} /></Card>)}
          <Card title={L("Declared loans outside TijaPass", "Mikopo ya nje iliyotajwa")}>
            {!ext.length && <p className="small muted">{L("None declared.", "Hakuna iliyotajwa.")}</p>}
            {ext.map((x) => <div key={x.id} className="item"><div className="grow"><b>{x.lender}</b><div className="small muted">{money(x.instalment)} · {tl(FREQUENCIES[x.frequency])} · {x.remaining} {L("left", "zimebaki")}</div></div><b>{money(x.balance)}</b></div>)}
          </Card>
        </div>
      )}
      {tab === "messages" && <Card><Thread threadKey={`fi:${fi.id}:${b.id}`} title={`${fi.name} · ${b.profile.businessName}`} participants={[{ fiId: fi.id }, { businessId: b.id }]} /></Card>}
    </div>
  );
}

function LimitedStatements({ business, days, initial }) {
  const { state } = useStore();
  const t = today(state);
  return (
    <div className="stack">
      <p className="notice">{L(`Your package shows the last ${days} days. Growth and Enterprise show any period.`, `Kifurushi chako kinaonyesha siku ${days} zilizopita. Ukuaji na Biashara kubwa zinaonyesha kipindi chochote.`)}</p>
      <StatementsWindow business={business} from={addDays(t, -days + 1)} initial={initial} />
    </div>
  );
}

function StatementsWindow({ business, from, initial }) {
  // Same statements, with the date range clamped to the package's window.
  return <Statements business={business} initial={initial} minDate={from} />;
}

export function FiLoans() {
  const { state, user, params, go } = useStore();
  const fi = myOrg(state, user);
  const [status, setStatus] = useState(params.status || "requested");
  const loans = state.loans.filter((l) => l.fiId === fi.id);
  const groups = { requested: ["requested"], offered: ["offered"], accepted: ["accepted"], disbursed: ["disbursed"], closed: ["repaid", "rejected", "declined"] };
  const list = loans.filter((l) => groups[status].includes(l.status));
  return (
    <div className="stack">
      <Tabs value={status} onChange={setStatus} tabs={[["requested", L("New", "Mapya")], ["offered", L("Offered", "Ofa")], ["accepted", L("Accepted", "Zimekubaliwa")], ["disbursed", L("Active", "Hai")], ["closed", L("Closed", "Zimefungwa")]].map(([value, label]) => ({ value, label, count: loans.filter((l) => groups[value].includes(l.status)).length }))} />
      {!list.length && <Empty text={L("Nothing here.", "Hakuna kitu hapa.")} />}
      {list.map((l) => {
        const b = state.businesses.find((x) => x.id === l.businessId);
        return (
          <button key={l.id} className="card item" style={{ width: "100%" }} onClick={() => go("fi-loan", { id: l.id })}>
            <div className="grow"><b>{b?.profile.businessName} · {money(l.offer?.principal || l.amount)}</b><div className="small muted">{tl(LOAN_TYPES[l.type])} · {fmtDate(l.requestedAt)} · {l.purpose}</div></div>
            <StatusPill status={l.status} />
          </button>
        );
      })}
    </div>
  );
}

export function FiLoan() {
  const { state, user, params, go } = useStore();
  const act = useAction();
  const fi = myOrg(state, user);
  const l = state.loans.find((x) => x.id === params.id && x.fiId === fi.id);
  const b = l && state.businesses.find((x) => x.id === l.businessId);
  const t = today(state);
  const products = fi.products.filter((p) => p.active && p.type === l?.type);
  const [productId, setProductId] = useState(l?.productId || products[0]?.id || "");
  const product = products.find((p) => p.id === productId);
  const [principal, setPrincipal] = useState(l?.amount || "");
  const [frequency, setFrequency] = useState(l?.frequency || "monthly");
  const [n, setN] = useState("6");
  const [reject, setReject] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  if (!l || !b) return <Empty text={L("Loan not found.", "Mkopo haupatikani.")} />;
  const consented = b.consent?.fis?.[fi.id]?.granted;
  const g = gates(state, b, t);
  const a = affordability(state, b, t);
  const maxN = Math.min(product?.maxInstalments || 12, maxInstalments(state, b.id, frequency));
  const inst = Math.max(1, Math.min(maxN, Number(n) || 1));
  const preview = product && Number(principal) > 0 ? schedule({ principal: Number(principal), annualRate: product.annualRate, frequency, instalments: inst, feePct: product.feePct, feeFixed: product.feeFixed, start: t }) : null;
  const fits = preview && toMonthly(preview.firstMaxAmount, frequency) <= a.capacity + 0.5;
  const quote = l.quoteId && state.quoteRequests.find((q) => q.id === l.quoteId);
  return (
    <div className="stack">
      <button className="btn ghost" onClick={() => go("fi-loans", { status: l.status })}>← {L("Loan requests", "Maombi ya mikopo")}</button>
      <Card title={`${b.profile.businessName} · ${money(l.amount)}`} actions={<StatusPill status={l.status} />}>
        <div className="kv">
          <span>{L("Type", "Aina")}</span><span>{tl(LOAN_TYPES[l.type])}</span>
          <span>{L("Purpose", "Madhumuni")}</span><span>{l.purpose}</span>
          <span>{L("Preferred repayment", "Marejesho yanayopendelewa")}</span><span>{tl(FREQUENCIES[l.frequency])}</span>
          {quote && <><span>{L("Supplier quote", "Nukuu ya msambazaji")}</span><span>{quote.item} · {money(quote.quote?.total)} · {state.suppliers.find((s) => s.id === quote.supplierId)?.name}</span></>}
          <span>{L("Records Rating", "Kiwango")}</span><span><RatingBadge business={b} /></span>
          <span>{L("Indicative score", "Alama ya makadirio")}</span><span>{g.score.value}/100</span>
          <span>{L("Can repay per month", "Uwezo wa kurejesha kwa mwezi")}</span><span>{money(a.capacity)}</span>
        </div>
        {consented && <button className="btn mt" onClick={() => go("fi-business", { id: b.id })}>{L("Open the business's file", "Fungua faili la biashara")}</button>}
        {!consented && <p className="notice bad mt">{L("The business has withdrawn consent.", "Biashara imeondoa ridhaa.")}</p>}
      </Card>
      {l.status === "requested" && consented && (
        <Card title={L("Make an offer", "Toa ofa")}>
          {!g.passed && !g.needsReview && <p className="notice bad mb"><b>{L("Checks not met: no offer possible yet", "Vigezo havijatimia: ofa haiwezekani bado")}</b>{Object.keys(g.results).filter((k) => g.results[k] !== true).map((k) => <div key={k}>✗ {tl(GATES[k])}</div>)}</p>}
          {g.needsReview && (
            <div className="notice warn mb">
              <b>{L("Records Rating is Okay (50–69): your own review is required", "Kiwango ni Wastani (50–69): mapitio yako yanahitajika")}</b>
              {L("All other checks are met. Review the business's statements, rating details and evidence, then record what you checked. Your review is kept with the offer.", "Vigezo vingine vyote vimetimia. Pitia taarifa za biashara, kiwango na ushahidi, kisha andika ulichokagua. Mapitio yako yanahifadhiwa pamoja na ofa.")}
              <label className="check mt"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{L("I have reviewed this business's records myself", "Nimekagua kumbukumbu za biashara hii mwenyewe")}</label>
              <textarea className="input mt" rows={2} placeholder={L("What you checked and why you are comfortable (at least 10 characters)", "Ulichokagua na kwa nini unaridhika (angalau herufi 10)")} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
            </div>
          )}
          <div className="form two">
            <Field label={L("Product", "Bidhaa")}><Select value={productId} onChange={setProductId} options={products.map((p) => ({ value: p.id, label: `${p.name} · ${p.annualRate}%` }))} /></Field>
            <Field label={L("Amount (TZS)", "Kiasi (TZS)")} hint={product ? `${money(product.min)} – ${money(product.max)}` : null}><AmountInput value={principal} onChange={setPrincipal} /></Field>
            <Field label={L("Repayment", "Marejesho")}><Chips value={frequency} onChange={setFrequency} options={(product?.frequencies || []).map((k) => ({ value: k, label: tl(FREQUENCIES[k]) }))} /></Field>
            <Field label={`${L("Instalments", "Idadi ya marejesho")} (${L("max", "juu")} ${maxN})`}><Text value={n} onChange={(v) => setN(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
          </div>
          {preview && (
            <div className="stack mt">
              <div className="kv">
                <span>{L("Fees", "Ada")}</span><span>{money(preview.fees)}</span>
                <span>{L("Largest instalment", "Rejesho kubwa zaidi")}</span><span>{money(preview.firstMaxAmount)}</span>
                <span>{L("Cost of credit", "Gharama ya mkopo")}</span><span>{money(preview.costOfCredit)}</span>
                <span><b>{L("Total to repay", "Jumla ya kurejesha")}</b></span><span>{money(preview.totalRepay)}</span>
              </div>
              <p className={`notice ${fits ? "good" : "bad"}`}>{fits ? L("The largest instalment fits the business's affordability.", "Rejesho kubwa zaidi linaendana na uwezo wa biashara.") : L("The largest instalment is more than the business can repay. Lower the amount or add instalments.", "Rejesho kubwa zaidi ni zaidi ya uwezo wa biashara. Punguza kiasi au ongeza marejesho.")}</p>
            </div>
          )}
          <div className="row mt">
            <button className="btn danger" onClick={() => setReject(true)}>{L("Do not approve", "Usiidhinishe")}</button>
            <button className="btn primary" disabled={!(g.passed || (g.needsReview && reviewed && reviewNote.trim().length >= 10)) || !fits || !product || Number(principal) < product.min || Number(principal) > product.max} onClick={() => act((d) => makeOffer(d, user, l.id, { fiId: fi.id, product, principal: Number(principal), frequency, instalments: inst, manualReview: g.needsReview ? { reason: reviewNote.trim() } : null }), L("Offer sent", "Ofa imetumwa"))}>{L("Send offer", "Tuma ofa")}</button>
          </div>
        </Card>
      )}
      {l.offer?.manualReview && <p className="notice"><b>{L("Offered after the lender's own review (Okay rating)", "Ofa baada ya mapitio ya mkopeshaji (kiwango cha Wastani)")}</b>{l.offer.manualReview.reason} · {l.offer.manualReview.by?.name} · {fmtDate(l.offer.manualReview.at)}</p>}
      {l.status === "offered" && <p className="notice">{L("Waiting for the business to accept the offer.", "Inasubiri biashara ikubali ofa.")} {L("Total to repay", "Jumla ya kurejesha")}: {money(l.offer.totalRepay)}</p>}
      {l.status === "accepted" && <Card title={L("Disburse", "Toa mkopo")}><p className="small muted mb">{L("Consent, affordability and the Records Rating are checked again now.", "Ridhaa, uwezo wa kulipa na Kiwango vinakaguliwa tena sasa.")}{l.type === "asset" ? ` ${L("The money goes to the supplier, who then delivers.", "Pesa inaenda kwa msambazaji, kisha anapeleka.")}` : ""}</p>{consented ? <button className="btn primary" onClick={() => act((d) => disburse(d, user, l.id), L("Disbursed (simulated)", "Imetolewa (mfano)"))}>{L("Disburse (simulated)", "Toa (mfano)")} {money(l.offer.principal)}</button> : <p className="notice bad">{L("The business withdrew consent, so the loan cannot be paid out.", "Biashara imeondoa ridhaa, hivyo mkopo hauwezi kutolewa.")}</p>}</Card>}
      {["disbursed", "repaid"].includes(l.status) && <Card title={L("Loan tracker", "Ufuatiliaji wa mkopo")}><LoanTracker loan={l} business={b} /></Card>}
      <Card title={L("Messages", "Ujumbe")}><Thread threadKey={`loan:${l.id}`} title={`Loan ${l.id}`} participants={[{ fiId: fi.id }, { businessId: b.id }]} /></Card>
      {reject && <ReasonModal title={L("Do not approve", "Usiidhinishe")} danger onClose={() => setReject(false)} onSubmit={(r) => act((d) => rejectLoan(d, user, l.id, r), L("Request closed", "Ombi limefungwa"))} />}
    </div>
  );
}

const emptyProduct = () => ({ id: "", name: "", type: "working_capital", annualRate: 24, feePct: 2, feeFixed: 0, min: 100000, max: 3000000, frequencies: ["monthly"], maxInstalments: 12, active: true });

export function Products() {
  const { state, user } = useStore();
  const act = useAction();
  const fi = myOrg(state, user);
  const [edit, setEdit] = useState(null);
  const save = () => act((d) => {
    const f = d.fis.find((x) => x.id === fi.id);
    const p = { ...edit, annualRate: Number(edit.annualRate) || 0, feePct: Number(edit.feePct) || 0, feeFixed: Number(edit.feeFixed) || 0, min: Number(edit.min) || 0, max: Number(edit.max) || 0, maxInstalments: Number(edit.maxInstalments) || 1 };
    if (p.id) f.products = f.products.map((x) => (x.id === p.id ? p : x));
    else f.products.push({ ...p, id: uid("P") });
    audit(d, user, "Loan product saved", fi.id, { after: p });
  }, L("Product saved", "Bidhaa imehifadhiwa")) && setEdit(null);
  return (
    <div className="stack">
      <Card title={L("Loan products", "Bidhaa za mikopo")} actions={<button className="btn small primary" onClick={() => setEdit(emptyProduct())}><Plus size={16} />{L("New product", "Bidhaa mpya")}</button>}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Product", "Bidhaa")}</th><th className="num">{L("Rate", "Riba")}</th><th className="num">{L("Fees", "Ada")}</th><th className="num">{L("Amounts", "Kiasi")}</th><th>{L("Repayment", "Marejesho")}</th><th /></tr></thead><tbody>
          {fi.products.map((p) => <tr key={p.id}><td>{p.name}<div className="tiny muted">{tl(LOAN_TYPES[p.type])}{p.active ? "" : ` · ${L("inactive", "haitumiki")}`}</div></td><td className="num">{p.annualRate}%</td><td className="num">{p.feePct}%{p.feeFixed ? ` + ${money(p.feeFixed)}` : ""}</td><td className="num">{money(p.min)} – {money(p.max)}</td><td className="small">{p.frequencies.map((f) => tl(FREQUENCIES[f])).join(", ")} · ≤{p.maxInstalments}</td><td><button className="btn small" onClick={() => setEdit({ ...p })}>{L("Edit", "Hariri")}</button></td></tr>)}
        </tbody></table></div>
      </Card>
      {edit && (
        <Card title={edit.id ? L("Edit product", "Hariri bidhaa") : L("New product", "Bidhaa mpya")}>
          <div className="form two">
            <Field label={L("Name", "Jina")}><Text value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
            <Field label={L("Type", "Aina")}><Select value={edit.type} onChange={(v) => setEdit({ ...edit, type: v })} options={Object.keys(LOAN_TYPES).map((k) => ({ value: k, label: tl(LOAN_TYPES[k]) }))} /></Field>
            <Field label={L("Interest rate (% a year)", "Riba (% kwa mwaka)")}><Text value={String(edit.annualRate)} onChange={(v) => setEdit({ ...edit, annualRate: v.replace(/[^\d.]/g, "") })} inputMode="decimal" /></Field>
            <Field label={L("Fee (% of amount)", "Ada (% ya kiasi)")}><Text value={String(edit.feePct)} onChange={(v) => setEdit({ ...edit, feePct: v.replace(/[^\d.]/g, "") })} inputMode="decimal" /></Field>
            <Field label={L("Fixed fee (TZS)", "Ada ya kudumu (TZS)")}><AmountInput value={edit.feeFixed} onChange={(v) => setEdit({ ...edit, feeFixed: v })} /></Field>
            <Field label={L("Most instalments", "Marejesho mengi zaidi")}><Text value={String(edit.maxInstalments)} onChange={(v) => setEdit({ ...edit, maxInstalments: v.replace(/\D/g, "") })} inputMode="numeric" /></Field>
            <Field label={L("Smallest amount", "Kiasi kidogo")}><AmountInput value={edit.min} onChange={(v) => setEdit({ ...edit, min: v })} /></Field>
            <Field label={L("Largest amount", "Kiasi kikubwa")}><AmountInput value={edit.max} onChange={(v) => setEdit({ ...edit, max: v })} /></Field>
            <Field label={L("Repayment frequencies", "Marudio ya marejesho")}><Chips multi value={edit.frequencies} onChange={(v) => setEdit({ ...edit, frequencies: v })} options={Object.keys(FREQUENCIES).map((k) => ({ value: k, label: tl(FREQUENCIES[k]) }))} /></Field>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />{L("Offered to businesses", "Inatolewa kwa biashara")}</label>
          </div>
          <div className="row mt"><button className="btn" onClick={() => setEdit(null)}>{L("Cancel", "Ghairi")}</button><button className="btn primary" disabled={!edit.name.trim() || !edit.frequencies.length || Number(edit.max) < Number(edit.min)} onClick={save}>{L("Save", "Hifadhi")}</button></div>
        </Card>
      )}
    </div>
  );
}

export function FiSuppliers() {
  const { state, user } = useStore();
  const fi = myOrg(state, user);
  return <QuoteRequests requester={{ type: "fi", id: fi.id, name: fi.name }} />;
}

export function Billing() {
  const { state, user } = useStore();
  const act = useAction();
  const fi = myOrg(state, user);
  const t = today(state);
  const [month, setMonth] = useState(monthKey(t));
  const [pkg, setPkg] = useState(fi.packageId || "starter");
  const [billing, setBillingMode] = useState(fi.billing || "monthly");
  const bill = fiBill(state, fi, month, t);
  const tier = state.packages.sponsorTiers.find((x) => x.id === (fi.sponsorTier || "standard"));
  const months = [monthKey(t), monthKey(addDays(startOfMonth(t), -1)), monthKey(addDays(startOfMonth(addDays(startOfMonth(t), -1)), -1))];
  return (
    <div className="stack">
      <div className="grid g3">
        {state.packages.fi.map((p) => (
          <Card key={p.id} title={tl(p)}>
            <strong style={{ fontSize: 22, fontFamily: "Manrope, Inter, sans-serif" }}>{money(p.monthly)}</strong><span className="small muted"> / {L("month", "mwezi")}</span>
            <p className="small muted">{money(p.annual)} / {L("year (10% off)", "mwaka (punguzo 10%)")}</p>
            <p className="small mt">{L("Per assessment", "Kwa tathmini")}: <b>{money(p.perAssessment)}</b> · {L("unlimited", "bila kikomo")}</p>
            <p className="small muted">{tl(ACCESS[p.id])}</p>
            <button className={`btn block mt ${pkg === p.id ? "navy" : ""}`} onClick={() => setPkg(p.id)}>{pkg === p.id ? L("Selected", "Imechaguliwa") : L("Choose", "Chagua")}</button>
          </Card>
        ))}
      </div>
      <Card>
        <Field label={L("Billing", "Malipo")}><Chips value={billing} onChange={setBillingMode} options={[{ value: "monthly", label: L("Monthly", "Kila mwezi") }, { value: "annual", label: L("Annual (10% off)", "Kila mwaka (punguzo 10%)") }]} /></Field>
        <button className="btn primary mt" disabled={pkg === fi.packageId && billing === fi.billing} onClick={() => act((d) => setFiPackage(d, user, fi.id, pkg, billing), L("Package changed", "Kifurushi kimebadilishwa"))}>{L("Save package", "Hifadhi kifurushi")}</button>
        <p className="small muted mt">{L("Sponsorship", "Udhamini")}: <b>{tl(tier)}</b> · {L("discount now", "punguzo sasa")} {sponsorDiscountPct(state, fi, t)}% {tier?.id !== "standard" ? `(${L("year 1", "mwaka 1")} ${tier.year1}%, ${L("years 2–3", "miaka 2–3")} ${tier.years23}%, ${L("standard from year 4", "kawaida kuanzia mwaka 4")})` : ""}</p>
      </Card>
      <Card title={L("Bill", "Bili")} actions={<Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: m }))} />}>
        <div className="kv">
          <span>{L("Package", "Kifurushi")}</span><span>{tl(fiPackage(state, fi))} · {fi.billing}</span>
          <span>{L("Subscription", "Usajili")}</span><span>{money(bill.subscriptionFull)}{bill.discount ? ` − ${bill.discount}% = ${money(bill.subscription)}` : ""}</span>
          <span>{L("Assessments", "Tathmini")}</span><span>{bill.assessments.length} · {money(bill.assessmentTotal)}</span>
          {state.settings.fiFees?.disbursementOn && <><span>{L("Disbursement service", "Huduma ya utoaji")} ({state.settings.fiFees.disbursementPct}%)</span><span>{bill.disbursements.length} · {money(bill.disbursementTotal)}</span></>}
          {state.settings.fiFees?.collectionOn && <><span>{L("Collection service", "Huduma ya ukusanyaji")} ({state.settings.fiFees.collectionPct}%)</span><span>{bill.collections.length} · {money(bill.collectionTotal)}</span></>}
          <span><b>{L("Total", "Jumla")}</b></span><span>{money(bill.total)}</span>
        </div>
        <div className="table-wrap mt"><table className="t"><thead><tr><th>{L("Date", "Tarehe")}</th><th>{L("Business", "Biashara")}</th><th className="num">{L("Fee", "Ada")}</th></tr></thead><tbody>
          {bill.assessments.map((a) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{state.businesses.find((b) => b.id === a.businessId)?.profile.businessName}</td><td className="num">{money(a.fee)}</td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  );
}
