// Finance for the business (CRD-06, FIN-01 to FIN-05).
import { useState } from "react";
import { FREQUENCIES, LOAN_TYPES, gates } from "../../core/credit.js";
import { addDays, money, today, uid } from "../../core/util.js";
import { declareExternalLoan, requestLoan, respondOffer, setConsent } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Area, Card, Chips, Confirm, DatePicker, Empty, Field, Select, StatusPill, Tabs, Text, fmtDate } from "../../ui/components.jsx";
import { LoanTracker, Passport, Thread, proposedLimits } from "../common.jsx";

export function approvedProducts(state) {
  return state.fis.filter((f) => f.status === "approved").flatMap((f) => f.products.filter((p) => p.active).map((p) => ({ ...p, fiId: f.id, fiName: f.name })));
}

function RequestLoan({ business, onDone }) {
  const { state, user } = useStore();
  const act = useAction();
  const [type, setType] = useState("working_capital");
  const [productKey, setProductKey] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [quoteId, setQuoteId] = useState("");
  const [askConsent, setAskConsent] = useState(null);
  const products = approvedProducts(state).filter((p) => p.type === type);
  const product = products.find((p) => `${p.fiId}:${p.id}` === productKey);
  const quotes = state.quoteRequests.filter((q) => q.requester.type === "business" && q.requester.id === business.id && ["quoted", "accepted"].includes(q.status));
  const quote = quotes.find((q) => q.id === quoteId);
  const limit = product ? proposedLimits(state, business, [product])[0]?.limit : 0;
  const g = gates(state, business, today(state));
  const amt = type === "asset" ? quote?.quote?.total || 0 : Number(amount) || 0;
  const ok = product && amt > 0 && purpose.trim().length > 2 && (type !== "asset" || quote) && product.frequencies.includes(frequency);
  const consented = product && business.consent?.fis?.[product.fiId]?.granted;
  const send = () => {
    act((d) => requestLoan(d, user, { id: uid("LN"), businessId: business.id, fiId: product.fiId, productId: product.id, type, amount: amt, purpose: purpose.trim(), frequency, quoteId: type === "asset" ? quoteId : null, checksAtRequest: g.results }), L("Loan request sent", "Ombi la mkopo limetumwa"));
    onDone();
  };
  const submit = () => (consented ? send() : setAskConsent(product));
  return (
    <Card title={L("Request a loan", "Omba mkopo")}>
      <div className="form">
        <Field label={L("Type of loan", "Aina ya mkopo")}><Chips value={type} onChange={(v) => { setType(v); setProductKey(""); }} options={Object.keys(LOAN_TYPES).map((k) => ({ value: k, label: tl(LOAN_TYPES[k]) }))} /></Field>
        <Field label={L("Lender and product", "Mkopeshaji na bidhaa")}>
          <Select value={productKey} onChange={setProductKey} placeholder={products.length ? L("Choose", "Chagua") : L("No product of this type yet", "Bado hakuna bidhaa ya aina hii")} options={products.map((p) => ({ value: `${p.fiId}:${p.id}`, label: `${p.fiName} · ${p.name} · ${p.annualRate}% ${L("a year", "kwa mwaka")}` }))} />
        </Field>
        {product && <p className="small muted">{L("Amounts", "Kiasi")}: {money(product.min)} – {money(product.max)} · {L("Fees", "Ada")}: {product.feePct}%{product.feeFixed ? ` + ${money(product.feeFixed)}` : ""} · {L("Your proposed limit", "Kiwango chako kinachopendekezwa")}: <b>{money(limit)}</b></p>}
        {type === "asset" ? (
          <Field label={L("Supplier quote", "Nukuu ya msambazaji")} hint={!quotes.length ? L("Asset finance needs a supplier quote. Ask a supplier for one under Suppliers.", "Mkopo wa mali unahitaji nukuu ya msambazaji. Omba nukuu kwenye Wasambazaji.") : null}>
            <Select value={quoteId} onChange={setQuoteId} placeholder={L("Choose a quote", "Chagua nukuu")} options={quotes.map((q) => ({ value: q.id, label: `${q.item} · ${money(q.quote?.total)} · ${state.suppliers.find((s) => s.id === q.supplierId)?.name}` }))} />
          </Field>
        ) : (
          <Field label={L("Amount (TZS)", "Kiasi (TZS)")}><AmountInput big value={amount} onChange={setAmount} /></Field>
        )}
        <Field label={L("Repayment", "Marejesho")}><Chips value={frequency} onChange={setFrequency} options={(product?.frequencies || Object.keys(FREQUENCIES)).map((k) => ({ value: k, label: tl(FREQUENCIES[k]) }))} /></Field>
        <Field label={L("What is it for?", "Ni kwa ajili ya nini?")}><Area value={purpose} onChange={setPurpose} rows={2} /></Field>
        {limit > 0 && amt > limit && <p className="notice warn">{L("This is more than your proposed limit; the lender may offer less.", "Hiki ni zaidi ya kiwango chako; mkopeshaji anaweza kutoa kidogo.")}</p>}
        {!g.passed && <p className="notice warn">{L("Some checks are not met yet (see Passport). The lender cannot make an offer until they are.", "Baadhi ya vigezo bado havijatimia (ona Pasipoti). Mkopeshaji hawezi kutoa ofa hadi vitimie.")}</p>}
        <button className="btn primary big" disabled={!ok} onClick={submit}>{L("Send request", "Tuma ombi")}</button>
      </div>
      {askConsent && (
        <Confirm
          title={L("Share your records with this lender?", "Shiriki kumbukumbu zako na mkopeshaji huyu?")}
          body={L(`${askConsent.fiName} will see your credit passport, Records Rating and statements, so it can assess your request. You can withdraw this at any time in Profile.`, `${askConsent.fiName} ataona pasipoti yako ya mkopo, Kiwango cha Kumbukumbu na taarifa za fedha, ili akague ombi lako. Unaweza kuondoa ridhaa hii wakati wowote kwenye Wasifu.`)}
          okLabel={L("Yes, share and send", "Ndiyo, shiriki na tuma")}
          onClose={() => setAskConsent(null)}
          onOk={() => { act((d) => setConsent(d, user, business.id, askConsent.fiId, true)); send(); }}
        />
      )}
    </Card>
  );
}

