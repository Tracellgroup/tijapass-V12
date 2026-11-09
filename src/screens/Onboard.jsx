// Business registration (ONB-01 to ONB-07, ONB-10), revised 29 Oct 2026: only the business itself registers
// (no officer or admin can create a business). Order: business, owners, management, money, questions,
// then the code to the main phone and a 4-digit PIN.
import { MapPin, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { openingLinesFor } from "../core/accounting.js";
import { ADULT_AGE, EDUCATION, LEGAL_FORMS, MAX_MONTHS_OPERATING, NAME_MAX, OWNER_ROLES, TZ_BANKS, ageOn, dobBounds, nidaDob, normNida, normPhone, pinProblem, profileProblems, syncProfile, typeNida, validName, validNida, validPhone } from "../core/people.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../core/seed.js";
import { sum, today, uid } from "../core/util.js";
import { adminEditOpening, createBusiness, ownOpeningChannels, saveOpening } from "../lib/actions.js";
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

// A bank from the list of Tanzanian banks, or "Other" with the name typed (REG-12).
export function BankName({ value, onChange }) {
  const listed = TZ_BANKS.includes(value);
  const [other, setOther] = useState(Boolean(value) && !listed);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Select value={other ? "__other" : value} onChange={(v) => { if (v === "__other") { setOther(true); onChange(""); } else { setOther(false); onChange(v); } }} placeholder={L("Choose the bank", "Chagua benki")} options={[...TZ_BANKS.map((x) => ({ value: x, label: x })), { value: "__other", label: L("Other bank", "Benki nyingine") }]} />
      {other && <Text value={value} maxLength={40} onChange={onChange} placeholder={L("Bank name", "Jina la benki")} />}
    </div>
  );
}

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
        <Field label={L("Full name * (at least two names)", "Jina kamili * (angalau majina mawili)")}><Text value={owner.name} onChange={(v) => set("name", v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ""))} maxLength={NAME_MAX} autoComplete="name" /></Field>
        <Field label={L("Phone *", "Simu *")} hint={owner.main ? L("Used to sign in", "Inatumika kuingia") : L("Gets a code to confirm", "Atapata msimbo wa kuthibitisha")}><Text maxLength={16} value={owner.phone} onChange={(v) => set("phone", v)} inputMode="tel" placeholder="0712 345 678" /></Field>
        <Field label={L("Date of birth * (year, month, day)", "Tarehe ya kuzaliwa * (mwaka, mwezi, siku)")} hint={L("Owners must be 12 or older", "Wamiliki lazima wawe na miaka 12 au zaidi")}><DatePicker name={L("Date of birth", "Tarehe ya kuzaliwa")} value={owner.dob} min={bounds.min} max={bounds.max} onChange={(v) => set("dob", v)} /></Field>
        <Field label={L("Gender *", "Jinsia *")}><Chips value={owner.gender} onChange={(v) => set("gender", v)} options={[{ value: "female", label: L("Female", "Mwanamke") }, { value: "male", label: L("Male", "Mwanaume") }]} /></Field>
        <Field label={L("NIDA number (20 digits)", "Namba ya NIDA (tarakimu 20)")} hint={owner.nida && !validNida(owner.nida) ? L(`${normNida(owner.nida).length} of 20 digits`, `Tarakimu ${normNida(owner.nida).length} kati ya 20`) : validNida(owner.nida) && owner.dob && nidaDob(owner.nida) !== owner.dob ? <span className="amber">{L("Does not match the date of birth: the first 8 digits are the birth date.", "Hailingani na tarehe ya kuzaliwa: tarakimu 8 za kwanza ni tarehe ya kuzaliwa.")}</span> : L("Optional now, needed before a loan", "Si lazima sasa, inahitajika kabla ya mkopo")}>
          {/* Digits only, never more than 20, shown 8-5-5-2; a NIDA fills an empty date of birth (9 Nov, REG-1, REG-2). */}
          <Text value={owner.nida} maxLength={23} onChange={(v) => { const n = typeNida(v); const nd = nidaDob(n); onChange({ ...owner, nida: n, dob: !owner.dob && normNida(n).length === 20 && nd ? nd : owner.dob }); }} inputMode="numeric" placeholder="19940512-11111-00001-21" />
        </Field>
        <Field label={L("Level of education (optional)", "Kiwango cha elimu (si lazima)")}><Select value={owner.education} onChange={(v) => set("education", v)} placeholder={L("Choose", "Chagua")} options={EDUCATION.map((e) => ({ value: e.id, label: tl(e) }))} /></Field>
        <Field label={L("Share of the business (%) *", "Hisa ya biashara (%) *")} hint={L("1 to 100", "1 hadi 100")}><Text value={String(owner.sharePct ?? "")} maxLength={3} onChange={(v) => set("sharePct", Math.min(100, Number(v.replace(/\D/g, "").slice(0, 3)) || 0))} inputMode="numeric" /></Field>
        <Field label={L("Role", "Nafasi")}><Select value={owner.role} onChange={(v) => set("role", v)} options={OWNER_ROLES.map((r) => ({ value: r.id, label: tl(r) }))} /></Field>
        {age != null && age < ADULT_AGE && (
          <>
            <p className="notice warn" style={{ gridColumn: "1 / -1" }}>{L("Under 18: a parent or guardian must be named. Records can be kept, but loans need an owner aged 18 or older.", "Chini ya miaka 18: mzazi au mlezi lazima atajwe. Kumbukumbu zinaweza kuwekwa, lakini mikopo inahitaji mmiliki wa miaka 18 au zaidi.")}</p>
            <Field label={L("Parent or guardian's name *", "Jina la mzazi au mlezi *")}><Text value={owner.guardianName} maxLength={NAME_MAX} onChange={(v) => set("guardianName", v)} /></Field>
            <Field label={L("Parent or guardian's phone * (their own)", "Simu ya mzazi au mlezi * (yake mwenyewe)")}><Text value={owner.guardianPhone} maxLength={16} onChange={(v) => set("guardianPhone", v)} inputMode="tel" /></Field>
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
  // Owners are checked together with the details that depend on them: ownership type, months operating, email.
  const profileDraft = syncProfile({ businessName: f.businessName || "Draft", owners: f.owners, legalForm: f.legalForm, registrationNo: f.registrationNo, monthsOperating: Number(f.monthsOperating) || 0, email: f.email, phone2: f.phone2 });
  const ownerProblems = profileProblems(profileDraft, t).filter((x) => !/business name/i.test(x.en));
  const num = (v) => Number(v || 0);
  const step0Problem = !f.businessName.trim() || !f.businessType || !f.sector || !f.region || !f.closingTime || f.address.trim().length < 5 || !fields.filter((x) => x.required).every((x) => f.custom[x.id])
    ? L("Fill in business name, type, sector, region, closing time and the address or a landmark.", "Jaza jina la biashara, aina, sekta, mkoa, muda wa kufunga na anwani au alama ya eneo.")
    : f.legalForm === "company" && f.registrationNo.trim().length < 3 ? L("A registered company needs its BRELA number.", "Kampuni iliyosajiliwa inahitaji namba yake ya BRELA.")
      : num(f.staffWomen) > num(f.staffTotal) || num(f.staffPaid) > num(f.staffTotal) ? L("Women staff and paid staff cannot be more than the total staff.", "Wafanyakazi wanawake au wanaolipwa hawawezi kuzidi wafanyakazi wote.")
        : num(f.monthsOperating) > MAX_MONTHS_OPERATING ? L(`Months operating can be at most ${MAX_MONTHS_OPERATING}.`, `Miezi ya biashara isizidi ${MAX_MONTHS_OPERATING}.`) : null;
  // Money accounts (REG-11, REG-12): wallet numbers are phone numbers; a repeated provider needs its own number.
  const providerCount = f.wallets.reduce((m, w) => ({ ...m, [w.provider]: (m[w.provider] || 0) + 1 }), {});
  const walletProblem = f.wallets.some((w) => w.number && !validPhone(w.number)) ? L("A wallet number must be a phone number, e.g. 0712 345 678.", "Namba ya pochi lazima iwe namba ya simu, k.m. 0712 345 678.")
    : f.wallets.some((w) => providerCount[w.provider] > 1 && !w.number) ? L("A provider listed more than once needs each wallet's number.", "Mtoa huduma aliyeorodheshwa zaidi ya mara moja anahitaji namba ya kila pochi.")
      : new Set(f.wallets.filter((w) => w.number).map((w) => `${w.provider}|${normPhone(w.number)}`)).size !== f.wallets.filter((w) => w.number).length ? L("The same wallet is listed twice.", "Pochi moja imeorodheshwa mara mbili.")
        : f.banks.some((b) => !b.name.trim()) ? L("Choose each bank.", "Chagua kila benki.")
          : f.banks.some((b) => b.number && !/^\d{4}$/.test(b.number)) ? L("Give exactly the last 4 digits of each bank account.", "Andika tarakimu 4 za mwisho za kila akaunti ya benki.") : null;
  // The joining questions must agree with the accounts listed (REG-10).
  const bl = f.baseline;
  const baselineProblem = bl.bank === "none" && f.banks.length ? L("You listed a bank account, so choose a \"Yes\" answer for the bank.", "Umeorodhesha akaunti ya benki, chagua jibu la \"Ndiyo\".")
    : bl.mobile === "none" && f.wallets.length ? L("You listed mobile money, so \"None\" cannot be the answer.", "Umeorodhesha pesa ya simu, hivyo \"Sina\" haiwezi kuwa jibu.")
      : bl.sources.includes("none") && bl.sources.length > 1 ? L("\"None\" cannot be chosen with other sources.", "\"Hakuna\" haiwezi kuchaguliwa pamoja na vyanzo vingine.")
        : bl.borrowed === "never" && bl.sources.includes("formal") ? L("You said you never borrowed from a bank, MFI or SACCO.", "Umesema hujawahi kukopa benki, taasisi au SACCOS.") : null;
  const [busy, setBusy] = useState(false);
  const pinIssue = f.pin ? pinProblem(f.pin, { dob: main.dob, phones: f.owners.map((o) => o.phone) }) : null;
  const errors = [
    [!step0Problem, step0Problem],
    [!ownerProblems.length && !phoneTaken, phoneTaken ? L("The main owner's phone is already registered.", "Simu ya mmiliki mkuu tayari imesajiliwa.") : tl(ownerProblems[0] || { en: "", sw: "" })],
    [f.management.managedBy === "owner" || (f.management.managers.length && f.management.managers.every((m) => validName(m.name) && validPhone(m.phone) && !f.owners.some((o) => normPhone(o.phone) === normPhone(m.phone)))), L("Add each manager's full name (two names) and their own phone, not an owner's.", "Ongeza jina kamili la kila meneja (majina mawili) na simu yake, si ya mmiliki.")],
    [f.wallets.every((w) => w.provider) && !walletProblem, walletProblem],
    [bl.bank && bl.mobile && bl.borrowed && bl.sources.length && bl.needFinance && (bl.needFinance === "no" || bl.needAmount) && !baselineProblem, baselineProblem || L("Answer every question.", "Jibu kila swali.")],
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
    if (busy) return; // one tap registers once
    setBusy(true);
    const id = uid("B");
    const userId = uid("U");
    const channels = [
      { id: uid("C"), type: "cash", name: L("Cash in hand", "Pesa taslimu") },
      ...f.wallets.map((w) => ({ id: uid("C"), type: "mobile", name: providerCount[w.provider] > 1 ? `${w.provider} ${normPhone(w.number).slice(-4)}` : w.provider, number: w.number ? normPhone(w.number) : "" })),
      ...f.banks.map((b) => ({ id: uid("C"), type: "bank", name: b.name.trim(), number: b.number }))
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
    else setBusy(false);
  };
  // Moving to the questions: answers that follow from the accounts listed are filled in (REG-10).
  const toStep = (n) => {
    if (n === 4) setF((x) => ({ ...x, baseline: { ...x.baseline, bank: x.baseline.bank || (x.banks.length ? "used" : ""), mobile: x.baseline.mobile || (x.wallets.length ? "personal" : "") } }));
    setStep(n);
  };

  const titles = [L("Business", "Biashara"), L("Owners", "Wamiliki"), L("Management", "Uendeshaji"), L("Money accounts", "Njia za pesa"), L("A few questions", "Maswali machache"), L("Phone code, PIN and consent", "Msimbo wa simu, PIN na ridhaa")];
  const mgr = f.management;
  return (
    <Card title={`${step + 1}. ${titles[step]}`}>
      <Steps count={titles.length} at={step} />
      {step === 0 && (
        <div className="form two">
          <Field label={L("Business name *", "Jina la biashara *")}><Text value={f.businessName} maxLength={80} onChange={(v) => set("businessName", v)} /></Field>
          <Field label={L("Ownership *", "Umiliki *")}><Select value={f.legalForm} onChange={(v) => set("legalForm", v)} options={LEGAL_FORMS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Business type *", "Aina ya biashara *")}><Select value={f.businessType} onChange={(v) => set("businessType", v)} placeholder={L("Choose", "Chagua")} options={BUSINESS_TYPES.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Sector *", "Sekta *")}><Select value={f.sector} onChange={(v) => set("sector", v)} placeholder={L("Choose", "Chagua")} options={SECTORS.map((x) => ({ value: x.id, label: tl(x) }))} /></Field>
          <Field label={L("Region *", "Mkoa *")}><Select value={f.region} onChange={(v) => set("region", v)} placeholder={L("Choose", "Chagua")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
          <Field label={f.legalForm === "company" ? L("BRELA registration number *", "Namba ya usajili wa BRELA *") : L("Licence, BRELA or TIN number (optional)", "Namba ya leseni, BRELA au TIN (si lazima)")}><Text value={f.registrationNo} maxLength={40} onChange={(v) => set("registrationNo", v)} /></Field>
          <Field label={L("Months operating", "Miezi ya biashara")} hint={L("0 to 600 (50 years)", "0 hadi 600 (miaka 50)")}><Text value={f.monthsOperating} onChange={(v) => set("monthsOperating", v.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" /></Field>
          <Field label={L("Usual closing time *", "Muda wa kawaida wa kufunga *")} hint={L("The daily close prompt comes at this time", "Ukumbusho wa kufunga siku unakuja muda huu")}><input type="time" className="input" value={f.closingTime} onChange={(e) => set("closingTime", e.target.value)} /></Field>
          <Field label={L("Staff in total", "Wafanyakazi wote")}><Text value={f.staffTotal} onChange={(v) => set("staffTotal", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
          <div className="form two">
            <Field label={L("Of whom women", "Kati yao wanawake")}><Text value={f.staffWomen} onChange={(v) => set("staffWomen", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
            <Field label={L("Of whom paid", "Kati yao wanaolipwa")}><Text value={f.staffPaid} onChange={(v) => set("staffPaid", v.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
          </div>
          <Field label={L("Written address or landmark *", "Anwani au alama ya eneo *")} hint={L("e.g. Kariakoo market, stall 12", "k.m. Soko la Kariakoo, meza 12")}><Text value={f.address} maxLength={120} onChange={(v) => set("address", v)} /></Field>
          <div className="field">
            <span>{L("Location (GPS)", "Mahali (GPS)")}</span>
            <button type="button" className="btn" onClick={captureGps} disabled={gpsBusy}><MapPin size={18} />{gpsBusy ? L("Finding location…", "Inatafuta mahali…") : f.gps ? L("Update location", "Sasisha mahali") : L("Capture location", "Chukua mahali")}</button>
            <small>{f.gps ? `${f.gps.lat.toFixed(5)}, ${f.gps.lng.toFixed(5)} (±${f.gps.accuracy} m)` : L("Allow location when the phone asks.", "Ruhusu mahali simu inapouliza.")}</small>
          </div>
          {fields.map((x) => (
            <Field key={x.id} label={`${tl(x.label)}${x.required ? " *" : ""}`}>
              {x.type === "select"
                ? <Select value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: v })} placeholder={L("Choose", "Chagua")} options={(x.options || []).map((o) => ({ value: o, label: o }))} />
                : <Text value={f.custom[x.id]} onChange={(v) => set("custom", { ...f.custom, [x.id]: x.type === "number" ? v.replace(/\D/g, "") : v })} inputMode={x.type === "number" ? "numeric" : undefined} />}
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
            <Field label={L("Second phone for the business (optional)", "Simu ya pili ya biashara (si lazima)")}><Text value={f.phone2} maxLength={16} onChange={(v) => set("phone2", v)} inputMode="tel" /></Field>
            <Field label={L("Email (optional)", "Barua pepe (si lazima)")}><Text value={f.email} maxLength={80} onChange={(v) => set("email", v.trim())} inputMode="email" /></Field>
            <Field label={L("Main owner's home address (optional)", "Anwani ya nyumbani ya mmiliki mkuu (si lazima)")}><Text value={f.homeAddress} maxLength={120} onChange={(v) => set("homeAddress", v)} /></Field>
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
              <Field label={L("Manager's name *", "Jina la meneja *")}><Text maxLength={NAME_MAX} value={m.name} onChange={(v) => set("management", { ...mgr, managers: mgr.managers.map((x, j) => (j === i ? { ...x, name: v } : x)) })} /></Field>
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
              <div style={{ flex: "1 1 140px" }}><Text value={w.number} maxLength={16} onChange={(v) => set("wallets", f.wallets.map((x, j) => (j === i ? { ...x, number: v } : x)))} placeholder={providerCount[w.provider] > 1 ? L("Wallet number *", "Namba ya pochi *") : L("Number (optional)", "Namba (si lazima)")} inputMode="tel" /></div>
              <button className="icon-btn" onClick={() => set("wallets", f.wallets.filter((_, j) => j !== i))} aria-label={L("Remove", "Ondoa")}><Trash2 size={18} /></button>
            </div>
          ))}
          <button className="btn" onClick={() => set("wallets", [...f.wallets, { provider: "Airtel Money", number: "" }])}><Plus size={18} />{L("Add wallet", "Ongeza pochi")}</button>
          <h3 className="mt">{L("Bank accounts", "Akaunti za benki")}</h3>
          {f.banks.map((b, i) => (
            <div className="row" key={`b${i}`}>
              <div style={{ flex: "1 1 160px" }}><BankName value={b.name} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, name: v } : x)))} /></div>
              <div style={{ flex: "1 1 140px" }}><Text value={b.number} maxLength={4} onChange={(v) => set("banks", f.banks.map((x, j) => (j === i ? { ...x, number: v.replace(/\D/g, "") } : x)))} placeholder={L("Last 4 digits (optional)", "Tarakimu 4 za mwisho (si lazima)")} inputMode="numeric" /></div>
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
        <button className="btn" onClick={() => toStep(step - 1)} disabled={step === 0}>{L("Back", "Rudi")}</button>
        {step < titles.length - 1 ? <button className="btn primary" disabled={!ok} onClick={() => toStep(step + 1)}>{L("Next", "Endelea")}</button> : <button className="btn primary" disabled={!ok || busy} onClick={finish}>{L("Register business", "Sajili biashara")}</button>}
      </div>
    </Card>
  );
}

// Opening balance sheet in plain words (ONB-07). Equity is calculated, never typed.
// Every amount says TZS (9 Nov, OPN-1): what the business has, then what it owes.
export const OPENING_FIELDS = [
  ["inventory", "Stock: value of goods for sale (TZS)", "Bidhaa za kuuza: thamani (TZS)"],
  ["receivables", "Money customers owe you (TZS)", "Pesa wateja wanazokudai (TZS)"],
  ["equipment", "Equipment and other business assets: value (TZS)", "Vifaa na mali nyingine za biashara: thamani (TZS)"],
  ["groupSavings", "Savings in mchezo, upatu or VICOBA (TZS)", "Akiba kwenye mchezo, upatu au VICOBA (TZS)"],
  ["payables", "Money you owe suppliers (TZS)", "Pesa unazodaiwa na wasambazaji (TZS)"],
  ["loansShort", "Loans due within 12 months (TZS)", "Mikopo ya kulipa ndani ya miezi 12 (TZS)"],
  ["loansLong", "Longer loans (TZS)", "Mikopo ya muda mrefu (TZS)"],
  ["groupLoans", "Group loans, e.g. VICOBA (TZS)", "Mikopo ya kikundi, k.m. VICOBA (TZS)"]
];

export function OpeningForm({ business, mode = "business", onSaved }) {
  const { state, user } = useStore();
  const act = useAction();
  const [v, setV] = useState(() => structuredClone(business.opening?.values || { channels: {} }));
  const [busy, setBusy] = useState(false);
  const setCh = (id, n) => setV((x) => ({ ...x, channels: { ...x.channels, [id]: n } }));
  // Accounts added later with their own starting balance are not in this form, so nothing counts twice.
  const own = ownOpeningChannels(state, business.id);
  const chans = business.channels.filter((c) => !c.archived && !own.has(c.id));
  const lines = openingLinesFor(business, v);
  const assets = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.dr);
  const liabs = sum(lines.filter((l) => l.acc !== "openingEquity"), (l) => l.cr);
  const blank = (x) => x === undefined || x === null || x === "";
  const unanswered = chans.filter((c) => blank(v.channels?.[c.id])).length + OPENING_FIELDS.filter(([k]) => blank(v[k])).length;
  const saved = business.opening?.status === "submitted";
  const save = () => {
    if (busy) return;
    setBusy(true);
    const ok = act((d) => saveOpening(d, user, business.id, v, true), saved ? L("Corrected. It counts at once and is still marked not verified.", "Imesahihishwa. Inahesabiwa mara moja na bado haijahakikiwa.") : L("Saved. It counts at once, marked not verified until TijaPass checks it.", "Imehifadhiwa. Inahesabiwa mara moja, haijahakikiwa hadi TijaPass ikague."));
    setBusy(false);
    if (ok) onSaved?.();
  };
  return (
    <div className="stack">
      <p className="muted">{L("What the business had and owed on its first day with TijaPass, in Tanzanian shillings (TZS). Type 0 where you have none. It counts as soon as you save; TijaPass checks it later and then it is locked.", "Biashara ilikuwa na nini na ilidaiwa nini siku yake ya kwanza na TijaPass, kwa shilingi (TZS). Andika 0 pale usipokuwa na kitu. Inahesabiwa ukihifadhi; TijaPass itakagua baadaye kisha inafungwa.")}</p>
      <h3>{L("What the business has", "Biashara ina nini")}</h3>
      <div className="form two">
        {chans.map((c) => (
          <Field key={c.id} label={c.type === "cash" ? L("Cash in hand (TZS)", "Pesa taslimu mkononi (TZS)") : `${c.name}: ${L("balance (TZS)", "salio (TZS)")}`}><AmountInput value={v.channels?.[c.id] ?? ""} onChange={(n) => setCh(c.id, n)} /></Field>
        ))}
        {OPENING_FIELDS.slice(0, 4).map(([k, en, sw]) => (
          <Field key={k} label={getLang() === "sw" ? sw : en}><AmountInput value={v[k] ?? ""} onChange={(n) => setV((x) => ({ ...x, [k]: n }))} /></Field>
        ))}
      </div>
      <h3>{L("What the business owes", "Biashara inadaiwa nini")}</h3>
      <div className="form two">
        {OPENING_FIELDS.slice(4).map(([k, en, sw]) => (
          <Field key={k} label={getLang() === "sw" ? sw : en}><AmountInput value={v[k] ?? ""} onChange={(n) => setV((x) => ({ ...x, [k]: n }))} /></Field>
        ))}
      </div>
      {own.size > 0 && <p className="tiny muted">{L("Accounts added later are not here: their balance was entered when they were added.", "Akaunti zilizoongezwa baadaye hazipo hapa: salio lake liliandikwa zilipoongezwa.")}</p>}
      <div className="kv card" style={{ boxShadow: "none" }}>
        <span>{L("Everything the business has", "Vyote biashara inavyomiliki")}</span><Money v={assets} />
        <span>{L("Everything the business owes", "Vyote biashara inavyodaiwa")}</span><Money v={liabs} />
        <span>{L("Owner's starting stake (calculated)", "Mtaji wa mmiliki wa kuanzia (umekokotolewa)")}</span><Money v={assets - liabs} />
      </div>
      {assets - liabs < 0 && <p className="notice warn">{L("The business owes more than it has. If that is right, save; otherwise check the figures.", "Biashara inadaiwa zaidi ya ilivyo nayo. Kama ni sahihi, hifadhi; vinginevyo hakiki takwimu.")}</p>}
      {mode !== "admin" && (
        <>
          {unanswered > 0 && <p className="small amber">{L(`${unanswered} box(es) still empty: type 0 where you have none.`, `Visanduku ${unanswered} bado viko wazi: andika 0 pale usipokuwa na kitu.`)}</p>}
          <button className="btn primary" disabled={unanswered > 0 || busy} onClick={save}>{saved ? L("Save the corrected figures", "Hifadhi takwimu zilizosahihishwa") : L("Save my starting position", "Hifadhi hali yangu ya kuanzia")}</button>
        </>
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
