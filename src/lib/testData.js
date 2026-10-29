// Super user test-data loader (feedback 27 Oct, item 7): 10 fictional businesses, 100 transactions and
// 8 Records Ratings from three CSV files, loaded and removed in one step. Every record carries testData: true.
import { channelBalances } from "../core/accounting.js";
import { bandFor } from "../core/rating.js";
import { parseDelimited } from "../core/statements.js";
import { addDays, dateRange, nowISO, seeded, today } from "../core/util.js";
import { audit } from "./actions.js";
import { syncProfile } from "../core/people.js";

// Test businesses sign in with this 4-digit PIN (the sample files carry an older 6-digit one).
export const TEST_PIN = "2468";
// A fictional but well-formed 20-digit NIDA: birth date, then a fixed test block and the business number.
const testNida = (dob, i) => `${String(dob).replace(/-/g, "")}99999${String(i + 1).padStart(5, "0")}00`;


const rowsToObjects = (text) => {
  const rows = parseDelimited(text).filter((r) => r.some((c) => String(c).trim()));
  const head = rows[0].map((h) => String(h).trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? "").trim()])));
};

const SECTOR_WORDS = [
  [/lishe|meal|food|restaurant/i, "food"], [/vegetable|produce|fruit/i, "produce"], [/farm|crop|agri/i, "agri"], [/livestock|poultry/i, "livestock"],
  [/tailor|fashion/i, "tailoring"], [/beauty|salon|hair/i, "beauty"], [/phone|electronic/i, "phones"], [/furniture|carpentr|manufactur|process/i, "processing"], [/repair|shoe|workshop/i, "repairs"],
  [/spare|hardware|construction/i, "hardware"], [/grocery|retail|shop|kiosk/i, "retail"], [/transport|boda|bajaji/i, "transport"]
];
const sectorFor = (s) => (SECTOR_WORDS.find(([re]) => re.test(s)) || [null, "services"])[1];
const typeFor = (sector) => ({ food: "service", produce: "shop", agri: "farming", tailoring: "production", beauty: "service", phones: "service", repairs: "service", processing: "production", hardware: "shop", retail: "shop" }[sector] || "other");

const KIND_BY_CATEGORY = {
  sales: "sale_cash", services: "sale_cash", inventory: "stock_cash", utilities: "utilities", transport: "transport", rent: "rent",
  salaries: "wages", wages: "wages", maintenance: "other_expense", telecom: "other_expense", otherexpense: "other_expense"
};
export function kindFor(direction, category) {
  const k = KIND_BY_CATEGORY[String(category).toLowerCase().replace(/[^a-z]/g, "")];
  if (k) return k;
  return /receipt|in/i.test(direction) ? "other_income" : "other_expense";
}

const phone = (p) => {
  const s = String(p).replace(/\D/g, "");
  return s.startsWith("0") ? `+255${s.slice(1)}` : s.startsWith("255") ? `+${s}` : `+${s}`;
};

