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

// ---------- Phones ----------
export const validPhone = (p) => /^(\+?255|0)[67]\d{8}$/.test(String(p || "").replace(/\s/g, ""));
export const normPhone = (p) => {
  const s = String(p || "").replace(/\s/g, "");
  return s.startsWith("0") ? `+255${s.slice(1)}` : s.startsWith("255") ? `+${s}` : s;
};

// ---------- Business structure ----------
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
  if (!String(profile.businessName || "").trim()) add("Enter the business name.", "Andika jina la biashara.");
  const owners = ownersOf(profile);
  if (!owners.length) add("Add at least one owner.", "Ongeza angalau mmiliki mmoja.");
  const total = owners.reduce((t, o) => t + (Number(o.sharePct) || 0), 0);
  if (owners.length && Math.round(total) !== 100) add(`Owners' shares must add up to 100% (now ${total}%).`, `Hisa za wamiliki lazima zijumlishe 100% (sasa ${total}%).`);
  const phones = new Set();
  const nidas = new Set();
  owners.forEach((o, i) => {
    const who = owners.length > 1 ? ` (${o.name || `owner ${i + 1}`})` : "";
    if (String(o.name || "").trim().length < 3) add(`Enter each owner's full name${who}.`, `Andika jina kamili la kila mmiliki${who}.`);
    if (!validPhone(o.phone)) add(`Enter a valid phone number${who}, e.g. 0712 345 678.`, `Andika namba sahihi ya simu${who}, k.m. 0712 345 678.`);
    else if (phones.has(normPhone(o.phone))) add("Each owner needs their own phone number.", "Kila mmiliki anahitaji namba yake ya simu.");
    else phones.add(normPhone(o.phone));
    const dp = dobProblem(o.dob, todayISO);
    if (dp) out.push({ en: dp.en + who, sw: dp.sw + who });
    if (!o.gender) add(`Choose gender${who}.`, `Chagua jinsia${who}.`);
    if (o.nida && !validNida(o.nida)) add(`A NIDA number has 20 digits${who}.`, `Namba ya NIDA ina tarakimu 20${who}.`);
    if (o.nida && validNida(o.nida)) {
      if (nidas.has(normNida(o.nida))) add("Two owners cannot share one NIDA number.", "Wamiliki wawili hawawezi kutumia NIDA moja.");
      nidas.add(normNida(o.nida));
    }
    const age = ageOn(o.dob, todayISO);
    if (age != null && age < ADULT_AGE && (!String(o.guardianName || "").trim() || !validPhone(o.guardianPhone)))
      add(`Owners under 18 need a parent or guardian's name and phone${who}.`, `Wamiliki chini ya miaka 18 wanahitaji jina na simu ya mzazi au mlezi${who}.`);
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

export const isAdultMain = (profile, todayISO) => {
  const m = mainOwner(profile);
  const a = ageOn(m?.dob, todayISO);
  return a != null && a >= ADULT_AGE;
};
