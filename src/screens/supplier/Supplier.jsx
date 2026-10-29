// Supplier workspace (HOME-03, SUP-02 to SUP-04). A supplier sees only its own requests, quotes, orders and invoices.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { addDays, money, today, uid } from "../../core/util.js";
import { audit, notify, quoteStep } from "../../lib/actions.js";
import { myOrg } from "../../lib/access.js";
import { L } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, DatePicker, Empty, Field, Select, Stat, StatusPill, Tabs, Text, fmtDate, fmtDateTime } from "../../ui/components.jsx";
import { Thread, eventLabel } from "../common.jsx";

const requesterName = (state, q) => (q.requester.type === "business" ? state.businesses.find((b) => b.id === q.requester.id)?.profile.businessName : state.fis.find((f) => f.id === q.requester.id)?.name) || q.requester.name;

export function SupHome() {
  const { state, user, go } = useStore();
  const s = myOrg(state, user);
  const mine = state.quoteRequests.filter((q) => q.supplierId === s.id);
  const count = (...st) => mine.filter((q) => st.includes(q.status)).length;
  const financedUnpaid = mine.filter((q) => ["accepted", "invoiced"].includes(q.status) && state.loans.some((l) => l.quoteId === q.id && ["requested", "offered", "accepted"].includes(l.status)));
  return (
    <div className="stack">
      <section className="hero"><p className="eyebrow">{s.name}</p><h1>{L("Supplier dashboard", "Dashibodi ya msambazaji")}</h1><p>{L("Quote, deliver and get paid, including orders financed by lenders.", "Toa nukuu, peleka na ulipwe, pamoja na oda zinazofadhiliwa na wakopeshaji.")}</p></section>
      <div className="grid g4 keep2">
        <Stat label={L("Open quote requests", "Maombi ya nukuu wazi")} value={count("requested")} onClick={() => go("sup-quotes")} />
        <Stat label={L("Quotes awaiting reply", "Nukuu zinazosubiri jibu")} value={count("quoted")} onClick={() => go("sup-quotes", { tab: "quoted" })} />
        <Stat label={L("Orders to deliver", "Oda za kupeleka")} value={count("accepted", "invoiced", "paid")} onClick={() => go("sup-orders")} />
        <Stat label={L("Payments due", "Malipo yanayotarajiwa")} value={money(mine.filter((q) => ["accepted", "invoiced"].includes(q.status)).reduce((t, q) => t + (q.quote?.total || 0), 0))} note={`${financedUnpaid.length} ${L("awaiting lender", "zinasubiri mkopeshaji")}`} onClick={() => go("sup-orders")} />
      </div>
    </div>
  );
}

