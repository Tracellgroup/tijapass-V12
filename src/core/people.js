// People and identity rules (agreed 29 Oct 2026): 4-digit PINs, ages, NIDA format, owners and shares,
// and linking one person's several businesses. Plain JavaScript so the pilot server can run it unchanged.
import { addDays, validISODate, yearsBetween } from "./util.js";

// ---------- PIN ----------
export const PIN_LENGTH = 4;
const SEQUENCES = ["0123456789", "9876543210"];
// Easy PINs refused: all the same digit, straight runs up or down, simple pairs and keypad patterns,
// the owner's birth year and the last 4 digits of their phone.
export function pinProblem(pin, { dob, phones = [] } = {}) {
  const p = String(pin || "");
  if (!/^\d{4}$/.test(p)) return { en: "The PIN must be exactly 4 digits.", sw: "PIN lazima iwe tarakimu 4 hasa." };
  if (/^(\d)\1{3}$/.test(p) || SEQUENCES.some((s) => s.includes(p)) || ["1212", "2121", "1122", "2580", "0852", "1004", "2000", "1010", "6969"].includes(p))
    return { en: "This PIN is too easy to guess. Choose another.", sw: "PIN hii ni rahisi kubahatisha. Chagua nyingine." };
  if (dob && String(dob).slice(0, 4) === p) return { en: "Do not use your birth year as your PIN.", sw: "Usitumie mwaka wako wa kuzaliwa kama PIN." };
  if (phones.some((ph) => String(ph || "").replace(/\D/g, "").endsWith(p))) return { en: "Do not use the end of your phone number as your PIN.", sw: "Usitumie tarakimu za mwisho za simu yako kama PIN." };
  return null;
}

export const PIN_LOCK = { tries: 5, minutes: 15, hardTries: 10 };

