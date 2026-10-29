// Business profile (ONB-08 to ONB-10), revised 29 Oct: business details first, then owners and management.
// Changes that fit the verified record apply at once and are logged; changes that contradict verified details
// (name, owners, ID, main phone, region) wait for Data Admin.
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { balanceSheet, channelBalance } from "../../core/accounting.js";
import { EDUCATION, LEGAL_FORMS, mainOwner, normPhone, ownersOf, validPhone } from "../../core/people.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../../core/seed.js";
import { sum, today } from "../../core/util.js";
import { addChannel, changeProfile, confirmOwner, requestCloseChannel, setConsent } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { getLocation } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, Chips, Confirm, Field, Money, RatingBadge, Select, StatusPill, StoredImage, Tabs, Text, fmtDate, fmtDateTime } from "../../ui/components.jsx";
import { OpeningForm, OwnerForm, PhoneCode, WALLETS } from "../Onboard.jsx";
import { OwnersTable } from "../admin/DataAdmin.jsx";

export function ProfileDetails({ business }) {
  const p = business.profile;
  const sector = SECTORS.find((x) => x.id === p.sector);
  const type = BUSINESS_TYPES.find((x) => x.id === p.businessType);
  const form = LEGAL_FORMS.find((x) => x.id === p.legalForm);
  const m = p.management || { managedBy: "owner", managers: [] };
  const main = mainOwner(p);
  return (
    <div className="stack">
      <Card title={L("Business", "Biashara")}>
        <div className="kv">
          <span>{L("Name", "Jina")}</span><span>{p.businessName}</span>
          <span>{L("Ownership", "Umiliki")}</span><span>{tl(form) || "—"}</span>
          <span>{L("Licence, BRELA or TIN", "Leseni, BRELA au TIN")}</span><span>{p.registrationNo || "—"}</span>
          <span>{L("Type", "Aina")}</span><span>{tl(type)}</span>
          <span>{L("Sector", "Sekta")}</span><span>{tl(sector)}</span>
          <span>{L("Region", "Mkoa")}</span><span>{p.region}</span>
          <span>{L("Months operating", "Miezi ya biashara")}</span><span>{p.monthsOperating}</span>
          <span>{L("Staff (women, paid)", "Wafanyakazi (wanawake, wanaolipwa)")}</span><span>{p.staffTotal} ({p.staffWomen}, {p.staffPaid})</span>
          <span>{L("Address", "Anwani")}</span><span>{p.address || "—"}</span>
          <span>{L("Location", "Mahali")}</span><span>{p.gps ? <a href={`https://www.openstreetmap.org/?mlat=${p.gps.lat}&mlon=${p.gps.lng}#map=17/${p.gps.lat}/${p.gps.lng}`} target="_blank" rel="noreferrer">{L("Open map", "Fungua ramani")}</a> : "—"}</span>
          <span>{L("Closing time", "Muda wa kufunga")}</span><span>{business.closingTime}</span>
          <span>{L("Money accounts", "Njia za pesa")}</span><span>{business.channels.filter((c) => !c.archived).map((c) => c.name).join(", ")}</span>
          <span>{L("Second phone", "Simu ya pili")}</span><span>{p.phone2 || "—"}</span>
          <span>{L("Email", "Barua pepe")}</span><span>{p.email || "—"}</span>
          <span>{L("Joined", "Alijiunga")}</span><span>{fmtDate(business.startDate)}</span>
          <span>{L("Identity check", "Uhakiki wa utambulisho")}</span><span><StatusPill status={business.kyc?.status || "pending"} /></span>
        </div>
      </Card>
      <Card title={L("Owners", "Wamiliki")}>
        <div className="row mb">{main?.photoId && <StoredImage id={main.photoId} />}{main?.idPhotoId && <StoredImage id={main.idPhotoId} />}</div>
        <OwnersTable owners={ownersOf(p)} />
      </Card>
      <Card title={L("Management", "Uendeshaji")}>
        <p>{m.managedBy === "owner" ? L("Run by the owner(s).", "Inaendeshwa na mmiliki/wamiliki.") : m.managedBy === "manager" ? L("Run by a manager.", "Inaendeshwa na meneja.") : L("Run by the owners and a manager.", "Inaendeshwa na wamiliki na meneja.")}</p>
        {(m.managers || []).map((x) => <p key={x.id} className="small">{x.name} · {x.phone}{x.role ? ` · ${x.role}` : ""}</p>)}
      </Card>
    </div>
  );
}

