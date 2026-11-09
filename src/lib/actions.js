// Domain actions. Each takes a draft of the state (`d`), the acting user and arguments, and changes the draft.
// Every Admin change carries a reason and lands in the audit trail (ROLE-05).
import { availableFrom, balancesAt, channelAccount, channelBalances, channelBalance } from "../core/accounting.js";
import { assessmentFee, needsAssessment } from "../core/billing.js";
import { GATES, gates, isSupported, offerFits, schedule } from "../core/credit.js";
import { REASONS, isClosed, isOnTime, shouldFlag, tolerance } from "../core/dailyClose.js";
import { KINDS, SUSPENSE_TARGETS } from "../core/kinds.js";
import { evaluateEntry } from "../core/posting.js";
import { CHECKS, pickForRecheck } from "../core/rating.js";
import { addDays, dateRange, daysBetween, nowISO, nowMs, seeded, today, tzTimeOf, uid, validISODate } from "../core/util.js";
import { LEGAL_FORMS, PIN_LOCK, isAdultMain, linkedBusinesses, nidaConflicts, normPhone, ownersOf, pinProblem, profileProblems, syncProfile, validEmail, validName, validNida, validPhone } from "../core/people.js";
import { BUSINESS_TYPES, REGIONS, SECTORS } from "../core/seed.js";

const by = (actor) => ({ id: actor?.id || "system", name: actor?.name || "System", role: actor?.role || "system" });

// ---------------------------------------------------------------- Rule-layer guards (29 Oct)
// The screens check these too, but the rules must refuse them on their own: in the live pilot the
// server runs these functions, and anyone calling the server directly skips the screens.
const fail = (msg) => { throw new Error(msg); };
export const STAFF_ROLES_ALL = ["officer", "dataAdmin", "systemAdmin", "super"];
const RANKS = { officer: 1, dataAdmin: 2, systemAdmin: 3, super: 4 };
const isStaff = (a) => Boolean(a && RANKS[a.role]);
const needRole = (actor, min) => { if (!actor || !RANKS[actor.role] || RANKS[actor.role] < RANKS[min]) fail("You are not allowed to do this."); };
const needReason = (reason, min = 5) => { if (!reason || String(reason).trim().length < min) fail("A reason is required."); };
// The largest amount TijaPass accepts (9 Nov, REC-F): TZS 10 billion; bigger numbers also lose precision.
export const MAX_AMOUNT = 10000000000;
const wholeAmount = (n, what = "an amount") => {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) fail(`Enter ${what} above zero.`);
  if (!Number.isInteger(x)) fail("Use whole shillings (no cents).");
  if (x > MAX_AMOUNT) fail("That amount is too large. Check the number of zeros.");
  return x;
};
const nonNegative = (n) => {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x < 0) fail("Amounts cannot be negative.");
  if (!Number.isInteger(x)) fail("Use whole shillings (no cents).");
  if (x > MAX_AMOUNT) fail("That amount is too large. Check the number of zeros.");
  return x;
};
// Free text has limits (9 Nov, GEN-A, REC-I).
export const TEXT_MAX = { name: 60, payer: 60, reference: 40, description: 300, note: 500, message: 1000 };
const maxLen = (v, n, what) => { if (String(v || "").length > n) fail(`${what} is too long (${n} characters at most).`); };
const ownsBusiness = (actor, businessId) => actor?.role === "business" && actor.businessId === businessId;
const findBusiness = (d, id) => d.businesses.find((x) => x.id === id) || fail("Business not found.");
const activeChannels = (b) => b.channels.filter((c) => !c.archived);

export function audit(d, actor, action, target, extra = {}) {
  d.audit.unshift({ id: uid("AU"), at: nowISO(d), actor: by(actor), action, target, ...extra });
  if (d.audit.length > 3000) d.audit.length = 3000;
}

// target: { userId } | { role } | { businessId } | { fiId } | { supplierId } | { officerOf: businessId }
export function notify(d, target, title, body, link = null) {
  let t = target;
  if (target.officerOf) {
    const b = d.businesses.find((x) => x.id === target.officerOf);
    t = b?.officerId ? { userId: b.officerId } : { role: "dataAdmin" };
  }
  d.notifications.unshift({ id: uid("N"), at: nowISO(d), ...t, title, body, link, readBy: [] });
  if (d.notifications.length > 2000) d.notifications.length = 2000;
}

const adminNotice = (d, title, body, link) => notify(d, { role: "dataAdmin" }, title, body, link);

// ---------------------------------------------------------------- Businesses
// Only the business itself can register (decided 29 Oct): no officer or admin can create a business.
// The main phone is confirmed with a code sent to it, and the owner chooses the PIN.
export function createBusiness(d, actor, { id, userId, profile, channels, baseline, closingTime, pin, lang, phoneVerified }) {
  if (isStaff(actor) || (actor && actor.role && actor.role !== "business")) fail("Only the business itself can register. TijaPass staff cannot create businesses.");
  const t = today(d);
  const p = syncProfile(profile);
  // Every required business detail is checked here too, not only on screen (audit VF-15, D5 on 9 Nov).
  if (!LEGAL_FORMS.some((x) => x.id === p.legalForm)) fail("Choose the type of ownership.");
  if (!BUSINESS_TYPES.some((x) => x.id === p.businessType)) fail("Choose the business type.");
  if (!SECTORS.some((x) => x.id === p.sector)) fail("Choose the sector.");
  if (!REGIONS.includes(p.region)) fail("Choose the region.");
  if (String(p.address || "").trim().length < 5) fail("Write the business address or a landmark (at least 5 characters).");
  maxLen(p.address, 120, "The address");
  maxLen(p.homeAddress, 120, "The home address");
  const problems = profileProblems(p, t);
  if (problems.length) fail(problems[0].en);
  const conflict = nidaConflicts(d, p);
  if (conflict.length) fail("This NIDA number is already registered to a person with a different name, birth date or gender. Check it, or contact TijaPass.");
  for (const f of d.settings.customFields || []) {
    const v = p.custom?.[f.id];
    if (f.required && !String(v ?? "").trim()) fail(`Fill in: ${f.label?.en || f.id}.`);
    if (f.type === "number" && v !== undefined && v !== "" && !/^\d+$/.test(String(v))) fail(`${f.label?.en || f.id}: use digits only.`);
  }
  channelProblems(channels);
  baselineProblems(baseline, channels);
  if (!phoneVerified) fail("Confirm the main phone number with the code sent to it.");
  const pp = pinProblem(pin, { dob: p.dob, phones: ownersOf(p).map((o) => o.phone) });
  if (pp) fail(pp.en);
  if (d.users.some((u) => u.role === "business" && u.login === normPhone(p.phone))) fail("This phone number is already registered.");
  if (!channels?.some((c) => c.type === "cash")) fail("Cash in hand must be one of the money accounts.");
  if (!/^\d{2}:\d{2}$/.test(closingTime || "17:00")) fail("Choose a closing time.");
  p.owners = p.owners.map((o) => ({ ...o, phone: normPhone(o.phone), confirmed: o.main ? true : Boolean(o.confirmed), confirmedAt: o.main || o.confirmed ? nowISO(d) : null }));
  const b = {
    id, status: "active", startDate: t, closingTime: closingTime || "17:00", createdAt: nowISO(d), createdBy: { id: userId, name: p.ownerName, role: "business" },
    officerId: null, profile: p, channels, baseline: { ...baseline, at: nowISO(d), original: { ...baseline }, corrections: [] }, opening: null,
    kyc: { status: "pending" },
    consent: { at: nowISO(d), scope: "records, statements, credit passport, Records Rating, officer visits with photos and location", fis: {} },
    lastSignIn: null, lang: lang || "sw", customFields: {}
  };
  d.businesses.push(b);
  d.users.push({ id: userId, role: "business", name: p.ownerName, login: normPhone(p.phone), pin, businessId: id, active: true, failedPins: 0 });
  audit(d, { id: userId, name: p.ownerName, role: "business" }, "Business registered by its owner", id, { after: { businessName: p.businessName, owners: p.owners.length } });
  adminNotice(d, { en: "New business: verify identity and assign an officer", sw: "Biashara mpya: hakiki utambulisho na mpangie afisa" }, { en: p.businessName, sw: p.businessName }, "approvals");
  const linked = linkedBusinesses(d, b);
  if (linked.length) adminNotice(d, { en: "Same owner, several businesses", sw: "Mmiliki mmoja, biashara kadhaa" }, { en: `${p.businessName} shares an owner with ${linked.map((x) => x.profile.businessName).join(", ")}`, sw: `${p.businessName} ina mmiliki mmoja na ${linked.map((x) => x.profile.businessName).join(", ")}` }, "approvals");
}

// Money accounts at registration (9 Nov, REG-11, REG-12, audit VF-17): a wallet number is a phone number, a
// provider used twice needs two different numbers, a bank account number (last 4 digits) is exactly 4 digits.
function channelProblems(channels) {
  const seen = new Set();
  const byName = {};
  for (const c of channels || []) if (c.type !== "cash") byName[c.name] = (byName[c.name] || 0) + 1;
  for (const c of channels || []) if (c.type !== "cash" && byName[c.name] > 1 && !String(c.number || "").trim()) fail(`${c.name} is listed more than once: give each one its number.`);
  for (const c of channels || []) {
    if (c.type === "cash") continue;
    if (!String(c.name || "").trim()) fail(c.type === "bank" ? "Enter the bank's name." : "Choose the mobile money provider.");
    maxLen(c.name, 40, "The account name");
    const num = String(c.number || "").replace(/\s/g, "");
    if (c.type === "mobile" && num && !validPhone(num)) fail(`${c.name}: the wallet number must be a phone number, e.g. 0712 345 678.`);
    if (c.type === "bank" && num && !/^\d{4}$/.test(num)) fail(`${c.name}: give exactly the last 4 digits of the account number.`);
    const key = `${c.type}|${String(c.name).trim().toLowerCase()}|${c.type === "mobile" ? normPhone(num) : num}`;
    if (seen.has(key)) fail(`${c.name} is listed twice with the same number.`);
    seen.add(key);
  }
}
// The joining questions must agree with the accounts listed (9 Nov, REG-10).
function baselineProblems(b, channels) {
  if (!b) return;
  const has = (t) => (channels || []).some((c) => c.type === t);
  if (b.bank === "none" && has("bank")) fail("You listed a bank account, so the answer cannot be \"No bank account\".");
  if (b.mobile === "none" && has("mobile")) fail("You listed mobile money, so the answer cannot be \"None\".");
  if ((b.sources || []).includes("none") && b.sources.length > 1) fail("\"None\" cannot be chosen together with other sources of credit.");
  if (b.borrowed === "never" && (b.sources || []).includes("formal")) fail("You said you never borrowed from a bank, MFI or SACCO, so it cannot be a usual source of credit.");
  if (b.needAmount !== undefined && b.needAmount !== "") nonNegative(b.needAmount);
}

// ---------------------------------------------------------------- Sign-in (4-digit PIN with lockout)
// These return { id } or { error } instead of throwing, so the wrong-PIN count is saved even when sign-in fails.
const err = (m) => ({ error: m });
// 5 wrong PINs: locked for 15 minutes. 10: blocked until an officer or Data Admin unlocks after checking the NIDA.
export function pinSignIn(d, phone, pin) {
  const u = d.users.find((x) => x.role === "business" && x.login === normPhone(phone) && x.active !== false);
  if (!u) return err("Phone number or PIN not recognised.");
  const now = nowMs(d);
  if (u.pinBlocked) return err("Too many wrong PINs. Your account is blocked: ask your TijaPass officer to unlock it.");
  if (u.lockedUntil && now < u.lockedUntil) return err(`Too many wrong PINs. Try again after ${tzTimeOf(u.lockedUntil)}.`);
  if (String(u.pin).length !== 4) return err("TijaPass now uses 4-digit PINs. Tap \"Forgot my PIN\" to set a new one with a code to your phone.");
  if (String(u.pin) !== String(pin)) {
    u.failedPins = (u.failedPins || 0) + 1;
    if (u.failedPins >= PIN_LOCK.hardTries) {
      u.pinBlocked = true;
      audit(d, { id: u.id, name: u.name, role: "business" }, "Sign-in blocked after repeated wrong PINs", u.businessId);
      notify(d, { officerOf: u.businessId }, { en: "Business account blocked (wrong PINs)", sw: "Akaunti ya biashara imezuiwa (PIN zisizo sahihi)" }, { en: u.name, sw: u.name }, "off-businesses");
      return err("Too many wrong PINs. Your account is blocked: ask your TijaPass officer to unlock it.");
    }
    if (u.failedPins % PIN_LOCK.tries === 0) {
      u.lockedUntil = now + PIN_LOCK.minutes * 60000;
      return err(`Too many wrong PINs. Try again after ${tzTimeOf(u.lockedUntil)}.`);
    }
    return err(`Phone number or PIN not recognised. ${PIN_LOCK.tries - (u.failedPins % PIN_LOCK.tries)} tries left before a 15-minute lock.`);
  }
  u.failedPins = 0;
  u.lockedUntil = null;
  return { id: u.id };
}

