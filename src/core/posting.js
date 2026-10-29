// Posting rules (REC-07, REC-08): entries post at once unless there is a real duplicate or a serious conflict.
import { channelBalance } from "./accounting.js";
import { KINDS } from "./kinds.js";
import { addDays, median } from "./util.js";

export const HOLD_REASONS = {
  duplicate: { en: "Looks like a repeat of an entry already recorded (same amount, same payer and reference or time)", sw: "Inaonekana kurudia muamala ulioandikwa tayari (kiasi, mlipaji na kumbukumbu au muda ni sawa)" },
  direction: { en: "The description says the opposite of money in or out", sw: "Maelezo yanasema kinyume cha pesa kuingia au kutoka" },
  unusual: { en: "The amount is far above this business's usual amounts", sw: "Kiasi ni kikubwa mno kuliko kawaida ya biashara hii" },
  overdraw: { en: "More money goes out than this account holds", sw: "Pesa inayotoka ni zaidi ya iliyopo kwenye akaunti hii" },
  closedDay: { en: "This day was already closed and counted, so the entry goes to TijaPass Admin as a correction", sw: "Siku hii ilishafungwa na kuhesabiwa, hivyo muamala unakwenda kwa TijaPass Admin kama marekebisho" }
};

const norm = (s) => String(s || "").trim().toLowerCase();

export function findDuplicate(state, entry) {
  const windowMin = state.settings.duplicateWindowMin ?? 10;
  const payer = norm(entry.payer);
  const ref = norm(entry.reference);
  // A transaction reference (M-Pesa or bank code) is unique: the same one twice is a duplicate, payer or not (V11).
  if (ref.length >= 4) {
    const same = (state.entries || []).find((e) => e.businessId === entry.businessId && e.id !== entry.id && e.status !== "declined" && !e.contra && !e.reversedBy && norm(e.reference) === ref);
    if (same) return same;
  }
  if (!payer) return null; // without a payer two equal amounts are normal (REC-07)
  return (state.entries || []).find((e) => {
    if (e.businessId !== entry.businessId || e.id === entry.id || e.status === "declined") return false;
    if (Number(e.amount) !== Number(entry.amount) || norm(e.payer) !== payer || e.kind !== entry.kind) return false;
    if (ref && norm(e.reference) === ref) return true;
    const dt = Math.abs(new Date(e.createdAt) - new Date(entry.createdAt)) / 60000;
    return e.date === entry.date && dt <= windowMin;
  }) || null;
}

export function isUnusual(state, entry) {
  const flow = KINDS[entry.kind]?.flow;
  if (flow !== "in" && flow !== "out") return false;
  const since = addDays(entry.date, -60);
  const history = (state.entries || [])
    .filter((e) => e.businessId === entry.businessId && e.status === "posted" && e.date >= since && KINDS[e.kind]?.flow === flow)
    .map((e) => Number(e.amount));
  if (history.length < 10) return false;
  const factor = state.settings.unusualFactor ?? 5;
  const floor = state.settings.unusualFloor ?? 100000;
  return Number(entry.amount) > Math.max(floor, factor * median(history));
}

export function wouldOverdraw(state, entry) {
  const flow = KINDS[entry.kind]?.flow;
  if (flow !== "out" && flow !== "transfer") return false;
  const bal = channelBalance(state, entry.businessId, entry.channelId, entry.date);
  return Number(entry.amount) > bal + 0.5;
}

// Returns { action: "post" | "hold", reasons: [codes] }.
export function evaluateEntry(state, entry, { directionConflict = false, closedDay = false } = {}) {
  const reasons = [];
  if (closedDay) reasons.push("closedDay");
  if (findDuplicate(state, entry)) reasons.push("duplicate");
  if (directionConflict) reasons.push("direction");
  if (isUnusual(state, entry)) reasons.push("unusual");
  if (wouldOverdraw(state, entry)) reasons.push("overdraw");
  return { action: reasons.length ? "hold" : "post", reasons };
}