export function SupProducts() {
  const { state, user } = useStore();
  const act = useAction();
  const s = myOrg(state, user);
  const [f, setF] = useState({ name: "", price: "", unit: "piece" });
  const change = (fn, msg) => act((d) => { const sup = d.suppliers.find((x) => x.id === s.id); fn(sup); if (msg) audit(d, user, "Supplier products changed", s.id); }, msg);
  return (
    <div className="stack">
      <Card title={L("Products and prices", "Bidhaa na bei")}>
        {!s.products.length && <Empty text={L("No products yet.", "Bado hakuna bidhaa.")} />}
        <div className="list">
          {s.products.map((p) => (
            <div key={p.id} className="item">
              <div className="grow"><b>{p.name}</b><div className="small muted">{L("per", "kwa")} {p.unit}</div></div>
              <div style={{ width: 160 }}><AmountInput value={p.price} onChange={(v) => change((sup) => { sup.products = sup.products.map((x) => (x.id === p.id ? { ...x, price: Number(v) || 0 } : x)); })} /></div>
              <button className="icon-btn" aria-label={L("Remove", "Ondoa")} onClick={() => change((sup) => { sup.products = sup.products.filter((x) => x.id !== p.id); }, L("Removed", "Imeondolewa"))}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Add a product", "Ongeza bidhaa")}>
        <div className="form two">
          <Field label={L("Name", "Jina")}><Text value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label={L("Price (TZS)", "Bei (TZS)")}><AmountInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
          <Field label={L("Unit", "Kipimo")}><Text value={f.unit} onChange={(v) => setF({ ...f, unit: v })} /></Field>
        </div>
        <button className="btn primary mt" disabled={!f.name.trim() || !(Number(f.price) > 0)} onClick={() => { change((sup) => { sup.products.push({ id: uid("SP"), name: f.name.trim(), price: Number(f.price), unit: f.unit.trim() || "piece" }); }, L("Product added", "Bidhaa imeongezwa")); setF({ name: "", price: "", unit: "piece" }); }}><Plus size={18} />{L("Add", "Ongeza")}</button>
      </Card>
    </div>
  );
}

function QuoteForm({ q, onDone }) {
  const { state, user } = useStore();
  const act = useAction();
  const s = myOrg(state, user);
  const prod = s.products.find((p) => p.id === q.productId);
  const [unitPrice, setUnitPrice] = useState(prod?.price || "");
  const [validUntil, setValidUntil] = useState(addDays(today(state), 14));
  const [notes, setNotes] = useState("");
  const [shareFi, setShareFi] = useState("");
  const total = (Number(unitPrice) || 0) * q.qty;
  return (
    <div className="form mt">
      <div className="form two">
        <Field label={L("Unit price (TZS)", "Bei ya kipande (TZS)")}><AmountInput value={unitPrice} onChange={setUnitPrice} /></Field>
        <Field label={L("Valid until", "Inadumu hadi")}><DatePicker name={L("Valid until", "Inadumu hadi")} newestFirst={false} min={today(state)} max={addDays(today(state), 365)} value={validUntil} onChange={setValidUntil} /></Field>
        <Field label={L("Notes", "Maelezo")}><Text value={notes} onChange={setNotes} /></Field>
        {q.requester.type === "business" && <Field label={L("Also send to a lender (optional)", "Tuma pia kwa mkopeshaji (si lazima)")}><Select value={shareFi} onChange={setShareFi} placeholder={L("No", "Hapana")} options={state.fis.filter((f) => f.status === "approved").map((f) => ({ value: f.id, label: f.name }))} /></Field>}
      </div>
      <p>{L("Total", "Jumla")}: <b>{money(total)}</b></p>
      <button className="btn primary" disabled={!(total > 0)} onClick={() => { act((d) => { quoteStep(d, user, q.id, "quoted", { quote: { unitPrice: Number(unitPrice), total, validUntil, notes: notes.trim(), sharedWithFi: shareFi || null } }); if (shareFi) notify(d, { fiId: shareFi }, { en: "Supplier quote shared with you", sw: "Nukuu ya msambazaji imeshirikishwa kwako" }, { en: `${q.item}: TZS ${total.toLocaleString("en-US")}`, sw: `${q.item}: TZS ${total.toLocaleString("en-US")}` }, "fi-loans"); }, L("Quote sent", "Nukuu imetumwa")); onDone(); }}>{L("Send quote", "Tuma nukuu")}</button>
    </div>
  );
}

export function SupQuotes() {
  const { state, user, params } = useStore();
  const act = useAction();
  const s = myOrg(state, user);
  const [tab, setTab] = useState(params.tab || "requested");
  const [open, setOpen] = useState(null);
  const list = state.quoteRequests.filter((q) => q.supplierId === s.id && (tab === "requested" ? q.status === "requested" : tab === "quoted" ? q.status === "quoted" : ["declined"].includes(q.status)));
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "requested", label: L("New requests", "Maombi mapya"), count: state.quoteRequests.filter((q) => q.supplierId === s.id && q.status === "requested").length }, { value: "quoted", label: L("Quotes sent", "Nukuu zilizotumwa") }, { value: "declined", label: L("Declined", "Zilizokataliwa") }]} />
      {!list.length && <Empty text={L("Nothing here.", "Hakuna kitu hapa.")} />}
      {list.map((q) => (
        <Card key={q.id} title={`${q.item} × ${q.qty}`} actions={<StatusPill status={q.status} />}>
          <p className="small muted">{requesterName(state, q)} · {fmtDateTime(q.createdAt)}{q.note ? ` · “${q.note}”` : ""}</p>
          {q.quote && <p className="mt">{L("Quoted", "Nukuu")}: <b>{money(q.quote.total)}</b> · {L("valid until", "hadi")} {fmtDate(q.quote.validUntil)}</p>}
          {q.status === "requested" && (open === q.id ? <QuoteForm q={q} onDone={() => setOpen(null)} /> : <div className="row mt"><button className="btn" onClick={() => act((d) => quoteStep(d, user, q.id, "declined"))}>{L("Cannot supply", "Siwezi kusambaza")}</button><button className="btn primary" onClick={() => setOpen(q.id)}>{L("Write a quote", "Andika nukuu")}</button></div>)}
          <details className="mt"><summary className="small bold" style={{ cursor: "pointer" }}>{L("Messages", "Ujumbe")}</summary><div className="mt"><Thread threadKey={`quote:${q.id}`} title={q.item} participants={[q.requester.type === "business" ? { businessId: q.requester.id } : { fiId: q.requester.id }, { supplierId: s.id }]} /></div></details>
        </Card>
      ))}
    </div>
  );
}

