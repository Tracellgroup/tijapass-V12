// Screens used by several user types: Help, Messages, Wallet, Packages, quote requests, organisation profile.
import { CheckCircle2, MessageCircle, Phone, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FEATURES, FREE_BENEFITS, activePackage, activeSubscription, featuresOf, hasFeature } from "../core/billing.js";
import { addDays, money, nowISO, today, uid } from "../core/util.js";
import { createQuery, payPackage, quoteStep, requestQuote } from "../lib/actions.js";
import { askHelp } from "../lib/ai.js";
import { myBusiness, myOrg } from "../lib/access.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useAction, useStore } from "../lib/store.jsx";
import { FAQ, TOPICS } from "../content/faq.js";
import { guideFor } from "../content/guide.js";
import { AmountInput, Area, Card, Chips, Empty, Field, Modal, Select, StatusPill, Tabs, Text, VoiceButton, fmtDate, fmtDateTime } from "../ui/components.jsx";
import { MENUS, menuFor } from "../ui/menus.js";
import { Thread, myThreads } from "./common.jsx";

// ------------------------------------------------------------------ Help (HLP-01 to HLP-04)
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9À-ɏ]+/).filter((w) => w.length > 2);
function searchFaq(list, query) {
  const qw = words(query);
  if (!qw.length) return list;
  return list
    .map((f) => {
      const text = `${f.q.en} ${f.q.sw} ${f.a.en} ${f.a.sw}`.toLowerCase();
      return { f, n: qw.filter((w) => text.includes(w)).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.f);
}

// Guide screenshots (HLP-01) live in public/guide/en.json and sw.json, loaded once per language.
const shotCache = {};
function useGuideShots(active) {
  const lang = getLang();
  const [shots, setShots] = useState(shotCache[lang] || null);
  useEffect(() => {
    if (!active || shotCache[lang]) { setShots(shotCache[lang] || null); return; }
    let live = true;
    fetch(`/guide/${lang}.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { shotCache[lang] = j; if (live) setShots(j); }).catch(() => {});
    return () => { live = false; };
  }, [active, lang]);
  return shots;
}

export function Help() {
  const { state, user, params } = useStore();
  const act = useAction();
  const [tab, setTab] = useState(params.tab || "guide");
  const [zoom, setZoom] = useState(null);
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState([]);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [complaint, setComplaint] = useState(false);
  const faq = FAQ.filter((f) => !f.roles || f.roles.includes(user.role) || ["officer", "dataAdmin", "systemAdmin", "super"].includes(user.role));
  const found = useMemo(() => searchFaq(faq, query), [faq, query]);
  const guide = guideFor(user.role);
  const menu = menuFor(user);
  const myQueries = state.queries.filter((q) => q.by.id === user.id);
  const b = myBusiness(state, user);
  const shots = useGuideShots(tab === "guide");

  const send = async () => {
    const question = ask.trim();
    if (!question) return;
    setAsk("");
    const next = [...chat, { from: "me", text: question }];
    setChat(next);
    setBusy(true);
    const ai = await askHelp(question, getLang(), faq.map((f) => ({ q: tl(f.q), a: tl(f.a) })));
    setBusy(false);
    if (ai?.answer && ai.confident) return setChat([...next, { from: "bot", text: ai.answer, engine: "ai" }]);
    const hit = searchFaq(faq, question)[0];
    if (hit) return setChat([...next, { from: "bot", text: tl(hit.a), engine: "faq", title: tl(hit.q) }]);
    return setChat([...next, { from: "bot", text: L("I can't answer that. Send it to TijaPass Admin and they will reply.", "Siwezi kujibu hilo. Litume kwa TijaPass Admin nao watajibu."), cannot: true }]);
  };
  const toAdmin = () => {
    const topic = chat.filter((m) => m.from === "me").map((m) => m.text).pop() || "";
    act((d) => createQuery(d, user, { id: uid("Q"), topic, chat, complaint, businessId: b?.id || null }), L("Sent to TijaPass Admin", "Imetumwa kwa TijaPass Admin"));
    setChat([]);
    setComplaint(false);
    setTab("mine");
  };

  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "guide", label: L("Guide", "Mwongozo") }, { value: "faq", label: L("Questions", "Maswali") }, { value: "chat", label: L("Ask", "Uliza") },
        { value: "mine", label: L("My questions", "Maswali yangu"), count: myQueries.filter((q) => q.status === "answered" && !q.seen).length }, { value: "contact", label: L("Contact", "Mawasiliano") }
      ]} />
      {tab === "guide" && menu.filter((m) => guide[m.id]).map((m) => {
        const Icon = m.icon;
        // Phone users (business, supplier, officer) see phone-sized shots beside the text; desk users (lenders,
        // admin tiers, reports) see desktop shots. Tap a picture to see it full size (29 Oct fix).
        const role = user.role === "officer" ? "officer" : ["dataAdmin", "systemAdmin", "super"].includes(user.role) ? "admin" : user.role;
        const phone = ["business", "supplier", "officer"].includes(role);
        const src = shots?.[`${role}-${m.id}`];
        return (
          <Card key={m.id}>
            <div className={`guide-item ${phone ? "phone" : "desk"}`}>
              <div className="guide-text">
                <div className="row"><Icon size={20} /><h3>{tl(m)}</h3></div>
                <p className="mt">{tl(guide[m.id])}</p>
              </div>
              {src && (
                <button type="button" className="guide-shot-btn" onClick={() => setZoom(src)} aria-label={`${L("Enlarge picture", "Kuza picha")}: ${tl(m)}`}>
                  <img className="guide-shot" alt={tl(m)} loading="lazy" src={src} />
                </button>
              )}
            </div>
          </Card>
        );
      })}
      {zoom && (
        <div className="lightbox" role="dialog" aria-label={L("Picture", "Picha")} onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
          <button type="button" className="btn" onClick={() => setZoom(null)}>{L("Close", "Funga")}</button>
        </div>
      )}
      {tab === "faq" && (
        <>
          <div className="row"><Search size={18} /><div style={{ flex: 1 }}><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("Search, e.g. close, mchezo, consent", "Tafuta, k.m. funga, mchezo, ridhaa")} /></div></div>
          {Object.keys(TOPICS).map((t) => {
            const items = found.filter((f) => f.topic === t);
            if (!items.length) return null;
            return (
              <Card key={t} title={tl(TOPICS[t])}>
                {items.map((f, i) => <details key={i} className="item" style={{ display: "block" }}><summary className="bold" style={{ cursor: "pointer" }}>{tl(f.q)}</summary><p className="mt">{tl(f.a)}</p></details>)}
              </Card>
            );
          })}
          {!found.length && <Empty text={L("Nothing found. Try the Ask tab.", "Hakuna kilichopatikana. Jaribu Uliza.")} />}
        </>
      )}
      {tab === "chat" && (
        <Card title={L("Ask TijaPass", "Uliza TijaPass")}>
          <div className="stack">
            {!chat.length && <p className="muted small">{L("Type or speak your question.", "Andika au ongea swali lako.")}</p>}
            {chat.map((m, i) => (
              <div key={i} className="notice" style={m.from === "me" ? { background: "#fff4ec", borderColor: "#f6d3a8", marginLeft: 30 } : { marginRight: 30 }}>
                {m.title && <b>{m.title}</b>}
                {m.text}
                {m.engine === "faq" && <div className="tiny muted mt">{L("From the common questions", "Kutoka maswali ya kawaida")}</div>}
              </div>
            ))}
            {busy && <p className="small muted">{L("Thinking…", "Inafikiri…")}</p>}
            <div className="row">
              <div style={{ flex: 1, minWidth: 180 }}><input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={L("Your question", "Swali lako")} /></div>
              <VoiceButton onText={(t) => setAsk((x) => `${x} ${t}`.trim())} />
              <button className="btn primary" onClick={send}><Send size={18} />{L("Ask", "Uliza")}</button>
            </div>
            {chat.length > 0 && (
              <div className="notice">
                <b>{L("Not answered?", "Haijajibiwa?")}</b>
                <label className="check mt"><input type="checkbox" checked={complaint} onChange={(e) => setComplaint(e.target.checked)} />{L("This is a complaint", "Hili ni lalamiko")}</label>
                <button className="btn mt" onClick={toAdmin}>{L("Send to TijaPass Admin", "Tuma kwa TijaPass Admin")}</button>
              </div>
            )}
          </div>
        </Card>
      )}
      {tab === "mine" && (
        <>
          {!myQueries.length && <Empty text={L("No questions sent yet.", "Bado hujatuma swali.")} />}
          {myQueries.map((q) => (
            <Card key={q.id} title={q.topic || L("Question", "Swali")} actions={<StatusPill status={q.status} />}>
              <p className="small muted">{fmtDateTime(q.createdAt)}{q.complaint ? ` · ${L("complaint", "lalamiko")}` : ""}</p>
              {q.answer && <p className="notice good mt"><b>{q.answeredBy?.name}</b>{q.answer}</p>}
            </Card>
          ))}
        </>
      )}
      {tab === "contact" && (
        <Card title={L("Talk to TijaPass", "Ongea na TijaPass")}>
          <div className="list">
            <a className="item" href={`https://wa.me/${state.settings.support.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle size={20} className="green" /><div className="grow"><b>WhatsApp</b><div className="small muted">{state.settings.support.whatsapp}</div></div></a>
            <a className="item" href={`tel:${state.settings.support.phone.replace(/\s/g, "")}`}><Phone size={20} /><div className="grow"><b>{L("Phone", "Simu")}</b><div className="small muted">{state.settings.support.phone}</div></div></a>
          </div>
          <p className="small muted mt">{L("Hours", "Saa za kazi")}: {state.settings.support.hours}</p>
          {b && hasFeature(state, b, "prioritySupport", today(state)) && <p className="notice good mt"><b>{L("Premium: priority support", "Premium: msaada wa kipaumbele")}</b>{L("Questions you send to TijaPass Admin go to the top and are answered the same day.", "Maswali unayotuma kwa TijaPass Admin yanakwenda juu na yanajibiwa siku hiyohiyo.")}</p>}
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Messages (MSG-01)
export function Messages() {
  const { state, user, params } = useStore();
  const threads = myThreads(state, user);
  const [open, setOpen] = useState(params.thread || threads[0]?.threadKey || null);
  const b = myBusiness(state, user);
  const org = myOrg(state, user);
  const self = b ? { businessId: b.id } : org ? (user.role === "fi" ? { fiId: org.id } : { supplierId: org.id }) : { userId: user.id };
  const current = threads.find((t) => t.threadKey === open);
  return (
    <div className="grid g2">
      <Card title={L("Conversations", "Mazungumzo")} actions={<button className="btn small" onClick={() => setOpen(`admin:${user.id}`)}>{L("Message TijaPass Admin", "Andikia TijaPass Admin")}</button>}>
        {!threads.length && <Empty text={L("No messages yet.", "Bado hakuna ujumbe.")} />}
        <div className="list">
          {threads.map((t) => (
            <button key={t.threadKey} className="item" onClick={() => setOpen(t.threadKey)} style={open === t.threadKey ? { background: "#fff7f1" } : undefined}>
              <div className="grow"><b>{t.title || t.threadKey}</b><div className="small muted">{t.from.name}: {t.text.slice(0, 60)}</div></div>
              <span className="tiny muted">{fmtDate(t.at)}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card title={current?.title || (open?.startsWith("admin:") ? L("TijaPass Admin", "TijaPass Admin") : L("Messages", "Ujumbe"))}>
        {open ? <Thread threadKey={open} title={current?.title || L("Message to TijaPass Admin", "Ujumbe kwa TijaPass Admin")} participants={current ? current.participants : [self, { role: "dataAdmin" }]} /> : <Empty text={L("Choose a conversation.", "Chagua mazungumzo.")} />}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Wallet (WAL-01): simulated
export function Wallet() {
  const { state, user, update } = useStore();
  const b = myBusiness(state, user);
  const org = myOrg(state, user);
  const owner = b || org;
  const [amount, setAmount] = useState("");
  const balance = owner?.walletBalance || 0;
  const moves = useMemo(() => {
    const out = [...(owner?.walletMoves || [])];
    if (user.role === "fi") {
      for (const l of state.loans.filter((x) => x.fiId === org.id && x.disbursedAt)) {
        out.push({ at: l.disbursedAt, amount: -l.offer.principal, note: `Loan ${l.id} disbursed` });
        for (const i of l.schedule || []) if (i.paidAt) out.push({ at: i.paidAt, amount: i.amount, note: `Loan ${l.id} instalment ${i.n}` });
      }
    }
    if (user.role === "supplier") for (const q of state.quoteRequests.filter((x) => x.supplierId === org.id && x.status !== "requested")) { const p = q.history.find((h) => h.event === "paid by lender"); if (p) out.push({ at: p.at, amount: q.quote?.total || 0, note: `Lender payment for ${q.item}` }); }
    return out.sort((a, b2) => b2.at.localeCompare(a.at));
  }, [state, owner, org, user.role]);
  const topUp = () => update((d) => {
    const o = b ? d.businesses.find((x) => x.id === b.id) : (user.role === "fi" ? d.fis : d.suppliers).find((x) => x.id === org.id);
    o.walletBalance = (o.walletBalance || 0) + Number(amount);
    o.walletMoves = [...(o.walletMoves || []), { at: nowISO(d), amount: Number(amount), note: "Simulated top-up" }];
  });
  return (
    <div className="stack">
      <div className="notice warn"><b>{L("Simulated wallet", "Pochi ya mfano")}</b>{L("Test version only: balances and movements are simulated. No real money is held or moved.", "Toleo la majaribio tu: salio na miamala ni ya mfano. Hakuna pesa halisi inayoshikiliwa wala kuhamishwa.")}</div>
      <div className="grid g2">
        <div className="stat"><small>{L("Simulated balance", "Salio la mfano")}</small><strong>{money(balance)}</strong></div>
        <Card>
          <Field label={L("Add test money (simulated)", "Ongeza pesa ya majaribio (mfano)")}><AmountInput value={amount} onChange={setAmount} /></Field>
          <button className="btn mt" disabled={!(Number(amount) > 0)} onClick={() => { topUp(); setAmount(""); }}>{L("Add", "Ongeza")}</button>
        </Card>
      </div>
      <Card title={L("Movements", "Miamala")}>
        {!moves.length && <Empty text={L("No movements yet.", "Bado hakuna miamala.")} />}
        <div className="list">{moves.map((m, i) => <div key={i} className="item"><div className="grow"><b>{m.note}</b><div className="small muted">{fmtDateTime(m.at)}</div></div><b className={m.amount >= 0 ? "green" : "amber"}>{money(m.amount)}</b></div>)}</div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Business packages (PKG-01, PKG-02, PKG-05; benefits 11 Nov)
const PERIOD_DAYS = { day: 1, week: 7, month: 30 };
const perText = (p) => (p.period === "day" ? L("per day", "kwa siku") : p.period === "week" ? L("per week", "kwa wiki") : p.period === "month" ? L("per month", "kwa mwezi") : "");
const lengthText = (p) => (p.period === "day" ? L("for 1 day", "kwa siku 1") : p.period === "week" ? L("for 7 days", "kwa siku 7") : L("for 30 days", "kwa siku 30"));
const joinAnd = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${L("and", "na")} ${xs[xs.length - 1]}` : xs[0] || "");
// One line on what a package adds, built from the same rules that unlock it.
function adds(p, all) {
  const f = featuresOf(p.id);
  if (!f.length) return L("The basics, free forever", "Mambo ya msingi, bure daima");
  const below = all.filter((q) => q.id !== p.id && q.price < p.price && featuresOf(q.id).every((x) => f.includes(x)) && featuresOf(q.id).length && featuresOf(q.id).length < f.length);
  const base = below.sort((x, y) => featuresOf(y.id).length - featuresOf(x.id).length || y.price - x.price)[0];
  const extra = f.filter((x) => !base || !featuresOf(base.id).includes(x));
  const head = base ? `${L("Everything in", "Vyote vya")} ${tl(base)}, ${L("plus", "pamoja na")}` : `${L("Everything in Basic, plus", "Vyote vya Msingi, pamoja na")}`;
  return `${head} ${joinAnd(extra.map((x) => tl(FEATURES[x].short)))}, ${lengthText(p)}.`;
}

export function Packages() {
  const { state, user, params } = useStore();
  const act = useAction();
  const b = myBusiness(state, user);
  const t = today(state);
  const all = state.packages.business;
  const current = activePackage(state, b, t);
  const sub = activeSubscription(state, b, t);
  const next = state.subscriptions.filter((x) => x.ownerId === b.id && x.status === "active" && x.from > t).sort((x, y) => x.from.localeCompare(y.from));
  const [pay, setPay] = useState(() => all.find((p) => p.id === params.choose && p.price > 0) || null);
  const [method, setMethod] = useState("mobile");
  const [result, setResult] = useState(null);
  const ref = useMemo(() => uid("REF"), [pay]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastEnd = state.subscriptions.filter((x) => x.ownerId === b.id && x.status === "active" && x.to >= t).map((x) => x.to).sort().pop();
  const startsOn = lastEnd ? addDays(lastEnd, 1) : t;
  const doPay = (outcome) => {
    let o = outcome;
    if (o === "success" && method === "wallet" && (b.walletBalance || 0) < pay.price) o = "failed";
    const r = act((d) => {
      const res = payPackage(d, user, { ownerId: b.id, packageId: pay.id, method, outcome: o, reference: ref });
      if (res === "success" && method === "wallet") {
        const bb = d.businesses.find((x) => x.id === b.id);
        bb.walletBalance -= pay.price;
        bb.walletMoves = [...(bb.walletMoves || []), { at: nowISO(d), amount: -pay.price, note: `Package ${pay.en}` }];
      }
      return res;
    });
    setResult(r);
  };
  const mid = all.filter((p) => p.price > 0 && p.id !== "premium");
  const prem = all.find((p) => p.id === "premium");
  const cols = [{ key: "basic", label: tl(all.find((p) => p.id === "basic")) }, { key: mid[0]?.id, label: L("Day, Week, Month", "Siku, Wiki, Mwezi") }, { key: "premium", label: tl(prem) }];
  const paidRows = Object.keys(FEATURES).filter((f) => featuresOf("premium").includes(f));
  const tick = (ok) => (ok ? <CheckCircle2 size={18} className="green" aria-label={L("Included", "Kimo")} /> : <span className="muted" aria-label={L("Not included", "Hakimo")}>–</span>);
  const mine = featuresOf(current);
  return (
    <div className="stack">
      <p className="notice good"><b>{L("Recording is always free", "Kuandika ni bure daima")}</b>{L("Basic has no fee per entry and never expires. Paid packages add tools that save you time or give you documents others ask for.", "Msingi hauna ada kwa kila muamala na hauishi. Vifurushi vya kulipia vinaongeza zana zinazokuokolea muda au kukupa nyaraka unazoombwa.")}</p>
      <Card title={L("Your package now", "Kifurushi chako sasa")}>
        <p><b>{tl(all.find((p) => p.id === current))}</b>{sub ? ` · ${L("until", "hadi")} ${fmtDate(sub.to)}` : ""}</p>
        {mine.length > 0 && <p className="small mt">{L("You have", "Unayo")}: {joinAnd(mine.map((x) => tl(FEATURES[x])))}.</p>}
        {next.map((x) => <p key={x.id} className="small muted">{L("Next", "Kinachofuata")}: {tl(all.find((p) => p.id === x.packageId))} {L("from", "kuanzia")} {fmtDate(x.from)} {L("to", "hadi")} {fmtDate(x.to)}</p>)}
      </Card>
      <div className="grid g3">
        {all.map((p) => (
          <Card key={p.id} title={tl(p)} className={`pkg-card ${current === p.id ? "on" : ""}`}>
            <strong style={{ fontSize: 24, fontFamily: "Manrope, Inter, sans-serif" }}>{p.price ? money(p.price) : L("Free", "Bure")}</strong>
            <span className="small muted"> {perText(p)}</span>
            {p.period === "month" && p.price > 0 && <div className="tiny muted">{L("about", "takriban")} {money(Math.round(p.price / 30))} {L("a day", "kwa siku")}</div>}
            <p className="small mt">{adds(p, all)}</p>
            {(p.forEn || p.forSw) && <p className="small muted mt"><b>{L("Choose this if", "Chagua hiki ikiwa")}:</b> {getLang() === "sw" ? p.forSw : p.forEn}.</p>}
            {p.price > 0 && <button className="btn primary block mt" onClick={() => { setPay(p); setResult(null); }}>{L("Choose", "Chagua")}</button>}
            {current === p.id && <p className="small green bold mt"><CheckCircle2 size={14} /> {L("Active", "Kinatumika")}</p>}
          </Card>
        ))}
      </div>
      <Card title={L("What each package gives", "Kila kifurushi kinatoa nini")}>
        <div className="table-wrap">
          <table className="t cmp">
            <colgroup><col className="feat" /><col /><col /><col /></colgroup>
            <thead><tr><th />{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
            <tbody>
              {FREE_BENEFITS.map((f) => <tr key={f.en}><td>{tl(f)}</td>{cols.map((c) => <td key={c.label}>{tick(true)}</td>)}</tr>)}
              {paidRows.map((f) => (
                <tr key={f}><td><b>{tl(FEATURES[f])}</b>{FEATURES[f].note && <div className="tiny muted">{tl(FEATURES[f].note)}</div>}</td>{cols.map((c) => <td key={c.label}>{tick(featuresOf(c.key).includes(f))}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="notice"><b>{L("When a package ends", "Kifurushi kikiisha")}</b>{L("You go back to Basic. Your records are never lost or locked, and anything you already downloaded is yours. A new package starts the day after the current one ends, so no day is paid twice. Staff sign-ins pause until Premium is renewed.", "Unarudi Msingi. Kumbukumbu zako hazipotei wala hazifungwi, na ulichopakua tayari ni chako. Kifurushi kipya kinaanza siku baada ya cha sasa kuisha, hivyo hakuna siku inayolipiwa mara mbili. Kuingia kwa wafanyakazi kunasitishwa hadi Premium ihuishwe.")}</p>
      {pay && (
        <Modal title={`${tl(pay)} · ${money(pay.price)}`} onClose={() => setPay(null)}>
          {!result && <p className="small mb">{adds(pay, all)} {L("From", "Kuanzia")} <b>{fmtDate(startsOn)}</b> {L("to", "hadi")} <b>{fmtDate(addDays(startsOn, (PERIOD_DAYS[pay.period] || 30) - 1))}</b>.</p>}
          {!result && (
            <div className="form">
              <Field label={L("Pay with", "Lipa kwa")}><Chips value={method} onChange={setMethod} options={[{ value: "mobile", label: L("Mobile money", "Pesa ya simu") }, { value: "bank", label: L("Bank", "Benki") }, { value: "wallet", label: L("Wallet", "Pochi") }]} /></Field>
              <p className="notice warn">{L("Test version: choose how the simulated payment ends.", "Toleo la majaribio: chagua jinsi malipo ya mfano yatakavyoisha.")}</p>
              <div className="row"><button className="btn danger" onClick={() => doPay("failed")}>{L("Simulate failed payment", "Iga malipo yaliyoshindikana")}</button><button className="btn primary" onClick={() => doPay("success")}>{L("Simulate successful payment", "Iga malipo yaliyofanikiwa")}</button></div>
            </div>
          )}
          {result === "success" && <div className="stack"><p className="notice good"><b>{L("Paid", "Imelipwa")}</b>{L("Your package is active.", "Kifurushi chako kinatumika.")} {L("Reference", "Kumbukumbu")}: {ref}</p><button className="btn" onClick={() => doPay("success")}>{L("Simulate the same confirmation again", "Iga uthibitisho huohuo tena")}</button></div>}
          {result === "duplicate" && <p className="notice"><b>{L("Already paid", "Imeshalipwa")}</b>{L("This confirmation was already received. You were not charged again.", "Uthibitisho huu ulishapokelewa. Hujakatwa tena.")}</p>}
          {result === "failed" && <div className="stack"><p className="notice bad"><b>{L("Payment failed", "Malipo yameshindikana")}</b>{L("Nothing was charged and the package is not active.", "Hakuna kilichokatwa na kifurushi hakitumiki.")}</p><button className="btn" onClick={() => setResult(null)}>{L("Try again", "Jaribu tena")}</button></div>}
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Quote requests from a business or an FI (SUP-01, SUP-03)
export function QuoteRequests({ requester }) {
  const { state, user } = useStore();
  const act = useAction();
  const sups = state.suppliers.filter((s) => s.status === "approved");
  const [supplierId, setSupplierId] = useState(sups[0]?.id || "");
  const [productId, setProductId] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const sup = sups.find((s) => s.id === supplierId);
  const prod = sup?.products.find((p) => p.id === productId);
  const mine = state.quoteRequests.filter((q) => q.requester.type === requester.type && q.requester.id === requester.id);
  const ok = supplierId && (prod || item.trim().length > 2) && Number(qty) > 0 && Number(qty) <= 10000;
  const self = requester.type === "business" ? { businessId: requester.id } : { fiId: requester.id };
  return (
    <div className="stack">
      <Card title={L("Request a quote", "Omba nukuu")}>
        <div className="form two">
          <Field label={L("Supplier", "Msambazaji")}><Select value={supplierId} onChange={(v) => { setSupplierId(v); setProductId(""); }} options={sups.map((s) => ({ value: s.id, label: `${s.name} · ${s.region}` }))} /></Field>
          <Field label={L("From their list", "Kutoka orodha yao")}><Select value={productId} onChange={setProductId} placeholder={L("Or describe below", "Au eleza hapa chini")} options={(sup?.products || []).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.price)}` }))} /></Field>
          {!prod && <Field label={L("Describe the item", "Eleza bidhaa")}><Area value={item} onChange={setItem} rows={2} /><VoiceButton onText={(t) => setItem((x) => `${x} ${t}`.trim())} /></Field>}
          <Field label={L("Quantity (1–10,000)", "Idadi (1–10,000)")}><Text value={qty} maxLength={5} onChange={(v) => setQty(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
          <Field label={L("Note (optional)", "Maelezo (si lazima)")}><Text value={note} onChange={setNote} /></Field>
        </div>
        <button className="btn primary mt" disabled={!ok} onClick={() => { act((d) => requestQuote(d, user, { id: uid("QR"), supplierId, productId: prod?.id || null, item: prod ? prod.name : item.trim(), qty: Number(qty), note: note.trim(), requester }), L("Request sent", "Ombi limetumwa")); setItem(""); setNote(""); setProductId(""); }}>{L("Send request", "Tuma ombi")}</button>
      </Card>
      {mine.map((q) => {
        const s = state.suppliers.find((x) => x.id === q.supplierId);
        return (
          <Card key={q.id} title={`${q.item} × ${q.qty}`} actions={<StatusPill status={q.status} />}>
            <p className="small muted">{s?.name} · {fmtDate(q.createdAt)}</p>
            {q.quote && (
              <div className="kv mt">
                <span>{L("Unit price", "Bei ya kipande")}</span><span>{money(q.quote.unitPrice)}</span>
                <span>{L("Total", "Jumla")}</span><span>{money(q.quote.total)}</span>
                <span>{L("Valid until", "Inadumu hadi")}</span><span>{fmtDate(q.quote.validUntil)}</span>
                {q.quote.notes && <><span>{L("Notes", "Maelezo")}</span><span>{q.quote.notes}</span></>}
                {q.invoice && <><span>{L("Invoice", "Ankara")}</span><span>{q.invoice.number}</span></>}
              </div>
            )}
            <div className="row mt">
              {q.status === "quoted" && <><button className="btn" onClick={() => act((d) => quoteStep(d, user, q.id, "declined"))}>{L("Decline", "Kataa")}</button>{q.quote?.validUntil && q.quote.validUntil < today(state) ? <span className="small muted">{L("This quote has expired. Ask for a new one.", "Nukuu hii imeisha muda. Omba mpya.")}</span> : <button className="btn primary" onClick={() => act((d) => quoteStep(d, user, q.id, "accepted"), L("Quote accepted", "Nukuu imekubaliwa"))}>{L("Accept quote", "Kubali nukuu")}</button>}</>}
              {q.status === "invoiced" && !state.loans.some((l) => l.quoteId === q.id) && <button className="btn" onClick={() => act((d) => quoteStep(d, user, q.id, "paid", { paidDirect: true }), L("Marked as paid. Record the payment under Record.", "Imewekwa kama imelipwa. Andika malipo kwenye Andika."))}>{L("I paid the supplier", "Nimemlipa msambazaji")}</button>}
              {q.status === "delivered" && <button className="btn primary" onClick={() => act((d) => quoteStep(d, user, q.id, "received"), L("Thank you", "Asante"))}>{L("I received the goods", "Nimepokea bidhaa")}</button>}
            </div>
            {["quoted", "accepted"].includes(q.status) && requester.type === "business" && <p className="tiny muted mt">{L("To finance this item, use Finance → Request a loan → Asset finance.", "Kufadhili bidhaa hii, tumia Fedha → Omba mkopo → Mkopo wa mali.")}</p>}
            <details className="mt"><summary className="small bold" style={{ cursor: "pointer" }}>{L("Messages with the supplier", "Ujumbe na msambazaji")}</summary><div className="mt"><Thread threadKey={`quote:${q.id}`} title={q.item} participants={[self, { supplierId: q.supplierId }]} /></div></details>
          </Card>
        );
      })}
    </div>
  );
}

export function BusinessSuppliers() {
  const { state, user } = useStore();
  const b = myBusiness(state, user);
  return <QuoteRequests requester={{ type: "business", id: b.id, name: b.profile.businessName }} />;
}

// ------------------------------------------------------------------ Organisation profile (FI, supplier)
export function OrgProfile() {
  const { state, user } = useStore();
  const org = myOrg(state, user);
  return (
    <Card title={org.name} actions={<StatusPill status={org.status} />}>
      <div className="kv">
        <span>{L("Licence", "Leseni")}</span><span>{org.licence}</span>
        <span>{L("Region", "Mkoa")}</span><span>{org.region}</span>
        <span>{L("Address", "Anwani")}</span><span>{org.address}</span>
        <span>{L("Phone", "Simu")}</span><span>{org.phone}</span>
        <span>{L("Email", "Barua pepe")}</span><span>{org.email}</span>
        <span>{L("Joined", "Alijiunga")}</span><span>{fmtDate(org.joinedAt)}</span>
      </div>
      <p className="small muted mt">{L("To change these details, message TijaPass Admin.", "Kubadilisha taarifa hizi, andikia TijaPass Admin.")}</p>
    </Card>
  );
}

export function PendingApproval() {
  const { state, user, signOut } = useStore();
  const org = myOrg(state, user);
  return (
    <div className="signin-main" style={{ paddingTop: 60 }}>
      <Card title={L("Waiting for approval", "Inasubiri idhini")}>
        <p>{L(`${org?.name} is registered. TijaPass Admin checks the licence and details before you can see or receive anything.`, `${org?.name} imesajiliwa. TijaPass Admin hukagua leseni na taarifa kabla hujaona au kupokea chochote.`)}</p>
        <p className="mt"><StatusPill status={org?.status || "pending"} /></p>
        <button className="btn mt" onClick={signOut}>{L("Sign out", "Toka")}</button>
      </Card>
    </div>
  );
}
