// Data Admin screens (ADM-02, REP-04, ACC-04, RAT-10, RAT-11, HLP-03, FIN-05).
import { FileText } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { ACCOUNTS, KINDS, READY_KINDS, SUSPENSE_TARGETS } from "../../core/kinds.js";
import { journal, ledger, openingLines, trialBalance } from "../../core/accounting.js";
import { FREQUENCIES } from "../../core/credit.js";
import { bandFor, ratingsFor } from "../../core/rating.js";
import { addDays, money, sum, today } from "../../core/util.js";
import { answerQuery, assignOfficer, changeTreatment, checkOrg, resolveSuspense, reviewPosted, decideChange, decideDispute, decideHeld, decideOpening, decideOrg, recordRecheck, reverseEntry, reviewExternalLoan, stockAdjust, verifyIdentity } from "../../lib/actions.js";
import { EDUCATION, fmtNida, linkedBusinesses, ownersOf, validNida } from "../../core/people.js";
import { atLeast, businessesInScope } from "../../lib/access.js";
import { getFile } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Area, BusinessPicker, Card, DatePicker, DateRange, Empty, Field, Pill, ReasonModal, Select, StatusPill, Tabs, Text, fmtDate, fmtDateTime, useRange } from "../../ui/components.jsx";
import { LoanTracker, RatingDetail, SOURCES, crType, holdText, kindPlain, sourceLabel } from "../common.jsx";

export function approvalCounts(state) {
  const c = {
    held: state.entries.filter((e) => e.status === "held").length,
    opening: state.businesses.filter((b) => b.opening?.status === "submitted").length,
    changes: state.changeRequests.filter((x) => x.status === "pending").length,
    external: state.externalLoans.filter((x) => x.status === "submitted").length,
    orgs: [...state.fis, ...state.suppliers].filter((o) => o.status === "pending").length,
    officer: state.businesses.filter((b) => !b.officerId && b.status !== "archived").length,
    identity: state.businesses.filter((b) => b.status !== "archived" && (b.kyc?.status || "pending") === "pending").length,
    disputes: state.ratings.filter((r) => r.status === "disputed").length,
    suspense: state.closes.filter((c) => Math.abs(c.open || 0) > 0.004).length,
    review: state.entries.filter((e) => e.review?.status === "open" && e.status === "posted").length
  };
  c.total = Object.values(c).reduce((a, b) => a + b, 0);
  return c;
}

const bizName = (state, id) => state.businesses.find((b) => b.id === id)?.profile.businessName || id;

async function openStored(id) {
  const f = await getFile(id);
  if (!f) return;
  const w = window.open();
  if (w) w.document.write(f.type?.startsWith("image/") ? `<img src="${f.data}" style="max-width:100%">` : `<iframe src="${f.data}" style="border:0;width:100%;height:100vh"></iframe>`);
}