// Staff, lenders and suppliers: email and password, with the same lock.
export function passwordSignIn(d, email, password) {
  const u = d.users.find((x) => x.login === String(email || "").trim().toLowerCase() && !x.test && x.role !== "business");
  if (!u || (u.active === false && u.status !== "pending")) return err("Email or password not recognised.");
  if (u.status === "pending") return err("This account is waiting for approval.");
  if (u.status === "declined") return err("This organisation was not approved. Contact TijaPass.");
  const now = nowMs(d);
  if (u.pinBlocked) return err("Account blocked after repeated wrong passwords. Ask the System Admin.");
  if (u.lockedUntil && now < u.lockedUntil) return err(`Too many wrong passwords. Try again after ${tzTimeOf(u.lockedUntil)}.`);
  if (u.password !== password) {
    u.failedPins = (u.failedPins || 0) + 1;
    if (u.failedPins >= PIN_LOCK.hardTries) u.pinBlocked = true;
    else if (u.failedPins % PIN_LOCK.tries === 0) u.lockedUntil = now + PIN_LOCK.minutes * 60000;
    return err("Email or password not recognised.");
  }
  u.failedPins = 0;
  u.lockedUntil = null;
  return { id: u.id };
}

// Forgotten PIN: a code to the registered phone, then a new PIN. Not possible while blocked.
export function resetPinWithCode(d, phone, newPin, codeOk) {
  const u = d.users.find((x) => x.role === "business" && x.login === normPhone(phone) && x.active !== false);
  if (!u) fail("Phone number not recognised.");
  if (!codeOk) fail("Enter the code sent to your phone.");
  if (u.pinBlocked) fail("Your account is blocked: ask your TijaPass officer to unlock it first.");
  const b = d.businesses.find((x) => x.id === u.businessId);
  const pp = pinProblem(newPin, { dob: b?.profile?.dob, phones: ownersOf(b?.profile).map((o) => o.phone) });
  if (pp) fail(pp.en);
  u.pin = newPin;
  u.failedPins = 0;
  u.lockedUntil = null;
  audit(d, { id: u.id, name: u.name, role: "business" }, "PIN reset with phone code", u.businessId);
}

export function unlockPin(d, actor, userId, reason) {
  needRole(actor, "officer");
  const u = d.users.find((x) => x.id === userId);
  if (actor.role === "officer" && d.businesses.find((b) => b.id === u.businessId)?.officerId !== actor.id) fail("Only the business's own officer or Data Admin can unlock it.");
  needReason(reason, 10);
  u.pinBlocked = false;
  u.failedPins = 0;
  u.lockedUntil = null;
  audit(d, actor, "Business sign-in unlocked", u.businessId || userId, { reason });
}

// ---------------------------------------------------------------- Identity and owners
export function verifyIdentity(d, actor, businessId, approve, reason) {
  needRole(actor, "dataAdmin");
  const b = findBusiness(d, businessId);
  if (!approve) needReason(reason);
  if (approve) {
    const missing = identityMissing(b);
    if (missing.length) fail(`Identity cannot be verified yet. Missing: ${missing.join("; ")}.`);
  }
  b.kyc = { status: approve ? "verified" : "rejected", by: by(actor), at: nowISO(d), reason: reason || "" };
  audit(d, actor, approve ? "Identity verified" : "Identity not verified", businessId, { reason });
  notify(d, { businessId }, approve ? { en: "Your identity is verified", sw: "Utambulisho wako umehakikiwa" } : { en: "Identity check: more information needed", sw: "Uhakiki wa utambulisho: taarifa zaidi zinahitajika" }, { en: reason || "", sw: reason || "" }, "profile");
}

// What must be in place before Data Admin can mark identity verified (9 Nov, ADM-F). NIDA stays optional at
// registration (D3), but identity, which every loan needs, cannot be verified without it.
export function identityMissing(b) {
  const out = [];
  const owners = ownersOf(b.profile);
  const main = owners.find((o) => o.main) || owners[0];
  if (owners.some((o) => !validNida(o.nida))) out.push("a NIDA number for every owner");
  if (!main?.photoId) out.push("the main owner's photo");
  if (!main?.idPhotoId) out.push("a photo of the main owner's NIDA card");
  if (owners.some((o) => o.confirmed === false)) out.push("every co-owner's confirmation by phone code");
  return out;
}

// A co-owner confirms with the code sent to their own phone.
export function confirmOwner(d, actor, businessId, ownerId, codeOk) {
  if (!ownsBusiness(actor, businessId)) fail("Only the business can confirm its owners.");
  if (!codeOk) fail("Enter the code sent to the owner's phone.");
  const b = findBusiness(d, businessId);
  const o = b.profile.owners.find((x) => x.id === ownerId);
  if (!o) fail("Owner not found.");
  o.confirmed = true;
  o.confirmedAt = nowISO(d);
  audit(d, actor, "Co-owner confirmed by phone code", businessId, { after: o.name });
}

export function assignOfficer(d, actor, businessId, officerId, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const b = findBusiness(d, businessId);
  const off = d.users.find((u) => u.id === officerId);
  if (!off || off.role !== "officer" || off.active === false) fail("Choose an active officer.");
  const before = b.officerId;
  b.officerId = officerId;
  b.officerHistory = [...(b.officerHistory || []), { officerId, at: nowISO(d), by: by(actor), reason }];
  audit(d, actor, "Officer assigned", businessId, { before, after: officerId, reason });
  notify(d, { userId: officerId }, { en: "New business assigned to you", sw: "Umepangiwa biashara mpya" }, { en: b.profile.businessName, sw: b.profile.businessName }, "officer-businesses");
}

export const OPENING_KEYS = ["inventory", "receivables", "equipment", "groupSavings", "payables", "loansShort", "loansLong", "groupLoans"];
// Accounts whose starting balance goes to Data Admin on its own (added after joining): never also in the starting
// position, so no amount is counted twice (9 Nov, PRO-4, audit VF-06).
export const ownOpeningChannels = (d, businessId) => new Set((d.changeRequests || []).filter((c) => c.businessId === businessId && c.type === "channelOpening" && c.status !== "declined").map((c) => c.fields.channelId));
function checkOpeningValues(d, b, values, { complete = false } = {}) {
  const own = ownOpeningChannels(d, b.id);
  const live = activeChannels(b).filter((c) => !own.has(c.id));
  for (const k of Object.keys(values || {})) if (k !== "channels" && !OPENING_KEYS.includes(k)) fail(`Unknown starting-position item: ${k}.`);
  for (const [id, v] of Object.entries(values.channels || {})) {
    if (own.has(id)) fail("This account's starting balance was sent separately; it cannot also be in the starting position.");
    if (!b.channels.some((c) => c.id === id)) fail("Unknown money account in the starting position.");
    nonNegative(v);
  }
  for (const k of OPENING_KEYS) if (values[k] !== undefined && values[k] !== "") nonNegative(values[k]);
  if (complete) {
    const blank = (v) => v === undefined || v === null || v === "";
    if (live.some((c) => blank(values.channels?.[c.id])) || OPENING_KEYS.some((k) => blank(values[k]))) fail("Answer every box before sending (type 0 where you have none).");
  }
}
export function saveOpening(d, actor, businessId, values, submit) {
  const b = findBusiness(d, businessId);
  if (b.opening?.status === "approved") throw new Error("Your starting position is verified and locked. Ask TijaPass if something must change.");
  if (!ownsBusiness(actor, businessId)) fail("Only the business enters its starting position. An officer may explain it, but not type it.");
  // Once saved it counts at once, marked "not verified"; it can be corrected until TijaPass verifies it.
  if (b.opening?.status === "submitted" && !submit) fail("Your starting position is already in use. Save the corrected figures instead.");
  checkOpeningValues(d, b, values, { complete: submit });
  const before = b.opening?.status === "submitted" ? b.opening.values : undefined;
  b.opening = { status: submit ? "submitted" : "draft", date: b.startDate, values, by: by(actor), at: nowISO(d), firstSavedAt: b.opening?.firstSavedAt || (submit ? nowISO(d) : undefined) };
  // No notice per business: at scale, staff work from the "To verify" list, sorted by priority (9 Nov).
  audit(d, actor, submit ? (before ? "Starting position corrected (not verified)" : "Starting position saved (not verified)") : "Starting position draft saved", businessId, before ? { before, after: values } : {});
}

export function decideOpening(d, actor, businessId, approve, reason) {
  needRole(actor, "dataAdmin");
  const b = d.businesses.find((x) => x.id === businessId);
  if (b.opening?.status !== "submitted") fail("There is no unverified starting position to check.");
  if (b.opening.by?.id === actor.id) fail("The person who entered the starting position cannot verify it.");
  needReason(reason);
  // Verified: locked. Not right: it keeps counting (the business keeps working) and the business is asked to correct it.
  if (approve) { b.opening.status = "approved"; b.opening.returned = null; } else b.opening.returned = { reason, at: nowISO(d), by: by(actor) };
  b.opening.decidedBy = by(actor);
  b.opening.decidedAt = nowISO(d);
  b.opening.reason = reason;
  if (approve && b.checkRequest && !b.checkRequest.doneAt) b.checkRequest.doneAt = nowISO(d);
  audit(d, actor, approve ? "Starting position verified and locked" : "Starting position: correction asked", businessId, { reason });
  notify(d, { businessId }, approve ? { en: "Starting position verified", sw: "Hali ya kuanzia imehakikiwa" } : { en: "Please correct your starting position", sw: "Tafadhali sahihisha hali yako ya kuanzia" }, { en: reason || "", sw: reason || "" }, "profile");
}

export function adminEditOpening(d, actor, businessId, values, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const b = findBusiness(d, businessId);
  // The same checks as the business's own form (9 Nov, OPN-3, audit VF-07).
  checkOpeningValues(d, b, values);
  const before = b.opening?.values;
  b.opening = { ...(b.opening || {}), status: "approved", date: b.opening?.date || b.startDate, values, editedBy: by(actor), editedAt: nowISO(d) };
  audit(d, actor, "Opening balances edited by Admin", businessId, { before, after: values, reason });
}

// ONB-09 / RAT-07 / officer recommendations: a change waits for Data Admin.
export function requestChange(d, actor, { id, businessId, type, fields, note, entryId }) {
  d.changeRequests.unshift({ id, businessId, type, fields, note, entryId, status: "pending", proposedBy: by(actor), at: nowISO(d) });
  adminNotice(d, { en: "Change waiting for approval", sw: "Mabadiliko yanasubiri idhini" }, { en: note || type, sw: note || type }, "approvals");
}