// ---------- Age and dates of birth ----------
export const MIN_AGE = 12; // owners must be 12 or older (born 2014 or earlier in 2026)
export const MAX_AGE = 100;
export const ADULT_AGE = 18; // loans need an adult main owner (age of majority; confirm with legal advice)
export const dobBounds = (todayISO) => {
  const [y, m, d] = todayISO.split("-").map(Number);
  const back = (years) => {
    const yy = y - years;
    const dd = m === 2 && d === 29 ? 28 : d; // 29 Feb has no match in most years
    return `${yy}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  };
  return { min: addDays(back(MAX_AGE), 1), max: back(MIN_AGE) };
};
export const ageOn = (dob, todayISO) => (dob ? yearsBetween(dob, todayISO) : null);
export function dobProblem(dob, todayISO) {
  if (!dob || !validISODate(dob)) return { en: "Choose the year, month and day of birth.", sw: "Chagua mwaka, mwezi na siku ya kuzaliwa." };
  const { min, max } = dobBounds(todayISO);
  if (dob > todayISO) return { en: "A date of birth cannot be in the future.", sw: "Tarehe ya kuzaliwa haiwezi kuwa ya baadaye." };
  if (dob > max) return { en: `Owners must be at least ${MIN_AGE} years old.`, sw: `Wamiliki lazima wawe na umri wa miaka ${MIN_AGE} au zaidi.` };
  if (dob < min) return { en: "Check the year of birth.", sw: "Hakiki mwaka wa kuzaliwa." };
  return null;
}

// ---------- NIDA ----------
// Tanzania's National ID number has 20 digits, often written 19940512-11111-00001-21.
export const normNida = (n) => String(n || "").replace(/\D/g, "");
export const validNida = (n) => normNida(n).length === 20;
export const fmtNida = (n) => {
  const s = normNida(n);
  return s.length === 20 ? `${s.slice(0, 8)}-${s.slice(8, 13)}-${s.slice(13, 18)}-${s.slice(18)}` : String(n || "");
};
// While typing (9 Nov, REG-2): digits only, never more than 20, shown as 8-5-5-2.
export const typeNida = (v) => {
  const s = normNida(v).slice(0, 20);
  return [s.slice(0, 8), s.slice(8, 13), s.slice(13, 18), s.slice(18)].filter(Boolean).join("-");
};
// The NIDA number starts with the holder's birth date, YYYYMMDD (decided 9 Nov, D4: a mismatch is refused).
export const nidaDob = (n) => {
  const s = normNida(n);
  if (s.length < 8) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return validISODate(iso) ? iso : null;
};

// ---------- Names, email (9 Nov, REG-7, REG-8) ----------
export const NAME_MAX = 60;
export function nameProblem(name) {
  const v = String(name || "").trim().replace(/\s+/g, " ");
  if (v.length < 3 || v.length > NAME_MAX) return "length";
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(v)) return "chars";
  if (v.split(" ").filter((w) => w.replace(/['-]/g, "").length >= 2).length < 2) return "words";
  return null;
}
export const validName = (n) => !nameProblem(n);
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(e || "").trim());
export const sameName = (a, b) => {
  const w = (x) => String(x || "").toLowerCase().replace(/[^a-zà-ÿ ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  return w(a) === w(b);
};

// ---------- Phones ----------
export const validPhone = (p) => /^(\+?255|0)[67]\d{8}$/.test(String(p || "").replace(/\s/g, ""));
export const normPhone = (p) => {
  const s = String(p || "").replace(/\s/g, "");
  return s.startsWith("0") ? `+255${s.slice(1)}` : s.startsWith("255") ? `+${s}` : s;
};

// ---------- Business structure ----------
// Tanzanian banks offered when adding a bank account (REG-12); "Other" lets the name be typed.
export const TZ_BANKS = ["CRDB Bank", "NMB Bank", "NBC Bank", "Stanbic Bank", "Absa Bank", "Equity Bank", "Exim Bank", "DTB Bank", "KCB Bank", "Azania Bank", "Amana Bank", "Bank of Africa", "I&M Bank", "Akiba Commercial Bank", "Mwanga Hakika Bank", "TCB Bank", "Access Bank", "Selcom Microfinance Bank", "Mkombozi Bank", "Maendeleo Bank"];
export const MAX_MONTHS_OPERATING = 600;

export const LEGAL_FORMS = [
  { id: "sole", en: "One owner (sole trader)", sw: "Mmiliki mmoja" },
  { id: "partnership", en: "Partners or family business", sw: "Ubia au biashara ya familia" },
  { id: "company", en: "Registered company", sw: "Kampuni iliyosajiliwa" },
  { id: "group", en: "Group or cooperative", sw: "Kikundi au ushirika" }
];

export const EDUCATION = [
  { id: "none", en: "No formal schooling", sw: "Sikusoma shule" },
  { id: "primary", en: "Primary", sw: "Msingi" },
  { id: "secondary", en: "Secondary (O-level)", sw: "Sekondari (kidato cha 4)" },
  { id: "alevel", en: "A-level", sw: "Kidato cha 6" },
  { id: "diploma", en: "Certificate or diploma", sw: "Cheti au stashahada" },
  { id: "degree", en: "Degree or higher", sw: "Shahada au zaidi" },
  { id: "na", en: "Prefer not to say", sw: "Sipendi kusema" }
];

export const OWNER_ROLES = [
  { id: "owner", en: "Owner", sw: "Mmiliki" },
  { id: "partner", en: "Partner", sw: "Mbia" },
  { id: "director", en: "Director", sw: "Mkurugenzi" },
  { id: "member", en: "Group member", sw: "Mwanachama" }
];

// Older records (and the October test data) have one owner in flat fields; turn them into an owners list.
export function ownersOf(profile) {
  if (Array.isArray(profile?.owners) && profile.owners.length) return profile.owners;
  if (!profile) return [];
  return [{
    id: "O1", name: profile.ownerName || "", phone: profile.phone || "", dob: profile.dob || "", gender: profile.gender || "", nida: profile.nida || "",
    education: profile.education || "", sharePct: 100, role: "owner", main: true, confirmed: true, photoId: profile.photoId || null, idPhotoId: profile.idPhotoId || null
  }];
}
export const mainOwner = (profile) => ownersOf(profile).find((o) => o.main) || ownersOf(profile)[0] || null;

// Keeps the flat fields used by reports and older screens in step with the main owner.
export function syncProfile(profile) {
  const owners = ownersOf(profile).map((o, i) => ({ ...o, id: o.id || `O${i + 1}` }));
  if (!owners.some((o) => o.main) && owners[0]) owners[0].main = true;
  const m = owners.find((o) => o.main);
  return {
    ...profile, owners,
    ownerName: m?.name || profile.ownerName || "", dob: m?.dob || "", gender: m?.gender || "", nida: m?.nida || "", phone: m?.phone || profile.phone || "",
    education: m?.education || "", photoId: m?.photoId ?? profile.photoId ?? null, idPhotoId: m?.idPhotoId ?? profile.idPhotoId ?? null
  };
}

// Women-owned = women hold 51% or more of the shares (BOT reporting; single owners follow their own gender).
export const womenShare = (profile) => ownersOf(profile).filter((o) => o.gender === "female").reduce((t, o) => t + (Number(o.sharePct) || 0), 0);
export const ownershipGender = (profile) => (womenShare(profile) >= 51 ? "female" : ownersOf(profile).length ? "male" : "");

// Everything wrong with a business profile (used at registration and on every approved change).
export function profileProblems(profile, todayISO) {
  const out = [];
  const add = (en, sw) => out.push({ en, sw });
  if (String(profile.businessName || "").trim().length < 2) add("Enter the business name.", "Andika jina la biashara.");
  if (String(profile.businessName || "").length > 80) add("The business name is too long (80 characters at most).", "Jina la biashara ni refu mno (herufi 80 zaidi).");
  const owners = ownersOf(profile);
  if (!owners.length) add("Add at least one owner.", "Ongeza angalau mmiliki mmoja.");
  // Ownership type must fit the owners (REG-6).
  const form = profile.legalForm;
  if (form === "sole" && owners.length !== 1) add("\"One owner\" means exactly one owner. Choose partners, company or group for more.", "\"Mmiliki mmoja\" ni mmiliki mmoja tu. Chagua ubia, kampuni au kikundi kwa zaidi.");
  if ((form === "partnership" || form === "group") && owners.length < 2) add("Partners, family businesses and groups need at least two owners.", "Ubia, biashara ya familia na vikundi vinahitaji wamiliki angalau wawili.");
  if (form === "company" && String(profile.registrationNo || "").trim().length < 3) add("A registered company needs its BRELA registration number.", "Kampuni iliyosajiliwa inahitaji namba yake ya BRELA.");
  if (profile.email && !validEmail(profile.email)) add("Check the email address, e.g. name@example.com.", "Hakiki barua pepe, k.m. jina@mfano.com.");
  if (profile.phone2 && !validPhone(profile.phone2)) add("Check the second phone number.", "Hakiki namba ya simu ya pili.");
  // Staff counts (REG-9) and months operating (REG-13).
  const staff = Number(profile.staffTotal || 0);
  if (Number(profile.staffWomen || 0) > staff || Number(profile.staffPaid || 0) > staff) add("Women staff and paid staff cannot be more than the total staff.", "Wafanyakazi wanawake au wanaolipwa hawawezi kuzidi wafanyakazi wote.");
  const months = Number(profile.monthsOperating || 0);
  if (months < 0 || months > MAX_MONTHS_OPERATING) add(`Months operating must be from 0 to ${MAX_MONTHS_OPERATING}.`, `Miezi ya biashara iwe kati ya 0 na ${MAX_MONTHS_OPERATING}.`);
  const m0 = owners.find((o) => o.main) || owners[0];
  const age0 = ageOn(m0?.dob, todayISO);
  if (age0 != null && months > Math.max(0, (age0 - MIN_AGE) * 12 + 12)) add("Months operating is more than the main owner's age allows.", "Miezi ya biashara ni mingi kuliko umri wa mmiliki mkuu unavyoruhusu.");
  // Managers (REG-16): a real name and their own phone.
  const mg = profile.management;
  if (mg && mg.managedBy && mg.managedBy !== "owner") {
    if (!(mg.managers || []).length) add("Add each manager's name and phone.", "Ongeza jina na simu ya kila meneja.");
    for (const x of mg.managers || []) {
      if (!validName(x.name)) add("Enter each manager's full name (at least two names).", "Andika jina kamili la kila meneja (angalau majina mawili).");
      if (!validPhone(x.phone)) add("Enter a valid phone number for each manager.", "Andika namba sahihi ya simu ya kila meneja.");
      else if (owners.some((o) => normPhone(o.phone) === normPhone(x.phone))) add("A manager needs their own phone number, not an owner's.", "Meneja anahitaji namba yake, si ya mmiliki.");
    }
  }
  const total = owners.reduce((t, o) => t + (Number(o.sharePct) || 0), 0);
  if (owners.length && Math.round(total) !== 100) add(`Owners' shares must add up to 100% (now ${total}%).`, `Hisa za wamiliki lazima zijumlishe 100% (sasa ${total}%).`);
  const phones = new Set();
  const nidas = new Set();
  owners.forEach((o, i) => {
    const who = owners.length > 1 ? ` (${o.name || `owner ${i + 1}`})` : "";
    const np = nameProblem(o.name);
    if (np === "chars") add(`Names use letters only (apostrophe and hyphen allowed)${who}.`, `Majina yatumie herufi tu (' na - vinaruhusiwa)${who}.`);
    else if (np) add(`Enter each owner's full name, at least two names${who}.`, `Andika jina kamili la kila mmiliki, angalau majina mawili${who}.`);
    const share = Number(o.sharePct);
    if (!Number.isInteger(share) || share < 1 || share > 100) add(`Each owner's share must be a whole number from 1% to 100%${who}.`, `Hisa ya kila mmiliki iwe namba kamili kati ya 1% na 100%${who}.`);
    if (!validPhone(o.phone)) add(`Enter a valid phone number${who}, e.g. 0712 345 678.`, `Andika namba sahihi ya simu${who}, k.m. 0712 345 678.`);
    else if (phones.has(normPhone(o.phone))) add("Each owner needs their own phone number.", "Kila mmiliki anahitaji namba yake ya simu.");
    else phones.add(normPhone(o.phone));
    const dp = dobProblem(o.dob, todayISO);
    if (dp) out.push({ en: dp.en + who, sw: dp.sw + who });
    if (!o.gender) add(`Choose gender${who}.`, `Chagua jinsia${who}.`);
    if (o.nida && (!validNida(o.nida) || /[^\d-]/.test(String(o.nida)))) add(`A NIDA number has exactly 20 digits${who}.`, `Namba ya NIDA ina tarakimu 20 hasa${who}.`);
    if (o.nida && validNida(o.nida)) {
      const nd = nidaDob(o.nida);
      if (!nd) add(`Check the NIDA number: its first 8 digits should be the birth date${who}.`, `Hakiki namba ya NIDA: tarakimu 8 za kwanza ni tarehe ya kuzaliwa${who}.`);
      else if (o.dob && nd !== o.dob) add(`The NIDA number does not match the date of birth${who}.`, `Namba ya NIDA hailingani na tarehe ya kuzaliwa${who}.`);
      if (nidas.has(normNida(o.nida))) add("Two owners cannot share one NIDA number.", "Wamiliki wawili hawawezi kutumia NIDA moja.");
      nidas.add(normNida(o.nida));
    }
    const age = ageOn(o.dob, todayISO);
    if (age != null && age < ADULT_AGE && (!String(o.guardianName || "").trim() || !validPhone(o.guardianPhone)))
      add(`Owners under 18 need a parent or guardian's name and phone${who}.`, `Wamiliki chini ya miaka 18 wanahitaji jina na simu ya mzazi au mlezi${who}.`);
    if (age != null && age < ADULT_AGE && validPhone(o.guardianPhone) && validPhone(o.phone) && normPhone(o.guardianPhone) === normPhone(o.phone))
      add(`The parent or guardian needs their own phone, not the owner's${who}.`, `Mzazi au mlezi anahitaji simu yake, si ya mmiliki${who}.`);
  });
  return out;
}

// One person, several businesses: linked by NIDA (or by phone where no NIDA is given yet).
export function personKeys(profile) {
  return ownersOf(profile).map((o) => (validNida(o.nida) ? `N:${normNida(o.nida)}` : null)).filter(Boolean);
}
export function linkedBusinesses(state, business) {
  const mine = new Set(personKeys(business.profile));
  if (!mine.size) return [];
  return state.businesses.filter((b) => b.id !== business.id && b.status !== "archived" && personKeys(b.profile).some((k) => mine.has(k)));
}

// One NIDA number belongs to one person (REG-3): the same NIDA on another business must have the same name,
// date of birth and gender, or registration is refused as an identity conflict.
export function nidaConflicts(state, profile, excludeBusinessId = null) {
  const out = [];
  for (const o of ownersOf(profile)) {
    if (!validNida(o.nida)) continue;
    const key = normNida(o.nida);
    for (const b of state.businesses || []) {
      if (b.id === excludeBusinessId || b.status === "archived") continue;
      for (const x of ownersOf(b.profile)) {
        if (normNida(x.nida) !== key) continue;
        if (!sameName(x.name, o.name) || (x.dob && o.dob && x.dob !== o.dob) || (x.gender && o.gender && x.gender !== o.gender)) out.push({ owner: o.name, nida: key, businessId: b.id });
      }
    }
  }
  return out;
}

export const isAdultMain = (profile, todayISO) => {
  const m = mainOwner(profile);
  const a = ageOn(m?.dob, todayISO);
  return a != null && a >= ADULT_AGE;
};