export function Approvals() {
  const { state, user, go } = useStore();
  const act = useAction();
  const counts = approvalCounts(state);
  const [tab, setTab] = useState(() => Object.keys(counts).find((k) => k !== "total" && counts[k]) || "held");
  const [modal, setModal] = useState(null);
  const [kind, setKind] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [ext, setExt] = useState({});
  const officers = state.users.filter((u) => u.role === "officer" && u.active !== false);
  const tabs = [
    ["held", L("Held entries", "Miamala iliyosimamishwa")], ["opening", L("Starting positions", "Hali za kuanzia")], ["changes", L("Changes and corrections", "Mabadiliko na marekebisho")],
    ["external", L("Declared loans", "Mikopo iliyotajwa")], ["orgs", L("New lenders and suppliers", "Wakopeshaji na wasambazaji wapya")], ["identity", L("Identity to verify", "Utambulisho wa kuhakiki")], ["officer", L("No officer", "Bila afisa")], ["disputes", L("Rating disputes", "Mapingamizi ya viwango")],
    ["suspense", L("Cash differences to resolve", "Tofauti za pesa za kutatua")], ["review", L("Accountant review", "Mapitio ya mhasibu")]
  ];
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={tabs.map(([value, label]) => ({ value, label, count: counts[value] }))} />
      {tab === "held" && (state.entries.filter((e) => e.status === "held").length ? state.entries.filter((e) => e.status === "held").map((e) => {
        const b = state.businesses.find((x) => x.id === e.businessId);
        return (
          <Card key={e.id} title={`${b?.profile.businessName} · ${money(e.amount)}`}>
            <p><b>{kindPlain(e.kind)}</b></p>
            <p className="small muted">{fmtDate(e.date)} · {b?.channels.find((c) => c.id === e.channelId)?.name} · “{e.description}”{e.payer ? ` · ${e.payer}` : ""} · {sourceLabel(e.source)}</p>
            <p className="notice warn mt"><b>{L("Why held", "Kwa nini imesimamishwa")}</b>{e.heldReasons.map((r) => holdText(r)).join(" ")}</p>
            {e.aiRecommendation && <p className="small mt">{L("AI recommendation", "Pendekezo la AI")} ({e.aiRecommendation.engine}): <b>{kindPlain(e.aiRecommendation.kind)}</b>{e.aiRecommendation.alternatives?.length ? ` · ${L("or", "au")} ${e.aiRecommendation.alternatives.map(kindPlain).join(" / ")}` : ""}</p>}
            <div className="row mt">
              <button className="btn danger" onClick={() => setModal({ type: "held", e, decision: "decline" })}>{L("Decline", "Kataa")}</button>
              <button className="btn" onClick={() => { setKind(e.kind); setModal({ type: "held", e, decision: "change" }); }}>{L("Change and post", "Badilisha na ingiza")}</button>
              <button className="btn primary" onClick={() => setModal({ type: "held", e, decision: "approve" })}>{L("Approve", "Idhinisha")}</button>
            </div>
          </Card>
        );
      }) : <Empty text={L("Nothing held.", "Hakuna kilichosimamishwa.")} />)}
      {tab === "opening" && (state.businesses.filter((b) => b.opening?.status === "submitted").map((b) => {
        const lines = openingLines(b);
        return (
          <Card key={b.id} title={b.profile.businessName}>
            <div className="kv">
              {lines.map((l) => <Fragment key={l.acc}><span>{l.acc.startsWith("ch:") ? b.channels.find((c) => `ch:${c.id}` === l.acc)?.name : tl(ACCOUNTS[l.acc])}</span><span>{money(l.dr || -l.cr)}</span></Fragment>)}
            </div>
            <p className="small muted mt">{L("Submitted by", "Imewasilishwa na")} {b.opening.by?.name} · {fmtDateTime(b.opening.at)}</p>
            <div className="row mt"><button className="btn" onClick={() => setModal({ type: "opening", b, approve: false })}>{L("Return for changes", "Rudisha kwa marekebisho")}</button><button className="btn primary" onClick={() => setModal({ type: "opening", b, approve: true })}>{L("Approve and lock", "Idhinisha na funga")}</button></div>
          </Card>
        );
      }))}
      {tab === "opening" && !counts.opening && <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />}
      {tab === "changes" && (counts.changes ? state.changeRequests.filter((x) => x.status === "pending").map((c) => {
        const b = state.businesses.find((x) => x.id === c.businessId);
        const e = c.entryId && state.entries.find((x) => x.id === c.entryId);
        return (
          <Card key={c.id} title={`${b?.profile.businessName} · ${crType(c.type)}`}>
            <p className="small muted">{c.proposedBy?.name} ({c.proposedBy?.role}) · {fmtDateTime(c.at)}</p>
            {c.note && <p className="mt">{c.note}</p>}
            {c.fields?.owners && <OwnersTable owners={c.fields.owners} before={ownersOf(b.profile)} />}
            {c.fields && c.type === "profile" && <div className="kv mt">{Object.entries(c.fields).filter(([k]) => k !== "owners").map(([k, v]) => <Fragment key={k}><span>{k}: {String(k === "closingTime" ? b.closingTime : typeof b.profile[k] === "object" && b.profile[k] ? "GPS" : b.profile[k] ?? "—")}</span><b>→ {typeof v === "object" ? `${v.lat?.toFixed(5)}, ${v.lng?.toFixed(5)}` : String(v)}</b></Fragment>)}</div>}
            {e && <p className="notice mt">{fmtDate(e.date)} · {money(e.amount)} · {kindPlain(e.kind)} · “{e.description}”</p>}
            <div className="row mt">
              {c.type === "correction" && <button className="btn" onClick={() => go("ledger", { id: c.businessId })}>{L("Open ledger", "Fungua leja")}</button>}
              <button className="btn danger" onClick={() => setModal({ type: "change", c, approve: false })}>{L("Decline", "Kataa")}</button>
              <button className="btn primary" onClick={() => setModal({ type: "change", c, approve: true })}>{c.type === "correction" ? L("Mark corrected", "Weka imesahihishwa") : L("Approve", "Idhinisha")}</button>
            </div>
          </Card>
        );
      }) : <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />)}
      {tab === "external" && (counts.external ? state.externalLoans.filter((x) => x.status === "submitted").map((x) => (
        <Card key={x.id} title={`${bizName(state, x.businessId)} · ${x.lender}`}>
          <div className="form two">
            <Field label={L("Lender", "Mkopeshaji")}><Text value={ext[x.id]?.lender ?? x.lender} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], lender: v } })} /></Field>
            <Field label={L("Balance", "Salio")}><AmountInput value={ext[x.id]?.balance ?? x.balance} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], balance: v } })} /></Field>
            <Field label={L("Instalment", "Rejesho")}><AmountInput value={ext[x.id]?.instalment ?? x.instalment} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], instalment: v } })} /></Field>
            <Field label={L("Frequency", "Marudio")}><Select value={ext[x.id]?.frequency ?? x.frequency} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], frequency: v } })} options={Object.keys(FREQUENCIES).map((k) => ({ value: k, label: tl(FREQUENCIES[k]) }))} /></Field>
            <Field label={L("Instalments left", "Marejesho yaliyobaki")}><Text value={String(ext[x.id]?.remaining ?? x.remaining)} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], remaining: Number(v.replace(/\D/g, "")) || 0 } })} /></Field>
            <Field label={L("Next due", "Linalofuata")}><DatePicker name={L("Next due", "Linalofuata")} newestFirst={false} min={today(state)} max={addDays(today(state), 3650)} value={ext[x.id]?.nextDue ?? x.nextDue} onChange={(v) => setExt({ ...ext, [x.id]: { ...ext[x.id], nextDue: v } })} /></Field>
          </div>
          <div className="row mt"><button className="btn" onClick={() => setModal({ type: "external", x, archive: true })}>{L("Archive", "Hifadhi kumbukumbu")}</button><button className="btn primary" onClick={() => setModal({ type: "external", x, archive: false })}>{L("Mark reviewed", "Weka imekaguliwa")}</button></div>
        </Card>
      )) : <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />)}
      {tab === "orgs" && (counts.orgs ? [...state.fis.map((o) => ({ ...o, kind: "fi" })), ...state.suppliers.map((o) => ({ ...o, kind: "supplier" }))].filter((o) => o.status === "pending").map((o) => (
        <Card key={o.id} title={`${o.name} · ${o.kind === "fi" ? L("Lender", "Mkopeshaji") : L("Supplier", "Msambazaji")}`}>
          <div className="kv"><span>{L("Licence", "Leseni")}</span><span>{o.licence}</span><span>{L("Region", "Mkoa")}</span><span>{o.region}</span><span>{L("Address", "Anwani")}</span><span>{o.address}</span><span>{L("Contact", "Mawasiliano")}</span><span>{o.contactName} · {o.phone} · {o.email}</span></div>
          {o.check ? <p className="small mt">{L("Licence checked by", "Leseni imekaguliwa na")} {o.check.by?.name} · {fmtDate(o.check.at)} · {o.check.reason}</p> : <p className="small muted mt">{L("Step 1: Data Admin checks the licence. Step 2: a System Admin (a different person) approves.", "Hatua 1: Msimamizi wa Data anakagua leseni. Hatua 2: Msimamizi wa Mfumo (mtu mwingine) anaidhinisha.")}</p>}
          <div className="row mt">
            <button className="btn danger" onClick={() => setModal({ type: "org", o, approve: false })}>{L("Decline", "Kataa")}</button>
            {!o.check && <button className="btn primary" onClick={() => setModal({ type: "orgcheck", o })}>{L("Licence checked", "Leseni imekaguliwa")}</button>}
            {o.check?.licenceOk && (atLeast(user, "systemAdmin") && o.check.by?.id !== user.id ? <button className="btn primary" onClick={() => setModal({ type: "org", o, approve: true })}>{L("Approve", "Idhinisha")}</button> : <span className="small muted">{L("Waiting for a System Admin to approve", "Inasubiri Msimamizi wa Mfumo kuidhinisha")}</span>)}
          </div>
        </Card>
      )) : <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />)}
      {tab === "identity" && (counts.identity ? state.businesses.filter((b) => b.status !== "archived" && (b.kyc?.status || "pending") === "pending").map((b) => (
        <Card key={b.id} title={b.profile.businessName}>
          <p className="small muted">{L("Registered", "Imesajiliwa")} {fmtDate(b.startDate)} · {b.profile.region}{b.kyc?.note ? ` · ${b.kyc.note}` : ""}</p>
          <OwnersTable owners={ownersOf(b.profile)} />
          {linkedBusinesses(state, b).length > 0 && <p className="notice warn mt">{L("Same owner's other businesses", "Biashara nyingine za mmiliki huyu")}: {linkedBusinesses(state, b).map((x) => x.profile.businessName).join(", ")}</p>}
          <div className="row mt">
            <button className="btn" onClick={() => setModal({ type: "kyc", b, approve: false })}>{L("Not verified", "Haujahakikiwa")}</button>
            <button className="btn primary" onClick={() => setModal({ type: "kyc", b, approve: true })}>{L("Identity verified", "Utambulisho umehakikiwa")}</button>
          </div>
        </Card>
      )) : <Empty text={L("Nothing to verify.", "Hakuna cha kuhakiki.")} />)}
      {tab === "officer" && (counts.officer ? state.businesses.filter((b) => !b.officerId && b.status !== "archived").map((b) => (
        <Card key={b.id} title={b.profile.businessName}>
          <p className="small muted">{b.profile.ownerName} · {b.profile.region} · {L("joined", "alijiunga")} {fmtDate(b.startDate)}</p>
          <button className="btn primary mt" onClick={() => { setOfficerId(""); setModal({ type: "assign", b }); }}>{L("Assign officer", "Panga afisa")}</button>
        </Card>
      )) : <Empty text={L("Every business has an officer.", "Kila biashara ina afisa.")} />)}
      {tab === "disputes" && <RatingReview initial="disputes" embedded />}
      {tab === "suspense" && (counts.suspense ? state.closes.filter((c) => Math.abs(c.open || 0) > 0.004).map((c) => {
        const b = state.businesses.find((x) => x.id === c.businessId);
        const side = c.open > 0 ? "over" : "short";
        return (
          <Card key={c.id} title={`${b?.profile.businessName} · ${money(Math.abs(c.open))}`}>
            <p className="small muted">{L("Closed", "Imefungwa")} {fmtDate(c.from)}{c.from !== c.to ? ` – ${fmtDate(c.to)}` : ""} · {side === "over" ? L("more money counted than the records", "pesa zaidi ya kumbukumbu") : L("less money counted than the records", "pesa pungufu ya kumbukumbu")}</p>
            {c.resolutions?.length > 0 && <div className="small mt">{c.resolutions.map((r, i) => <div key={i}>{fmtDate(r.at)} · {money(r.amount)} → {tl(SUSPENSE_TARGETS[side].find((t) => t.acc === r.resolveTo))} · {r.reason}</div>)}</div>}
            <button className="btn primary mt" onClick={() => { setTarget(SUSPENSE_TARGETS[side][0].acc); setAmount(Math.abs(c.open)); setModal({ type: "suspense", c, side }); }}>{L("Resolve", "Tatua")}</button>
          </Card>
        );
      }) : <Empty text={L("No cash differences waiting.", "Hakuna tofauti za pesa zinazosubiri.")} />)}
      {tab === "review" && (counts.review ? state.entries.filter((e) => e.review?.status === "open" && e.status === "posted").map((e) => {
        const b = state.businesses.find((x) => x.id === e.businessId);
        return (
          <Card key={e.id} title={`${b?.profile.businessName} · ${money(e.amount)}`}>
            <p><b>{kindPlain(e.kind)}</b></p>
            <p className="small muted">{fmtDate(e.date)} · “{e.description}” · {sourceLabel(e.source)}</p>
            <p className="small mt">{e.review.reason === "ready" ? L("Chosen from the ready list after the reading failed", "Imechaguliwa kwenye orodha baada ya usomaji kushindwa") : e.review.reason === "override" ? L("The business chose a different meaning from the AI's reading", "Biashara ilichagua maana tofauti na usomaji wa AI") : L("Read with low confidence", "Imesomwa kwa uhakika mdogo")}{e.ai?.suggested ? ` · ${L("AI suggested", "AI ilipendekeza")}: ${kindPlain(e.ai.suggested)}` : ""}</p>
            <div className="row mt">
              <button className="btn" onClick={() => { setKind(e.kind); setModal({ type: "review", e, decision: "change" }); }}>{L("Change treatment", "Badilisha uingizaji")}</button>
              <button className="btn primary" onClick={() => setModal({ type: "review", e, decision: "confirm" })}>{L("Confirm as posted", "Thibitisha kama ilivyo")}</button>
            </div>
          </Card>
        );
      }) : <Empty text={L("Nothing to review.", "Hakuna cha kupitia.")} />)}

      {modal?.type === "held" && (
        <ReasonModal title={modal.decision === "decline" ? L("Decline entry", "Kataa muamala") : modal.decision === "change" ? L("Change and post", "Badilisha na ingiza") : L("Approve entry", "Idhinisha muamala")} danger={modal.decision === "decline"} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => decideHeld(d, user, modal.e.id, modal.decision, { kind, reason }), L("Done", "Imefanyika"))}>
          {modal.decision === "change" && <Field label={L("Post as", "Ingiza kama")}><Select value={kind} onChange={setKind} options={READY_KINDS.map((k) => ({ value: k, label: kindPlain(k) }))} /></Field>}
        </ReasonModal>
      )}
      {modal?.type === "opening" && <ReasonModal title={modal.approve ? L("Approve and lock starting position", "Idhinisha na funga hali ya kuanzia") : L("Return for changes", "Rudisha kwa marekebisho")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => decideOpening(d, user, modal.b.id, modal.approve, reason), L("Done", "Imefanyika"))} />}
      {modal?.type === "change" && <ReasonModal title={modal.approve ? L("Approve change", "Idhinisha mabadiliko") : L("Decline change", "Kataa mabadiliko")} danger={!modal.approve} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => decideChange(d, user, modal.c.id, modal.approve, reason), L("Done", "Imefanyika"))} />}
      {modal?.type === "external" && <ReasonModal title={modal.archive ? L("Archive declared loan", "Hifadhi mkopo uliotajwa") : L("Mark declared loan reviewed", "Weka mkopo uliotajwa umekaguliwa")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => reviewExternalLoan(d, user, modal.x.id, ext[modal.x.id] || {}, reason, modal.archive), L("Done", "Imefanyika"))} />}
      {modal?.type === "org" && <ReasonModal title={modal.approve ? L("Approve organisation", "Idhinisha taasisi") : L("Decline organisation", "Kataa taasisi")} danger={!modal.approve} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => decideOrg(d, user, modal.o.kind, modal.o.id, modal.approve, reason), L("Done", "Imefanyika"))} />}
      {modal?.type === "kyc" && <ReasonModal title={modal.approve ? L("Identity verified", "Utambulisho umehakikiwa") : L("Identity not verified", "Utambulisho haujahakikiwa")} intro={L("Compare each owner's NIDA photo and number with the details given.", "Linganisha picha na namba ya NIDA ya kila mmiliki na taarifa zilizotolewa.")} danger={!modal.approve} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => verifyIdentity(d, user, modal.b.id, modal.approve, reason), L("Saved", "Imehifadhiwa"))} />}
      {modal?.type === "orgcheck" && <ReasonModal title={L("Licence checked", "Leseni imekaguliwa")} intro={L("Say how you checked the licence or registration (for example, BOT or BRELA register).", "Eleza ulivyokagua leseni au usajili (k.m. daftari la BOT au BRELA).")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => checkOrg(d, user, modal.o.kind, modal.o.id, true, reason), L("Sent for System Admin approval", "Imetumwa kwa Msimamizi wa Mfumo kuidhinisha"))} />}
      {modal?.type === "suspense" && (
        <ReasonModal title={L("Resolve cash difference", "Tatua tofauti ya pesa")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => resolveSuspense(d, user, modal.c.id, target, amount, reason), L("Resolved", "Imetatuliwa"))}>
          <Field label={L("What it was", "Ilikuwa nini")}><Select value={target} onChange={setTarget} options={SUSPENSE_TARGETS[modal.side].map((t) => ({ value: t.acc, label: tl(t) }))} /></Field>
          <Field label={L("Amount (TZS)", "Kiasi (TZS)")}><AmountInput value={amount} onChange={setAmount} /></Field>
        </ReasonModal>
      )}
      {modal?.type === "review" && (
        <ReasonModal title={modal.decision === "change" ? L("Change treatment", "Badilisha uingizaji") : L("Confirm entry", "Thibitisha muamala")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => reviewPosted(d, user, modal.e.id, modal.decision, { kind, reason }), L("Done", "Imefanyika"))}>
          {modal.decision === "change" && <Field label={L("Post as", "Ingiza kama")}><Select value={kind} onChange={setKind} options={READY_KINDS.map((k) => ({ value: k, label: kindPlain(k) }))} /></Field>}
        </ReasonModal>
      )}
      {modal?.type === "assign" && (
        <ReasonModal title={`${L("Assign officer", "Panga afisa")}: ${modal.b.profile.businessName}`} onClose={() => setModal(null)} onSubmit={(reason) => (officerId ? act((d) => assignOfficer(d, user, modal.b.id, officerId, reason), L("Officer assigned", "Afisa amepangwa")) : false)}>
          <Field label={L("Officer", "Afisa")}><Select value={officerId} onChange={setOfficerId} placeholder={L("Choose", "Chagua")} options={officers.map((o) => ({ value: o.id, label: o.name }))} /></Field>
        </ReasonModal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Ledger, journal and trial balance (REP-04, ACC-04)
export function Ledger() {
  const { state, user, params, go } = useStore();
  const act = useAction();
  const list = businessesInScope(state, user);
  const id = params.id || "";
  const b = list.find((x) => x.id === id);
  const [tab, setTab] = useState("journal");
  const [range, setRange] = useRange("month");
  const [source, setSource] = useState("");
  const [acc, setAcc] = useState("");
  const [modal, setModal] = useState(null);
  const [kind, setKind] = useState("");
  const [delta, setDelta] = useState("");
  const j = useMemo(() => (b ? journal(state, b.id, range.to).filter((x) => x.date >= range.from && (!source || x.source === source)) : []), [state, b, range, source]);
  const tb = useMemo(() => (b ? trialBalance(state, b.id, range.to) : null), [state, b, range]);
  const accounts = b ? [...b.channels.map((c) => ({ value: `ch:${c.id}`, label: c.name })), ...Object.keys(ACCOUNTS).map((k) => ({ value: k, label: tl(ACCOUNTS[k]) }))] : [];
  const lg = useMemo(() => (b && acc ? ledger(state, b.id, acc, range.to).filter((r) => r.date >= range.from) : []), [state, b, acc, range]);
  const accName = (a) => (a.startsWith("ch:") ? b.channels.find((c) => `ch:${c.id}` === a)?.name : tl(ACCOUNTS[a]) || a);
  return (
    <div className="stack">
      <BusinessPicker businesses={list} value={id} onChange={(v) => go("ledger", { id: v })} />
      {!b && <Empty text={L("Choose a business.", "Chagua biashara.")} />}
      {b && (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: "journal", label: L("Journal", "Jarida") }, { value: "ledger", label: L("Ledger by account", "Leja kwa akaunti") }, { value: "tb", label: L("Trial balance", "Mizania ya majaribio") }, { value: "stock", label: L("Stock adjustment", "Marekebisho ya stoku") }]} />
          {tab !== "stock" && <DateRange value={range} onChange={setRange} />}
          {tab === "journal" && (
            <Card>
              <div className="row mb"><span className="small bold">{L("Source", "Chanzo")}</span><div style={{ minWidth: 200 }}><Select value={source} onChange={setSource} placeholder={L("All", "Zote")} options={Object.keys(SOURCES).map((k) => ({ value: k, label: sourceLabel(k) }))} /></div></div>
              {!j.length && <Empty text={L("No entries.", "Hakuna miamala.")} />}
              {j.map((x) => (
                <div key={x.id} className="item" style={{ display: "block" }}>
                  <div className="between">
                    <div><b>{fmtDate(x.date)} · {x.kind === "opening" ? L("Opening balances", "Salio la kuanzia") : `${KINDS[x.kind]?.en}`}</b>{x.contra && <Pill tone="orange">{L("reversal", "ugeuzi")}</Pill>}{x.reversedBy && <Pill tone="grey">{L("reversed", "imegeuzwa")}</Pill>}<div className="tiny muted">{x.id} · {sourceLabel(x.source)} · {x.createdBy?.name}{x.decidedBy ? ` · ${L("approved by", "imeidhinishwa na")} ${x.decidedBy.name}` : ""}{x.description ? ` · “${x.description}”` : ""}{x.reason ? ` · ${L("reason", "sababu")}: ${x.reason}` : ""}</div></div>
                    {x.kind !== "opening" && !x.contra && !x.reversedBy && <div className="row"><button className="btn small" onClick={() => { setKind(x.kind); setModal({ type: "treat", x }); }}>{L("Change treatment", "Badilisha uingizaji")}</button><button className="btn small danger" onClick={() => setModal({ type: "reverse", x })}>{L("Reverse", "Geuza")}</button></div>}
                  </div>
                  <div className="table-wrap mt"><table className="t"><thead><tr><th>{L("Account", "Akaunti")}</th><th className="num">{L("Debit", "Debiti")}</th><th className="num">{L("Credit", "Krediti")}</th></tr></thead><tbody>{x.lines.map((l, i) => <tr key={i}><td>{accName(l.acc)}</td><td className="num">{l.dr ? money(l.dr) : ""}</td><td className="num">{l.cr ? money(l.cr) : ""}</td></tr>)}</tbody></table></div>
                  <div className="row">{x.importId && <button className="btn small ghost" onClick={() => openStored(x.importId)}><FileText size={16} />{L("Open statement file", "Fungua faili la taarifa")}</button>}{x.photoId && <button className="btn small ghost" onClick={() => openStored(x.photoId)}><FileText size={16} />{L("Open receipt", "Fungua risiti")}</button>}</div>
                </div>
              ))}
            </Card>
          )}
          {tab === "ledger" && (
            <Card>
              <Select value={acc} onChange={setAcc} placeholder={L("Choose an account", "Chagua akaunti")} options={accounts} />
              <div className="table-wrap mt"><table className="t"><thead><tr><th>{L("Date", "Tarehe")}</th><th>{L("Details", "Maelezo")}</th><th className="num">Dr</th><th className="num">Cr</th><th className="num">{L("Balance", "Salio")}</th></tr></thead><tbody>
                {lg.map((r, i) => <tr key={i}><td className="nowrap">{fmtDate(r.date)}</td><td>{r.description}<div className="tiny muted">{sourceLabel(r.source)}</div></td><td className="num">{r.debit ? money(r.debit) : ""}</td><td className="num">{r.credit ? money(r.credit) : ""}</td><td className="num">{money(r.balance)}</td></tr>)}
              </tbody></table></div>
            </Card>
          )}
          {tab === "tb" && tb && (
            <Card>
              <div className="table-wrap"><table className="t"><thead><tr><th>{L("Account", "Akaunti")}</th><th className="num">Dr</th><th className="num">Cr</th></tr></thead><tbody>
                {tb.rows.map((r) => <tr key={r.acc}><td>{accName(r.acc)}</td><td className="num">{r.debit ? money(r.debit) : ""}</td><td className="num">{r.credit ? money(r.credit) : ""}</td></tr>)}
                <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{money(tb.totalDebit)}</td><td className="num">{money(tb.totalCredit)}</td></tr>
              </tbody></table></div>
              <p className={`small mt ${Math.abs(tb.totalDebit - tb.totalCredit) < 1 ? "green" : "red"}`}>{Math.abs(tb.totalDebit - tb.totalCredit) < 1 ? L("Balanced", "Inalingana") : L("Not balanced", "Hailingani")}</p>
            </Card>
          )}
          {tab === "stock" && (
            <Card title={L("Update stock value after a count", "Sasisha thamani ya stoku baada ya kuhesabu")}>
              <Field label={L("Change in stock value (negative to reduce)", "Mabadiliko ya thamani ya stoku (hasi kupunguza)")}><AmountInput allowNegative value={delta} onChange={setDelta} /></Field>
              <button className="btn primary mt" disabled={!Number(delta)} onClick={() => setModal({ type: "stock" })}>{L("Post adjustment", "Ingiza marekebisho")}</button>
            </Card>
          )}
        </>
      )}
      {modal?.type === "reverse" && <ReasonModal title={L("Reverse entry", "Geuza muamala")} danger okLabel={L("Reverse", "Geuza")} intro={`${money(modal.x.amount)} · ${kindPlain(modal.x.kind)}`} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => reverseEntry(d, user, modal.x.id, reason), L("Reversed", "Imegeuzwa"))} />}
      {modal?.type === "treat" && (
        <ReasonModal title={L("Change treatment", "Badilisha uingizaji")} intro={L("The entry is reversed and posted again with the new treatment.", "Muamala unageuzwa na kuingizwa tena kwa njia mpya.")} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => changeTreatment(d, user, modal.x.id, kind, reason), L("Changed", "Imebadilishwa"))}>
          <Field label={L("New treatment", "Uingizaji mpya")}><Select value={kind} onChange={setKind} options={Object.keys(KINDS).filter((k) => k !== "stock_adjust").map((k) => ({ value: k, label: `${KINDS[k].en} (${KINDS[k].dr} / ${KINDS[k].cr})` }))} /></Field>
        </ReasonModal>
      )}
      {modal?.type === "stock" && <ReasonModal title={L("Post stock adjustment", "Ingiza marekebisho ya stoku")} intro={money(delta)} onClose={() => setModal(null)} onSubmit={(reason) => { act((d) => stockAdjust(d, user, b.id, Number(delta), reason), L("Posted", "Imeingizwa")); setDelta(""); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ Records Rating review (RAT-10 to RAT-12)
export function RatingReview({ initial = "all", embedded }) {
  const { state, user } = useStore();
  const act = useAction();
  const [tab, setTab] = useState(initial);
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState(null);
  const [score, setScore] = useState("");
  const all = [...state.ratings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lists = {
    all,
    disputes: all.filter((r) => r.status === "disputed"),
    recheck: all.filter((r) => r.recheck?.selected),
    location: all.filter((r) => r.locationFlag)
  };
  const shown = lists[tab];
  return (
    <div className="stack">
      {!embedded && <Tabs value={tab} onChange={setTab} tabs={[{ value: "all", label: L("All ratings", "Viwango vyote") }, { value: "disputes", label: L("Disputes", "Mapingamizi"), count: lists.disputes.length }, { value: "recheck", label: L("Re-checks", "Ukaguzi upya"), count: lists.recheck.filter((r) => !r.recheck.done).length }, { value: "location", label: L("Location flags", "Tahadhari za mahali"), count: lists.location.length }]} />}
      {!shown.length && <Empty text={L("Nothing here.", "Hakuna kitu hapa.")} />}
      {shown.map((r) => {
        const b = state.businesses.find((x) => x.id === r.businessId);
        return (
          <div key={r.id} className="stack">
            <Card>
              <div className="item" style={{ border: 0, padding: 0, flexWrap: "wrap" }}>
                <div className="grow" style={{ minWidth: 180 }}><b>{b?.profile.businessName}</b><div className="small muted">{fmtDate(r.date)} · {r.officer?.name}{r.recheck?.selected ? ` · ${L("picked for re-check", "imechaguliwa kukaguliwa upya")}` : ""}</div></div>
                <span className="badge" style={{ background: r.status === "disputed" ? "#8a94a6" : bandFor(r.score).color }}><i className="sw" />{tl(bandFor(r.score))}, {r.score}%{r.status === "disputed" ? ` · ${L("under review", "inapitiwa")}` : ""}</span>
                {r.recheck?.done && <Pill tone={r.recheck.flagged ? "red" : "green"}>{L("Re-check", "Ukaguzi upya")}: {r.recheck.score}% ({L("gap", "tofauti")} {r.recheck.gap})</Pill>}
                <button className="btn small" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? L("Hide", "Ficha") : L("Details", "Maelezo")}</button>
                {r.status === "disputed" && <button className="btn small primary" onClick={() => { setScore(String(r.score)); setModal({ type: "dispute", r }); }}>{L("Decide dispute", "Amua pingamizi")}</button>}
                {r.recheck?.selected && !r.recheck.done && <button className="btn small primary" onClick={() => { setScore(""); setModal({ type: "recheck", r }); }}>{L("Record re-check", "Andika ukaguzi upya")}</button>}
              </div>
            </Card>
            {open === r.id && b && <RatingDetail rating={r} business={b} mode="admin" />}
          </div>
        );
      })}
      {modal?.type === "dispute" && (
        <ReasonModal title={L("Decide dispute", "Amua pingamizi")} intro={`${L("Business says", "Biashara inasema")}: “${modal.r.dispute?.reason}”`} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => decideDispute(d, user, modal.r.id, score, reason), L("Decided", "Imeamuliwa"))}>
          <Field label={L("Score after review (leave as is to keep)", "Alama baada ya mapitio (acha ilivyo kubaki)")}><Text value={score} onChange={(v) => setScore(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
        </ReasonModal>
      )}
      {modal?.type === "recheck" && (
        <ReasonModal title={L("Re-check result", "Matokeo ya ukaguzi upya")} intro={L("Score from the independent re-check by Data Admin or another officer.", "Alama kutoka ukaguzi upya wa Msimamizi wa Data au afisa mwingine.")} onClose={() => setModal(null)} onSubmit={(reason) => (score !== "" ? act((d) => recordRecheck(d, user, modal.r.id, Number(score), reason), L("Saved", "Imehifadhiwa")) : false)}>
          <Field label={L("Re-check score (0–100)", "Alama ya ukaguzi upya (0–100)")}><Text value={score} onChange={(v) => setScore(v.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" /></Field>
        </ReasonModal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Queries (HLP-03)
export function Queries() {
  const { state, user } = useStore();
  const act = useAction();
  const [tab, setTab] = useState("open");
  const [answer, setAnswer] = useState({});
  const list = state.queries.filter((q) => (tab === "open" ? q.status === "open" : q.status !== "open"));
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "open", label: L("Open", "Wazi"), count: state.queries.filter((q) => q.status === "open").length }, { value: "answered", label: L("Answered", "Yamejibiwa") }]} />
      {!list.length && <Empty text={L("No queries.", "Hakuna maswali.")} />}
      {list.map((q) => (
        <Card key={q.id} title={q.topic || L("Question", "Swali")} actions={<>{q.complaint && <Pill tone="red">{L("Complaint", "Lalamiko")}</Pill>}<StatusPill status={q.status} /></>}>
          <p className="small muted">{q.by.name} ({q.by.role}) · {fmtDateTime(q.createdAt)}{q.businessId ? ` · ${bizName(state, q.businessId)}` : ""}</p>
          <details className="mt"><summary className="small bold">{L("Chat attached", "Mazungumzo yaliyoambatishwa")}</summary>{(q.chat || []).map((m, i) => <p key={i} className="small"><b>{m.from === "me" ? q.by.name : "TijaPass"}:</b> {m.text}</p>)}</details>
          {q.status === "open" ? (
            <div className="form mt"><Area value={answer[q.id] || ""} onChange={(v) => setAnswer({ ...answer, [q.id]: v })} placeholder={L("Your reply", "Jibu lako")} /><button className="btn primary" disabled={!answer[q.id]?.trim()} onClick={() => act((d) => answerQuery(d, user, q.id, answer[q.id].trim()), L("Reply sent", "Jibu limetumwa"))}>{L("Send reply", "Tuma jibu")}</button></div>
          ) : <p className="notice good mt"><b>{q.answeredBy?.name}</b>{q.answer}</p>}
        </Card>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Loans and repayments (FIN-05)
export function AdminLoans() {
  const { state } = useStore();
  const t = today(state);
  const [open, setOpen] = useState(null);
  const loans = [...state.loans].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const arrears = (l) => sum((l.schedule || []).filter((i) => !i.paidAt && i.due < t), (i) => i.amount);
  return (
    <div className="stack">
      <div className="grid g4 keep2">
        <div className="stat"><small>{L("Loans", "Mikopo")}</small><strong>{loans.length}</strong></div>
        <div className="stat"><small>{L("Disbursed", "Iliyotolewa")}</small><strong>{money(sum(loans.filter((l) => l.disbursedAt), (l) => l.offer.principal))}</strong></div>
        <div className="stat"><small>{L("In arrears", "Iliyochelewa")}</small><strong className="red">{money(sum(loans, arrears))}</strong></div>
        <div className="stat"><small>{L("Declared outside loans", "Mikopo ya nje iliyotajwa")}</small><strong>{state.externalLoans.filter((x) => !x.archived).length}</strong></div>
      </div>
      <Card>
        {!loans.length && <Empty text={L("No loans yet.", "Bado hakuna mikopo.")} />}
        {loans.map((l) => {
          const b = state.businesses.find((x) => x.id === l.businessId);
          return (
            <div key={l.id}>
              <button className="item" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <div className="grow"><b>{b?.profile.businessName} · {money(l.offer?.principal || l.amount)}</b><div className="small muted">{state.fis.find((f) => f.id === l.fiId)?.name} · {fmtDate(l.requestedAt)}{arrears(l) ? ` · ${L("arrears", "deni lililochelewa")} ${money(arrears(l))}` : ""}</div></div>
                <StatusPill status={l.status} />
              </button>
              {open === l.id && b && l.schedule && <LoanTracker loan={l} business={b} />}
            </div>
          );
        })}
      </Card>
    </div>
  );
}


// Owners with their shares and identity details; with `before`, changed rows are marked.
export function OwnersTable({ owners, before }) {
  const edu = (id) => tl(EDUCATION.find((e) => e.id === id)) || "—";
  return (
    <div className="table-wrap mt">
      <table className="t">
        <thead><tr><th>{L("Owner", "Mmiliki")}</th><th>{L("Share", "Hisa")}</th><th>NIDA</th><th>{L("Born", "Alizaliwa")}</th><th>{L("Phone", "Simu")}</th><th>{L("Education", "Elimu")}</th><th>{L("Confirmed", "Amethibitisha")}</th></tr></thead>
        <tbody>
          {owners.map((o) => {
            const old = before?.find((x) => x.id === o.id);
            const changed = before && (!old || ["name", "nida", "dob", "phone", "sharePct", "gender"].some((k) => String(old[k] ?? "") !== String(o[k] ?? "")));
            return (
              <tr key={o.id} className={changed ? "changed-row" : ""}>
                <td>{o.name}{o.main ? ` (${L("main", "mkuu")})` : ""}{o.guardianName ? <div className="tiny muted">{L("Guardian", "Mlezi")}: {o.guardianName} · {o.guardianPhone}</div> : null}</td>
                <td>{o.sharePct}%</td>
                <td className={o.nida && !validNida(o.nida) ? "red" : ""}>{o.nida ? fmtNida(o.nida) : "—"}</td>
                <td>{fmtDate(o.dob)}</td>
                <td>{o.phone}</td>
                <td>{edu(o.education)}</td>
                <td>{o.confirmed === false ? L("Not yet", "Bado") : L("Yes", "Ndiyo")}</td>
              </tr>
            );
          })}
          {before && before.filter((x) => !owners.some((o) => o.id === x.id)).map((x) => <tr key={x.id} className="changed-row"><td><s>{x.name}</s> ({L("removed", "ameondolewa")})</td><td>{x.sharePct}%</td><td colSpan={5} /></tr>)}
        </tbody>
      </table>
    </div>
  );
}