// Details the business may change at once (logged, officer told).
function QuickDetails({ business }) {
  const { user } = useStore();
  const act = useAction();
  const p = business.profile;
  const [f, setF] = useState({ phone2: p.phone2 || "", email: p.email || "", address: p.address || "", closingTime: business.closingTime, staffTotal: p.staffTotal ?? "", staffWomen: p.staffWomen ?? "", staffPaid: p.staffPaid ?? "", monthsOperating: p.monthsOperating ?? "" });
  const changes = {};
  for (const k of ["email", "address", "closingTime"]) if ((f[k] ?? "") !== ((k === "closingTime" ? business.closingTime : p[k]) ?? "")) changes[k] = String(f[k]).trim();
  if ((f.phone2 ? normPhone(f.phone2) : "") !== (p.phone2 || "")) changes.phone2 = f.phone2 ? normPhone(f.phone2) : "";
  for (const k of ["staffTotal", "staffWomen", "staffPaid", "monthsOperating"]) if (Number(f[k] || 0) !== Number(p[k] || 0)) changes[k] = Number(f[k] || 0);
  const valid = (!f.phone2 || validPhone(f.phone2)) && Number(f.staffWomen || 0) <= Number(f.staffTotal || 0) && Number(f.staffPaid || 0) <= Number(f.staffTotal || 0);
  const num = (k) => (v) => setF({ ...f, [k]: v.replace(/\D/g, "").slice(0, 4) });
  return (
    <Card title={L("Update my details", "Sasisha taarifa zangu")}>
      <p className="small muted mb">{L("These change at once and are recorded; your officer is told.", "Hizi zinabadilika mara moja na zinahifadhiwa; afisa wako anajulishwa.")}</p>
      <div className="form two">
        <Field label={L("Second phone", "Simu ya pili")}><Text value={f.phone2} onChange={(v) => setF({ ...f, phone2: v })} inputMode="tel" /></Field>
        <Field label={L("Email", "Barua pepe")}><Text value={f.email} onChange={(v) => setF({ ...f, email: v })} /></Field>
        <Field label={L("Written address or landmark", "Anwani au alama ya eneo")}><Text value={f.address} onChange={(v) => setF({ ...f, address: v })} /></Field>
        <Field label={L("Closing time", "Muda wa kufunga")}><input type="time" className="input" value={f.closingTime} onChange={(e) => setF({ ...f, closingTime: e.target.value })} /></Field>
        <Field label={L("Staff in total", "Wafanyakazi wote")}><Text value={String(f.staffTotal)} onChange={num("staffTotal")} inputMode="numeric" /></Field>
        <Field label={L("Of whom women", "Kati yao wanawake")}><Text value={String(f.staffWomen)} onChange={num("staffWomen")} inputMode="numeric" /></Field>
        <Field label={L("Of whom paid", "Kati yao wanaolipwa")}><Text value={String(f.staffPaid)} onChange={num("staffPaid")} inputMode="numeric" /></Field>
        <Field label={L("Months operating", "Miezi ya biashara")}><Text value={String(f.monthsOperating)} onChange={num("monthsOperating")} inputMode="numeric" /></Field>
      </div>
      <button className="btn primary mt" disabled={!Object.keys(changes).length || !valid} onClick={() => act((d) => changeProfile(d, user, business.id, changes), L("Saved", "Imehifadhiwa"))}>{L("Save", "Hifadhi")}</button>
    </Card>
  );
}

