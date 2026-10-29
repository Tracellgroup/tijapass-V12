// Business registration (ONB-01 to ONB-07, ONB-10), revised 29 Oct 2026: only the business itself registers
// (no officer or admin can create a business). Order: business, owners, management, money, questions,
// then the code to the main phone and a 4-digit PIN.
import { MapPin, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { openingLines } from "../core/accounting.js";
import { ADULT_AGE, EDUCATION, LEGAL_FORMS, OWNER_ROLES, ageOn, dobBounds, normNida, normPhone, pinProblem, profileProblems, syncProfile, validNida, validPhone } from "../core/people.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../core/seed.js";
import { sum, today, uid } from "../core/util.js";
import { adminEditOpening, createBusiness, saveOpening } from "../lib/actions.js";
import { getLocation } from "../lib/files.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useAction, useStore } from "../lib/store.jsx";
import { AmountInput, Card, Chips, DatePicker, Field, Money, PhotoInput, Select, Steps, Text } from "../ui/components.jsx";

export { normPhone, validPhone };
export const WALLETS = ["M-Pesa", "Mixx by Yas (Tigo Pesa)", "Airtel Money", "HaloPesa", "AzamPesa", "T-Pesa"];

const BASELINE = {
  bank: [["used", "Yes, used in the last 3 months", "Ndiyo, nimeitumia miezi 3 iliyopita"], ["notUsed", "Yes, but not used in 3 months", "Ndiyo, lakini sijaitumia miezi 3"], ["none", "No bank account", "Sina akaunti ya benki"]],
  mobile: [["personal", "Personal mobile money line", "Laini ya pesa ya simu binafsi"], ["business", "Business till or Lipa number", "Namba ya Lipa ya biashara"], ["none", "None", "Sina"]],
  borrowed: [["now", "Yes, I have a loan now", "Ndiyo, nina mkopo sasa"], ["past", "Yes, in the past", "Ndiyo, zamani"], ["never", "Never", "Sijawahi"]],
  sources: [["family", "Family and friends", "Familia na marafiki"], ["vicoba", "VICOBA or savings group", "VICOBA au kikundi cha akiba"], ["supplier", "Supplier credit", "Mkopo wa msambazaji"], ["app", "Loan app", "Programu ya mikopo"], ["moneylender", "Moneylender", "Mkopeshaji binafsi"], ["formal", "Bank, MFI or SACCO", "Benki, taasisi ndogo au SACCOS"], ["none", "None", "Hakuna"]]
};
const opts = (k) => BASELINE[k].map(([value, en, sw]) => ({ value, label: getLang() === "sw" ? sw : en }));

// A code sent to a phone (simulated in the web MVP: the code is shown on screen instead of sent by SMS).
export function PhoneCode({ phone, done, onDone, label }) {
  const [code, setCode] = useState(null);
  const [typed, setTyped] = useState("");
  const [wrong, setWrong] = useState(false);
  if (done) return <p className="small green">✓ {label || L("Phone confirmed", "Simu imethibitishwa")}: {phone}</p>;
  return (
    <div className="phone-code">
      {!code ? (
        <>
          <button type="button" className="btn primary" disabled={!validPhone(phone)} onClick={() => { setCode(String(1000 + Math.floor(Math.random() * 9000))); setWrong(false); }}>
            {L("Send code to", "Tuma msimbo kwa")} {phone || "…"}
          </button>
          <p className="tiny muted">{validPhone(phone) ? L("Tap to get a 4-digit code. Test version: the code shows here instead of an SMS, so a made-up number works.", "Bofya kupata msimbo wa tarakimu 4. Toleo la majaribio: msimbo unaonekana hapa badala ya SMS, kwa hiyo namba ya kubuni inafaa.") : L("Enter a valid phone number first, e.g. 0712 345 678.", "Andika kwanza namba sahihi ya simu, k.m. 0712 345 678.")}</p>
        </>
      ) : (
        <>
          <p className="tiny test-code">{L("Test version: the SMS code is", "Toleo la majaribio: msimbo wa SMS ni")} <b data-testid="sms-code">{code}</b></p>
          <div className="row">
            <input className="input" style={{ maxWidth: 140 }} inputMode="numeric" maxLength={4} aria-label={L("Code from SMS", "Msimbo wa SMS")} value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
            <button type="button" className="btn primary" onClick={() => { if (typed === code) onDone(); else setWrong(true); }}>{L("Confirm code", "Thibitisha msimbo")}</button>
            <button type="button" className="btn ghost" onClick={() => { setCode(null); setTyped(""); }}>{L("Send again", "Tuma tena")}</button>
          </div>
          {wrong && <p className="small amber">{L("That code is not right.", "Msimbo huo si sahihi.")}</p>}
        </>
      )}
    </div>
  );
}

PhoneCode.isGroup = true;

const newOwner = (main = false) => ({ id: uid("O"), name: "", phone: "", dob: "", gender: "", nida: "", education: "", sharePct: main ? 100 : 0, role: "owner", main, photoId: null, idPhotoId: null, guardianName: "", guardianPhone: "", confirmed: main });

export function OwnerForm({ owner, onChange, onRemove, index, t }) {
  const set = (k, v) => onChange({ ...owner, [k]: v });
  const bounds = dobBounds(t);
  const age = ageOn(owner.dob, t);
  return (
    <div className="owner-card">
      <div className="between mb">
        <b>{owner.main ? L("Main owner (signs in)", "Mmiliki mkuu (anaingia)") : `${L("Owner", "Mmiliki")} ${index + 1}`}</b>
        {onRemove && <button type="button" className="icon-btn" onClick={onRemove} aria-label={L("Remove owner", "Ondoa mmiliki")}><Trash2 size={18} /></button>}
      </div>
      <div className="form two">
        <Field label={L("Full name *", "Jina kamili *")}><Text value={owner.name} onChange={(v) => set("name", v)} autoComplete="name" /></Field>
        <Field label={L("Phone *", "Simu *")} hint={owner.main ? L("Used to sign in", "Inatumika kuingia") : L("Gets a code to confirm", "Atapata msimbo wa kuthibitisha")}><Text value={owner.phone} onChange={(v) => set("phone", v)} inputMode="tel" placeholder="0712 345 678" /></Field>
        <Field label={L("Date of birth * (year, month, day)", "Tarehe ya kuzaliwa * (mwaka, mwezi, siku)")} hint={L("Owners must be 12 or older", "Wamiliki lazima wawe na miaka 12 au zaidi")}><DatePicker name={L("Date of birth", "Tarehe ya kuzaliwa")} value={owner.dob} min={bounds.min} max={bounds.max} onChange={(v) => set("dob", v)} /></Field>
        <Field label={L("Gender *", "Jinsia *")}><Chips value={owner.gender} onChange={(v) => set("gender", v)} options={[{ value: "female", label: L("Female", "Mwanamke") }, { value: "male", label: L("Male", "Mwanaume") }]} /></Field>
        <Field label={L("NIDA number (20 digits)", "Namba ya NIDA (tarakimu 20)")} hint={owner.nida && !validNida(owner.nida) ? L(`${normNida(owner.nida).length} of 20 digits`, `Tarakimu ${normNida(owner.nida).length} kati ya 20`) : L("Needed before a loan", "Inahitajika kabla ya mkopo")}><Text value={owner.nida} onChange={(v) => set("nida", v.replace(/[^\d-]/g, ""))} inputMode="numeric" placeholder="19940512-11111-00001-21" /></Field>
        <Field label={L("Level of education (optional)", "Kiwango cha elimu (si lazima)")}><Select value={owner.education} onChange={(v) => set("education", v)} placeholder={L("Choose", "Chagua")} options={EDUCATION.map((e) => ({ value: e.id, label: tl(e) }))} /></Field>
        <Field label={L("Share of the business (%) *", "Hisa ya biashara (%) *")}><Text value={String(owner.sharePct ?? "")} onChange={(v) => set("sharePct", Number(v.replace(/\D/g, "").slice(0, 3)) || 0)} inputMode="numeric" /></Field>
        <Field label={L("Role", "Nafasi")}><Select value={owner.role} onChange={(v) => set("role", v)} options={OWNER_ROLES.map((r) => ({ value: r.id, label: tl(r) }))} /></Field>
        {age != null && age < ADULT_AGE && (
          <>
            <p className="notice warn" style={{ gridColumn: "1 / -1" }}>{L("Under 18: a parent or guardian must be named. Records can be kept, but loans need an owner aged 18 or older.", "Chini ya miaka 18: mzazi au mlezi lazima atajwe. Kumbukumbu zinaweza kuwekwa, lakini mikopo inahitaji mmiliki wa miaka 18 au zaidi.")}</p>
            <Field label={L("Parent or guardian's name *", "Jina la mzazi au mlezi *")}><Text value={owner.guardianName} onChange={(v) => set("guardianName", v)} /></Field>
            <Field label={L("Parent or guardian's phone *", "Simu ya mzazi au mlezi *")}><Text value={owner.guardianPhone} onChange={(v) => set("guardianPhone", v)} inputMode="tel" /></Field>
          </>
        )}
        <PhotoInput label={L("Owner photo", "Picha ya mmiliki")} value={owner.photoId} onChange={(v) => set("photoId", v)} capture="user" />
        <PhotoInput label={L("ID photo (NIDA card)", "Picha ya kitambulisho (NIDA)")} value={owner.idPhotoId} onChange={(v) => set("idPhotoId", v)} />
      </div>
    </div>
  );
}

const emptyForm = () => ({
  businessName: "", legalForm: "sole", registrationNo: "", businessType: "", sector: "", region: "", monthsOperating: "", staffTotal: "", staffWomen: "", staffPaid: "", gps: null, address: "", closingTime: "17:00", custom: {},
  owners: [newOwner(true)],
  management: { managedBy: "owner", managers: [] },
  phone2: "", email: "", homeAddress: "",
  wallets: [{ provider: "M-Pesa", number: "" }], banks: [],
  baseline: { bank: "", mobile: "", borrowed: "", sources: [], needFinance: "", needPurpose: "", needAmount: "" },
  pin: "", pin2: "", consent: false, phoneOk: false
});

export function BusinessWizard({ onDone }) {
  const { state, lang } = useStore();
  const act = useAction();
  const [f, setF] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [gpsBusy, setGpsBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setB = (k, v) => setF((x) => ({ ...x, baseline: { ...x.baseline, [k]: v } }));
  const setOwner = (i, o) => setF((x) => ({ ...x, owners: x.owners.map((y, j) => (j === i ? o : y)), phoneOk: i === 0 && o.phone !== x.owners[0].phone ? false : x.phoneOk }));
  const fields = state.settings.customFields || [];
  const t = today(state);
  void lang;

  const main = f.owners[0];
  const phoneTaken = state.users.some((u) => u.role === "business" && u.login === normPhone(main.phone));
  const shares = sum(f.owners, (o) => o.sharePct);
  const profileDraft = syncProfile({ businessName: f.businessName, owners: f.owners });
  const ownerProblems = profileProblems(profileDraft, t).filter((x) => !/business name/i.test(x.en));
  const pinIssue = f.pin ? pinProblem(f.pin, { dob: main.dob, phones: f.owners.map((o) => o.phone) }) : null;
  const errors = [
    [f.businessName.trim() && f.legalForm && f.businessType && f.sector && f.region && f.closingTime && fields.filter((x) => x.required).every((x) => f.custom[x.id]), L("Fill in business name, type, sector, region and closing time.", "Jaza jina la biashara, aina, sekta, mkoa na muda wa kufunga.")],
    [!ownerProblems.length && !phoneTaken, phoneTaken ? L("The main owner's phone is already registered.", "Simu ya mmiliki mkuu tayari imesajiliwa.") : tl(ownerProblems[0] || { en: "", sw: "" })],
    [f.management.managedBy === "owner" || (f.management.managers.length && f.management.managers.every((m) => m.name.trim().length > 2 && validPhone(m.phone))), L("Add each manager's name and phone.", "Ongeza jina na simu ya kila meneja.")],
    [f.wallets.every((w) => w.provider) && f.banks.every((b) => b.name) && (!f.phone2 || validPhone(f.phone2)), L("Each wallet needs a provider and each bank a name.", "Kila pochi inahitaji mtoa huduma na kila benki jina.")],
    [f.baseline.bank && f.baseline.mobile && f.baseline.borrowed && f.baseline.sources.length && f.baseline.needFinance && (f.baseline.needFinance === "no" || f.baseline.needAmount), L("Answer every question.", "Jibu kila swali.")],
    [f.phoneOk && /^\d{4}$/.test(f.pin) && !pinIssue && f.pin === f.pin2 && f.consent, [
      !f.phoneOk && L("Confirm the main phone: tap \"Send code\", then type the code shown.", "Thibitisha simu kuu: bofya \"Tuma msimbo\", kisha andika msimbo unaoonekana."),
      !/^\d{4}$/.test(f.pin) ? L("Choose a 4-digit PIN.", "Chagua PIN ya tarakimu 4.") : pinIssue ? tl(pinIssue) : f.pin !== f.pin2 && L("Repeat the same PIN.", "Rudia PIN ile ile."),
      !f.consent && L("Tick \"I agree\".", "Weka alama \"Nakubali\".")
    ].filter(Boolean).join(" ")]
  ];
  const ok = Boolean(errors[step][0]);

  const captureGps = async () => {
    setGpsBusy(true);
    const g = await getLocation();
    setGpsBusy(false);
    if (g) set("gps", g);
  };

  const finish = () => {
    const id = uid("B");
    const userId = uid("U");
    const channels = [
      { id: uid("C"), type: "cash", name: L("Cash in hand", "Pesa taslimu") },
      ...f.wallets.map((w) => ({ id: uid("C"), type: "mobile", name: w.provider, number: w.number })),
      ...f.banks.map((b) => ({ id: uid("C"), type: "bank", name: b.name, number: b.number }))
    ];
    const profile = syncProfile({
      owners: f.owners.map((o) => ({ ...o, name: o.name.trim(), nida: o.nida.trim(), phone: normPhone(o.phone), guardianPhone: o.guardianPhone ? normPhone(o.guardianPhone) : "" })),
      phone2: f.phone2 ? normPhone(f.phone2) : "", email: f.email.trim(), homeAddress: f.homeAddress.trim(),
      businessName: f.businessName.trim(), legalForm: f.legalForm, registrationNo: f.registrationNo.trim(), businessType: f.businessType, sector: f.sector, region: f.region,
      monthsOperating: Number(f.monthsOperating) || 0, staffTotal: Number(f.staffTotal) || 0, staffWomen: Number(f.staffWomen) || 0, staffPaid: Number(f.staffPaid) || 0,
      management: { managedBy: f.management.managedBy, managers: f.management.managers.map((m) => ({ ...m, name: m.name.trim(), phone: normPhone(m.phone) })) },
      gps: f.gps, address: f.address.trim(), custom: f.custom
    });
    const baseline = { ...f.baseline, needAmount: Number(f.baseline.needAmount) || 0 };
    const done = act((d) => createBusiness(d, null, { id, userId, profile, channels, baseline, closingTime: f.closingTime, pin: f.pin, lang: getLang(), phoneVerified: f.phoneOk }), L("Business registered", "Biashara imesajiliwa"));
    if (done) onDone({ businessId: id, userId });
  };

  const titles = [L("Business", "Biashara"), L("Owners", "Wamiliki"), L("Management", "Uendeshaji"), L("Money accounts", "Njia za pesa"), L("A few questions", "Maswali machache"), L("Phone code, PIN and consent", "Msimbo wa simu, PIN na ridhaa")];
  const mgr = f.management;
  return (
    <Card title={`${step + 1}. ${titles[step]}`}>
      <Steps count={titles.length} at={step} />
      {step === 0 && (
        <div className="form two">
          <Field label={L("Business name *", "Jina la biashara *")}><Text value={f.businessName} onChange={(v) => set("businessName", v)} /></Field>
          <Field label={L("Ownership *", "Umiliki *")}><Select value={f.legalForm} onChange={(v) => set("legalForm", v)} options={LEGAL_FORMS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Business type *", "Aina ya biashara *")}><Select value={f.businessType} onChange={(v) => set("businessType", v)} placeholder={L("Choose", "Chagua")} options={BUSINESS_TYPES.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Sector *", "Sekta *")}><Select value={f.sector} onChange={(v) => set("sector", v)} placeholder={L("Choose", "Chagua")} options={SECTORS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Region *", "Mkoa *")}><Select value={f.region} onChange={(v) => set("region", v)} placeholder={L("Choose", "Chagua")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
          <Field label={L("Licence, BRELA or TIN number (optional)", "Namba ya leseni, BRELA au TIN (si lazima)")}><Text value={f.registrationNo} onChange={(v) => set("registrationNo", v)} /></Field>
          <Field label={L("Months operating", "Miezi ya biashara")}><Text value={f.monthsOperating} onChange={(v) => set("monthsOperating", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
          <Field label={L("Usual closing time *", "Muda wa kawaida wa kufunga *")} hint={L("The daily close prompt comes at this time", "Ukumbusho wa kufunga siku unakuja muda huu")}><input type="time" className="input" value={f.closingTime} onChange={(e) => set("closingTime", e.target.value)} /></Field>
          <Field label={L("Staff in total", "Wafanyakazi wote")}><Text value={f.staffTotal} onChange={(v) => set("staffTotal", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
          <div className="form two">
            <Field label={L("Of whom women", "Kati yao wanawake")}><Text value={f.staffWomen} onChange={(v) => set("staffWomen", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
            <Field label={L("Of whom paid", "Kati yao wanaolipwa")}><Text value={f.staffPaid} onChange={(v) => set("staffPaid", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
          </div>
          <Field label={L("Written address or landmark", "Anwani au alama ya eneo")}><Text value={f.address} onChange={(v) => set("address", v)} /></Field>
          <div className="field">
            <span>{L("Location (GPS)", "Mahali (GPS)")}</span>
            <button type="button" className="btn" onClick={captureGps} disabled={gpsBusy}><MapPin size={18} />{gpsBusy ? L("Finding location…", "Inatafuta mahali…") : f.gps ? L("Update location", "Sasisha mahali") : L("Capture location", "Chukua mahali")}</button>
            <small>{f.gps ? `${f.gps.lat.toFixed(5)}, ${f.gps.lng.toFixed(5)} (±${f.gps.accuracy} m)` : L("Allow location when the phone asks.", "Ruhusu mahali simu inapouliza.")}</small>
          </div>
          {fields.map((x) => (
            <Field key={x.id} label={`${tl(x.label)}${x.required ? " *" : ""}`}>
              {x.type === "select"
                ? <Select value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: v })} placeholder={L("Choose", "Chagua")} options={(x.options || []).map((o) => ({ value: o, label: o }))} />
                : <Text value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: v })} inputMode={x.type === "number" ? "numeric" : undefined} />}
            </Field>
          ))}
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <p className="muted">{L("Add every owner. The first owner signs in; each other owner confirms with a code sent to their own phone. Shares must add up to 100%.", "Ongeza kila mmiliki. Mmiliki wa kwanza ndiye anaingia; kila mmiliki mwingine anathibitisha kwa msimbo unaotumwa kwenye simu yake. Hisa lazima zijumlishe 100%.")}</p>
          {f.owners.map((o, i) => <OwnerForm key={o.id} owner={o} index={i} t={t} onChange={(x) => setOwner(i, x)} onRemove={i > 0 ? () => set("owners", f.owners.filter((_, j) => j !== i)) : null} />)}
          <div className="between">
            <button type="button" className="btn" onClick={() => set("owners", [...f.owners, newOwner(false)])}><UserPlus size={18} />{L("Add another owner", "Ongeza mmiliki mwingine")}</button>
            <span className={`small ${shares === 100 ? "green" : "amber"}`}>{L("Shares", "Hisa")}: {shares}% / 100%</span>
          </div>
          <div className="form two">
            <Field label={L("Second phone for the business (optional)", "Simu ya pili ya biashara (si lazima)")}><Text value={f.phone2} onChange={(v) => set("phone2", v)} inputMode="tel" /></Field>
            <Field label={L("Email (optional)", "Barua pepe (si lazima)")}><Text value={f.email} onChange={(v) => set("email", v)} inputMode="email" /></Field>
            <Field label={L("Main owner's home address", "Anwani ya nyumbani ya mmiliki mkuu")}><Text value={f.homeAddress} onChange={(v) => set("homeAddress", v)} /></Field>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <Field label={L("Who runs the business day to day?", "Nani anaendesha biashara kila siku?")}>
            <Chips value={mgr.managedBy} onChange={(v) => set("management", { ...mgr, managedBy: v, managers: v === "owner" ? [] : mgr.managers.length ? mgr.managers : [{ id: uid("M"), name: "", phone: "", role: "" }] })} options={[{ value: "owner", label: L("The owner(s)", "Mmiliki/wamiliki") }, { value: "manager", label: L("A manager", "Meneja") }, { value: "both", label: L("Owners and a manager", "Wamiliki na meneja") }]} />
          </Field>
          {mgr.managedBy !== "owner" && mgr.managers.map((m, i) => (
            <div className="form two" key={m.id}>
              <Field label={L("Manager's name *", "Jina la meneja *")}><Text value={m.name} onChange={(v) => set("management", { ...mgr, managers: mgr.managers.map((x, j) => (j === i ? { ...x, name: v } : x)) })} /></Field>
              <Field label={L("Manager's phone *", "Simu ya meneja *")}><Text value={m.phone} onChange={(v) => set("management", { ...mgr, managers: mgr.managers.map((x, j) => (j === i ? { ...x, phone: v } : x)) })} inputMode="tel" /></Field>
              <Field label={L("Role or title", "Nafasi")}><Text value={m.role} onChange={(v) => set("management", { ...mgr, managers: mgr.managers.map((x, j) => (j === i ? { ...x, role: v } : x)) })} /></Field>
              {mgr.managers.length > 1 && <button type="button" className="btn ghost" onClick={() => set("management", { ...mgr, managers: mgr.managers.filter((_, j) => j !== i) })}><Trash2 size={16} />{L("Remove", "Ondoa")}</button>}
            </div>
          ))}
          {mgr.managedBy !== "owner" && <button type="button" className="btn" onClick={() => set("management", { ...mgr, managers: [...mgr.managers, { id: uid("M"), name: "", phone: "", role: "" }] })}><Plus size={18} />{L("Add a manager", "Ongeza meneja")}</button>}
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <p className="muted">{L("Cash in hand is always included. Add every mobile money wallet and bank account the business uses.", "Pesa taslimu ipo daima. Ongeza kila pochi ya pesa ya simu na akaunti ya benki ambayo biashara inatumia.")}</p>
          <h3>{L("Mobile money", "Pesa ya simu")}</h3>
          {f.wallets.map((w, i) => (
            <div className="row" key={`w${i}`}>
              <div style={{ flex: "1 1 160px" }}><Select value={w.provider} onChange={(v) => set("wallets", f.wallets.map((x, j) => (j === i ? { ...x, provider: v } : x)))} options={WALLETS.map((p) => ({ value: p, label: p }))} /></div>
              <div style={{ flex: "1 1 140px" }}><Text value={w.number} onChange={(v) => set("wallets", f.wallets.map((x, j) => (j === i ? { ...x, number: v } : x)))} placeholder={L("Number (optional)", "Namba (si lazima)")} inputMode="tel" /></div>
              <button className="icon-btn" onClick={() => set("wallets", f.wallets.filter((_, j) => j !== i))} aria-label={L("Remove", "Ondoa")}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn" onClick={() => set("wallets", [...f.wallets, { provider: "Airtel Money", number: "" }])}><Plus size={18} />{L("Add wallet", "Ongeza pochi")}</button>
          <h3 className="mt">{L("Bank accounts", "Akaunti za benki")}</h3>
          {f.banks.map((b, i) => (
            <div className="row" key={`b${i}`}>
              <div style={{ flex: "1 1 160px" }}><Text value={b.name} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder={L("Bank name", "Jina la benki")} /></div>
              <div style={{ flex: "1 1 140px" }}><Text value={b.number} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, number: v } : x)))} placeholder={L("Last 4 digits (optional)", "Tarakimu 4 za mwisho")} inputMode="numeric" /></div>
              <button className="icon-btn" onClick={() => set("banks", f.banks.filter((_, j) => j !== i))} aria-label={L("Remove", "Ondoa")}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn" onClick={() => set("banks", [...f.banks, { name: "", number: "" }])}><Plus size={18} />{L("Add bank account", "Ongeza akaunti ya benki")}</button>
        </div>
      )}
      {step === 4 && (
        <div className="stack">
          <p className="notice">{L("Asked once to understand how TijaPass helps. Your answers are kept as they are and are not changed later.", "Yanaulizwa mara moja kuelewa jinsi TijaPass inavyosaidia. Majibu yako yanahifadhiwa kama yalivyo.")}</p>
          <Field label={L("Do you have a bank account?", "Una akaunti ya benki?")}><Chips value={f.baseline.bank} onChange={(v) => setB("bank", v)} options={opts("bank")} /></Field>
          <Field label={L("Which mobile money do you use?", "Unatumia pesa ya simu ipi?")}><Chips value={f.baseline.mobile} onChange={(v) => setB("mobile", v)} options={opts("mobile")} /></Field>
          <Field label={L("Have you ever borrowed from a bank, MFI or SACCO?", "Umewahi kukopa benki, taasisi ndogo ya fedha au SACCOS?")}><Chips value={f.baseline.borrowed} onChange={(v) => setB("borrowed", v)} options={opts("borrowed")} /></Field>
          <Field label={L("Where do you usually get credit? (choose all)", "Kwa kawaida unapata mkopo wapi? (chagua zote)")}><Chips multi value={f.baseline.sources} onChange={(v) => setB("sources", v)} options={opts("sources")} /></Field>
          <Field label={L("Will you need finance in the next 6 months?", "Utahitaji mkopo ndani ya miezi 6 ijayo?")}><Chips value={f.baseline.needFinance} onChange={(v) => setB("needFinance", v)} options={[{ value: "no", label: L("No", "Hapana") }, { value: "yes", label: L("Yes", "Ndiyo") }]} /></Field>
          {f.baseline.needFinance === "yes" && (
            <div className="form two">
              <Field label={L("For what?", "Kwa ajili ya nini?")}><Text value={f.baseline.needPurpose} onChange={(v) => setB("needPurpose", v)} /></Field>
              <Field label={L("Rough amount (TZS)", "Kiasi cha makadirio (TZS)")}><AmountInput value={f.baseline.needAmount} onChange={(v) => setB("needAmount", v)} /></Field>
            </div>
          )}
        </div>
      )}
      {step === 5 && (
        <div className="form">
          <Field label={L("Main phone", "Simu kuu")}><PhoneCode phone={normPhone(main.phone)} done={f.phoneOk} onDone={() => set("phoneOk", true)} /></Field>
          {f.owners.slice(1).map((o, i) => (
            <Field key={o.id} label={`${L("Co-owner", "Mmiliki mwenza")}: ${o.name}`} hint={L("Can also be confirmed later from Profile", "Inaweza pia kuthibitishwa baadaye kwenye Wasifu")}>
              <PhoneCode phone={normPhone(o.phone)} done={o.confirmed} label={L("Owner confirmed", "Mmiliki amethibitisha")} onDone={() => setOwner(i + 1, { ...o, confirmed: true })} />
            </Field>
          ))}
          <div className="form two">
            <Field label={L("Choose a 4-digit PIN *", "Chagua PIN ya tarakimu 4 *")} hint={pinIssue && f.pin.length === 4 ? <span className="amber">{tl(pinIssue)}</span> : L("Not the same digit 4 times, a straight run up or down (1234, 7654), your birth year or the end of your phone number", "Si tarakimu moja mara 4, mfululizo wa kupanda au kushuka (1234, 7654), mwaka wa kuzaliwa au mwisho wa namba ya simu")}><input className="input" type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label={L("Repeat the PIN *", "Rudia PIN *")} hint={f.pin2.length === 4 && f.pin2 !== f.pin ? <span className="amber">{L("The two PINs are not the same.", "PIN mbili hazifanani.")}</span> : null}><input className="input" type="password" inputMode="numeric" maxLength={4} value={f.pin2} onChange={(e) => set("pin2", e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
          <p className="tiny muted">{L("Only you choose your PIN. A TijaPass officer never needs it. Test version: use a made-up PIN, never a real one.", "Wewe pekee unachagua PIN yako. Afisa wa TijaPass hahitaji kamwe. Toleo la majaribio: tumia PIN ya kubuni, si halisi.")}</p>
          <div className="notice">
            <b>{L("Consent", "Ridhaa")}</b>
            {L("TijaPass keeps this business's records, statements, credit passport and Records Rating, and its officer visits with photos and location. Lenders see them only after you give each lender consent, which you can withdraw at any time.", "TijaPass inahifadhi kumbukumbu, taarifa za fedha, pasipoti ya mkopo na Kiwango cha Kumbukumbu cha biashara hii, na ziara za afisa kwa picha na mahali. Wakopeshaji wanaziona tu baada ya wewe kumpa kila mmoja ridhaa, unayoweza kuiondoa wakati wowote.")}
          </div>
          <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />{L("I agree", "Nakubali")}</label>
        </div>
      )}
      {!ok && errors[step][1] && <p className="small amber mt" role="alert">{errors[step][1]}</p>}
      <div className="between mt2">
        <button className="btn" onClick={() => setStep(step - 1)} disabled={step === 0}>{L("Back", "Rudi")}</button>
        {step < titles.length - 1 ? <button className="btn primary" disabled={!ok} onClick={() => setStep(step + 1)}>{L("Next", "Endelea")}</button> : <button className="btn primary" disabled={!ok} onClick={finish}>{L("Register business", "Sajili biashara")}</button>}
      </div>
    </Card>
  );
}

// Opening balance sheet in plain words (ONB-07). Equity is calculated, never typed.
export const OPENING_FIELDS = [
  ["inventory", "Stock (value of goods for sale)", "Bidhaa za kuuza (thamani)"],
  ["receivables", "Money customers owe you", "Pesa wateja wanazokudai"],
  ["equipment", "Equipment and other business assets", "Vifaa na mali nyingine za biashara"],
  ["groupSavings", "Savings in mchezo, upatu or VICOBA", "Akiba kwenye mchezo, upatu au VICOBA"],
  ["payables", "Money you owe suppliers", "Pesa unazodaiwa na wasambazaji"],
  ["loansShort", "Loans due within 12 months", "Mikopo ya kulipa ndani ya miezi 12"],
  ["loansLong", "Longer loans", "Mikopo ya muda mrefu"],
  ["groupLoans", "Group loans (VICOBA)", "Mikopo ya kikundi (VICOBA)"]
];

export function OpeningForm({ business, mode = "business", onSaved }) {
  const { user } = useStore();
  const act = useAction();
  const [v, setV] = useState(() => structuredClone(business.opening?.values || { channels: {} }));
  const setCh = (id, n) => setV((x) => ({ ...x, channels: { ...x.channels, [id]: n } }));
  const preview = { ...business, opening: { values: v } };
  const lines = openingLines(preview);
  const assets = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.dr);
  const liabs = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.cr);
  const save = (submit) => act((d) => saveOpening(d, user, business.id, v, submit), submit ? L("Sent to Data Admin for approval", "Imetumwa kwa Msimamizi wa Data kuidhinishwa") : L("Saved", "Imehifadhiwa")) && onSaved?.();
  return (
    <div className="stack">
      <p className="muted">{L("What the business had and owed on its first day with TijaPass. After Data Admin approves, these figures are locked.", "Biashara ilikuwa na nini na ilidaiwa nini siku yake ya kwanza na TijaPass. Baada ya Msimamizi wa Data kuidhinisha, takwimu hizi zinafungwa.")}</p>
      <div className="form two">
        {business.channels.map((c) => (
          <Field key={c.id} label={c.type === "cash" ? L("Cash in hand", "Pesa taslimu mkononi") : `${c.name} ${L("balance", "salio")}`}><AmountInput value={v.channels?.[c.id] ?? ""} onChange={(n) => setCh(c.id, n)} /></Field>
        ))}
        {OPENING_FIELDS.map(([k, en, sw]) => (
          <Field key={k} label={getLang() === "sw" ? sw : en}><AmountInput value={v[k] ?? ""} onChange={(n) => setV((x) => ({ ...x, [k]: n }))} /></Field>
        ))}
      </div>
      <div className="kv card" style={{ boxShadow: "none" }}>
        <span>{L("Everything the business has", "Vyote biashara inavyomiliki")}</span><Money v={assets} />
        <span>{L("Everything the business owes", "Vyote biashara inavyodaiwa")}</span><Money v={liabs} />
        <span>{L("Owner's starting stake (calculated)", "Mtaji wa mmiliki wa kuanzia (umekokotolewa)")}</span><Money v={assets - liabs} />
      </div>
      {mode !== "admin" && (
        <div className="row">
          <button className="btn" onClick={() => save(false)}>{L("Save draft", "Hifadhi rasimu")}</button>
          <button className="btn primary" onClick={() => save(true)}>{L("Send for approval", "Tuma kwa idhini")}</button>
        </div>
      )}
      {mode === "admin" && <OpeningAdminSave business={business} values={v} onSaved={onSaved} />}
    </div>
  );
}

function OpeningAdminSave({ business, values, onSaved }) {
  const { user } = useStore();
  const act = useAction();
  const [reason, setReason] = useState("");
  return (
    <div className="form">
      <Field label={L("Reason for the change (required)", "Sababu ya mabadiliko (lazima)")}><Text value={reason} onChange={setReason} /></Field>
      <button className="btn primary" disabled={reason.trim().length < 5} onClick={() => act((d) => adminEditOpening(d, user, business.id, values, reason.trim()), L("Opening balances changed", "Salio la kuanzia limebadilishwa")) && onSaved?.()}>{L("Save change", "Hifadhi mabadiliko")}</button>
    </div>
  );
}