// ---------------------------------------------------------------- Profile changes (agreed 29 Oct)
// Additions and updates that fit the verified record apply at once and are logged; anything that
// contradicts verified details waits for Data Admin.
export const PROFILE_IMMEDIATE = ["phone2", "email", "staffTotal", "staffWomen", "staffPaid", "address", "homeAddress", "management", "closingTime"];
// Months operating counts up by itself from joining; a correction goes to Data Admin (9 Nov, PRO-7).
export const PROFILE_APPROVAL = ["phone", "businessName", "businessType", "sector", "region", "legalForm", "registrationNo", "gps", "owners", "monthsOperating"];
const OWNER_IDENTITY = ["name", "dob", "gender", "nida", "phone", "sharePct", "role", "guardianName", "guardianPhone", "photoId", "idPhotoId", "main"];
const metres = (a, b) => {
  if (!a || !b) return Infinity;
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
// Plain names for profile details, shown in messages and pending lists (PRO-8).
export const PROFILE_LABELS = { phone: "main phone", phone2: "second phone", email: "email", businessName: "business name", businessType: "business type", sector: "sector", region: "region", legalForm: "ownership", registrationNo: "licence or BRELA number", gps: "location", owners: "owners", monthsOperating: "months operating", address: "address", homeAddress: "home address", closingTime: "closing time", staffTotal: "staff", staffWomen: "women staff", staffPaid: "paid staff", management: "management" };
export function classifyProfileChange(business, changes) {
  const now = {};
  const ask = {};
  const p = business.profile;
  for (const [k, v] of Object.entries(changes)) {
    if (k === "gps") (p.gps && metres(p.gps, v) <= 2000 ? now : ask)[k] = v;
    else if (k === "owners") {
      const old = ownersOf(p);
      const sameIds = old.length === v.length && v.every((o) => old.some((x) => x.id === o.id));
      const identityChanged = !sameIds || v.some((o) => { const x = old.find((y) => y.id === o.id); return OWNER_IDENTITY.some((f) => String(x?.[f] ?? "") !== String(o[f] ?? "")); });
      (identityChanged ? ask : now)[k] = v;
    } else if (PROFILE_IMMEDIATE.includes(k)) now[k] = v;
    else if (PROFILE_APPROVAL.includes(k)) ask[k] = v;
    else fail(`This detail cannot be changed here: ${k}.`);
  }
  return { now, ask };
}
// Officer recommendations may name the main owner's details in the older flat form; they map onto the owners list.
const OWNER_FLAT = { ownerName: "name", dob: "dob", gender: "gender", nida: "nida", education: "education" };
const applyProfile = (d, b, fields) => {
  const before = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "closingTime") { before[k] = b.closingTime; b.closingTime = v; continue; }
    if (OWNER_FLAT[k]) {
      const owners = ownersOf(b.profile).map((o) => ({ ...o }));
      const m = owners.find((o) => o.main) || owners[0];
      before[k] = m[OWNER_FLAT[k]];
      m[OWNER_FLAT[k]] = v;
      b.profile = { ...b.profile, owners };
      continue;
    }
    if (k === "phone") {
      const owners = ownersOf(b.profile).map((o) => ({ ...o }));
      const m = owners.find((o) => o.main) || owners[0];
      m.phone = normPhone(v);
      b.profile = { ...b.profile, owners };
    }
    before[k] = b.profile[k];
    b.profile[k] = v;
  }
  b.profile = syncProfile(b.profile);
  const u = d.users.find((x) => x.role === "business" && x.businessId === b.id);
  if (u) { u.login = normPhone(b.profile.phone); u.name = b.profile.ownerName; }
  return before;
};
export function changeProfile(d, actor, businessId, changes, { phoneCodeOk = false, ownersConfirmed = false, note = "" } = {}) {
  if (!ownsBusiness(actor, businessId)) fail("Only the business can change its own profile.");
  const b = findBusiness(d, businessId);
  const { now, ask } = classifyProfileChange(b, changes);
  if (changes.address !== undefined && String(changes.address).trim().length < 5) fail("Write the business address or a landmark (at least 5 characters).");
  if (changes.closingTime !== undefined && !/^\d{2}:\d{2}$/.test(changes.closingTime)) fail("Choose a closing time.");
  for (const k of ["address", "homeAddress"]) if (changes[k] !== undefined) maxLen(changes[k], 120, "The address");
  if (changes.businessType !== undefined && !BUSINESS_TYPES.some((x) => x.id === changes.businessType)) fail("Choose the business type.");
  if (changes.sector !== undefined && !SECTORS.some((x) => x.id === changes.sector)) fail("Choose the sector.");
  if (changes.region !== undefined && !REGIONS.includes(changes.region)) fail("Choose the region.");
  if (changes.legalForm !== undefined && !LEGAL_FORMS.some((x) => x.id === changes.legalForm)) fail("Choose the type of ownership.");
  // One pending request per detail (9 Nov, PRO-6): the same thing cannot wait for approval twice.
  const waiting = new Set(d.changeRequests.filter((c) => c.businessId === businessId && c.type === "profile" && c.status === "pending").flatMap((c) => Object.keys(c.fields || {})));
  const again = Object.keys(ask).filter((k) => waiting.has(k));
  if (again.length) fail(`A change to ${again.map((k) => PROFILE_LABELS[k] || k).join(", ")} is already waiting for approval.`);
  const trial = structuredClone(b);
  applyProfile({ users: [] }, trial, { ...now, ...ask });
  const problems = profileProblems(trial.profile, today(d));
  if (problems.length) fail(problems[0].en);
  if ((ask.owners || now.owners) && nidaConflicts(d, trial.profile, b.id).length) fail("A NIDA number here is already registered to a person with a different name, birth date or gender.");
  if (ask.phone && normPhone(ask.phone) !== b.profile.phone) {
    if (!phoneCodeOk) fail("Confirm the new phone number with the code sent to it.");
    if (d.users.some((u) => u.role === "business" && u.login === normPhone(ask.phone) && u.businessId !== businessId)) fail("This phone number is already registered.");
  }
  if (ask.owners && !ownersConfirmed) fail("Every current owner must confirm this change with the code sent to their phone.");
  if (Object.keys(now).length) {
    const before = applyProfile(d, b, now);
    audit(d, actor, "Profile updated by the business", businessId, { before, after: now });
    if (b.officerId) notify(d, { userId: b.officerId }, { en: "A business updated its profile", sw: "Biashara imesasisha wasifu wake" }, { en: `${b.profile.businessName}: ${Object.keys(now).join(", ")}`, sw: `${b.profile.businessName}: ${Object.keys(now).join(", ")}` }, "off-changes");
  }
  if (Object.keys(ask).length) requestChange(d, actor, { id: uid("CR"), businessId, type: "profile", fields: ask, note: note || `Profile change: ${Object.keys(ask).join(", ")}` });
  return { applied: Object.keys(now), requested: Object.keys(ask) };
}

// A new mobile money wallet, till or bank account can be added at once; its starting balance waits for Data Admin.
export function addChannel(d, actor, businessId, { type, name, number = "", openingBalance = 0 }) {
  if (!ownsBusiness(actor, businessId)) fail("Only the business can add its money accounts.");
  if (!["mobile", "bank"].includes(type)) fail("Choose mobile money or bank.");
  if (!String(name || "").trim()) fail("Enter the provider or bank name.");
  const amount = nonNegative(openingBalance);
  const b = findBusiness(d, businessId);
  const ch = { id: uid("C"), type, name: name.trim(), number: String(number || "").replace(/\s/g, ""), addedAt: nowISO(d), addedDate: today(d) };
  // Same checks as at registration, against the open accounts (no duplicates, valid numbers; audit VF-17).
  channelProblems([ch]);
  const same = activeChannels(b).filter((c) => c.type === type && c.name.trim().toLowerCase() === ch.name.toLowerCase());
  const key = (c) => (c.type === "mobile" ? normPhone(c.number) : String(c.number || ""));
  if (same.length && !ch.number) fail(`You already have ${ch.name}. Give this one's number so the two can be told apart.`);
  if (same.some((c) => c.number && key(c) === key(ch))) fail(`${ch.name} is listed twice with the same number.`);
  if (same.length) ch.name = `${ch.name} ${String(ch.number).slice(-4)}`;
  // Until the starting position is saved, an account's starting balance is entered there, once (PRO-4).
  if (amount > 0 && b.opening?.status !== "approved" && b.opening?.status !== "submitted") fail("Add the account without an amount, then enter its balance in your Starting position.");
  b.channels.push(ch);
  audit(d, actor, "Money account added", businessId, { after: `${ch.name} ${ch.number}`.trim() });
  if (amount > 0) {
    // The balance counts at once, marked "not verified"; TijaPass checks it from the "To verify" list (9 Nov).
    const crId = uid("CR");
    d.entries.push({ id: uid("E"), businessId, date: today(d), kind: "channel_opening", amount, channelId: ch.id, status: "posted", source: "business", evidence: "declared", unverified: true, verifyRequestId: crId, description: `Starting balance of ${ch.name}`, createdAt: nowISO(d), createdBy: by(actor) });
    d.changeRequests.unshift({ id: crId, businessId, type: "channelOpening", fields: { channelId: ch.id, channelName: ch.name, amount }, note: `Starting balance of ${ch.name}: TZS ${amount.toLocaleString("en-US")}`, status: "pending", proposedBy: by(actor), at: nowISO(d) });
  }
  return ch.id;
}

export function requestCloseChannel(d, actor, businessId, channelId) {
  if (!ownsBusiness(actor, businessId)) fail("Only the business can close its money accounts.");
  const b = d.businesses.find((x) => x.id === businessId);
  const ch = b.channels.find((c) => c.id === channelId);
  if (!ch || ch.type === "cash") fail("Cash in hand cannot be closed.");
  if (ch.archived) fail("This account is already closed.");
  // Money must be moved out first (9 Nov, PRO-5): refused at once, not only at approval.
  const bal = channelBalance(d, businessId, channelId, today(d));
  if (Math.abs(bal) > 0.5) fail(`${ch.name} still holds TZS ${Math.round(bal).toLocaleString("en-US")}. Move the money to another account first.`);
  if (d.changeRequests.some((c) => c.businessId === businessId && c.type === "closeChannel" && c.status === "pending" && c.fields.channelId === channelId)) fail("Closing this account is already waiting for approval.");
  requestChange(d, actor, { id: uid("CR"), businessId, type: "closeChannel", fields: { channelId, channelName: ch.name }, note: `Close ${ch.name}` });
}

// The business asks TijaPass to check its records (9 Nov): it moves to the top of the "To verify" list.
export function requestCheck(d, actor, businessId, note = "") {
  if (!ownsBusiness(actor, businessId)) fail("Only the business can ask for a check of its own records.");
  maxLen(note, TEXT_MAX.note, "The note");
  const b = findBusiness(d, businessId);
  if (b.checkRequest && !b.checkRequest.doneAt) fail("You already asked. TijaPass will contact you.");
  b.checkRequest = { at: nowISO(d), note: String(note).trim() };
  audit(d, actor, "Business asked for a records check", businessId, { after: note });
  notify(d, { officerOf: businessId }, { en: "A business asked for a records check", sw: "Biashara imeomba ukaguzi wa kumbukumbu" }, { en: b.profile.businessName, sw: b.profile.businessName }, "verify");
}

export function decideChange(d, actor, id, approve, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const cr = d.changeRequests.find((x) => x.id === id);
  if (cr.status !== "pending") fail("This request was already decided.");
  if (cr.proposedBy?.id === actor.id) fail("The person who proposed a change cannot approve it.");
  cr.status = approve ? "approved" : "declined";
  cr.decidedBy = by(actor);
  cr.decidedAt = nowISO(d);
  cr.reason = reason;
  const b = d.businesses.find((x) => x.id === cr.businessId);
  if (approve && cr.type === "stock" && b) {
    const bookStock = balancesAt(d, b.id, today(d)).inventory || 0;
    const delta = Math.round(Number(cr.fields.estimate) - bookStock);
    if (delta) stockAdjust(d, actor, b.id, delta, `Stock count by officer: ${reason}`);
  } else if (approve && cr.type === "profile" && b) {
    const trial = structuredClone(b);
    applyProfile({ users: [] }, trial, cr.fields || {});
    const problems = profileProblems(trial.profile, today(d));
    if (problems.length) fail(problems[0].en);
    if (cr.fields?.owners && nidaConflicts(d, trial.profile, b.id).length) fail("A NIDA number in this change belongs to a person with a different name, birth date or gender.");
    const before = applyProfile(d, b, cr.fields || {});
    if (cr.fields?.owners || cr.fields?.nida) b.kyc = { ...(b.kyc || {}), status: "pending", note: "Owners or ID changed: verify again" };
    audit(d, actor, "Profile change approved", cr.businessId, { before, after: cr.fields, reason });
  } else if (cr.type === "channelOpening" && b) {
    // The balance was counted when the account was added; this only verifies it, or takes it back out.
    const e = d.entries.find((x) => x.verifyRequestId === cr.id);
    if (approve) {
      if (e) { e.unverified = false; e.verifiedBy = by(actor); }
      audit(d, actor, "New account's starting balance verified", cr.businessId, { after: cr.fields, reason });
    } else {
      if (e && !e.reversedBy) reverseEntry(d, actor, e.id, `Starting balance not confirmed: ${reason}`);
      audit(d, actor, "New account's starting balance taken out", cr.businessId, { after: cr.fields, reason });
    }
  } else if (approve && cr.type === "closeChannel" && b) {
    const bal = channelBalance(d, b.id, cr.fields.channelId, today(d));
    if (Math.abs(bal) > 0.5) fail(`This account still holds TZS ${Math.round(bal).toLocaleString("en-US")}. Move the money first.`);
    b.channels.find((c) => c.id === cr.fields.channelId).archived = true;
    audit(d, actor, "Money account closed", cr.businessId, { after: cr.fields.channelName, reason });
  } else audit(d, actor, approve ? `Change approved (${cr.type})` : `Change declined (${cr.type})`, cr.businessId, { reason });
  notify(d, { businessId: cr.businessId }, approve ? { en: "Your change was approved", sw: "Mabadiliko yako yameidhinishwa" } : { en: "Your change was declined", sw: "Mabadiliko yako yamekataliwa" }, { en: reason || "", sw: reason || "" }, "profile");
}

export function setConsent(d, actor, businessId, fiId, granted) {
  // Only the business gives or withdraws consent, and only to an approved lender (audit VF-13).
  if (!ownsBusiness(actor, businessId)) fail("Only the business can give or withdraw consent.");
  const b = findBusiness(d, businessId);
  if (granted && !d.fis.some((f) => f.id === fiId && f.status === "approved")) fail("Choose an approved lender.");
  b.consent.fis = b.consent.fis || {};
  b.consent.fis[fiId] = granted ? { granted: true, at: nowISO(d) } : { granted: false, withdrawnAt: nowISO(d) };
  audit(d, actor, granted ? "Consent given to FI" : "Consent withdrawn from FI", businessId, { after: fiId });
}

// ---------------------------------------------------------------- Entries
// How much a business may still owe or be owed for a given kind, from its books.
const OWED = { debtor_receipt: { acc: ["receivables"], sign: 1, en: "customers owe you" }, supplier_payment: { acc: ["payables"], sign: -1, en: "you owe suppliers" }, loan_repayment: { acc: ["loansShort", "loansLong"], sign: -1, en: "you owe on loans" }, group_loan_repayment: { acc: ["groupLoans"], sign: -1, en: "you owe your group" } };
export function owedFor(d, businessId, kind) {
  const o = OWED[kind];
  if (!o) return null;
  const bal = balancesAt(d, businessId, today(d));
  return Math.max(0, o.sign * o.acc.reduce((t, a) => t + (bal[a] || 0), 0));
}
// What can still leave an account dated `date` without any day from then to today going below zero (D1).
export const availableToSpend = (d, businessId, channelId, date) => Math.max(0, availableFrom(d, businessId, channelAccount(channelId), date, today(d)));