function MyLoans({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [ch, setCh] = useState(business.channels[0]?.id);
  const list = state.loans.filter((l) => l.businessId === business.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  if (!list.length) return <Empty text={L("No loan requests yet.", "Bado hakuna maombi ya mkopo.")} />;
  return list.map((l) => {
    const fi = state.fis.find((f) => f.id === l.fiId);
    return (
      <Card key={l.id} title={`${tl(LOAN_TYPES[l.type])} · ${money(l.offer?.principal || l.amount)}`} actions={<StatusPill status={l.status} />}>
        <p className="small muted">{fi?.name} · {L("requested", "imeombwa")} {fmtDate(l.requestedAt)} · {l.purpose}</p>
        {l.status === "offered" && (
          <div className="stack mt">
            <div className="notice">
              <b>{L("Offer", "Ofa")}: {l.offer.productName}</b>
              <div className="kv mt">
                <span>{L("You receive", "Utapokea")}</span><span>{money(l.offer.principal)}</span>
                <span>{L("Interest rate", "Riba")}</span><span>{l.offer.annualRate}% {L("a year", "kwa mwaka")}</span>
                <span>{L("Fees", "Ada")}</span><span>{money(l.offer.fees)}</span>
                <span>{L("Instalments", "Marejesho")}</span><span>{l.offer.instalments} × {tl(FREQUENCIES[l.offer.frequency])}</span>
                <span>{L("Cost of the loan", "Gharama ya mkopo")}</span><span>{money(l.offer.costOfCredit)}</span>
                <span><b>{L("Total you will repay", "Jumla utakayorejesha")}</b></span><span>{money(l.offer.totalRepay)}</span>
              </div>
            </div>
            {l.type !== "asset" && <Field label={L("Receive the money in", "Pokea pesa kwenye")}><Chips value={ch} onChange={setCh} options={business.channels.map((c) => ({ value: c.id, label: c.name }))} /></Field>}
            <div className="row">
              <button className="btn" onClick={() => act((d) => respondOffer(d, user, l.id, false), L("Offer declined", "Ofa imekataliwa"))}>{L("Decline", "Kataa")}</button>
              <button className="btn primary" onClick={() => act((d) => respondOffer(d, user, l.id, true, ch), L("Offer accepted", "Ofa imekubaliwa"))}>{L("Accept offer", "Kubali ofa")}</button>
            </div>
          </div>
        )}
        {["disbursed", "repaid"].includes(l.status) && <div className="mt"><LoanTracker loan={l} business={business} canPay /></div>}
        <details className="mt"><summary className="small bold" style={{ cursor: "pointer" }}>{L("Messages with the lender", "Ujumbe na mkopeshaji")}</summary><div className="mt"><Thread threadKey={`loan:${l.id}`} title={`Loan ${l.id}`} participants={[{ fiId: l.fiId }, { businessId: business.id }]} /></div></details>
      </Card>
    );
  });
}

function ExternalLoans({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const list = state.externalLoans.filter((x) => x.businessId === business.id && !x.archived);
  const [f, setF] = useState({ lender: "", balance: "", instalment: "", frequency: "monthly", remaining: "", nextDue: "" });
  const ok = f.lender.trim() && Number(f.balance) > 0 && Number(f.instalment) > 0 && Number(f.remaining) > 0 && f.nextDue;
  return (
    <div className="stack">
      {list.map((x) => (
        <Card key={x.id} title={x.lender} actions={<StatusPill status={x.status} />}>
          <div className="kv">
            <span>{L("Still owed", "Bado unadaiwa")}</span><span>{money(x.balance)}</span>
            <span>{L("Instalment", "Rejesho")}</span><span>{money(x.instalment)} · {tl(FREQUENCIES[x.frequency])}</span>
            <span>{L("Instalments left", "Marejesho yaliyobaki")}</span><span>{x.remaining}</span>
            <span>{L("Next due", "Linalofuata")}</span><span>{fmtDate(x.nextDue)}</span>
          </div>
          <p className="tiny muted mt">{L("Only TijaPass Admin can change a declared loan.", "TijaPass Admin pekee anaweza kubadilisha mkopo uliotajwa.")}</p>
        </Card>
      ))}
      <Card title={L("Declare a loan from outside TijaPass", "Taja mkopo kutoka nje ya TijaPass")}>
        <p className="small muted mb">{L("Declare each loan once. It lowers how much you can borrow here, so you are not over-borrowed.", "Taja kila mkopo mara moja. Unapunguza kiasi unachoweza kukopa hapa, ili usikope kupita uwezo.")}</p>
        <div className="form two">
          <Field label={L("Lender", "Mkopeshaji")}><Text value={f.lender} onChange={(v) => setF({ ...f, lender: v })} /></Field>
          <Field label={L("Amount still owed (TZS)", "Kiasi bado unadaiwa (TZS)")}><AmountInput value={f.balance} onChange={(v) => setF({ ...f, balance: v })} /></Field>
          <Field label={L("Instalment (TZS)", "Rejesho (TZS)")}><AmountInput value={f.instalment} onChange={(v) => setF({ ...f, instalment: v })} /></Field>
          <Field label={L("How often", "Mara ngapi")}><Chips value={f.frequency} onChange={(v) => setF({ ...f, frequency: v })} options={Object.keys(FREQUENCIES).map((k) => ({ value: k, label: tl(FREQUENCIES[k]) }))} /></Field>
          <Field label={L("Instalments left", "Marejesho yaliyobaki")}><Text value={f.remaining} onChange={(v) => setF({ ...f, remaining: v.replace(/\D/g, "") })} inputMode="numeric" /></Field>
          <Field label={L("Next due date", "Tarehe ya rejesho lijalo")}><DatePicker name={L("Next due date", "Tarehe ya rejesho lijalo")} newestFirst={false} min={today(state)} max={addDays(today(state), 3650)} value={f.nextDue} onChange={(v) => setF({ ...f, nextDue: v })} /></Field>
        </div>
        <button className="btn primary mt" disabled={!ok} onClick={() => act((d) => declareExternalLoan(d, user, { id: uid("XL"), businessId: business.id, lender: f.lender.trim(), balance: Number(f.balance), instalment: Number(f.instalment), frequency: f.frequency, remaining: Number(f.remaining), nextDue: f.nextDue }), L("Declared", "Imetajwa")) && setF({ lender: "", balance: "", instalment: "", frequency: "monthly", remaining: "", nextDue: "" })}>{L("Declare loan", "Taja mkopo")}</button>
      </Card>
    </div>
  );
}

export default function Finance() {
  const { state, user, params } = useStore();
  const b = myBusiness(state, user);
  const [tab, setTab] = useState(params.tab || "passport");
  const offers = state.loans.filter((l) => l.businessId === b.id && l.status === "offered").length;
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "passport", label: L("Credit passport", "Pasipoti ya mkopo") },
        { value: "request", label: L("Request a loan", "Omba mkopo") },
        { value: "loans", label: L("My loans", "Mikopo yangu"), count: offers },
        { value: "external", label: L("Loans outside TijaPass", "Mikopo nje ya TijaPass") }
      ]} />
      {tab === "passport" && <Passport business={b} products={approvedProducts(state)} />}
      {tab === "request" && <RequestLoan business={b} onDone={() => setTab("loans")} />}
      {tab === "loans" && <MyLoans business={b} />}
      {tab === "external" && <ExternalLoans business={b} />}
    </div>
  );
}
