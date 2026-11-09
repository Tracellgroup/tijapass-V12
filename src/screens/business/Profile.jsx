// Business profile (ONB-08 to ONB-10), revised 29 Oct: business details first, then owners and management.
// Changes that fit the verified record apply at once and are logged; changes that contradict verified details
// (name, owners, ID, main phone, region) wait for Data Admin.
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { balanceSheet, channelBalance, openingLinesFor } from "../../core/accounting.js";
import { ACCOUNTS } from "../../core/kinds.js";
import { EDUCATION, LEGAL_FORMS, MAX_MONTHS_OPERATING, mainOwner, normPhone, ownersOf, validEmail, validPhone } from "../../core/people.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../../core/seed.js";
import { daysBetween, sum, today } from "../../core/util.js";
import { PROFILE_LABELS, addChannel, changeProfile, confirmOwner, requestCheck, requestCloseChannel, setConsent } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { getLocation } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, Chips, Confirm, Field, Money, Pill, RatingBadge, Select, StatusPill, StoredImage, Tabs, Text, fmtDate, fmtDateTime } from "../../ui/components.jsx";

// Months operating counts up by itself from joining (9 Nov, PRO-7).
export const monthsNow = (business, todayISO) => Number(business.profile.monthsOperating || 0) + Math.floor(daysBetween(business.startDate, todayISO) / 30.4);
const labelOf = (k) => L(PROFILE_LABELS[k] || k, { phone: "simu kuu", phone2: "simu ya pili", email: "barua pepe", businessName: "jina la biashara", businessType: "aina ya biashara", sector: "sekta", region: "mkoa", legalForm: "umiliki", registrationNo: "namba ya leseni au BRELA", gps: "mahali", owners: "wamiliki", monthsOperating: "miezi ya biashara", address: "anwani", closingTime: "muda wa kufunga" }[k] || k);
import { BankName, OPENING_FIELDS, OpeningForm, OwnerForm, PhoneCode, WALLETS } from "../Onboard.jsx";
import { OwnersTable } from "../admin/DataAdmin.jsx";

export function ProfileDetails({ business }) {
  const { state } = useStore();
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
          <span>{L("Months operating", "Miezi ya biashara")}</span><span>{monthsNow(business, today(state))}</span>
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
  const [f, setF] = useState({ phone2: p.phone2 || "", email: p.email || "", address: p.address || "", closingTime: business.closingTime, staffTotal: p.staffTotal ?? "", staffWomen: p.staffWomen ?? "", staffPaid: p.staffPaid ?? "" });
  const changes = {};
  for (const k of ["email", "address", "closingTime"]) if ((f[k] ?? "") !== ((k === "closingTime" ? business.closingTime : p[k]) ?? "")) changes[k] = String(f[k]).trim();
  if ((f.phone2 ? normPhone(f.phone2) : "") !== (p.phone2 || "")) changes.phone2 = f.phone2 ? normPhone(f.phone2) : "";
  for (const k of ["staffTotal", "staffWomen", "staffPaid"]) if (Number(f[k] || 0) !== Number(p[k] || 0)) changes[k] = Number(f[k] || 0);
  const problem = f.phone2 && !validPhone(f.phone2) ? L("Check the second phone number.", "Hakiki namba ya simu ya pili.")
    : f.email && !validEmail(f.email) ? L("Check the email address, e.g. name@example.com.", "Hakiki barua pepe, k.m. jina@mfano.com.")
      : f.address.trim().length < 5 ? L("Write the address or a landmark (at least 5 characters).", "Andika anwani au alama ya eneo (angalau herufi 5).")
        : Number(f.staffWomen || 0) > Number(f.staffTotal || 0) || Number(f.staffPaid || 0) > Number(f.staffTotal || 0) ? L("Women and paid staff cannot be more than the total.", "Wanawake na wanaolipwa hawawezi kuzidi wote.") : null;
  const valid = !problem;
  const num = (k) => (v) => setF({ ...f, [k]: v.replace(/\D/g, "").slice(0, 4) });
  return (
    <Card title={L("Update my details", "Sasisha taarifa zangu")}>
      <p className="small muted mb">{L("These change at once and are recorded; your officer is told.", "Hizi zinabadilika mara moja na zinahifadhiwa; afisa wako anajulishwa.")}</p>
      <div className="form two">
        <Field label={L("Second phone", "Simu ya pili")}><Text value={f.phone2} onChange={(v) => setF({ ...f, phone2: v })} inputMode="tel" /></Field>
        <Field label={L("Email", "Barua pepe")}><Text value={f.email} maxLength={80} onChange={(v) => setF({ ...f, email: v.trim() })} inputMode="email" /></Field>
        <Field label={L("Written address or landmark *", "Anwani au alama ya eneo *")}><Text value={f.address} maxLength={120} onChange={(v) => setF({ ...f, address: v })} /></Field>
        <Field label={L("Closing time", "Muda wa kufunga")}><input type="time" className="input" value={f.closingTime} onChange={(e) => setF({ ...f, closingTime: e.target.value })} /></Field>
        <Field label={L("Staff in total", "Wafanyakazi wote")}><Text value={String(f.staffTotal)} onChange={num("staffTotal")} inputMode="numeric" /></Field>
        <Field label={L("Of whom women", "Kati yao wanawake")}><Text value={String(f.staffWomen)} onChange={num("staffWomen")} inputMode="numeric" /></Field>
        <Field label={L("Of whom paid", "Kati yao wanaolipwa")}><Text value={String(f.staffPaid)} onChange={num("staffPaid")} inputMode="numeric" /></Field>
      </div>
      {problem && <p className="small amber mt">{problem}</p>}
      <button className="btn primary mt" disabled={!Object.keys(changes).length || !valid} onClick={() => act((d) => changeProfile(d, user, business.id, changes), L("Saved", "Imehifadhiwa"))}>{L("Save", "Hifadhi")}</button>
    </Card>
  );
}