export function addEntry(d, actor, entry, { directionConflict = false, aiRecommendation = null } = {}) {
  const b = d.businesses.find((x) => x.id === entry.businessId);
  if (!b) fail("Business not found.");
  if (isStaff(actor)) fail("TijaPass staff do not record for a business. Corrections go through reversal with a reason.");
  // A business records only its own money (audit VF-12).
  if (!ownsBusiness(actor, entry.businessId)) fail("You can record only for your own business.");
  maxLen(entry.payer, TEXT_MAX.payer, "The name");
  maxLen(entry.reference, TEXT_MAX.reference, "The reference");
  maxLen(entry.description, TEXT_MAX.description, "The description");
  const k = KINDS[entry.kind];
  if (!k || k.hidden) fail("Choose what happened from the list.");
  wholeAmount(entry.amount);
  if (!validISODate(entry.date)) fail("Choose a valid date.");
  if (entry.date > today(d)) fail("An entry cannot be dated in the future.");
  if (entry.date < b.startDate) fail("An entry cannot be dated before the business joined TijaPass.");
  if (k.flow !== "none" && !activeChannels(b).some((c) => c.id === entry.channelId)) fail("Choose one of this business's money accounts.");
  if (entry.kind === "transfer") {
    if (!activeChannels(b).some((c) => c.id === entry.toChannelId)) fail("Choose the account the money went to.");
    if (entry.toChannelId === entry.channelId) fail("Choose a different account to move the money to.");
  }
  // Loan repayments split into what reduces the loan and what is interest or fees (V11).
  const interest = entry.interest ? nonNegative(entry.interest) : 0;
  if (interest && !["loan_repayment", "group_loan_repayment"].includes(entry.kind)) fail("Only a loan repayment has an interest part.");
  if (interest && interest >= Number(entry.amount)) fail("The interest part must be less than the whole repayment.");
  // Money out or moved above what the account holds is refused (decided 9 Nov, D1): record the money that came in first.
  const flow = k.flow;
  if ((flow === "out" || flow === "transfer") && !entry.interestOf) {
    const avail = availableToSpend(d, b.id, entry.channelId, entry.date);
    if (Number(entry.amount) > avail + 0.5) {
      const ch = b.channels.find((c) => c.id === entry.channelId);
      fail(`${ch?.name || "This account"} has only TZS ${Math.round(avail).toLocaleString("en-US")} available${entry.date < today(d) ? ` from ${entry.date} to today` : ""}. Record the money that came in first, or choose another account.`);
    }
  }
  // Paying back more than is owed would leave a negative debt (9 Nov, REC-D).
  const owed = owedFor(d, b.id, entry.kind);
  const principal = Number(entry.amount) - (entry.interest ? Number(entry.interest) : 0);
  if (owed !== null && principal > owed + 0.5) {
    const o = OWED[entry.kind];
    fail(owed > 0 ? `Your records show ${o.en} only TZS ${Math.round(owed).toLocaleString("en-US")}. Record the rest as what it really was.` : `Your records show nothing that ${o.en}. ${entry.kind === "debtor_receipt" ? "Record the credit sale first, or choose \"other income\"." : entry.kind === "supplier_payment" ? "Record the credit purchase first, or choose what you bought." : "Record the loan first (\"I borrowed money\"), or check your starting position."}`);
  }
  const closedDay = isClosed(d, b.id, entry.date);
  if (interest) {
    const main = { ...entry, amount: Number(entry.amount) - interest, interest: undefined, grossAmount: Number(entry.amount) };
    const r = addEntry(d, actor, main, { directionConflict, aiRecommendation });
    const mainEntry = d.entries.find((x) => x.id === main.id);
    const ie = { ...main, id: uid("E"), kind: "loan_interest", amount: interest, grossAmount: undefined, interestOf: main.id, status: mainEntry?.status || "posted", heldReasons: mainEntry?.heldReasons, createdAt: nowISO(d), createdBy: by(actor), evidence: "declared" };
    d.entries.push(ie);
    if (mainEntry?.status === "posted" && channelBalance(d, b.id, entry.channelId, entry.date) < -0.5) {
      for (const x of [mainEntry, ie]) { x.status = "held"; x.heldReasons = ["overdraw"]; }
      return { action: "hold", reasons: ["overdraw"] };
    }
    return r;
  }
  const e = { status: "posted", createdAt: nowISO(d), createdBy: by(actor), ...entry };
  e.evidence = isSupported(e) ? "supported" : "declared";
  const ev = evaluateEntry(d, e, { directionConflict, closedDay });
  if (ev.action === "hold") {
    e.status = "held";
    e.heldReasons = ev.reasons;
    e.aiRecommendation = aiRecommendation;
    adminNotice(d, { en: "Entry held for review", sw: "Muamala umesimamishwa kwa ukaguzi" }, { en: `${e.amount} · ${ev.reasons.join(", ")}`, sw: `${e.amount} · ${ev.reasons.join(", ")}` }, "approvals");
  } else {
    // Second stage (accountant review after posting): uncertain readings of material amounts are checked by
    // a TijaPass accountant without stopping the business (AI proposes, rules post, people review exceptions).
    const material = Number(e.amount) >= (d.settings.reviewFloor ?? 50000);
    const uncertain = (e.ai && (e.ai.confidence ?? 1) < 0.6) || e.source === "ready" || (e.ai?.suggested && e.ai.suggested !== e.kind);
    if (material && uncertain) {
      e.review = { status: "open", reason: e.source === "ready" ? "ready" : e.ai?.suggested && e.ai.suggested !== e.kind ? "override" : "confidence", aiRecommendation };
    }
  }
  d.entries.push(e);
  return ev;
}

export function reviewPosted(d, actor, entryId, decision, { kind, reason } = {}) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const e = d.entries.find((x) => x.id === entryId);
  if (decision === "change" && kind && kind !== e.kind) changeTreatment(d, actor, entryId, kind, reason);
  e.review = { ...(e.review || {}), status: decision === "change" ? "changed" : "confirmed", by: by(actor), at: nowISO(d), note: reason };
  if (decision !== "change") audit(d, actor, "Posted entry confirmed by accountant", entryId, { reason });
}

export function decideHeld(d, actor, entryId, decision, { kind, reason } = {}) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const e = d.entries.find((x) => x.id === entryId);
  if (!e || e.status !== "held") fail("This entry is not waiting for a decision.");
  if (decision === "approve") decision = "post";
  if (!["post", "change", "decline"].includes(decision)) fail("Choose post, change or decline.");
  if (decision === "change" && (!KINDS[kind] || KINDS[kind].hidden || (KINDS[kind].flow === "transfer") !== (KINDS[e.kind]?.flow === "transfer"))) fail("Choose a valid treatment.");
  const before = { status: e.status, kind: e.kind };
  if (decision !== "decline") {
    // Approval re-checks the money (audit VF-04): an approved entry may never take an account below zero.
    const trial = { ...e, kind: decision === "change" && kind ? kind : e.kind };
    const flow = KINDS[trial.kind]?.flow;
    if (flow === "out" || flow === "transfer") {
      const others = d.entries.filter((x) => x.interestOf === e.id && x.status === "held");
      const need = Number(trial.amount) + others.reduce((t, x) => t + Number(x.amount), 0);
      const avail = availableToSpend(d, e.businessId, e.channelId, e.date);
      if (need > avail + 0.5) fail(`Cannot post: the account has only TZS ${Math.round(avail).toLocaleString("en-US")} available. Decline it, or wait until the business records the missing money in.`);
    }
  }
  if (decision === "decline") e.status = "declined";
  else {
    if (decision === "change" && kind) e.kind = kind;
    e.status = "posted";
  }
  e.decidedBy = by(actor);
  e.decisionReason = reason;
  for (const x of d.entries.filter((y) => y.interestOf === e.id && y.status === "held")) x.status = e.status;
  if (e.status === "posted" && e.heldReasons?.includes("closedDay")) {
    const c = d.closes.find((x) => x.businessId === e.businessId && x.from <= e.date && x.to >= e.date);
    if (c) c.adjustments = [...(c.adjustments || []), { entryId: e.id, at: nowISO(d), by: by(actor), reason }];
  }
  audit(d, actor, `Held entry ${decision}`, entryId, { before, after: { status: e.status, kind: e.kind }, reason });
  notify(d, { businessId: e.businessId }, decision === "decline" ? { en: "An entry was declined", sw: "Muamala umekataliwa" } : { en: "An entry was approved", sw: "Muamala umeidhinishwa" }, { en: reason || "", sw: reason || "" }, "activity");
}

export function reverseEntry(d, actor, entryId, reason) {
  needRole(actor, "dataAdmin");
  const e = d.entries.find((x) => x.id === entryId);
  if (!e) fail("Entry not found.");
  if (!reason || reason.trim().length < 5) throw new Error("A reason is required.");
  if (e.reversedBy) fail("This entry was already reversed.");
  if (e.contra) fail("A reversal cannot itself be reversed. Record a new entry instead.");
  if (e.status !== "posted") fail("Only a posted entry can be reversed.");
  const rev = { ...e, id: uid("E"), contra: true, reversalOf: e.id, source: "admin", createdAt: nowISO(d), createdBy: by(actor), description: `Reversal: ${e.description || ""}`, reason };
  d.entries.push(rev);
  e.reversedBy = rev.id;
  audit(d, actor, "Entry reversed", entryId, { reason });
  return rev.id;
}

export function changeTreatment(d, actor, entryId, newKind, reason) {
  const e = d.entries.find((x) => x.id === entryId);
  if (!e) fail("Entry not found.");
  if (!KINDS[newKind] || KINDS[newKind].hidden || (KINDS[newKind].flow === "transfer") !== (KINDS[e.kind]?.flow === "transfer")) fail("Choose a valid treatment.");
  reverseEntry(d, actor, entryId, reason);
  // A correction keeps the original evidence level; changing the treatment is not new evidence (9 Nov, ADM-E).
  const fresh = { ...e, id: uid("E"), kind: newKind, reversedBy: undefined, review: undefined, createdAt: nowISO(d), createdBy: by(actor), source: e.source, correctionOf: e.id, evidence: e.evidence, decidedBy: undefined };
  d.entries.push(fresh);
  audit(d, actor, "Entry treatment changed", entryId, { before: e.kind, after: newKind, reason });
}

export function stockAdjust(d, actor, businessId, delta, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const x = Number(delta);
  if (!Number.isInteger(x) || !x || Math.abs(x) > MAX_AMOUNT) fail("Enter a whole-shilling change in stock value.");
  if ((balancesAt(d, businessId, today(d)).inventory || 0) + x < 0) fail("Stock value cannot go below zero.");
  d.entries.push({ id: uid("E"), businessId, date: today(d), kind: "stock_adjust", amount: delta, status: "posted", source: "admin", description: reason, createdAt: nowISO(d), createdBy: by(actor) });
  audit(d, actor, "Stock value adjusted", businessId, { after: delta, reason });
}