// Builds the records from CSV text. Options: history (6 months of earlier activity, so loan journeys can be
// tested), closes (daily closes up to yesterday, on time in line with each rating's timeliness).
export function buildTestData({ profilesCsv, transactionsCsv, ratingsCsv }, { history = false, closes = true, todayISO }) {
  const profiles = rowsToObjects(profilesCsv);
  const txs = rowsToObjects(transactionsCsv);
  const ratings = ratingsCsv ? rowsToObjects(ratingsCsv) : [];
  const at = `${todayISO}T08:00:00.000Z`;
  const out = { businesses: [], users: [], entries: [], closes: [], ratings: [] };
  profiles.forEach((p, i) => {
    const id = p.business_id;
    const officerId = i < Math.ceil(profiles.length / 2) ? "U-OFF1" : "U-OFF2";
    const sector = sectorFor(`${p.sector} ${p.business}`);
    const own = txs.filter((t) => t.business_id === id).sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = own[0]?.date || addDays(todayISO, -27);
    const start = history ? addDays(firstDate.slice(0, 8) + "01", -183) : firstDate.slice(0, 8) + "01";
    const ch = { cash: `${id}-cash`, mobile: `${id}-mpesa`, bank: `${id}-bank` };
    out.businesses.push({
      id, testData: true, status: "active", startDate: start, closingTime: "17:00", createdAt: at, createdBy: { id: "test-loader", name: "Test data loader", role: "super" },
      officerId, officerHistory: [{ officerId, at, by: { id: "test-loader", name: "Test data loader" }, reason: "Test data" }],
      kyc: { status: "verified", by: { id: "test-loader", name: "Test data loader" }, at, reason: "Test data" },
      profile: syncProfile({
        legalForm: "sole", registrationNo: "", management: { managedBy: "owner", managers: [] },
        owners: [{ id: "O1", name: p.owner, phone: phone(p.phone_test), dob: p.dob, gender: /^f/i.test(p.gender) ? "female" : "male", nida: testNida(p.dob, i), education: "na", sharePct: 100, role: "owner", main: true, confirmed: true, photoId: null, idPhotoId: null }],
        ownerName: p.owner, phone: phone(p.phone_test), phone2: "", email: "", nida: testNida(p.dob, i), dob: p.dob, gender: /^f/i.test(p.gender) ? "female" : "male",
        homeAddress: `${p.region} (test address)`, businessName: p.business, businessType: typeFor(sector), sector, sectorText: p.sector, region: p.region,
        monthsOperating: 24, staffTotal: Number(p.staff) || 0, staffWomen: 0, staffPaid: Number(p.staff) || 0, address: `${p.region} (test address)`, gps: null, photoId: null, idPhotoId: null, custom: {}
      }),
      channels: [{ id: ch.cash, type: "cash", name: "Cash in hand" }, { id: ch.mobile, type: "mobile", name: "M-Pesa" }, { id: ch.bank, type: "bank", name: "CRDB Bank" }],
      baseline: (() => {
        const base = { bank: /true/i.test(p.previously_unbanked) ? "none" : "used", mobile: "personal", borrowed: /true/i.test(p.previous_formal_loan) ? "past" : "never", sources: ["family"], needFinance: "no", needPurpose: "", needAmount: 0 };
        return { ...base, at, original: { ...base }, corrections: [] };
      })(),
      opening: { status: "approved", date: start, values: { channels: { [ch.cash]: 100000, [ch.mobile]: 100000, [ch.bank]: 150000 } }, by: { id: "test-loader", name: "Test data loader" }, at, decidedBy: { id: "test-loader", name: "Test data loader" }, reason: "Test data" },
      consent: { at, scope: "Test data: records, statements, passport and Records Rating", fis: { "FI-1": { granted: true, at } } },
      lang: "sw", customFields: {}
    });
    out.users.push({ id: `U-${id}`, role: "business", name: p.owner, login: phone(p.phone_test), pin: TEST_PIN, businessId: id, active: true, testData: true, failedPins: 0 });

    const entry = (t, date, amount, n) => ({
      id: `E-${t.reference || id}-${n}`, testData: true, businessId: id, date, kind: kindFor(t.direction, t.category), amount,
      channelId: ch[t.payment_channel] || ch.cash, description: t.description, reference: n ? "" : t.reference, status: "posted", source: "test-load",
      evidence: /simulated review/i.test(t.review_evidence) ? "supported" : "declared", createdAt: `${date}T12:00:00.000Z`, createdBy: { id: `U-${id}`, name: p.owner, role: "business" }
    });
    own.forEach((t) => out.entries.push(entry(t, t.date, Number(t.amount_tzs), 0)));
    if (history) {
      // Earlier months repeat the business's own pattern every 15 days, with amounts varied by up to 5%.
      const rnd = seeded(id);
      for (let k = 1; k <= 12; k++) own.forEach((t) => {
        const date = addDays(t.date, -15 * k);
        if (date < start) return;
        out.entries.push(entry(t, date, Math.round((Number(t.amount_tzs) * (0.95 + rnd() * 0.1)) / 100) * 100, k));
      });
    }

    const r = ratings.find((x) => x.business_id === id);
    const timeliness = r ? Number(r.timeliness) / 15 : 0.8;
    if (r) {
      const pts = { cash: Number(r.cash), completeness: Number(r.completeness), correctness: Number(r.correctness), timeliness: Number(r.timeliness), stock: Number(r.stock) };
      const score = Number(r.score_100);
      out.ratings.push({
        id: `R-${id}`, testData: true, businessId: id, businessName: p.business, date: r.review_date, visitAt: `${r.review_date}T10:00:00.000Z`, gps: null, distanceM: null, locationFlag: false,
        points: pts, score, status: "final", createdAt: `${r.review_date}T10:30:00.000Z`, officer: { id: officerId, name: officerId === "U-OFF1" ? "Neema Officer" : "Paul Officer", role: "officer" },
        details: {
          cash: { counted: 0, book: 0 },
          completeness: { sampled: 10, found: Math.round((pts.completeness / 25) * 10) },
          correctness: { sampled: 10, correct: Math.round((pts.correctness / 20) * 10), items: [] },
          timeliness: { tradingDays: 26, onTime: Math.round(timeliness * 26) },
          stock: {}
        },
        evidence: [], note: `${r.status || "Simulated records check"} · band in file: ${r.band}; calculated band: ${bandFor(score).en}`, recheck: { selected: false }
      });
    }
    out._closePlan = [...(out._closePlan || []), { id, start, ratio: timeliness, closes }];
  });
  return out;
}