// Details that contradict what was verified: sent to Data Admin.
function ApprovalChanges({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const p = business.profile;
  const [f, setF] = useState({ phone: p.phone, businessName: p.businessName, businessType: p.businessType, sector: p.sector, region: p.region, legalForm: p.legalForm || "sole", registrationNo: p.registrationNo || "", monthsOperating: String(p.monthsOperating ?? ""), gps: null, note: "" });
  const [phoneOk, setPhoneOk] = useState(false);
  const changes = {};
  for (const k of ["businessName", "businessType", "sector", "region", "legalForm", "registrationNo"]) if ((f[k] ?? "") !== (p[k] ?? "")) changes[k] = String(f[k]).trim();
  if (normPhone(f.phone) !== p.phone) changes.phone = normPhone(f.phone);
  if (Number(f.monthsOperating || 0) !== Number(p.monthsOperating || 0)) changes.monthsOperating = Number(f.monthsOperating || 0);
  if (f.gps) changes.gps = f.gps;
  const pending = state.changeRequests.filter((c) => c.businessId === business.id && ["profile", "channelOpening", "closeChannel"].includes(c.type));
  // One pending request per detail (PRO-6): details already waiting cannot be sent again.
  const waiting = new Set(pending.filter((c) => c.type === "profile" && c.status === "pending").flatMap((c) => Object.keys(c.fields || {})));
  const again = Object.keys(changes).filter((k) => waiting.has(k));
  const phoneTaken = changes.phone && state.users.some((u) => u.role === "business" && u.login === changes.phone);
  const problem = f.businessName.trim().length < 2 ? L("Enter the business name.", "Andika jina la biashara.")
    : again.length ? L(`Already waiting for approval: ${again.map(labelOf).join(", ")}.`, `Tayari inasubiri idhini: ${again.map(labelOf).join(", ")}.`)
      : Number(f.monthsOperating || 0) > MAX_MONTHS_OPERATING ? L(`Months operating can be at most ${MAX_MONTHS_OPERATING}.`, `Miezi isizidi ${MAX_MONTHS_OPERATING}.`) : null;
  const valid = validPhone(f.phone) && !phoneTaken && (!changes.phone || phoneOk) && f.note.trim().length >= 5 && !problem;
  return (
    <Card title={L("Changes that need approval", "Mabadiliko yanayohitaji idhini")}>
      <p className="small muted mb">{L("Name, type, sector, region, main phone and a move of more than 2 km change only after Data Admin approves. Say why.", "Jina, aina, sekta, mkoa, simu kuu na kuhama zaidi ya km 2 vinabadilika baada ya Msimamizi wa Data kuidhinisha. Eleza kwa nini.")}</p>
      <div className="form two">
        <Field label={L("Business name", "Jina la biashara")}><Text value={f.businessName} maxLength={80} onChange={(v) => setF({ ...f, businessName: v })} /></Field>
        <Field label={L("Ownership", "Umiliki")}><Select value={f.legalForm} onChange={(v) => setF({ ...f, legalForm: v })} options={LEGAL_FORMS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Licence, BRELA or TIN", "Leseni, BRELA au TIN")}><Text value={f.registrationNo} onChange={(v) => setF({ ...f, registrationNo: v })} /></Field>
        <Field label={L("Business type", "Aina ya biashara")}><Select value={f.businessType} onChange={(v) => setF({ ...f, businessType: v })} options={BUSINESS_TYPES.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Sector", "Sekta")}><Select value={f.sector} onChange={(v) => setF({ ...f, sector: v })} options={SECTORS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
        <Field label={L("Region", "Mkoa")}><Select value={f.region} onChange={(v) => setF({ ...f, region: v })} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
        <Field label={L("Main phone (sign-in)", "Simu kuu (kuingia)")} hint={phoneTaken ? L("This number is already registered.", "Namba hii tayari imesajiliwa.") : null}><Text value={f.phone} onChange={(v) => { setF({ ...f, phone: v }); setPhoneOk(false); }} inputMode="tel" /></Field>
        {changes.phone && !phoneTaken && <Field label={L("Confirm the new number", "Thibitisha namba mpya")}><PhoneCode phone={changes.phone} done={phoneOk} onDone={() => setPhoneOk(true)} /></Field>}
        <div className="field"><span>{L("Business location", "Mahali pa biashara")}</span><button className="btn" onClick={async () => { const g = await getLocation(); if (g) setF({ ...f, gps: g }); }}><MapPin size={18} />{f.gps ? L("New location captured", "Mahali papya pamechukuliwa") : L("Capture new location", "Chukua mahali papya")}</button><small>{L("Within 2 km of the old one it changes at once.", "Ndani ya km 2 ya pa zamani inabadilika mara moja.")}</small></div>
        <Field label={L("Months operating when you joined", "Miezi ya biashara ulipojiunga")} hint={L("TijaPass adds the months since you joined", "TijaPass inaongeza miezi tangu ujiunge")}><Text value={f.monthsOperating} maxLength={3} onChange={(v) => setF({ ...f, monthsOperating: v.replace(/\D/g, "") })} inputMode="numeric" /></Field>
        <Field label={L("Why? (required)", "Kwa nini? (lazima)")}><Text value={f.note} maxLength={300} onChange={(v) => setF({ ...f, note: v })} /></Field>
      </div>
      {problem && Object.keys(changes).length > 0 && <p className="small amber mt">{problem}</p>}
      <button className="btn primary mt" disabled={!Object.keys(changes).length || !valid} onClick={() => act((d) => changeProfile(d, user, business.id, changes, { phoneCodeOk: phoneOk, note: f.note.trim() }), L("Sent. Small location moves apply at once; the rest wait for approval.", "Imetumwa. Kuhama kidogo kunabadilika mara moja; mengine yanasubiri idhini."))}>{L("Send", "Tuma")}</button>
      {pending.length > 0 && (
        <div className="list mt">
          {pending.slice(0, 8).map((c) => (
            <div className="item" key={c.id}><div className="grow"><b>{c.type === "profile" ? `${L("Change", "Mabadiliko")}: ${Object.keys(c.fields || {}).map(labelOf).join(", ")}` : c.note}</b><div className="small muted">{fmtDateTime(c.at)}{c.reason ? ` · ${c.reason}` : ""}</div></div><StatusPill status={c.status} /></div>
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
  const waiting = state.changeRequests.find((c) => c.businessId === business.id && c.type === "profile" && c.status === "pending" && c.fields?.owners);
  if (waiting) return <Card title={L("Owners", "Wamiliki")}><p className="notice">{L("A change to the owners is waiting for Data Admin. You can change owners again after it is decided.", "Mabadiliko ya wamiliki yanasubiri Msimamizi wa Data. Unaweza kubadilisha tena baada ya uamuzi.")} {fmtDateTime(waiting.at)}</p><OwnersTable owners={current} /></Card>;
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

// Money accounts (9 Nov, PRO-1/2/5): the list first; "Open a new account" shows the form. A new account's
// starting balance counts at once and is marked "not verified" until TijaPass checks it.
function MoneyAccounts({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const empty = { type: "mobile", name: "M-Pesa", number: "", openingBalance: "" };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [closeId, setCloseId] = useState(null);
  const t = today(state);
  const startSaved = ["submitted", "approved"].includes(business.opening?.status);
  const unverified = (id) => state.entries.find((e) => e.businessId === business.id && e.channelId === id && e.kind === "channel_opening" && e.unverified && !e.reversedBy);
  const closing = (id) => state.changeRequests.some((c) => c.businessId === business.id && c.type === "closeChannel" && c.status === "pending" && c.fields.channelId === id);
  const numberOk = !f.number || (f.type === "mobile" ? validPhone(f.number) : /^\d{4}$/.test(f.number));
  const add = () => { if (act((d) => addChannel(d, user, business.id, { ...f, openingBalance: Number(f.openingBalance) || 0 }), L("Account added", "Akaunti imeongezwa"))) { setF(empty); setOpen(false); } };
  return (
    <Card title={L("Money accounts", "Njia za pesa")} actions={!open && <button className="btn small primary" onClick={() => setOpen(true)}><Plus size={16} />{L("Open a new account", "Fungua akaunti mpya")}</button>}>
      <div className="list mb">
        {business.channels.filter((c) => !c.archived).map((c) => {
          const bal = channelBalance(state, business.id, c.id, t);
          const u = unverified(c.id);
          return (
            <div key={c.id} className="item">
              <div className="grow">
                <b>{c.name}</b>{c.number ? <span className="small muted"> · {c.number}</span> : null}
                <div className="small muted"><Money v={bal} /> {u && <Pill tone="orange">{L("starting balance not verified", "salio la kuanzia halijahakikiwa")}</Pill>}{closing(c.id) && <Pill tone="grey">{L("closing: waiting for approval", "inafungwa: inasubiri idhini")}</Pill>}</div>
              </div>
              {c.type !== "cash" && !closing(c.id) && <button className="btn small" onClick={() => setCloseId(c.id)}>{L("Close account", "Funga akaunti")}</button>}
            </div>
          );
        })}
      </div>
      {open && (
        <div className="stack">
          <h3>{L("Open a new account", "Fungua akaunti mpya")}</h3>
          <div className="form two">
            <Field label={L("Kind", "Aina")}><Chips value={f.type} onChange={(v) => setF({ ...f, type: v, name: v === "mobile" ? "M-Pesa" : "", number: "" })} options={[{ value: "mobile", label: L("Mobile money", "Pesa ya simu") }, { value: "bank", label: L("Bank", "Benki") }]} /></Field>
            {f.type === "mobile" ? <Field label={L("Provider", "Mtoa huduma")}><Select value={f.name} onChange={(v) => setF({ ...f, name: v })} options={WALLETS.map((w) => ({ value: w, label: w }))} /></Field> : <Field label={L("Bank", "Benki")}><BankName value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>}
            <Field label={f.type === "mobile" ? L("Wallet phone number (optional)", "Namba ya simu ya pochi (si lazima)") : L("Last 4 digits of the account (optional)", "Tarakimu 4 za mwisho za akaunti (si lazima)")} hint={!numberOk ? <span className="amber">{f.type === "mobile" ? L("Use a phone number, e.g. 0712 345 678.", "Tumia namba ya simu, k.m. 0712 345 678.") : L("Exactly 4 digits.", "Tarakimu 4 hasa.")}</span> : null}>
              <Text value={f.number} maxLength={f.type === "mobile" ? 16 : 4} onChange={(v) => setF({ ...f, number: f.type === "mobile" ? v : v.replace(/\D/g, "") })} inputMode="numeric" />
            </Field>
            {startSaved
              ? <Field label={L("Money in it today (TZS)", "Pesa iliyomo leo (TZS)")} hint={L("Counts at once, marked not verified until TijaPass checks it", "Inahesabiwa mara moja, haijahakikiwa hadi TijaPass ikague")}><AmountInput value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v })} /></Field>
              : <p className="small muted">{L("Enter this account's money in your Starting position (tab above), so it is counted once.", "Andika pesa ya akaunti hii kwenye Hali ya kuanzia (juu), ili ihesabiwe mara moja.")}</p>}
          </div>
          <div className="row">
            <button className="btn" onClick={() => { setF(empty); setOpen(false); }}>{L("Cancel", "Ghairi")}</button>
            <button className="btn primary" disabled={!f.name.trim() || !numberOk} onClick={add}><Plus size={18} />{L("Add account", "Ongeza akaunti")}</button>
          </div>
        </div>
      )}
      {closeId && <Confirm title={L("Close this account?", "Funga akaunti hii?")} body={channelBalance(state, business.id, closeId, t) ? L(`It still holds ${Math.round(channelBalance(state, business.id, closeId, t)).toLocaleString("en-US")} TZS. Move the money to another account first (Record → Move money).`, `Bado ina TZS ${Math.round(channelBalance(state, business.id, closeId, t)).toLocaleString("en-US")}. Hamisha pesa kwanza (Andika → Hamisha pesa).`) : L("Data Admin approves the closure. Its history stays in your records.", "Msimamizi wa Data anaidhinisha kufunga. Historia yake inabaki kwenye kumbukumbu.")} onClose={() => setCloseId(null)} onOk={() => act((d) => requestCloseChannel(d, user, business.id, closeId), L("Sent for approval", "Imetumwa kwa idhini"))} />}
    </Card>
  );
}

// Starting position (9 Nov): counts as soon as it is saved, marked "not verified" until TijaPass checks it.
export function StartingPosition({ business }) {
  const { user } = useStore();
  const act = useAction();
  const o = business.opening;
  const lines = o?.values ? openingLinesFor(business, o.values) : [];
  const ask = business.checkRequest && !business.checkRequest.doneAt;
  const Items = () => (
    <div className="kv">
      {lines.filter((l) => l.acc !== "openingEquity").map((l) => {
        const ch = business.channels.find((c) => `ch:${c.id}` === l.acc);
        const key = OPENING_FIELDS.find(([k]) => k === l.acc);
        return [<span key={`a${l.acc}`}>{ch ? ch.name : key ? L(key[1], key[2]) : tl(ACCOUNTS[l.acc]) || l.acc}</span>, <Money key={`b${l.acc}`} v={l.dr || -l.cr} />];
      })}
      <span><b>{L("Owner's starting stake", "Mtaji wa mmiliki wa kuanzia")}</b></span><Money v={sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.dr - l.cr)} />
    </div>
  );
  if (o?.status === "approved") {
    return (
      <Card title={L("Starting position", "Hali ya kuanzia")} actions={<Pill tone="green">{L("Verified", "Imehakikiwa")}</Pill>}>
        <p className="small muted mb">{L("Verified by TijaPass and locked. Only TijaPass can change it, with a reason.", "Imehakikiwa na TijaPass na imefungwa. TijaPass pekee inaweza kuibadilisha, kwa sababu.")} {fmtDate(o.decidedAt || o.date)}</p>
        <Items />
      </Card>
    );
  }
  return (
    <Card title={L("Starting position", "Hali ya kuanzia")} actions={o?.status === "submitted" ? <Pill tone="orange">{L("Not verified yet", "Bado haijahakikiwa")}</Pill> : null}>
      {o?.returned && <p className="notice warn mb"><b>{L("TijaPass asks you to correct it", "TijaPass inaomba uisahihishe")}</b>{o.returned.reason}</p>}
      {o?.status === "submitted" && (
        <div className="notice mb">
          {L("These figures are in use now. TijaPass will check them; you can correct them until then.", "Takwimu hizi zinatumika sasa. TijaPass itazikagua; unaweza kuzisahihisha hadi wakati huo.")}
          <div className="mt"><Items /></div>
          <div className="mt">{ask ? <span className="small">{L("You asked for a check on", "Uliomba ukaguzi tarehe")} {fmtDate(business.checkRequest.at)}.</span> : <button className="btn small" onClick={() => act((d) => requestCheck(d, user, business.id, "Starting position"), L("Sent. TijaPass will contact you.", "Imetumwa. TijaPass itawasiliana nawe."))}>{L("Ask TijaPass to check my records", "Omba TijaPass ikague kumbukumbu zangu")}</button>}</div>
        </div>
      )}
      <OpeningForm key={o?.at || "new"} business={business} />
    </Card>
  );
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