// ---------------------------------------------------------------- Daily close
export function closeDay(d, actor, { businessId, from, to, counts, reasons, catchUp }) {
  const b = d.businesses.find((x) => x.id === businessId);
  if (!ownsBusiness(actor, businessId)) fail("Only the business closes its own day.");
  if (!validISODate(from) || !validISODate(to) || from > to) fail("Choose the days to close.");
  if (to > today(d)) fail("A day cannot be closed before it happens.");
  if (from < b.startDate) fail("These days are before the business joined.");
  const already = dateRange(from, to).filter((x) => isClosed(d, businessId, x));
  if (already.length) fail(`Already closed: ${already.join(", ")}. A closed day changes only through a correction.`);
  for (const c of activeChannels(b)) {
    const v = counts?.[c.id];
    if (v === undefined || v === null || v === "") fail(`Count every account, including ${c.name}.`);
    nonNegative(v);
  }
  // The reasons are checked too (9 Nov, DAY-E): a known reason, on an open account, on the right side of the
  // difference, adding up to no more than the difference.
  const bookNow = Object.fromEntries(channelBalances(d, businessId, to).map((x) => [x.channel.id, x.balance]));
  const perCh = {};
  for (const r of reasons || []) {
    if (!r.amount) continue;
    wholeAmount(Math.abs(r.amount));
    if (!activeChannels(b).some((c) => c.id === r.channelId)) fail("A reason names an unknown account.");
    const diff = Number(counts[r.channelId] || 0) - (bookNow[r.channelId] || 0);
    const side = diff > 0 ? "higher" : "lower";
    if (!REASONS[side].some((x) => x.kind === r.kind)) fail("Choose a reason from the list for each difference.");
    perCh[r.channelId] = (perCh[r.channelId] || 0) + Math.abs(r.amount);
    if (perCh[r.channelId] > Math.abs(diff) + 0.5) fail("The reasons add up to more than the difference.");
    if (r.kind === "debtor_receipt") {
      const owed = owedFor(d, businessId, "debtor_receipt");
      if (Math.abs(r.amount) > owed + 0.5) fail(`Customers owe you only TZS ${Math.round(owed).toLocaleString("en-US")}; choose another reason for the rest.`);
    }
  }
  // 1. Each guided reason creates its entry (DAY-06), dated the last day being closed.
  for (const r of reasons || []) {
    if (!r.amount) continue;
    d.entries.push({ id: uid("E"), businessId, date: to, kind: r.kind, amount: Math.abs(r.amount), channelId: r.channelId, status: "posted", source: "close", description: r.label, createdAt: nowISO(d), createdBy: by(actor) });
  }
  // 2. Differences within tolerance are accepted (DAY-05); the rest waits in suspense for an authorised
  //    person to resolve, so unexplained money never lands straight in profit (DAY-07, revised 27 Oct).
  const book = {};
  const diffs = {};
  let remainder = 0;
  for (const { channel, balance } of channelBalances(d, businessId, to).filter((x) => !x.channel.archived)) {
    const counted = Number(counts[channel.id]) || 0;
    book[channel.id] = balance;
    const diff = Math.round((counted - balance) * 100) / 100;
    diffs[channel.id] = diff;
    if (Math.abs(diff) <= 0.004) continue;
    const small = Math.abs(diff) <= tolerance(d.settings, balance);
    const kind = small ? (diff > 0 ? "cash_over_small" : "cash_short_small") : diff > 0 ? "cash_over" : "cash_short";
    d.entries.push({ id: uid("E"), businessId, date: to, kind, amount: Math.abs(diff), channelId: channel.id, status: "posted", source: "close", description: "Daily close difference", createdAt: nowISO(d), createdBy: by(actor) });
    if (!small) remainder += diff;
  }
  const closedAt = nowISO(d);
  const close = { id: uid("K"), businessId, date: to, from, to, counts, book, diffs, remainder, open: Math.abs(remainder) > 0.004 ? remainder : 0, resolutions: [], catchUp: Boolean(catchUp), closedAt, onTime: from === to && isOnTime(to, closedAt), by: by(actor) };
  if (close.open) adminNotice(d, { en: "Cash difference to resolve", sw: "Tofauti ya pesa ya kutatua" }, { en: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} (${to})`, sw: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} (${to})` }, "approvals");
  if (Math.abs(remainder) > 0.004 && shouldFlag(d, businessId, remainder, to)) {
    close.flagged = true;
    notify(d, { officerOf: businessId }, { en: "Cash difference to follow up", sw: "Tofauti ya pesa ya kufuatilia" }, { en: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} unexplained (${to})`, sw: `${b.profile.businessName}: TZS ${Math.round(remainder).toLocaleString("en-US")} haielezeki (${to})` }, "officer-close");
  }
  d.closes.push(close);
  audit(d, actor, catchUp ? "Days caught up and closed" : "Day closed", businessId, { after: { from, to, remainder } });
  return close;
}

// Resolve a cash difference held in suspense: an authorised person sends it to the right account, with a reason.
export function resolveSuspense(d, actor, closeId, resolveTo, amount, reason) {
  needRole(actor, "dataAdmin");
  const c = d.closes.find((x) => x.id === closeId);
  const side = c.open > 0 ? "over" : "short";
  if (!SUSPENSE_TARGETS[side].some((t) => t.acc === resolveTo)) throw new Error("Choose where the difference belongs.");
  const amt = Math.min(Math.abs(Number(amount) || 0), Math.abs(c.open));
  if (!amt) throw new Error("Enter an amount.");
  if (!reason || reason.trim().length < 5) throw new Error("A reason is required.");
  d.entries.push({ id: uid("E"), businessId: c.businessId, date: today(d), kind: "suspense_resolve", side, resolveTo, amount: amt, status: "posted", source: "admin", description: `Cash difference of ${c.to} resolved`, reason, closeId, createdAt: nowISO(d), createdBy: by(actor) });
  c.open = Math.round((c.open - Math.sign(c.open) * amt) * 100) / 100;
  c.resolutions.push({ at: nowISO(d), by: by(actor), resolveTo, amount: amt, reason });
  audit(d, actor, "Cash difference resolved", c.businessId, { before: { open: c.open + Math.sign(c.open || 1) * amt }, after: { resolveTo, amount: amt }, reason });
  notify(d, { businessId: c.businessId }, { en: "A cash difference was resolved", sw: "Tofauti ya pesa imetatuliwa" }, { en: reason, sw: reason }, "activity");
}

// Baseline answers are corrected through an audited process; the first answers are kept unchanged (ONB-06 revised).
export function correctBaseline(d, actor, businessId, field, value, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  if (!["bank", "mobile", "borrowed", "sources", "needFinance", "needPurpose", "needAmount"].includes(field)) fail("This answer cannot be corrected here.");
  const b = findBusiness(d, businessId);
  if (!b.baseline.original) b.baseline.original = { ...b.baseline, corrections: undefined, original: undefined };
  const before = b.baseline[field];
  b.baseline[field] = value;
  b.baseline.corrections = [...(b.baseline.corrections || []), { field, before, after: value, at: nowISO(d), by: by(actor), reason }];
  audit(d, actor, "Baseline answer corrected", businessId, { before: { [field]: before }, after: { [field]: value }, reason });
}

// ---------------------------------------------------------------- Records Rating
export function saveRating(d, actor, rating) {
  const b = d.businesses.find((x) => x.id === rating.businessId);
  // Only the business's own officer rates it; admin tiers review but never rate (29 Oct).
  if (actor?.role !== "officer" || b?.officerId !== actor.id) fail("Only the officer assigned to this business can do its Records Rating.");
  for (const [key, def] of Object.entries(CHECKS)) {
    const v = Number(rating.points?.[key]);
    if (!Number.isFinite(v) || v < 0 || v > def.max || !Number.isInteger(v)) fail(`Points for ${def.en} must be a whole number from 0 to ${def.max}.`);
  }
  const total = Object.keys(CHECKS).reduce((t, k) => t + Number(rating.points[k]), 0);
  if (Number(rating.score) !== total) fail("The total must equal the sum of the five checks.");
  const previous = d.ratings.filter((x) => x.businessId === b.id && x.status !== "void");
  const last = previous.map((x) => x.date).sort().pop();
  const gap = d.settings.ratingMinGapDays ?? 25;
  if (last && daysBetween(last, rating.date || today(d)) < gap) fail(`This business was rated on ${last}. One Records Rating per period: the next one is possible after ${addDays(last, gap)}.`);
  const r = { ...rating, status: "final", createdAt: nowISO(d), officer: by(actor) };
  if (b.checkRequest && !b.checkRequest.doneAt) b.checkRequest.doneAt = nowISO(d);
  // The first rating of every business is always re-checked by a second person; later ones about 1 in 10.
  r.recheck = { selected: !previous.length || pickForRecheck(d.settings.recheckRate ?? 0.1), first: !previous.length };
  d.ratings.push(r);
  // Entries the officer confirmed against evidence become supported evidence for credit.
  for (const item of rating.details?.correctness?.items || []) {
    if (item.ok === true) {
      const e = d.entries.find((x) => x.id === item.entryId);
      if (e) { e.verifiedInRating = r.id; e.evidence = "supported"; }
    }
  }
  // RAT-07: errors become correction requests; the rating scores the records as found.
  for (const item of rating.details?.correctness?.items || []) {
    if (item.ok === false) {
      d.changeRequests.unshift({ id: uid("CR"), businessId: r.businessId, type: "correction", entryId: item.entryId, note: item.note || "Officer found an error during the Records Rating check", status: "pending", proposedBy: by(actor), at: nowISO(d), ratingId: r.id });
    }
  }
  // Stock found differs from the books: the officer's count goes to Data Admin as a stock update request.
  const st = rating.details?.stock;
  if (st && Math.abs((Number(st.stockEst) || 0) - (Number(st.bookStock) || 0)) > 0.1 * Math.max(1, Number(st.bookStock) || 0)) {
    d.changeRequests.unshift({ id: uid("CR"), businessId: r.businessId, type: "stock", fields: { estimate: Number(st.stockEst) || 0 }, note: `Stock counted at visit: TZS ${Math.round(Number(st.stockEst) || 0).toLocaleString("en-US")} (books: TZS ${Math.round(Number(st.bookStock) || 0).toLocaleString("en-US")})`, status: "pending", proposedBy: by(actor), at: nowISO(d), ratingId: r.id });
  }
  audit(d, actor, "Records Rating completed", r.businessId, { after: { score: r.score, ratingId: r.id } });
  notify(d, { businessId: r.businessId }, { en: "Your Records Rating is ready", sw: "Kiwango chako cha Kumbukumbu kiko tayari" }, { en: `${r.score}%`, sw: `${r.score}%` }, "rating");
  if (r.recheck.selected) adminNotice(d, { en: "Records Rating picked for re-check", sw: "Kiwango kimechaguliwa kukaguliwa upya" }, { en: r.businessName || r.businessId, sw: r.businessName || r.businessId }, "rating-review");
  if (r.locationFlag) adminNotice(d, { en: "Rating visit far from the business location", sw: "Ukaguzi ulifanyika mbali na eneo la biashara" }, { en: r.businessName || r.businessId, sw: r.businessName || r.businessId }, "rating-review");
}

export function acknowledgeRating(d, actor, ratingId) {
  const r = d.ratings.find((x) => x.id === ratingId);
  if (!r || !ownsBusiness(actor, r.businessId)) fail("Only the business can acknowledge its own rating.");
  r.acknowledgedAt = nowISO(d);
  audit(d, actor, "Records Rating acknowledged", r.businessId, { after: ratingId });
}

export function disputeRating(d, actor, ratingId, reason) {
  const r = d.ratings.find((x) => x.id === ratingId);
  // Only the business, once, within the window, saying why (9 Nov, ADM-A, audit P35).
  if (!r || !ownsBusiness(actor, r.businessId)) fail("Only the business can dispute its own rating.");
  if (r.status !== "final" || r.dispute) fail("This rating was already disputed.");
  if (daysBetween(r.date || today(d), today(d)) > (d.settings.disputeDays ?? 7)) fail(`A rating can be disputed within ${d.settings.disputeDays ?? 7} days.`);
  needReason(reason, 10);
  maxLen(reason, TEXT_MAX.note, "The reason");
  r.status = "disputed";
  r.dispute = { reason, at: nowISO(d), by: by(actor) };
  audit(d, actor, "Records Rating disputed", r.businessId, { reason });
  adminNotice(d, { en: "Records Rating disputed", sw: "Kiwango cha Kumbukumbu kimepingwa" }, { en: reason, sw: reason }, "rating-review");
}

export function decideDispute(d, actor, ratingId, revisedScore, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const r = d.ratings.find((x) => x.id === ratingId);
  if (!r || r.status !== "disputed") fail("This rating is not disputed.");
  const before = r.score;
  if (revisedScore != null && revisedScore !== "") r.score = Math.max(0, Math.min(100, Math.round(Number(revisedScore))));
  r.status = "final";
  r.dispute = { ...r.dispute, decidedAt: nowISO(d), decidedBy: by(actor), decision: reason, before, after: r.score };
  audit(d, actor, "Records Rating dispute decided", r.businessId, { before, after: r.score, reason });
  notify(d, { businessId: r.businessId }, { en: "Decision on your rating dispute", sw: "Uamuzi kuhusu pingamizi la kiwango chako" }, { en: reason, sw: reason }, "rating");
}

export function recordRecheck(d, actor, ratingId, score, note) {
  needRole(actor, "officer");
  const r = d.ratings.find((x) => x.id === ratingId);
  if (!r || !r.recheck?.selected) fail("This rating was not picked for a re-check.");
  if (r.recheck.done) fail("This rating was already re-checked.");
  if (r.officer?.id === actor.id) fail("A re-check must be done by a different person from the original officer.");
  const sc = Number(score);
  if (!Number.isInteger(sc) || sc < 0 || sc > 100) fail("The re-check score must be a whole number from 0 to 100.");
  needReason(note);
  const gap = Math.abs(Number(score) - r.score);
  r.recheck = { ...(r.recheck || {}), selected: true, done: true, score: Number(score), gap, flagged: gap > (d.settings.recheckGapFlag ?? 15), by: by(actor), at: nowISO(d), note };
  audit(d, actor, "Records Rating re-checked", r.businessId, { before: r.score, after: Number(score), reason: note });
}

// ---------------------------------------------------------------- External loans (FIN-02)
export function declareExternalLoan(d, actor, loan) {
  if (!ownsBusiness(actor, loan.businessId)) fail("Only the business declares its own outside loans.");
  if (!String(loan.lender || "").trim()) fail("Enter the lender's name.");
  wholeAmount(loan.balance, "the amount still owed");
  wholeAmount(loan.instalment, "the instalment");
  maxLen(loan.lender, TEXT_MAX.name, "The lender's name");
  // The instalment cannot be more than what is owed (9 Nov, FIN-C).
  if (Number(loan.instalment) > Number(loan.balance)) fail("The instalment cannot be more than the amount still owed.");
  if (loan.remaining !== undefined && loan.remaining !== "" && (!Number.isInteger(Number(loan.remaining)) || Number(loan.remaining) < 1 || Number(loan.remaining) > 600)) fail("Instalments left must be from 1 to 600.");
  if (loan.nextDue && (!validISODate(loan.nextDue) || loan.nextDue < today(d))) fail("The next due date must be today or later.");
  d.externalLoans.push({ ...loan, status: "submitted", submittedBy: by(actor), submittedAt: nowISO(d), revisions: [] });
  audit(d, actor, "External loan declared", loan.businessId, { after: loan.lender });
  adminNotice(d, { en: "External loan to review", sw: "Mkopo wa nje wa kukagua" }, { en: loan.lender, sw: loan.lender }, "approvals");
}

export function reviewExternalLoan(d, actor, id, changes, reason, archive = false) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  if (changes.balance !== undefined) nonNegative(changes.balance);
  if (changes.instalment !== undefined) nonNegative(changes.instalment);
  const x = d.externalLoans.find((l) => l.id === id);
  const before = { ...x, revisions: undefined };
  Object.assign(x, changes);
  x.status = "reviewed";
  if (archive) x.archived = true;
  x.revisions.push({ at: nowISO(d), by: by(actor), before, after: changes, reason, archive });
  audit(d, actor, archive ? "External loan archived" : "External loan reviewed", x.businessId, { before, after: changes, reason });
  notify(d, { businessId: x.businessId }, { en: "Your declared loan was reviewed", sw: "Mkopo uliotaja umekaguliwa" }, { en: reason, sw: reason }, "finance");
}

// ---------------------------------------------------------------- Loans (FIN-01 to FIN-06)
const consented = (b, fiId) => Boolean(b?.consent?.fis?.[fiId]?.granted);
const OPEN_LOAN = ["requested", "offered", "accepted"];
export function requestLoan(d, actor, loan) {
  if (!ownsBusiness(actor, loan.businessId)) fail("Only the business requests its own loans.");
  const b0 = findBusiness(d, loan.businessId);
  wholeAmount(loan.amount, "the amount");
  if (String(loan.purpose || "").trim().length < 3) fail("Say what the loan is for.");
  maxLen(loan.purpose, TEXT_MAX.description, "The purpose");
  // The amount must fit the chosen product (9 Nov, FIN-A).
  // A request always names one lender's product, so its limits apply (P38).
  if (!loan.fiId || !loan.productId) fail("Choose a lender and a loan product.");
  const fi0 = loan.fiId ? d.fis.find((f) => f.id === loan.fiId && f.status === "approved") : null;
  if (loan.fiId && !fi0) fail("Choose an approved lender.");
  const prod = fi0 && loan.productId ? fi0.products.find((x) => x.id === loan.productId && x.active) : null;
  if (loan.productId && !prod) fail("This loan product is no longer offered.");
  if (prod) {
    if (Number(loan.amount) < prod.min || Number(loan.amount) > prod.max) fail(`This product lends from TZS ${Number(prod.min).toLocaleString("en-US")} to TZS ${Number(prod.max).toLocaleString("en-US")}.`);
    if (loan.frequency && !prod.frequencies.includes(loan.frequency)) fail("Choose a repayment frequency this product offers.");
  }
  if (loan.type === "asset") {
    const q = d.quoteRequests.find((x) => x.id === loan.quoteId);
    if (!q || q.requester?.type !== "business" || q.requester.id !== loan.businessId || !["quoted", "accepted"].includes(q.status)) fail("Choose one of your supplier quotes.");
    if (q.quote?.validUntil && q.quote.validUntil < today(d)) fail("This quote has expired. Ask the supplier for a new one.");
  }
  if (!isAdultMain(b0.profile, today(d))) fail("Loans need a main owner aged 18 or older.");
  if (loan.fiId && !consented(b0, loan.fiId)) fail("Allow this lender to see your records first (Profile, Consent).");
  // One open request per lender at a time (29 Oct).
  if (d.loans.some((l) => l.businessId === loan.businessId && OPEN_LOAN.includes(l.status) && (!loan.fiId || !l.fiId || l.fiId === loan.fiId)))
    fail("You already have an open loan request with this lender. Wait for its answer, or withdraw it first.");
  d.loans.push({ ...loan, status: "requested", requestedAt: nowISO(d), history: [{ at: nowISO(d), event: "requested", by: by(actor) }] });
  const b = d.businesses.find((x) => x.id === loan.businessId);
  for (const fi of d.fis.filter((f) => f.status === "approved" && (!loan.fiId || f.id === loan.fiId) && b.consent?.fis?.[f.id]?.granted)) {
    notify(d, { fiId: fi.id }, { en: "New loan request", sw: "Ombi jipya la mkopo" }, { en: `${b.profile.businessName}: TZS ${Number(loan.amount).toLocaleString("en-US")}`, sw: `${b.profile.businessName}: TZS ${Number(loan.amount).toLocaleString("en-US")}` }, "fi-loans");
  }
  audit(d, actor, "Loan requested", loan.businessId, { after: { amount: loan.amount, type: loan.type } });
}

// The business may withdraw a request it no longer needs (9 Nov, FIN-B).
export function withdrawLoan(d, actor, loanId) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!l || !ownsBusiness(actor, l.businessId)) fail("Only the business can withdraw its own request.");
  if (!["requested", "offered"].includes(l.status)) fail("Only a request or an offer not yet accepted can be withdrawn.");
  l.status = "withdrawn";
  l.history.push({ at: nowISO(d), event: "withdrawn", by: by(actor) });
  audit(d, actor, "Loan request withdrawn", l.businessId, { after: l.id });
  if (l.fiId) notify(d, { fiId: l.fiId }, { en: "Loan request withdrawn", sw: "Ombi la mkopo limeondolewa" }, { en: l.id, sw: l.id }, "fi-loans");
}

export function makeOffer(d, actor, loanId, { fiId, product, principal, frequency, instalments, manualReview = null }) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "requested") fail("Only a new loan request can receive an offer.");
  if (actor?.role !== "fi" || (actor.orgId && actor.orgId !== fiId)) fail("Only the lender can make its own offer.");
  if (l.fiId && l.fiId !== fiId) fail("This request was sent to another lender.");
  const b = d.businesses.find((x) => x.id === l.businessId);
  if (!consented(b, fiId)) fail("The business has withdrawn consent. No offer can be made.");
  wholeAmount(principal, "the amount");
  if (!Number.isInteger(Number(instalments)) || Number(instalments) < 1) fail("Choose the number of instalments.");
  if (product && (Number(principal) < (product.min || 0) || Number(principal) > (product.max || Infinity))) fail("The amount is outside this product's limits.");
  const g = gates(d, b, today(d));
  // Automatic eligibility needs a rating of 70+; 50-69 is allowed only with the lender's own recorded review.
  const reviewed = g.needsReview && manualReview && String(manualReview.reason || "").trim().length >= 10;
  if (!g.passed && !reviewed) {
    if (g.needsReview) throw new Error("Records Rating is Okay (50–69): record your own review of this business's records before offering.");
    throw new Error(`No offer possible yet. Not met: ${Object.keys(g.results).filter((k) => g.results[k] !== true).map((k) => GATES[k].en).join("; ")}.`);
  }
  const sc = schedule({ principal, annualRate: product.annualRate, frequency, instalments, feePct: product.feePct, feeFixed: product.feeFixed, start: today(d) });
  if (!offerFits(d, b, sc, frequency, today(d))) throw new Error("The largest instalment does not fit this business's affordability.");
  l.fiId = fiId;
  l.status = "offered";
  l.offeredAt = nowISO(d);
  l.offer = { manualReview: reviewed ? { ...manualReview, by: by(actor), at: nowISO(d) } : null, productId: product.id, productName: product.name, annualRate: product.annualRate, feePct: product.feePct, feeFixed: product.feeFixed, principal, frequency, instalments, rows: sc.rows, fees: sc.fees, totalRepay: sc.totalRepay, costOfCredit: sc.costOfCredit };
  l.history.push({ at: nowISO(d), event: "offered", by: by(actor) });
  audit(d, actor, "Loan offer made", l.businessId, { after: { principal, totalRepay: sc.totalRepay } });
  notify(d, { businessId: l.businessId }, { en: "You have a loan offer", sw: "Una ofa ya mkopo" }, { en: `Total to repay TZS ${Math.round(sc.totalRepay).toLocaleString("en-US")}`, sw: `Jumla ya kurejesha TZS ${Math.round(sc.totalRepay).toLocaleString("en-US")}` }, "finance");
}

export function respondOffer(d, actor, loanId, accept, channelId) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "offered") fail("There is no offer to answer.");
  if (!ownsBusiness(actor, l.businessId)) fail("Only the business can accept or decline its offer.");
  if (accept && l.type !== "asset" && !activeChannels(findBusiness(d, l.businessId)).some((c) => c.id === channelId)) fail("Choose the account to receive the money.");
  l.status = accept ? "accepted" : "declined";
  l.channelId = channelId;
  l.history.push({ at: nowISO(d), event: accept ? "accepted" : "declined", by: by(actor) });
  audit(d, actor, accept ? "Loan offer accepted" : "Loan offer declined", l.businessId);
  notify(d, { fiId: l.fiId }, accept ? { en: "Offer accepted", sw: "Ofa imekubaliwa" } : { en: "Offer declined", sw: "Ofa imekataliwa" }, { en: l.id, sw: l.id }, "fi-loans");
}

export function rejectLoan(d, actor, loanId, reason) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!l || !["requested", "accepted"].includes(l.status)) fail("This request can no longer be rejected.");
  if (actor?.role !== "fi" || (actor.orgId && l.fiId && actor.orgId !== l.fiId)) fail("Only the lender can reject this request.");
  needReason(reason);
  l.status = "rejected";
  l.history.push({ at: nowISO(d), event: "rejected", by: by(actor), reason });
  audit(d, actor, "Loan request rejected", l.businessId, { reason });
  notify(d, { businessId: l.businessId }, { en: "Loan request not approved", sw: "Ombi la mkopo halikuidhinishwa" }, { en: reason, sw: reason }, "finance");
}

export function disburse(d, actor, loanId) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!l || l.status !== "accepted" || !l.offer) fail("Only an accepted offer can be paid out.");
  if (actor?.role !== "fi" || (actor.orgId && actor.orgId !== l.fiId)) fail("Only the lender can pay out this loan.");
  const b = d.businesses.find((x) => x.id === l.businessId);
  // Consent is checked again before any money moves (V11): a withdrawal stops the payout.
  if (!consented(b, l.fiId)) fail("The business has withdrawn consent. Disbursement stopped.");
  const sc = schedule({ principal: l.offer.principal, annualRate: l.offer.annualRate, frequency: l.offer.frequency, instalments: l.offer.instalments, feePct: l.offer.feePct, feeFixed: l.offer.feeFixed, start: today(d) });
  if (!offerFits(d, b, sc, l.offer.frequency, today(d))) throw new Error("This loan no longer fits the business's affordability. Disbursement stopped.");
  const g = gates(d, b, today(d));
  const ratingOk = g.results.rating === true || (g.results.rating === "review" && l.offer.manualReview);
  if (!ratingOk || !g.results.overdue || !g.results.reconciled) throw new Error(`Disbursement stopped. Not met: ${["rating", "overdue", "reconciled"].filter((k) => (k === "rating" ? !ratingOk : g.results[k] !== true)).map((k) => GATES[k].en).join("; ")}.`);
  l.schedule = sc.rows;
  l.frequency = l.offer.frequency;
  l.status = "disbursed";
  l.disbursedAt = nowISO(d);
  const long = l.offer.frequency === "monthly" ? l.offer.instalments > 12 : l.offer.frequency === "weekly" ? l.offer.instalments > 52 : false;
  if (l.type === "asset") {
    d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "asset_financed", amount: l.offer.principal, longTerm: long, status: "posted", source: "loan", loanId, description: `Asset finance ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
    const qr = d.quoteRequests.find((q) => q.id === l.quoteId);
    if (qr) {
      qr.status = "paid";
      qr.history.push({ at: nowISO(d), event: "paid by lender", by: by(actor) });
      const sup = d.suppliers.find((s) => s.id === qr.supplierId);
      if (sup) sup.walletBalance = (sup.walletBalance || 0) + l.offer.principal;
      notify(d, { supplierId: qr.supplierId }, { en: "Payment received from lender", sw: "Malipo yamepokelewa kutoka kwa mkopeshaji" }, { en: "Deliver and confirm delivery", sw: "Peleka na thibitisha kufikisha" }, "supplier-orders");
    }
  } else {
    d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_received", amount: l.offer.principal, longTerm: long, channelId: l.channelId, status: "posted", source: "loan", loanId, description: `Loan ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  }
  const fi = d.fis.find((f) => f.id === l.fiId);
  if (fi) fi.walletBalance = (fi.walletBalance || 0) - l.offer.principal;
  l.history.push({ at: nowISO(d), event: "disbursed", by: by(actor) });
  audit(d, actor, "Loan disbursed", l.businessId, { after: l.offer.principal });
  notify(d, { businessId: l.businessId }, { en: "Loan disbursed", sw: "Mkopo umetolewa" }, { en: `TZS ${Math.round(l.offer.principal).toLocaleString("en-US")}`, sw: `TZS ${Math.round(l.offer.principal).toLocaleString("en-US")}` }, "finance");
}

export function payInstalment(d, actor, loanId, n, channelId) {
  const l = d.loans.find((x) => x.id === loanId);
  if (!ownsBusiness(actor, l.businessId)) fail("Only the business pays its instalments here.");
  const i = l.schedule.find((x) => x.n === n);
  if (i.paidAt) return;
  const next = l.schedule.filter((x) => !x.paidAt).sort((a, b2) => a.n - b2.n)[0];
  if (next && next.n !== n) fail(`Pay instalment ${next.n} first.`);
  const bal = channelBalance(d, l.businessId, channelId, today(d));
  if (bal + 0.5 < i.amount) throw new Error("Not enough money in this account for the instalment.");
  d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_repayment", amount: i.principal, channelId, status: "posted", source: "loan", loanId, description: `Instalment ${n} of ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  if (i.interest + i.fee > 0) d.entries.push({ id: uid("E"), businessId: l.businessId, date: today(d), kind: "loan_interest", amount: i.interest + i.fee, channelId, status: "posted", source: "loan", loanId, description: `Interest and fees, instalment ${n} of ${l.id}`, createdAt: nowISO(d), createdBy: by(actor) });
  i.paidAt = nowISO(d);
  const fi = d.fis.find((f) => f.id === l.fiId);
  if (fi) fi.walletBalance = (fi.walletBalance || 0) + i.amount;
  if (l.schedule.every((x) => x.paidAt)) {
    l.status = "repaid";
    l.history.push({ at: nowISO(d), event: "repaid", by: by(actor) });
  }
  audit(d, actor, "Instalment paid", l.businessId, { after: { loanId, n } });
}

// ---------------------------------------------------------------- Suppliers and quotes
export function requestQuote(d, actor, q) {
  // A business or lender asks an approved supplier for itself only (9 Nov, SUP-B, audit VF-18).
  const own = (q.requester?.type === "business" && ownsBusiness(actor, q.requester.id)) || (q.requester?.type === "fi" && actor?.role === "fi" && actor.orgId === q.requester.id);
  if (!own) fail("You can ask for quotes only for your own business or institution.");
  if (!d.suppliers.some((x) => x.id === q.supplierId && x.status === "approved")) fail("Choose an approved supplier.");
  const qty = Number(q.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) fail("Quantity must be from 1 to 10,000.");
  if (String(q.item || "").trim().length < 3) fail("Describe the item.");
  maxLen(q.item, 120, "The item");
  maxLen(q.note, TEXT_MAX.note, "The note");
  d.quoteRequests.unshift({ ...q, status: "requested", createdAt: nowISO(d), history: [{ at: nowISO(d), event: "requested", by: by(actor) }] });
  notify(d, { supplierId: q.supplierId }, { en: "New quote request", sw: "Ombi jipya la nukuu" }, { en: q.item, sw: q.item }, "supplier-quotes");
}

// Quote steps happen in order (29 Oct). From each status, the steps that may follow it.
const QUOTE_NEXT = {
  requested: ["quoted", "declined"], quoted: ["accepted", "declined"], accepted: ["invoiced", "ordered", "paid", "declined"],
  ordered: ["invoiced", "delivered", "paid"], invoiced: ["paid", "delivered"], paid: ["delivered", "received"], delivered: ["received", "paid"], received: ["paid"], declined: []
};
export function quoteStep(d, actor, id, event, patch = {}) {
  const q = d.quoteRequests.find((x) => x.id === id);
  if (!q) fail("Quote not found.");
  if (!(QUOTE_NEXT[q.status] || []).includes(event)) fail(`A quote that is "${q.status}" cannot be marked "${event}".`);
  // Each step belongs to one side (9 Nov, SUP-A): the supplier quotes, invoices and delivers; the one who asked
  // accepts, orders, pays and confirms receipt; either side may decline before acceptance.
  const isSupplier = actor?.role === "supplier" && actor.orgId === q.supplierId;
  const isRequester = (q.requester?.type === "business" && ownsBusiness(actor, q.requester.id)) || (q.requester?.type === "fi" && actor?.role === "fi" && actor.orgId === q.requester.id);
  const SUPPLIER_STEPS = ["quoted", "invoiced", "delivered"];
  const REQUESTER_STEPS = ["accepted", "ordered", "paid", "received"];
  if (SUPPLIER_STEPS.includes(event) && !isSupplier) fail("Only the supplier can do this step.");
  if (REQUESTER_STEPS.includes(event) && !isRequester) fail("Only the one who asked for the quote can do this step.");
  if (event === "declined" && !isSupplier && !isRequester) fail("Only the supplier or the one who asked can decline.");
  if (event === "accepted" && q.quote?.validUntil && q.quote.validUntil < today(d)) fail("This quote has expired. Ask the supplier for a new one.");
  if (patch.quote?.validUntil && (!validISODate(patch.quote.validUntil) || patch.quote.validUntil < today(d))) fail("Valid-until must be today or later.");
  if (patch.quote) { wholeAmount(patch.quote.total, "the quote total"); if (patch.quote.unitPrice !== undefined) nonNegative(patch.quote.unitPrice); }
  Object.assign(q, patch);
  const status = { quoted: "quoted", accepted: "accepted", ordered: "ordered", invoiced: "invoiced", delivered: "delivered", received: "received", paid: "paid", declined: "declined" }[event];
  if (status) q.status = status;
  q.history.push({ at: nowISO(d), event, by: by(actor) });
  const toRequester = q.requester.type === "business" ? { businessId: q.requester.id } : { fiId: q.requester.id };
  if (["quoted", "invoiced", "delivered"].includes(event)) notify(d, toRequester, { en: `Quote ${event}`, sw: `Nukuu: ${event}` }, { en: q.item, sw: q.item }, "suppliers");
  if (["accepted", "received", "paid"].includes(event)) notify(d, { supplierId: q.supplierId }, { en: `Quote ${event}`, sw: `Nukuu: ${event}` }, { en: q.item, sw: q.item }, "supplier-quotes");
}

// ---------------------------------------------------------------- Messages, queries, quarterly
export function sendMessage(d, actor, { threadKey, title, text, participants }) {
  // The sender must be one of the people in the conversation, or TijaPass staff (9 Nov, ADM-A).
  const inThread = (participants || []).some((p) => (p.userId && p.userId === actor?.id) || (p.businessId && ownsBusiness(actor, p.businessId)) || (p.fiId && actor?.role === "fi" && actor.orgId === p.fiId) || (p.supplierId && actor?.role === "supplier" && actor.orgId === p.supplierId));
  if (!actor || (!inThread && !isStaff(actor))) fail("You are not part of this conversation.");
  if (!String(text || "").trim()) fail("Write a message.");
  maxLen(text, TEXT_MAX.message, "The message");
  d.messages.push({ id: uid("M"), threadKey, title, text, at: nowISO(d), from: by(actor), participants });
  for (const p of participants) if (!(p.userId && p.userId === actor.id)) notify(d, p, { en: "New message", sw: "Ujumbe mpya" }, { en: title || text.slice(0, 60), sw: title || text.slice(0, 60) }, "messages");
}

export function createQuery(d, actor, q) {
  if (!actor) fail("Sign in first.");
  if (q.businessId && !ownsBusiness(actor, q.businessId)) fail("You can ask only about your own business.");
  maxLen(q.topic, TEXT_MAX.note, "The question");
  d.queries.unshift({ ...q, status: "open", createdAt: nowISO(d), by: by(actor) });
  adminNotice(d, { en: "New help query", sw: "Swali jipya la msaada" }, { en: q.topic || "", sw: q.topic || "" }, "admin-queries");
}

export function answerQuery(d, actor, id, answer) {
  needRole(actor, "dataAdmin");
  const q = d.queries.find((x) => x.id === id);
  if (!q) fail("Query not found.");
  if (!String(answer || "").trim()) fail("Write the answer.");
  maxLen(answer, TEXT_MAX.message, "The answer");
  q.status = "answered";
  q.answer = answer;
  q.answeredBy = by(actor);
  q.answeredAt = nowISO(d);
  notify(d, { userId: q.by.id }, { en: "Your question was answered", sw: "Swali lako limejibiwa" }, { en: answer.slice(0, 80), sw: answer.slice(0, 80) }, "help");
}

export function saveQuarterly(d, actor, a) {
  // Only the business answers for itself (audit VF-14).
  if (!ownsBusiness(actor, a.businessId)) fail("Only the business answers its own check-in.");
  if (!["yes", "no"].includes(a.outsideLoan) || !["yes", "no"].includes(a.needFinance)) fail("Answer every question.");
  nonNegative(a.outsideAmount);
  nonNegative(a.needAmount);
  d.quarterly.push({ ...a, at: nowISO(d), by: by(actor) });
  const b = d.businesses.find((x) => x.id === a.businessId);
  b.lastQuarterlyAt = nowISO(d);
}

// ---------------------------------------------------------------- Packages, payments and billing
export function payPackage(d, actor, { ownerId, packageId, method, outcome, reference }) {
  if (!ownsBusiness(actor, ownerId)) fail("Only the business pays for its own package.");
  const pkg = d.packages.business.find((p) => p.id === packageId);
  if (!pkg || !pkg.price) fail("Choose a paid package.");
  if (reference && d.payments.some((p) => p.reference === reference && p.status === "success")) return "duplicate";
  d.payments.push({ id: uid("PAY"), ownerId, packageId, amount: pkg.price, method, reference, status: outcome, at: nowISO(d), by: by(actor) });
  if (outcome !== "success") return "failed";
  const days = { day: 1, week: 7, month: 30 }[pkg.period] || 30;
  // A new package starts the day after the current one ends, so no day is paid twice (9 Nov, PKG-A).
  const lastEnd = d.subscriptions.filter((x) => x.ownerId === ownerId && x.status === "active" && x.to >= today(d)).map((x) => x.to).sort().pop();
  const from = lastEnd ? addDays(lastEnd, 1) : today(d);
  d.subscriptions.push({ id: uid("SUB"), ownerId, packageId, from, to: addDays(from, days - 1), status: "active" });
  audit(d, actor, "Package paid", ownerId, { after: packageId });
  return "success";
}

export function setFiPackage(d, actor, fiId, packageId, billing) {
  if (!((actor?.role === "fi" && actor.orgId === fiId) || RANKS[actor?.role] >= RANKS.systemAdmin)) fail("Only the lender or System Admin can change its package.");
  if (!d.packages.fi.some((p) => p.id === packageId) || !["monthly", "annual"].includes(billing)) fail("Choose a package and billing.");
  const fi = d.fis.find((f) => f.id === fiId);
  const before = { packageId: fi.packageId, billing: fi.billing };
  fi.packageId = packageId;
  fi.billing = billing;
  audit(d, actor, "FI package changed", fiId, { before, after: { packageId, billing } });
}

export function logAssessment(d, actor, fiId, businessId) {
  if (actor?.role !== "fi" || actor.orgId !== fiId) fail("Only the lender itself opens an assessment.");
  if (!d.businesses.find((b) => b.id === businessId)?.consent?.fis?.[fiId]?.granted) fail("This business has not given you consent.");
  const day = today(d);
  if (!needsAssessment(d, fiId, businessId, day)) return false;
  const fi = d.fis.find((f) => f.id === fiId);
  d.assessments.push({ id: uid("AS"), fiId, businessId, date: day, at: nowISO(d), fee: assessmentFee(d, fi, day), by: by(actor) });
  audit(d, actor, "Assessment opened (billed)", businessId, { after: fiId });
  return true;
}

// ---------------------------------------------------------------- Organisations
// One sign-in email belongs to one account across TijaPass (9 Nov, ORG-A).
const loginTaken = (d, email) => d.users.some((u) => String(u.login || "").toLowerCase() === String(email || "").trim().toLowerCase());
export function registerOrg(d, actor, kind, org) {
  if (!["fi", "supplier"].includes(kind)) fail("Choose lender or supplier.");
  const list = kind === "fi" ? d.fis : d.suppliers;
  if (String(org.name || "").trim().length < 3) fail("Enter the organisation's name.");
  maxLen(org.name, 80, "The name");
  if (String(org.licence || "").trim().length < 3) fail("Enter the licence or registration number.");
  if (list.some((o) => String(o.licence || "").trim().toLowerCase() === String(org.licence).trim().toLowerCase())) fail("This licence or registration number is already registered.");
  if (org.phone !== undefined && !validPhone(org.phone)) fail("Enter a valid phone number, e.g. 0712 345 678.");
  if (!validEmail(org.email)) fail("Enter a valid sign-in email.");
  if (loginTaken(d, org.email)) fail("This email is already used by another TijaPass account.");
  if (String(org.password || "").length < 8) fail("The password needs at least 8 characters.");
  list.push({ ...org, password: undefined, email: org.email.trim().toLowerCase(), status: "pending", joinedAt: today(d), walletBalance: 0, products: [], ...(kind === "fi" ? { packageId: "starter", billing: "monthly", sponsorTier: "standard" } : {}) });
  // Not active until approved (9 Nov, ORG-B): sign-in says "waiting for approval".
  d.users.push({ id: uid("U"), role: kind, name: org.contactName || org.name, login: org.email.trim().toLowerCase(), password: org.password, orgId: org.id, active: false, status: "pending" });
  adminNotice(d, { en: `New ${kind === "fi" ? "FI" : "supplier"} to approve`, sw: `${kind === "fi" ? "Taasisi" : "Msambazaji"} mpya wa kuidhinisha` }, { en: org.name, sw: org.name }, "approvals");
}

// Lenders and suppliers need two people (29 Oct): Data Admin checks the licence, then a System Admin approves.
export function checkOrg(d, actor, kind, id, licenceOk, reason) {
  needRole(actor, "dataAdmin");
  needReason(reason);
  const o = (kind === "fi" ? d.fis : d.suppliers).find((x) => x.id === id);
  o.check = { by: by(actor), at: nowISO(d), licenceOk: Boolean(licenceOk), reason };
  if (!licenceOk) o.status = "declined";
  audit(d, actor, `${kind === "fi" ? "FI" : "Supplier"} licence ${licenceOk ? "checked" : "not confirmed"}`, id, { reason });
  if (licenceOk) notify(d, { role: "systemAdmin" }, { en: `${kind === "fi" ? "Lender" : "Supplier"} ready for approval`, sw: `${kind === "fi" ? "Mkopeshaji" : "Msambazaji"} yuko tayari kuidhinishwa` }, { en: o.name, sw: o.name }, "users");
}
export function decideOrg(d, actor, kind, id, approve, reason) {
  const list = kind === "fi" ? d.fis : d.suppliers;
  const o = list.find((x) => x.id === id);
  needReason(reason);
  if (approve) {
    needRole(actor, "systemAdmin");
    if (!o.check?.licenceOk) fail("Data Admin must check the licence first.");
    if (o.check.by?.id === actor.id) fail("The person who checked the licence cannot also approve.");
  } else needRole(actor, "dataAdmin");
  o.status = approve ? "approved" : "declined";
  o.decidedBy = by(actor);
  for (const u of d.users.filter((x) => x.orgId === id && x.role === kind)) {
    if (approve) { u.active = true; u.status = "active"; } else { u.active = false; u.status = "declined"; }
  }
  audit(d, actor, `${kind === "fi" ? "FI" : "Supplier"} ${approve ? "approved" : "declined"}`, id, { reason });
}

// ---------------------------------------------------------------- Lender products (9 Nov, FIN-F)
export function saveProduct(d, actor, fiId, p) {
  if (actor?.role !== "fi" || actor.orgId !== fiId) fail("Only the lender edits its own products.");
  const fi = d.fis.find((f) => f.id === fiId);
  if (!fi) fail("Lender not found.");
  const name = String(p.name || "").trim();
  if (name.length < 3) fail("Enter the product name.");
  maxLen(name, TEXT_MAX.name, "The name");
  const n = (v) => Number(v);
  const rate = n(p.annualRate);
  const fee = n(p.feePct);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) fail("The interest rate must be from 0% to 100% a year.");
  if (!Number.isFinite(fee) || fee < 0 || fee > 20) fail("The fee must be from 0% to 20% of the amount.");
  nonNegative(p.feeFixed);
  if (!Number.isInteger(n(p.min)) || n(p.min) < 10000) fail("The smallest amount must be at least TZS 10,000.");
  wholeAmount(p.max, "the largest amount");
  if (n(p.max) < n(p.min)) fail("The largest amount cannot be below the smallest.");
  if (!Number.isInteger(n(p.maxInstalments)) || n(p.maxInstalments) < 1 || n(p.maxInstalments) > 60) fail("Instalments must be from 1 to 60.");
  if (!Array.isArray(p.frequencies) || !p.frequencies.length) fail("Choose at least one repayment frequency.");
  const clean = { id: p.id || uid("P"), name, type: p.type, annualRate: rate, feePct: fee, feeFixed: n(p.feeFixed) || 0, min: n(p.min), max: n(p.max), frequencies: p.frequencies, maxInstalments: n(p.maxInstalments), active: Boolean(p.active) };
  if (p.id && fi.products.some((x) => x.id === p.id)) fi.products = fi.products.map((x) => (x.id === p.id ? clean : x));
  else fi.products.push(clean);
  audit(d, actor, "Loan product saved", fiId, { after: clean });
  return clean.id;
}