// Details that contradict what was verified: sent to Data Admin.
function ApprovalChanges({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const p = business.profile;
  const [f, setF] = useState({ phone: p.phone, businessName: p.businessName, businessType: p.businessType, sector: p.sector, region: p.region, legalForm: p.legalForm || "sole", registrationNo: p.registrationNo || "", gps: null, note: "" });
  const [phoneOk, setPhoneOk] = useState(false);
  const changes = {};
  for (const k of ["businessName", "businessType", "sector", "region", "legalForm", "registrationNo"]) if ((f[k] ?? "") !== (p[k] ?? "")) changes[k] = String(f[k]).trim();
  if (normPhone(f.phone) !== p.phone) changes.phone = normPhone(f.phone);
  if (f.gps) changes.gps = f.gps;
  const pending = state.changeRequests.filter((c) => c.businessId === business.id && ["profile", "channelOpening", "closeChannel"].includes(c.type));
  const phoneTaken = changes.phone && state.users.some((u) => u.role === "business" && u.login === changes.phone);
  const valid = validPhone(f.phone) && !phoneTaken && (!changes.phone || phoneOk) && f.note.trim().length >= 5;
  return (
    <Card title={L("Changes that need approval", "Mabadiliko yanayohitaji idhini")}>
      <p className="small muted mb">{L("Name, type, sector, region, main phone and a move of more than 2 km change only after Data Admin approves. Say why.", "Jina, aina, sekta, mkoa, simu kuu na kuhama zaidi ya km 2 vinabadilika baada ya Msimamizi wa Data kuidhinisha. Eleza kwa nini.")}</p>
      <div className="form two">
        <Field label={L("Business name", "Jina la biashara")}><Text value={f.businessName} onChange={(v) => setF({ ...f, businessName: v })} /></Field>
        <Field label={L("Ownership", "Umiliki")}><Select value={f.legalForm} onChange={(v) => setF({ ...f, legalForm: v })} options={LEGAL_FORMS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Licence, BRELA or TIN", "Leseni, BRELA au TIN")}><Text value={f.registrationNo} onChange={(v) => setF({ ...f, registrationNo: v })} /></Field>
        <Field label={L("Business type", "Aina ya biashara")}><Select value={f.businessType} onChange={(v) => setF({ ...f, businessType: v })} options={BUSINESS_TYPES.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Sector", "Sekta")}><Select value={f.sector} onChange={(v) => setF({ ...f, sector: v })} options={SECTORS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Region", "Mkoa")}><Select value={f.region} onChange={(v) => setF({ ...f, region: v })} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
        <Field label={L("Main phone (sign-in)", "Simu kuu (kuingia)")} hint={phoneTaken ? L("This number is already registered.", "Namba hii tayari imesajiliwa.") : null}><Text value={f.phone} onChange={(v) => { setF({ ...f, phone: v }); setPhoneOk(false); }} inputMode="tel" /></Field>
        {changes.phone && !phoneTaken && <Field label={L("Confirm the new number", "Thibitisha namba mpya")}><PhoneCode phone={changes.phone} done={phoneOk} onDone={() => setPhoneOk(true)} /></Field>}
        <div className="field"><span>{L("Business location", "Mahali pa biashara")}</span><button className="btn" onClick={async () => { const g = await getLocation(); if (g) setF({ ...f, gps: g }); }}><MapPin size={18} />{f.gps ? L("New location captured", "Mahali papya pamechukuliwa") : L("Capture new location", "Chukua mahali papya")}</button><small>{L("Within 2 km of the old one it changes at once.", "Ndani ya km 2 ya pa zamani inabadilika mara moja.")}</small></div>
        <Field label={L("Why? (required)", "Kwa nini? (lazima)")}><Text value={f.note} onChange={(v) => setF({ ...f, note: v })} /></Field>
      </div>
      <button className="btn primary mt" disabled={!Object.keys(changes).length || !valid} onClick={() => act((d) => changeProfile(d, user, business.id, changes, { phoneCodeOk: phoneOk, note: f.note.trim() }), L("Sent. Small location moves apply at once; the rest wait for approval.", "Imetumwa. Kuhama kidogo kunabadilika mara moja; mengine yanasubiri idhini."))}>{L("Send", "Tuma")}</button>
      {pending.length > 0 && (
        <div className="list mt">
          {pending.slice(0, 8).map((c) => (
            <div className="item" key={c.id}><div className="grow"><b>{c.note || Object.keys(c.fields || {}).join(", ")}</b><div className="small muted">{fmtDateTime(c.at)}{c.reason ? ` · ${c.reason}` : ""}</div></div><StatusPill status={c.status} /></div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Owners: education updates apply at once; any other change (people, shares, ID) needs every current owner's
// phone code and then Data Admin.
function OwnersEditor({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const current = ownersOf(business.profile);
  const [owners, setOwners] = useState(() => structuredClone(current));
  const [codes, setCodes] = useState({});
  const t = today(state);
  const changed = JSON.stringify(owners) !== JSON.stringify(current);
  const shares = sum(owners, (o) => o.sharePct);
  const identityKeys = ["name", "dob", "gender", "nida", "phone", "sharePct", "role", "guardianName", "guardianPhone", "photoId", "idPhotoId", "main"];
  const needsApproval = owners.length !== current.length || owners.some((o) => { const x = current.find((y) => y.id === o.id); return !x || identityKeys.some((k) => String(x[k] ?? "") !== String(o[k] ?? "")); });
  const allCodes = current.every((o) => codes[o.id]);
  const unconfirmed = current.filter((o) => o.confirmed === false);
  return (
    <Card title={L("Owners", "Wamiliki")}>
      {unconfirmed.length > 0 && (
        <div className="notice warn mb">
          <b>{L("Owners still to confirm", "Wamiliki ambao bado kuthibitisha")}</b>
          {unconfirmed.map((o) => <div key={o.id} className="mt"><span className="small">{o.name}: </span><PhoneCode phone={o.phone} done={false} onDone={() => act((d) => confirmOwner(d, user, business.id, o.id, true), L("Owner confirmed", "Mmiliki amethibitisha"))} /></div>)}
        </div>
      )}
      <p className="small muted mb">{L("Education updates apply at once. Adding or removing an owner, or changing a name, ID, phone or share, needs a code to every current owner's phone and then Data Admin's approval.", "Kusasisha elimu kunabadilika mara moja. Kuongeza au kuondoa mmiliki, au kubadilisha jina, kitambulisho, simu au hisa, kunahitaji msimbo kwa simu ya kila mmiliki wa sasa kisha idhini ya Msimamizi wa Data.")}</p>
      <div className="stack">
        {owners.map((o, i) => <OwnerForm key={o.id} owner={o} index={i} t={t} onChange={(x) => setOwners(owners.map((y, j) => (j === i ? x : y)))} onRemove={!o.main ? () => setOwners(owners.filter((_, j) => j !== i)) : null} />)}
      </div>
      <div className="between mt">
        <button className="btn" onClick={() => setOwners([...owners, { id: `O-${Date.now().toString(36)}`, name: "", phone: "", dob: "", gender: "", nida: "", education: "", sharePct: 0, role: "owner", main: false, confirmed: false }])}><Plus size={18} />{L("Add an owner", "Ongeza mmiliki")}</button>
        <span className={`small ${shares === 100 ? "green" : "amber"}`}>{L("Shares", "Hisa")}: {shares}% / 100%</span>
      </div>
      {changed && needsApproval && (
        <div className="stack mt">
          <b>{L("Every current owner confirms this change", "Kila mmiliki wa sasa anathibitisha mabadiliko haya")}</b>
          {current.map((o) => <Field key={o.id} label={o.name}><PhoneCode phone={o.phone} done={codes[o.id]} label={L("Confirmed", "Amethibitisha")} onDone={() => setCodes({ ...codes, [o.id]: true })} /></Field>)}
        </div>
      )}
      {changed && <button className="btn primary mt" disabled={shares !== 100 || (needsApproval && !allCodes)} onClick={() => act((d) => changeProfile(d, user, business.id, { owners }, { ownersConfirmed: allCodes, note: L("Owners changed", "Wamiliki wamebadilishwa") }), needsApproval ? L("Sent to Data Admin", "Imetumwa kwa Msimamizi wa Data") : L("Saved", "Imehifadhiwa"))}>{needsApproval ? L("Send for approval", "Tuma kwa idhini") : L("Save", "Hifadhi")}</button>}
      <p className="tiny muted mt">{L("Education", "Elimu")}: {EDUCATION.map((e) => tl(e)).join(" · ")}</p>
    </Card>
  );
}

// Money accounts: add a wallet, till or bank account at once; its starting balance waits for Data Admin.
function MoneyAccounts({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [f, setF] = useState({ type: "mobile", name: "M-Pesa", number: "", openingBalance: "" });
  const [closeId, setCloseId] = useState(null);
  const t = today(state);
  return (
    <Card title={L("Money accounts", "Njia za pesa")}>
      <div className="list mb">
        {business.channels.filter((c) => !c.archived).map((c) => (
          <div key={c.id} className="item">
            <div className="grow"><b>{c.name}</b>{c.number ? <span className="small muted"> · {c.number}</span> : null}<div className="small muted"><Money v={channelBalance(state, business.id, c.id, t)} /></div></div>
            {c.type !== "cash" && <button className="btn small" onClick={() => setCloseId(c.id)}>{L("Close account", "Funga akaunti")}</button>}
          </div>
        ))}
      </div>
      <h3>{L("Add an account", "Ongeza akaunti")}</h3>
      <div className="form two">
        <Field label={L("Kind", "Aina")}><Chips value={f.type} onChange={(v) => setF({ ...f, type: v, name: v === "mobile" ? "M-Pesa" : "" })} options={[{ value: "mobile", label: L("Mobile money", "Pesa ya simu") }, { value: "bank", label: L("Bank", "Benki") }]} /></Field>
        {f.type === "mobile" ? <Field label={L("Provider", "Mtoa huduma")}><Select value={f.name} onChange={(v) => setF({ ...f, name: v })} options={WALLETS.map((w) => ({ value: w, label: w }))} /></Field> : <Field label={L("Bank name", "Jina la benki")}><Text value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>}
        <Field label={L("Number or last 4 digits (optional)", "Namba au tarakimu 4 za mwisho (si lazima)")}><Text value={f.number} onChange={(v) => setF({ ...f, number: v })} inputMode="numeric" /></Field>
        <Field label={L("Money in it today (TZS)", "Pesa iliyomo leo (TZS)")} hint={L("Checked by Data Admin before it counts", "Inakaguliwa na Msimamizi wa Data kabla ya kuhesabiwa")}><AmountInput value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v })} /></Field>
      </div>
      <button className="btn primary mt" disabled={!f.name.trim()} onClick={() => { if (act((d) => addChannel(d, user, business.id, { ...f, openingBalance: Number(f.openingBalance) || 0 }), L("Account added", "Akaunti imeongezwa"))) setF({ type: "mobile", name: "M-Pesa", number: "", openingBalance: "" }); }}><Plus size={18} />{L("Add account", "Ongeza akaunti")}</button>
      {closeId && <Confirm title={L("Close this account?", "Funga akaunti hii?")} body={L("Move any money out first. Data Admin approves the closure.", "Hamisha pesa yoyote kwanza. Msimamizi wa Data anaidhinisha kufunga.")} onClose={() => setCloseId(null)} onOk={() => act((d) => requestCloseChannel(d, user, business.id, closeId), L("Sent for approval", "Imetumwa kwa idhini"))} />}
    </Card>
  );
}

export function StartingPosition({ business }) {
  const { state } = useStore();
  const o = business.opening;
  if (o?.status === "approved") {
    const bs = balanceSheet(state, business.id, o.date);
    return (
      <Card title={L("Starting position (locked)", "Hali ya kuanzia (imefungwa)")}>
        <p className="small muted mb">{L("Approved by TijaPass Admin. Only Admin can change it, with a reason.", "Imeidhinishwa na TijaPass Admin. Msimamizi pekee anaweza kuibadilisha, kwa sababu.")} {fmtDate(o.date)}</p>
        <div className="kv">
          <span>{L("Everything the business had", "Vyote biashara ilivyokuwa navyo")}</span><Money v={bs.totalAssets} />
          <span>{L("Everything it owed", "Vyote ilivyodaiwa")}</span><Money v={bs.totalLiabilities} />
          <span>{L("Owner's starting stake", "Mtaji wa mmiliki wa kuanzia")}</span><Money v={bs.equity[0].amount} />
        </div>
      </Card>
    );
  }
  if (o?.status === "submitted") return <Card title={L("Starting position", "Hali ya kuanzia")}><p>{L("Sent to TijaPass Admin. You will be told when it is approved.", "Imetumwa kwa TijaPass Admin. Utajulishwa ikiidhinishwa.")}</p></Card>;
  return <Card title={L("Starting position", "Hali ya kuanzia")}>{o?.reason && <p className="notice warn mb">{L("Admin asked for changes", "Msimamizi ameomba marekebisho")}: {o.reason}</p>}<OpeningForm business={business} /></Card>;
}

function ConsentCard({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [ask, setAsk] = useState(null);
  const fis = state.fis.filter((f) => f.status === "approved");
  return (
    <Card title={L("Who can see my records", "Nani anaweza kuona kumbukumbu zangu")}>
      <p className="small muted mb">{L("Consent given", "Ridhaa ilitolewa")}: {fmtDateTime(business.consent?.at)}. {L("Each lender sees your passport, rating and statements only if you allow it here.", "Kila mkopeshaji anaona pasipoti, kiwango na taarifa zako ukiruhusu hapa tu.")}</p>
      <div className="list">
        {fis.map((f) => {
          const on = business.consent?.fis?.[f.id]?.granted;
          return (
            <div key={f.id} className="item">
              <div className="grow"><b>{f.name}</b><div className="small muted">{on ? `${L("Allowed since", "Imeruhusiwa tangu")} ${fmtDate(business.consent.fis[f.id].at)}` : L("Not allowed", "Hairuhusiwi")}</div></div>
              <button className={`btn small ${on ? "danger" : ""}`} onClick={() => setAsk({ fi: f, grant: !on })}>{on ? L("Withdraw", "Ondoa") : L("Allow", "Ruhusu")}</button>
            </div>
          );
        })}
      </div>
      {ask && <Confirm title={ask.grant ? L("Allow this lender?", "Ruhusu mkopeshaji huyu?") : L("Withdraw consent?", "Ondoa ridhaa?")} body={ask.grant ? L(`${ask.fi.name} will see your credit passport, Records Rating and statements.`, `${ask.fi.name} ataona pasipoti yako, Kiwango cha Kumbukumbu na taarifa zako.`) : L(`${ask.fi.name} will lose access at once.`, `${ask.fi.name} atapoteza ruhusa mara moja.`)} danger={!ask.grant} onClose={() => setAsk(null)} onOk={() => act((d) => setConsent(d, user, business.id, ask.fi.id, ask.grant), L("Saved", "Imehifadhiwa"))} />}
    </Card>
  );
}

export default function Profile() {
  const { state, user, params } = useStore();
  const b = myBusiness(state, user);
  const [tab, setTab] = useState(params.tab || "details");
  const officer = state.users.find((u) => u.id === b.officerId);
  return (
    <div className="stack">
      <div className="between"><RatingBadge business={b} big /><span className="small muted">{L("Your officer", "Afisa wako")}: <b>{officer?.name || L("being assigned", "anapangwa")}</b></span></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "details", label: L("My details", "Taarifa zangu") }, { value: "owners", label: L("Owners", "Wamiliki") }, { value: "accounts", label: L("Money accounts", "Njia za pesa") }, { value: "opening", label: L("Starting position", "Hali ya kuanzia") }, { value: "consent", label: L("Consent", "Ridhaa") }]} />
      {tab === "details" && <><ProfileDetails business={b} /><QuickDetails business={b} /><ApprovalChanges business={b} /></>}
      {tab === "owners" && <OwnersEditor business={b} />}
      {tab === "accounts" && <MoneyAccounts business={b} />}
      {tab === "opening" && <StartingPosition business={b} />}
      {tab === "consent" && <ConsentCard business={b} />}
    </div>
  );
}
