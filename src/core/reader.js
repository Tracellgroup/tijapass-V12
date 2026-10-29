// Rules-based reader for entry descriptions (REC-03 fallback when no AI key is configured).
// Reads Kiswahili and English, including amounts written in words ("elfu ishirini", "laki mbili na elfu hamsini").
import { KINDS } from "./kinds.js";

const SW_UNITS = { sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };
const EN_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const MULT = { mia: 100, hundred: 100, elfu: 1000, thousand: 1000, laki: 100000, milioni: 1000000, million: 1000000 };

const normalise = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9.,/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Parse a written number starting at token i. Returns { value, next } or null.
function readSmall(tokens, i) {
  let v = null;
  let j = i;
  const unit = (t) => (t in SW_UNITS ? SW_UNITS[t] : t in EN_UNITS ? EN_UNITS[t] : /^\d+$/.test(t) ? Number(t) : null);
  const first = unit(tokens[j]);
  if (first == null) return null;
  v = first;
  j++;
  // "ishirini na tano" (25), "twenty five"
  while (j < tokens.length) {
    if ((tokens[j] === "na" || tokens[j] === "and") && unit(tokens[j + 1]) != null && !(tokens[j + 1] in MULT) && unit(tokens[j + 1]) < 10 && v >= 10 && v % 10 === 0) {
      v += unit(tokens[j + 1]);
      j += 2;
    } else if (unit(tokens[j]) != null && unit(tokens[j]) < 10 && v >= 20 && v % 10 === 0 && tokens[j] in EN_UNITS) {
      v += unit(tokens[j]);
      j++;
    } else break;
  }
  return { value: v, next: j };
}

// A number below 1,000 in Kiswahili order: "mia tano" (500), "mia mbili na hamsini" (250), "ishirini na tano" (25).
function readGroup(tokens, j) {
  if (tokens[j] === "mia") {
    const r = readSmall(tokens, j + 1);
    if (!r) return null;
    let v = 100 * r.value;
    let k = r.next;
    if (tokens[k] === "na" && !(tokens[k + 1] in MULT)) {
      const s = readSmall(tokens, k + 1);
      if (s && s.value < 100) {
        v += s.value;
        k = s.next;
      }
    }
    return { value: v, next: k };
  }
  return readSmall(tokens, j);
}

export function wordsToNumber(text) {
  const tokens = normalise(text).split(" ");
  let best = null;
  for (let i = 0; i < tokens.length; i++) {
    let total = 0;
    let j = i;
    let matched = false;
    while (j < tokens.length) {
      const t = tokens[j];
      const big = t in MULT && MULT[t] > 100 ? readGroup(tokens, j + 1) : null;
      if (big) {
        // Kiswahili order, multiplier first: "elfu ishirini" = 20,000; "elfu mia tano" = 500,000
        total += MULT[t] * big.value;
        j = big.next;
        matched = true;
        continue;
      }
      const grp = readGroup(tokens, j);
      if (grp && tokens[grp.next] in MULT) {
        // English order, multiplier after: "twenty thousand", "two hundred thousand"
        let chunk = grp.value;
        let k = grp.next;
        while (tokens[k] in MULT) {
          chunk *= MULT[tokens[k]];
          k++;
        }
        total += chunk;
        j = k;
        matched = true;
      } else if (grp && t === "mia") {
        total += grp.value;
        j = grp.next;
        matched = true;
      } else if ((t === "na" || t === "and") && matched) {
        j++;
      } else break;
    }
    if (matched && total > 0 && (best == null || total > best)) best = total;
  }
  return best;
}