// ---------------------------------------------------------------- Settings and prices (9 Nov, D6: maker-checker)
// A System Admin proposes; a different Super user approves. Credit, rating and privacy rules never change on one
// person's say.
export const SETTING_RANGES = {
  ratingAutoMin: [0, 100], ratingReviewMin: [0, 100], reviewFloor: [0, MAX_AMOUNT], minCellSize: [3, 50], closeToleranceAbs: [0, 1000000], closeTolerancePct: [0, 10],
  differenceFlagLevel: [0, MAX_AMOUNT], duplicateWindowMin: [1, 1440], unusualFactor: [1, 100], unusualFloor: [0, MAX_AMOUNT], disputeDays: [1, 60], ratingOverdueDays: [1, 365],
  firstCheckDays: [1, 365], recheckRate: [0, 1], recheckGapFlag: [0, 100], visitDistanceFlagM: [50, 100000], minGroupSize: [1, 1000], activeMinDays: [1, 30], youthMaxAge: [18, 60],
  qualifyScore: [0, 100], cashBuffer: [0, 1], quarterlyDays: [30, 365], ratingMinGapDays: [1, 365], idleMinutes: [0, 240]
};
export function settingsProblems(s) {
  const out = [];
  for (const [k, [lo, hi]] of Object.entries(SETTING_RANGES)) {
    if (s[k] === undefined) continue;
    const v = s[k];
    if (v === "" || v === null || !Number.isFinite(Number(v)) || Number(v) < lo || Number(v) > hi) out.push(`${k} must be from ${lo} to ${hi}`);
  }
  if (Number(s.ratingReviewMin) > Number(s.ratingAutoMin)) out.push("the review level cannot be above the automatic level");
  for (const set of ["first", "repeat"]) {
    const w = s.scoreWeights?.[set] || {};
    const total = Object.values(w).reduce((t, v) => t + Number(v || 0), 0);
    if (Object.values(w).some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) out.push(`${set} weights must be 0 or more`);
    if (Math.round(total) !== 100) out.push(`${set === "first" ? "first-loan" : "repeat-loan"} weights must add up to 100 (now ${total})`);
  }
  for (const [k, v] of Object.entries(s.ratingFrequency || {})) if (!Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 12) out.push(`rating frequency for ${k} must be 1 to 12 months`);
  return out;
}
export function proposeConfig(d, actor, kind, value, reason) {
  needRole(actor, "systemAdmin");
  needReason(reason);
  if (!["settings", "prices"].includes(kind)) fail("Unknown change.");
  if (kind === "settings") {
    const p = settingsProblems(value);
    if (p.length) fail(`Check the settings: ${p.join("; ")}.`);
  } else {
    for (const pk of [...(value.business || []), ...(value.fi || [])]) for (const k of ["price", "monthly", "perAssessment"]) if (pk[k] !== undefined) nonNegative(pk[k]);
    for (const k of ["disbursementPct", "collectionPct"]) if (value.fees?.[k] !== undefined && (Number(value.fees[k]) < 0 || Number(value.fees[k]) > 10)) fail("Lender fees must be from 0% to 10%.");
  }
  d.pendingConfig = (d.pendingConfig || []).filter((x) => x.kind !== kind);
  d.pendingConfig.push({ id: uid("CFG"), kind, value, reason, by: by(actor), at: nowISO(d) });
  audit(d, actor, kind === "settings" ? "Settings change proposed" : "Price change proposed", kind, { reason });
  notify(d, { role: "super" }, { en: kind === "settings" ? "Settings change to approve" : "Price change to approve", sw: kind === "settings" ? "Mabadiliko ya mipangilio ya kuidhinisha" : "Mabadiliko ya bei ya kuidhinisha" }, { en: reason, sw: reason }, kind === "settings" ? "settings" : "admin-packages");
}
export function decideConfig(d, actor, id, approve, reason) {
  if (actor?.role !== "super") fail("A Super user approves settings and price changes.");
  needReason(reason);
  const c = (d.pendingConfig || []).find((x) => x.id === id);
  if (!c) fail("Nothing waiting for approval.");
  if (c.by?.id === actor.id) fail("The person who proposed this cannot approve it.");
  if (approve) {
    if (c.kind === "settings") {
      const before = d.settings;
      d.settings = { ...d.settings, ...c.value };
      audit(d, actor, "Settings changed", "settings", { before, after: c.value, reason: `${c.reason} / approved: ${reason}` });
    } else {
      const { fees, ...packages } = c.value;
      const before = { packages: d.packages, fees: d.settings.fiFees };
      d.packages = { ...d.packages, ...packages };
      if (fees) d.settings.fiFees = fees;
      audit(d, actor, "Packages and prices changed", "packages", { before, after: c.value, reason: `${c.reason} / approved: ${reason}` });
    }
  } else audit(d, actor, `${c.kind === "settings" ? "Settings" : "Price"} change declined`, c.kind, { reason });
  d.pendingConfig = d.pendingConfig.filter((x) => x.id !== id);
}