export function SupOrders() {
  const { state, user } = useStore();
  const act = useAction();
  const s = myOrg(state, user);
  const list = state.quoteRequests.filter((q) => q.supplierId === s.id && ["accepted", "invoiced", "paid", "delivered", "received"].includes(q.status));
  return (
    <div className="stack">
      {!list.length && <Empty text={L("No orders yet. Accepted quotes appear here.", "Bado hakuna oda. Nukuu zilizokubaliwa zinaonekana hapa.")} />}
      {list.map((q) => {
        const loan = state.loans.find((l) => l.quoteId === q.id);
        return (
          <Card key={q.id} title={`${q.item} × ${q.qty} · ${money(q.quote?.total)}`} actions={<StatusPill status={q.status} />}>
            <p className="small muted">{requesterName(state, q)}{loan ? ` · ${L("financed by", "inafadhiliwa na")} ${state.fis.find((f) => f.id === loan.fiId)?.name} (${loan.status})` : ""}</p>
            <div className="kv mt">
              {q.invoice && <><span>{L("Invoice", "Ankara")}</span><span>{q.invoice.number} · {fmtDate(q.invoice.date)}</span></>}
              {q.delivery && <><span>{L("Delivery note", "Hati ya kufikisha")}</span><span>{q.delivery.number} · {fmtDate(q.delivery.date)}</span></>}
            </div>
            <div className="list mt">{q.history.map((h, i) => <div key={i} className="small">{fmtDateTime(h.at)} · {eventLabel(h.event)} · {h.by.name}</div>)}</div>
            <div className="row mt">
              {q.status === "accepted" && <button className="btn primary" onClick={() => act((d) => quoteStep(d, user, q.id, "invoiced", { invoice: { number: `INV-${q.id.slice(-6)}`, date: today(d), amount: q.quote.total, loanId: loan?.id || null } }), L("Invoice issued", "Ankara imetolewa"))}>{L("Issue invoice", "Toa ankara")}</button>}
              {["invoiced", "paid"].includes(q.status) && (!loan || q.status === "paid") && <button className="btn primary" onClick={() => act((d) => quoteStep(d, user, q.id, "delivered", { delivery: { number: `DN-${q.id.slice(-6)}`, date: today(d) } }), L("Delivery confirmed", "Kufikisha kumethibitishwa"))}>{L("Confirm delivery", "Thibitisha kufikisha")}</button>}
              {q.status === "invoiced" && loan && <p className="small muted">{L("Waiting for the lender to pay before delivery.", "Inasubiri mkopeshaji alipe kabla ya kupeleka.")}</p>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