export function parseAmount(text) {
  const s = normalise(text).replace(/\/=/g, "");
  // 20k, 1.5m
  const km = s.match(/(\d+(?:\.\d+)?)\s?(k|m)\b/);
  if (km) return Math.round(Number(km[1]) * (km[2] === "k" ? 1000 : 1000000));
  // 20,000 or 20000 (ignore 4-digit years next to dates)
  const nums = [...s.matchAll(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
  const wordVal = wordsToNumber(s);
  const digitVal = nums.length ? Math.max(...nums) : null;
  if (digitVal && wordVal) return Math.max(digitVal, wordVal);
  return digitVal || wordVal || null;
}

const KEYWORDS = {
  sale_cash: ["nimeuza", "niliuza", "nimeuzwa", "mauzo", "kuuza", "uza", "sold", "sale", "sales", "sell", "customer payment", "payment from", "malipo ya mteja", "till payment"],
  sale_credit: ["kwa mkopo", "atalipa baadaye", "on credit", "will pay later", "kopesha", "nimemkopesha"],
  debtor_receipt: ["amelipa deni", "amelipa deni lake", "alikuwa anadaiwa", "paid what they owed", "debtor", "deni lake", "owed me", "mdaiwa"],
  stock_cash: ["nimenunua bidhaa", "nimenunua mzigo", "mzigo", "bidhaa za kuuza", "bought stock", "stock", "mboga za kuuza", "nimenunua", "to supplier", "wholesale", "jumla"],
  stock_credit: ["nimekopa bidhaa", "bidhaa kwa mkopo", "stock on credit", "bought on credit", "nitamlipa baadaye"],
  supplier_payment: ["nimemlipa msambazaji", "deni la msambazaji", "paid supplier", "paid a supplier", "supplier i owed", "msambazaji"],
  rent: ["kodi ya pango", "pango", "kodi ya fremu", "fremu", "rent"],
  utilities: ["umeme", "luku", "maji", "electricity", "water bill", "tanesco", "dawasa"],
  transport: ["usafiri", "nauli", "bodaboda", "boda", "daladala", "bajaji", "transport", "fare", "taxi"],
  wages: ["mshahara", "ujira", "kibarua", "mfanyakazi", "wages", "salary", "worker"],
  other_expense: ["gharama", "nimelipia", "ada", "leseni", "kodi tra", "expense", "cost", "fee", "licence", "license"],
  equipment: ["friji", "jokofu", "kifaa", "samani", "meza", "kiti", "mashine", "equipment", "furniture", "fridge", "machine", "table"],
  drawings: ["nyumbani", "matumizi binafsi", "familia yangu", "ada ya shule", "chakula cha nyumbani", "home use", "personal", "family use", "school fees"],
  capital: ["pesa yangu binafsi", "nimeongeza mtaji", "mtaji", "own money", "my own money", "added capital", "capital"],
  group_contribution: ["nimechangia", "mchango wa mchezo", "mchezo", "upatu", "vikoba", "vicoba", "kikundi", "contribution", "paid into"],
  group_payout: ["mgao", "nimepokea mchezo", "zamu yangu", "payout", "my turn"],
  loan_received: ["nimekopa", "mkopo nimepokea", "nimepewa mkopo", "borrowed", "loan received", "got a loan"],
  loan_repayment: ["nimelipa mkopo", "rejesho", "marejesho", "repaid", "repayment", "loan payment"],
  group_loan_received: ["mkopo wa vikoba", "mkopo wa kikundi", "nimekopa vikoba", "nimekopa kikundi", "group loan"],
  group_loan_repayment: ["nimerejesha mkopo wa kikundi", "rejesho la vikoba", "repaid group loan", "repaid my group loan"],
  other_income: ["nimepokea", "zawadi", "mapato mengine", "other income", "received", "gift"],
  transfer: ["nimehamisha", "nimeweka benki", "nimetoa benki", "nimetoa m-pesa", "nimeweka m-pesa", "moved money", "transfer", "deposited", "withdrew", "withdrawal", "wakala", "agent", "cash deposit"]
};

const CHANNEL_WORDS = {
  cash: ["cash", "taslimu", "keshi", "mkononi", "kash"],
  mobile: ["m-pesa", "mpesa", "tigo", "mixx", "airtel", "halopesa", "halo pesa", "simu", "mobile", "lipa namba"],
  bank: ["benki", "bank", "crdb", "nmb", "nbc", "akaunti"]
};

const IN_WORDS = ["nimeuza", "nimepokea", "nimelipwa", "amelipa", "mgao", "nimekopa", "sold", "received", "got paid", "paid me", "borrowed"];
const OUT_WORDS = ["nimenunua", "nimelipa", "nimelipia", "nimetoa", "nimechangia", "nimechukua", "bought", "paid", "spent", "gave"];

function hits(text, words) {
  let n = 0;
  for (const w of words) if (text.includes(w)) n += w.includes(" ") ? 2 : 1;
  return n;
}

export function channelHint(text) {
  const t = normalise(text);
  let best = null;
  let bestN = 0;
  for (const [type, words] of Object.entries(CHANNEL_WORDS)) {
    const n = hits(t, words);
    if (n > bestN) {
      best = type;
      bestN = n;
    }
  }
  return best;
}

export function directionHint(text) {
  const t = normalise(text);
  const i = hits(t, IN_WORDS);
  const o = hits(t, OUT_WORDS);
  if (i > o) return "in";
  if (o > i) return "out";
  return null;
}

// Returns { kind, alternatives, amount, channelType, confidence, conflict, engine: "rules" }.
export function readDescription(text, direction = null) {
  const t = normalise(text);
  const scores = Object.entries(KEYWORDS)
    .map(([kind, words]) => ({ kind, n: hits(t, words) }))
    .filter((x) => x.n > 0);
  // Multi-word, more specific phrases win over generic ones.
  const specificity = { group_loan_received: 3, group_loan_repayment: 3, debtor_receipt: 2, sale_credit: 2, stock_credit: 2, supplier_payment: 2, loan_repayment: 1, drawings: 1 };
  scores.forEach((s) => (s.n += (specificity[s.kind] || 0) * (s.n > 0 ? 1 : 0)));
  // Respect the direction the user chose, when a kind needs one.
  const fits = (kind) => {
    const f = KINDS[kind].flow;
    if (!direction) return true;
    if (f === "none" || f === "transfer") return true;
    return f === direction;
  };
  scores.sort((a, b) => b.n - a.n);
  const ranked = scores.filter((s) => fits(s.kind));
  const textDir = directionHint(t);
  // When the words point the other way, keep the best overall reading and flag the conflict (REC-08).
  const top = ranked[0] || (direction && textDir && textDir !== direction ? scores[0] : undefined);
  const conflict = Boolean(direction && textDir && textDir !== direction && !(top && ["transfer", "sale_credit", "stock_credit"].includes(top.kind)));
  const amount = parseAmount(text);
  const channelType = channelHint(text);
  if (!top) {
    return { kind: null, alternatives: defaultAlternatives(direction), amount, channelType, confidence: 0, conflict, engine: "rules" };
  }
  const second = ranked[1]?.n || 0;
  const confidence = Math.min(0.95, 0.45 + 0.15 * top.n - 0.1 * second);
  const alternatives = ranked.slice(1, 4).map((s) => s.kind);
  for (const k of defaultAlternatives(direction)) if (alternatives.length < 3 && k !== top.kind && !alternatives.includes(k)) alternatives.push(k);
  return { kind: top.kind, alternatives, amount, channelType, confidence, conflict, engine: "rules" };
}

export function defaultAlternatives(direction) {
  if (direction === "in") return ["sale_cash", "debtor_receipt", "capital"];
  if (direction === "out") return ["stock_cash", "other_expense", "drawings"];
  return ["sale_cash", "stock_cash", "transfer"];
}