// ---------------------------------------------------------------- Staff accounts (maker-checker, 29 Oct)
// A System Admin proposes; a Super user approves. System Admin and Super user accounts need two approvers.
const POWERFUL = ["systemAdmin", "super"];
export function proposeStaff(d, actor, { id, role, name, login, password, orgName }) {
  needRole(actor, "systemAdmin");
  if (!STAFF_ROLES_ALL.includes(role) && role !== "reports") fail("Choose a role.");
  if (String(name || "").trim().length < 3) fail("Enter the person's name.");
  if (!validEmail(login)) fail("Enter a valid sign-in email.");
  if (String(password || "").length < 8) fail("The password needs at least 8 characters.");
  if (loginTaken(d, login)) fail("This email is already used.");
  d.users.push({ id, role, name: name.trim(), login: login.trim().toLowerCase(), password, orgName, active: false, status: "pending", proposedBy: by(actor), approvals: [], needs: POWERFUL.includes(role) ? 2 : 1 });
  audit(d, actor, "Staff account proposed", id, { after: { role, name } });
  notify(d, { role: "super" }, { en: "Staff account to approve", sw: "Akaunti ya mfanyakazi ya kuidhinisha" }, { en: `${name} (${role})`, sw: `${name} (${role})` }, "users");
}
export function approveStaff(d, actor, userId, reason) {
  const u = d.users.find((x) => x.id === userId);
  const target = u.status === "pending" ? u.role : u.pendingRole;
  if (!target) fail("Nothing to approve for this account.");
  // Super users approve; a System Admin may give the second approval for a powerful role.
  if (!(actor?.role === "super" || (actor?.role === "systemAdmin" && u.approvals?.length))) fail("A Super user must approve first.");
  if (u.proposedBy?.id === actor.id) fail("The person who proposed this cannot approve it.");
  if (u.id === actor.id) fail("You cannot approve your own account.");
  if ((u.approvals || []).some((a) => a.id === actor.id)) fail("You already approved this. A second person must approve.");
  needReason(reason);
  u.approvals = [...(u.approvals || []), { ...by(actor), at: nowISO(d), reason }];
  if (u.approvals.length >= (u.needs || 1)) {
    if (u.status === "pending") { u.status = "active"; u.active = true; } else { u.role = u.pendingRole; u.pendingRole = null; }
    audit(d, actor, "Staff account approved", userId, { after: u.role, reason });
  } else audit(d, actor, "Staff account: first approval", userId, { reason });
}
export function proposeRoleChange(d, actor, userId, role, reason) {
  needRole(actor, "systemAdmin");
  needReason(reason);
  const u = d.users.find((x) => x.id === userId);
  // Only staff accounts, and only to staff roles (9 Nov, ADM-B).
  if (!u || ![...STAFF_ROLES_ALL, "reports"].includes(u.role)) fail("Only TijaPass staff accounts can change role.");
  if (![...STAFF_ROLES_ALL, "reports"].includes(role) || role === u.role) fail("Choose a different staff role.");
  if (u.id === actor.id) fail("You cannot change your own role.");
  u.pendingRole = role;
  u.proposedBy = by(actor);
  u.approvals = [];
  u.needs = POWERFUL.includes(role) ? 2 : 1;
  audit(d, actor, "Role change proposed", userId, { before: u.role, after: role, reason });
}

