// Officer screens (MENU-01, HOME-04, ADM-05). Data Admin and above see every business.
// Since 29 Oct no officer or admin can create a business: businesses register themselves.
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { closesFor, isClosed, unclosedPastDays } from "../../core/dailyClose.js";
import { dueList, nextDue } from "../../core/rating.js";
import { SECTORS } from "../../core/seed.js";
import { addDays, daysBetween, money, today, uid } from "../../core/util.js";
import { linkedBusinesses, ownersOf } from "../../core/people.js";
import { assignOfficer, correctBaseline, requestChange, unlockPin, verifyIdentity } from "../../lib/actions.js";
import { atLeast, businessesInScope, canSeeBusiness } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { BusinessPicker, Card, DateRange, Empty, Field, ReasonModal, RatingBadge, Select, Stat, StatusPill, Tabs, Text, fmtDate, fmtDateTime, useRange } from "../../ui/components.jsx";
import { ActivityList, LoanTracker, RatingHistory, Statements, crType, daysClosed30 } from "../common.jsx";
import { ProfileDetails } from "../business/Profile.jsx";
import { OpeningForm } from "../Onboard.jsx";
import { approvalCounts } from "./DataAdmin.jsx";

export function OfficerHome() {
  const { state, user, go } = useStore();
  const act = useAction();
  const t = today(state);
  const list = businessesInScope(state, user);
  const [q, setQ] = useState("");
  const [assign, setAssign] = useState(null);
  const [officerId, setOfficerId] = useState("");
  const closedToday = list.filter((b) => isClosed(state, b.id, t)).length;
  const flagged = state.closes.filter((c) => c.flagged && c.date >= addDays(t, -7) && list.some((b) => b.id === c.businessId));
  const due = dueList(state, list, addDays(t, 7));
  const pendingApprovals = atLeast(user, "dataAdmin") ? approvalCounts(state).total : state.changeRequests.filter((c) => c.status === "pending" && list.some((b) => b.id === c.businessId)).length;
  const openQueries = state.queries.filter((x) => x.status === "open").length;
  const officers = state.users.filter((u) => u.role === "officer" && u.active !== false);
  const shown = list.filter((b) => !q || `${b.profile.businessName} ${b.profile.ownerName} ${b.profile.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="grid g4 keep2">
        <Stat label={L("Businesses", "Biashara")} value={list.length} note={atLeast(user, "dataAdmin") ? L("All businesses", "Biashara zote") : L("Assigned to you", "Ulizopangiwa")} />
        <Stat label={L("Closed today", "Zimefunga leo")} value={`${closedToday} / ${list.length}`} onClick={() => go("off-close")} />
        <Stat label={L("Flagged differences (7 days)", "Tofauti zilizoletwa (siku 7)")} value={flagged.length} onClick={() => go("off-close")} />
        <Stat label={L("Records checks due this week", "Ukaguzi wiki hii")} value={due.length} note={`${due.filter((x) => x.overdue).length} ${L("overdue", "umechelewa")}`} onClick={user.role === "officer" ? () => go("off-rating") : () => go("rating-review")} />
        <Stat label={L("Pending approvals", "Zinazosubiri idhini")} value={pendingApprovals} onClick={() => go(atLeast(user, "dataAdmin") ? "approvals" : "off-changes")} />
        {atLeast(user, "dataAdmin") && <Stat label={L("Open queries", "Maswali wazi")} value={openQueries} onClick={() => go("admin-queries")} />}
      </div>
      <Card title={L("Businesses", "Biashara")}>
        <input className="input mb" placeholder={L("Search name or phone", "Tafuta jina au simu")} value={q} onChange={(e) => setQ(e.target.value)} />
        {!shown.length && <Empty text={L("No businesses yet. Businesses register themselves; Data Admin then assigns an officer.", "Bado hakuna biashara. Biashara zinajisajili zenyewe; kisha Msimamizi wa Data anapanga afisa.")} />}
        <div className="list">
          {shown.map((b) => {
            const dc = daysClosed30(state, b);
            const missed = unclosedPastDays(state, b, t).length;
            const officer = state.users.find((u) => u.id === b.officerId);
            return (
              <div key={b.id} className="item" style={{ flexWrap: "wrap" }}>
                <div className="grow" style={{ minWidth: 200 }}>
                  <button className="btn ghost" style={{ padding: 0, minHeight: 0 }} onClick={() => go("business", { id: b.id })}><b>{b.profile.businessName}</b></button>
                  <div className="small muted">{b.profile.ownerName} · {b.profile.phone} · {tl(SECTORS.find((s) => s.id === b.profile.sector))} · {b.profile.region}</div>
                  <div className="small muted">{L("Days closed", "Siku zilizofungwa")} {dc.closed}/{dc.days}{missed ? ` · ${missed} ${L("not closed", "hazijafungwa")}` : ""} · {L("Next check", "Ukaguzi ujao")} {fmtDate(nextDue(state, b))}</div>
                  {atLeast(user, "dataAdmin") && <div className="small">{L("Officer", "Afisa")}: <b className={officer ? "" : "red"}>{officer?.name || L("none", "hakuna")}</b> <button className="btn small ghost" onClick={() => { setAssign(b); setOfficerId(b.officerId || ""); }}>{L("Assign", "Panga")}</button></div>}
                </div>
                <RatingBadge business={b} />
                <button className="icon-btn" onClick={() => go("business", { id: b.id })} aria-label={L("Open", "Fungua")}><ChevronRight size={18} /></button>
              </div>
            );
          })}
        </div>
      </Card>
      {assign && (
        <ReasonModal title={`${L("Assign officer", "Panga afisa")}: ${assign.profile.businessName}`} onClose={() => setAssign(null)} onSubmit={(reason) => (officerId ? act((d) => assignOfficer(d, user, assign.id, officerId, reason), L("Officer assigned", "Afisa amepangwa")) : false)}>
          <Field label={L("Officer", "Afisa")}><Select value={officerId} onChange={setOfficerId} placeholder={L("Choose", "Chagua")} options={officers.map((o) => ({ value: o.id, label: o.name }))} /></Field>
          {(assign.officerHistory || []).length > 0 && <p className="small muted">{L("History", "Historia")}: {assign.officerHistory.map((h) => `${state.users.find((u) => u.id === h.officerId)?.name} (${fmtDate(h.at)})`).join(" → ")}</p>}
        </ReasonModal>
      )}
    </div>
  );
}

// A business's file for officers and admins: details, activity, statements, rating, starting position, loans.
export function BusinessFile({ businessId, initial = "activity" }) {
  const { state, user, go } = useStore();
  const [tab, setTab] = useState(initial);
  const [range, setRange] = useRange("week");
  const b = state.businesses.find((x) => x.id === businessId);
  if (!b || !canSeeBusiness(state, user, businessId)) return <Empty text={L("This business is not assigned to you.", "Biashara hii haijapangiwa kwako.")} />;
  const loans = state.loans.filter((l) => l.businessId === b.id);
  // Only the assigned officer rates, once per period (29 Oct); admin tiers review but never rate.
  const gap = state.settings.ratingMinGapDays ?? 25;
  const lastRated = state.ratings.filter((r) => r.businessId === b.id && r.status !== "void").map((r) => r.date).sort().pop();
  const ratedRecently = Boolean(lastRated && daysBetween(lastRated, today(state)) < gap);
  const canRate = user.role === "officer" && b.officerId === user.id && !ratedRecently;
  return (
    <div className="stack">
      <div className="between">
        <div><h2>{b.profile.businessName}</h2><p className="small muted">{b.profile.ownerName} · {b.profile.phone}</p></div>
        <div className="row"><RatingBadge business={b} />{canRate ? <button className="btn small primary" onClick={() => go("rating-check", { id: b.id })}>{L("Start records check", "Anza ukaguzi wa kumbukumbu")}</button> : ratedRecently && user.role === "officer" ? <span className="small muted">{L("Next check possible from", "Ukaguzi ujao unawezekana kuanzia")} {fmtDate(addDays(lastRated, gap))}</span> : null}</div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "activity", label: L("Activity", "Shughuli") }, { value: "statements", label: L("Statements", "Taarifa za fedha") }, { value: "rating", label: L("Records Rating", "Kiwango cha Kumbukumbu") },
        { value: "profile", label: L("Profile", "Wasifu") }, { value: "opening", label: L("Starting position", "Hali ya kuanzia") }, { value: "loans", label: L("Loans", "Mikopo") }
      ]} />
      {tab === "activity" && <><DateRange value={range} onChange={setRange} /><ActivityList business={b} from={range.from} to={range.to} /></>}
      {tab === "statements" && <Statements business={b} />}
      {tab === "rating" && <RatingHistory business={b} mode="admin" />}
      {tab === "profile" && <><IdentityCard business={b} /><ProfileDetails business={b} /><BaselineCard business={b} /></>}
      {tab === "opening" && (
        <Card title={L("Starting position", "Hali ya kuanzia")} actions={b.opening ? <StatusPill status={b.opening.status} /> : null}>
          {b.opening?.status === "approved" ? (atLeast(user, "dataAdmin") ? <OpeningForm business={b} mode="admin" /> : <p>{L("Approved and locked. Only Data Admin can change it.", "Imeidhinishwa na imefungwa. Msimamizi wa Data pekee anaweza kuibadilisha.")}</p>)
            : b.opening?.status === "submitted" ? <p>{L("Waiting for Data Admin approval.", "Inasubiri idhini ya Msimamizi wa Data.")}</p> : <p className="muted">{L("Not entered yet. The business enters its starting position in its own Profile; you may explain it, but not type it.", "Bado haijaingizwa. Biashara inaingiza hali yake ya kuanzia kwenye Wasifu wake; unaweza kuieleza, lakini si kuiandika.")}</p>}
        </Card>
      )}
      {tab === "loans" && (loans.length ? loans.map((l) => <Card key={l.id} title={`${l.id} · ${money(l.offer?.principal || l.amount)}`} actions={<StatusPill status={l.status} />}>{l.schedule ? <LoanTracker loan={l} business={b} /> : <p className="small muted">{l.purpose}</p>}</Card>) : <Empty text={L("No loans.", "Hakuna mikopo.")} />)}
    </div>
  );
}

// Identity, owners' confirmation, sign-in status and linked businesses (29 Oct).
function IdentityCard({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [modal, setModal] = useState(null);
  const u = state.users.find((x) => x.role === "business" && x.businessId === business.id);
  const owners = ownersOf(business.profile);
  const linked = linkedBusinesses(state, business);
  const k = business.kyc || { status: "pending" };
  const canUnlock = u && (u.pinBlocked || (u.lockedUntil && u.lockedUntil > Date.now())) && (atLeast(user, "dataAdmin") || business.officerId === user.id);
  return (
    <Card title={L("Identity and sign-in", "Utambulisho na kuingia")}>
      <div className="kv">
        <span>{L("Identity check", "Uhakiki wa utambulisho")}</span><span><StatusPill status={k.status} />{k.by ? <span className="tiny muted"> {k.by.name} · {fmtDate(k.at)}{k.reason ? ` · ${k.reason}` : ""}</span> : null}</span>
        <span>{L("Owners confirmed by phone", "Wamiliki waliothibitisha kwa simu")}</span><span>{owners.filter((o) => o.confirmed !== false).length} / {owners.length}</span>
        <span>{L("Sign-in", "Kuingia")}</span><span>{u?.pinBlocked ? <b className="red">{L("Blocked after 10 wrong PINs", "Imezuiwa baada ya PIN 10 zisizo sahihi")}</b> : u?.lockedUntil && u.lockedUntil > Date.now() ? L("Locked for 15 minutes", "Imefungwa kwa dakika 15") : L("Normal", "Kawaida")}</span>
        <span>{L("Same owner's other businesses", "Biashara nyingine za mmiliki huyu")}</span><span>{linked.length ? linked.map((x) => x.profile.businessName).join(", ") : "—"}</span>
      </div>
      <div className="row mt">
        {atLeast(user, "dataAdmin") && k.status !== "verified" && <button className="btn primary small" onClick={() => setModal("verify")}>{L("Identity verified", "Utambulisho umehakikiwa")}</button>}
        {atLeast(user, "dataAdmin") && k.status !== "rejected" && <button className="btn small" onClick={() => setModal("reject")}>{L("Not verified", "Haujahakikiwa")}</button>}
        {canUnlock && <button className="btn small" onClick={() => setModal("unlock")}>{L("Unlock sign-in", "Fungua kuingia")}</button>}
      </div>
      {modal && (
        <ReasonModal
          title={modal === "unlock" ? L("Unlock sign-in", "Fungua kuingia") : modal === "verify" ? L("Identity verified", "Utambulisho umehakikiwa") : L("Identity not verified", "Utambulisho haujahakikiwa")}
          intro={modal === "unlock" ? L("Confirm you checked the owner's NIDA card in person (at least 10 characters).", "Thibitisha kuwa umeangalia kitambulisho cha NIDA cha mmiliki ana kwa ana (herufi 10 au zaidi).") : L("Compare the NIDA photo and number with the owners' details.", "Linganisha picha na namba ya NIDA na taarifa za wamiliki.")}
          onClose={() => setModal(null)}
          onSubmit={(reason) => act((d) => (modal === "unlock" ? unlockPin(d, user, u.id, reason) : verifyIdentity(d, user, business.id, modal === "verify", reason)), L("Saved", "Imehifadhiwa"))}
        />
      )}
    </Card>
  );
}

const BASELINE_FIELDS = {
  bank: [["used", "Bank account used in last 3 months"], ["notUsed", "Bank account, not used"], ["none", "No bank account"]],
  mobile: [["personal", "Personal mobile money"], ["business", "Business till / Lipa number"], ["none", "No mobile money"]],
  borrowed: [["now", "Borrowing formally now"], ["past", "Borrowed formally in the past"], ["never", "Never borrowed formally"]],
  needFinance: [["yes", "Needs finance in 6 months"], ["no", "No finance need"]]
};

// Baseline answers: asked once; Data Admin may correct one with a reason, and the first answers stay on record (ONB-06 revised).
function BaselineCard({ business }) {
  const { user } = useStore();
  const act = useAction();
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const base = business.baseline || {};
  const orig = base.original || base;
  const label = (f, v) => (BASELINE_FIELDS[f]?.find(([k]) => k === v)?.[1]) || (Array.isArray(v) ? v.join(", ") : String(v ?? "—"));
  return (
    <Card title={L("Inclusion baseline (asked once)", "Maswali ya msingi (yaliulizwa mara moja)")}>
      <div className="table-wrap"><table className="t"><thead><tr><th>{L("Question", "Swali")}</th><th>{L("First answer", "Jibu la kwanza")}</th><th>{L("Now", "Sasa")}</th></tr></thead><tbody>
        {["bank", "mobile", "borrowed", "sources", "needFinance", "needAmount"].map((f) => <tr key={f}><td>{f}</td><td>{label(f, orig[f])}</td><td>{label(f, base[f])}{JSON.stringify(orig[f]) !== JSON.stringify(base[f]) ? " *" : ""}</td></tr>)}
      </tbody></table></div>
      {(base.corrections || []).map((c, i) => <p key={i} className="tiny muted mt">* {c.field}: {label(c.field, c.before)} → {label(c.field, c.after)} · {c.by?.name} · {fmtDate(c.at)} · {c.reason}</p>)}
      {atLeast(user, "dataAdmin") && (
        <div className="form two mt">
          <Field label={L("Correct an answer", "Sahihisha jibu")}><Select value={field} onChange={(v) => { setField(v); setValue(""); }} placeholder={L("Choose", "Chagua")} options={Object.keys(BASELINE_FIELDS).map((f) => ({ value: f, label: f }))} /></Field>
          {field && <Field label={L("Correct answer", "Jibu sahihi")}><Select value={value} onChange={setValue} placeholder={L("Choose", "Chagua")} options={BASELINE_FIELDS[field].map(([k, t]) => ({ value: k, label: t }))} /></Field>}
          {field && value && <CorrectBaseline business={business} field={field} value={value} onDone={() => { setField(""); setValue(""); }} act={act} user={user} />}
        </div>
      )}
    </Card>
  );
}

function CorrectBaseline({ business, field, value, onDone, act, user }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>{L("Save correction", "Hifadhi marekebisho")}</button>
      {open && <ReasonModal title={L("Correct baseline answer", "Sahihisha jibu la msingi")} intro={L("The first answer stays on record.", "Jibu la kwanza linabaki kwenye kumbukumbu.")} onClose={() => setOpen(false)} onSubmit={(reason) => { const ok = act((d) => correctBaseline(d, user, business.id, field, value, reason), L("Corrected", "Imesahihishwa")); if (ok) onDone(); return ok; }} />}
    </>
  );
}

export function BusinessRoute() {
  const { params } = useStore();
  return <BusinessFile businessId={params.id} initial={params.tab || "activity"} />;
}

export function OffActivity() {
  const { state, user, params, go } = useStore();
  const list = businessesInScope(state, user);
  const id = params.id || "";
  return (
    <div className="stack">
      <BusinessPicker businesses={list} value={id} onChange={(v) => go("off-activity", { id: v })} />
      {id ? <BusinessFile key={id} businessId={id} initial="activity" /> : <Empty text={L("Choose a business to see its activity and statements.", "Chagua biashara kuona shughuli na taarifa zake.")} />}
    </div>
  );
}

export function OffClose() {
  const { state, user, go } = useStore();
  const t = today(state);
  const list = businessesInScope(state, user);
  const rows = list.map((b) => ({ b, closed: isClosed(state, b.id, t), missed: unclosedPastDays(state, b, t), last: closesFor(state, b.id).slice(-1)[0] }));
  const flags = state.closes.filter((c) => c.flagged && list.some((b) => b.id === c.businessId)).slice(-30).reverse();
  return (
    <div className="stack">
      <Card title={L("Flagged cash differences", "Tofauti za pesa zilizoletwa")}>
        {!flags.length && <Empty text={L("No flagged differences.", "Hakuna tofauti zilizoletwa.")} />}
        <div className="list">
          {flags.map((c) => {
            const b = list.find((x) => x.id === c.businessId);
            return <div key={c.id} className="item"><AlertTriangle size={18} className="amber" /><div className="grow"><b>{b.profile.businessName}</b><div className="small muted">{fmtDate(c.date)} · {L("unexplained", "haielezeki")} {money(c.remainder)} · {Math.abs(c.open || 0) > 0.004 ? `${L("still to resolve", "bado kutatuliwa")} ${money(c.open)}` : L("resolved", "imetatuliwa")}</div></div><button className="btn small" onClick={() => go("business", { id: b.id })}>{L("Open", "Fungua")}</button></div>;
          })}
        </div>
      </Card>
      <Card title={`${L("Today", "Leo")}: ${fmtDate(t)}`}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>{L("Business", "Biashara")}</th><th>{L("Today", "Leo")}</th><th>{L("Missed days", "Siku zilizokosa")}</th><th>{L("Last close", "Kufunga kwa mwisho")}</th></tr></thead>
            <tbody>
              {rows.map(({ b, closed, missed, last }) => (
                <tr key={b.id}><td>{b.profile.businessName}<div className="tiny muted">{b.profile.phone} · {L("closes at", "hufunga")} {b.closingTime}</div></td><td>{closed ? <span className="pill green">{L("Closed", "Imefungwa")}</span> : <span className="pill grey">{L("Open", "Wazi")}</span>}</td><td>{missed.length ? <span className="pill red">{missed.length}</span> : "0"}</td><td className="small">{last ? `${fmtDateTime(last.closedAt)}${Math.abs(last.remainder) > 0.5 ? ` · ${money(last.remainder)}` : ""}` : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const CHANGE_FIELDS = [
  ["phone", "Main phone", "Simu kuu"], ["phone2", "Second phone", "Simu ya pili"], ["email", "Email", "Barua pepe"], ["address", "Business address", "Anwani ya biashara"], ["closingTime", "Closing time", "Muda wa kufunga"],
  ["businessName", "Business name", "Jina la biashara"], ["ownerName", "Owner name", "Jina la mmiliki"], ["nida", "NIDA number", "Namba ya NIDA"], ["dob", "Date of birth", "Tarehe ya kuzaliwa"], ["region", "Region", "Mkoa"], ["monthsOperating", "Months operating", "Miezi ya biashara"], ["staffTotal", "Staff total", "Wafanyakazi wote"]
];

export function OffChanges() {
  const { state, user } = useStore();
  const act = useAction();
  const list = businessesInScope(state, user);
  const [bid, setBid] = useState("");
  const [field, setField] = useState("phone");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const ids = useMemo(() => new Set(list.map((b) => b.id)), [list]);
  const requests = state.changeRequests.filter((c) => ids.has(c.businessId)).slice(0, 60);
  const b = list.find((x) => x.id === bid);
  const current = b ? (field === "closingTime" ? b.closingTime : b.profile[field]) : "";
  return (
    <div className="stack">
      <Card title={L("Recommend a change", "Pendekeza mabadiliko")}>
        <p className="small muted mb">{L("Officers cannot change data directly. Your recommendation waits for Data Admin.", "Maafisa hawabadilishi taarifa moja kwa moja. Pendekezo lako linasubiri Msimamizi wa Data.")}</p>
        <div className="form two">
          <Field label={L("Business", "Biashara")}><BusinessPicker businesses={list} value={bid} onChange={setBid} /></Field>
          <Field label={L("What to change", "Nini kibadilishwe")}><Select value={field} onChange={setField} options={CHANGE_FIELDS.map(([v, en, sw]) => ({ value: v, label: L(en, sw) }))} /></Field>
          <Field label={L("Now", "Sasa")}><input className="input" disabled value={current ?? ""} /></Field>
          <Field label={L("New value", "Thamani mpya")}><Text value={value} onChange={setValue} /></Field>
          <Field label={L("Why", "Kwa nini")}><Text value={note} onChange={setNote} /></Field>
        </div>
        <button className="btn primary mt" disabled={!b || !value.trim() || note.trim().length < 5} onClick={() => { act((d) => requestChange(d, user, { id: uid("CR"), businessId: bid, type: "profile", fields: { [field]: field === "monthsOperating" || field === "staffTotal" ? Number(value) || 0 : value.trim() }, note: `Officer: ${note.trim()}` }), L("Sent to Data Admin", "Imetumwa kwa Msimamizi wa Data")); setValue(""); setNote(""); }}>{L("Send recommendation", "Tuma pendekezo")}</button>
      </Card>
      <Card title={L("Change requests", "Maombi ya mabadiliko")}>
        {!requests.length && <Empty text={L("None yet.", "Bado hakuna.")} />}
        <div className="list">
          {requests.map((c) => (
            <div key={c.id} className="item">
              <div className="grow"><b>{state.businesses.find((x) => x.id === c.businessId)?.profile.businessName}</b><div className="small muted">{crType(c.type)} · {c.note || Object.keys(c.fields || {}).join(", ")}</div><div className="tiny muted">{c.proposedBy?.name} · {fmtDateTime(c.at)}{c.reason ? ` · ${c.reason}` : ""}</div></div>
              <StatusPill status={c.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