export function hasTestData(state) {
  return state.businesses.some((b) => b.testData);
}

export function loadTestData(d, actor, built) {
  if (hasTestData(d)) throw new Error("Test data is already loaded. Remove it first.");
  const ids = new Set(built.businesses.map((b) => b.id));
  if (d.businesses.some((b) => ids.has(b.id))) throw new Error("A business with a test id already exists.");
  const phones = new Set(built.users.map((u) => u.login));
  if (d.users.some((u) => phones.has(u.login))) throw new Error("A test phone number is already used by another business.");
  d.businesses.push(...built.businesses);
  d.users.push(...built.users);
  d.entries.push(...built.entries);
  d.ratings.push(...built.ratings);
  // Daily closes: counts equal the books, on time in line with each business's timeliness score.
  const t = today(d);
  for (const plan of built._closePlan || []) {
    if (!plan.closes) continue;
    const rnd = seeded(`${plan.id}-closes`);
    const end = addDays(t, -1);
    if (plan.start > end) continue;
    for (const date of dateRange(plan.start, end)) {
      const counts = {};
      for (const { channel, balance } of channelBalances(d, plan.id, date)) counts[channel.id] = balance;
      const onTime = rnd() < plan.ratio;
      d.closes.push({ id: `K-${plan.id}-${date}`, testData: true, businessId: plan.id, date, from: date, to: date, counts, book: counts, diffs: {}, remainder: 0, open: 0, resolutions: [], closedAt: onTime ? `${date}T15:00:00.000Z` : `${addDays(date, 1)}T09:00:00.000Z`, onTime, catchUp: false });
    }
  }
  audit(d, actor, "Test data loaded", "test-data", { after: { businesses: built.businesses.length, entries: built.entries.length, ratings: built.ratings.length } });
  return { businesses: built.businesses.length, entries: built.entries.length, ratings: built.ratings.length };
}

export function removeTestData(d, actor) {
  const ids = new Set(d.businesses.filter((b) => b.testData).map((b) => b.id));
  const byBiz = (x) => !ids.has(x.businessId);
  const n = ids.size;
  d.businesses = d.businesses.filter((b) => !ids.has(b.id));
  d.users = d.users.filter((u) => !ids.has(u.businessId));
  for (const k of ["entries", "closes", "ratings", "changeRequests", "externalLoans", "loans", "notifications", "queries", "assessments", "quarterly", "imports"]) d[k] = (d[k] || []).filter(byBiz);
  d.subscriptions = d.subscriptions.filter((s) => !ids.has(s.ownerId));
  d.payments = d.payments.filter((p) => !ids.has(p.ownerId));
  d.quoteRequests = d.quoteRequests.filter((q) => !(q.requester?.type === "business" && ids.has(q.requester.id)));
  d.messages = d.messages.filter((m) => !m.participants.some((p) => ids.has(p.businessId)));
  audit(d, actor, "Test data removed", "test-data", { before: { businesses: n } });
  return n;
}

export const loadedAt = (state) => state.audit.find((a) => a.action === "Test data loaded")?.at || nowISO(state);