// ---------------------------------------------------------------- Test tools (web MVP only)
// Moves a business's start date back and fills it with realistic sample activity and daily closes,
// so ratings, scoring and reports can be tested without waiting weeks.
export function generateSampleActivity(d, actor, businessId, days = 60, onTimeShare = 0.9) {
  const b = d.businesses.find((x) => x.id === businessId);
  const end = addDays(today(d), -1);
  const start = addDays(today(d), -days);
  b.startDate = start;
  if (b.opening) b.opening.date = start;
  // Earlier entries are replaced; daily-close differences and their resolutions go with the closes they belong to.
  d.entries = d.entries.filter((e) => !(e.businessId === businessId && (e.date < today(d) || e.source === "close" || e.kind === "suspense_resolve")));
  d.closes = d.closes.filter((c) => c.businessId !== businessId);
  const rnd = seeded(`${businessId}-${days}`);
  const cash = b.channels.find((c) => c.type === "cash") || b.channels[0];
  const mobile = b.channels.find((c) => c.type === "mobile") || cash;
  const mk = (date, kind, amount, ch, desc) => d.entries.push({ id: uid("E"), businessId, date, kind, amount: Math.round(amount / 100) * 100, channelId: ch.id, status: "posted", source: "typed", description: desc, createdAt: `${date}T${String(8 + Math.floor(rnd() * 9)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00`, createdBy: by(actor), sample: true });
  for (const date of dateRange(start, end)) {
    const sales = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < sales; i++) mk(date, "sale_cash", 5000 + rnd() * 30000, rnd() < 0.7 ? cash : mobile, "Nimeuza bidhaa");
    if (rnd() < 0.5) mk(date, "stock_cash", 20000 + rnd() * 60000, cash, "Nimenunua mzigo");
    if (rnd() < 0.3) mk(date, "transport", 2000 + rnd() * 5000, cash, "Nauli");
    if (rnd() < 0.15) mk(date, "drawings", 5000 + rnd() * 10000, cash, "Matumizi ya nyumbani");
    if (date.endsWith("-01")) mk(date, "rent", 60000, mobile, "Kodi ya pango");
    if (rnd() < onTimeShare) {
      const counts = {};
      for (const { channel, balance } of channelBalances(d, businessId, date)) counts[channel.id] = Math.max(0, balance);
      d.closes.push({ id: uid("K"), businessId, date, from: date, to: date, counts, book: counts, diffs: {}, remainder: 0, closedAt: `${date}T18:00:00`, onTime: true, sample: true });
    } else {
      d.closes.push({ id: uid("K"), businessId, date, from: date, to: date, counts: {}, book: {}, diffs: {}, remainder: 0, closedAt: `${addDays(date, 1)}T11:00:00`, onTime: false, sample: true });
    }
  }
  audit(d, actor, "Test tool: sample activity generated", businessId, { after: { days } });
}
