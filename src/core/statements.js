// Statement upload (IMP-01 to IMP-05): turn CSV/Excel rows or PDF text into dated lines, then run reliability checks.
// Checks report what passed; they never claim a document is genuine (IMP-03).
import { addDays, isoDate } from "./util.js";

export function parseDelimited(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const delim = (src.split(/\r?\n/)[0].match(/\t/g) || []).length > (src.split(/\r?\n/)[0].match(/,/g) || []).length ? "\t" : (src.split(/\r?\n/)[0].match(/;/g) || []).length > (src.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{5}$/.test(t)) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return isoDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return null;
}

export const parseNumber = (s) => {
  const t = String(s ?? "").replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!t || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Find which columns hold date, description, amounts and balance.
export function detectColumns(rows) {
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const head = rows[h].map((x) => String(x).toLowerCase());
    const find = (...words) => head.findIndex((c) => words.some((w) => c.includes(w)));
    const date = find("date", "tarehe");
    if (date < 0) continue;
    return {
      header: h,
      date,
      description: find("description", "details", "narration", "particular", "maelezo", "transaction"),
      paidIn: find("paid in", "credit", "deposit", "money in", "received", "kuingia", "in (tzs)"),
      paidOut: find("paid out", "withdrawn", "debit", "withdrawal", "money out", "kutoka", "out (tzs)"),
      amount: find("amount", "kiasi"),
      balance: find("balance", "salio"),
      reference: find("reference", "receipt", "ref", "kumbukumbu")
    };
  }
  return null;
}

export function rowsToLines(rows) {
  const cols = detectColumns(rows);
  if (!cols) throw new Error("No date column found. The file needs a column named Date (or Tarehe).");
  const lines = [];
  for (const r of rows.slice(cols.header + 1)) {
    const date = parseDate(r[cols.date]);
    if (!date) continue;
    let amountIn = cols.paidIn >= 0 ? Math.abs(parseNumber(r[cols.paidIn]) || 0) : 0;
    let amountOut = cols.paidOut >= 0 ? Math.abs(parseNumber(r[cols.paidOut]) || 0) : 0;
    if (!amountIn && !amountOut && cols.amount >= 0) {
      const a = parseNumber(r[cols.amount]) || 0;
      if (a >= 0) amountIn = a;
      else amountOut = -a;
    }
    if (!amountIn && !amountOut) continue;
    lines.push({
      date,
      description: cols.description >= 0 ? r[cols.description] || "" : "",
      reference: cols.reference >= 0 ? r[cols.reference] || "" : "",
      amountIn,
      amountOut,
      balance: cols.balance >= 0 ? parseNumber(r[cols.balance]) : null
    });
  }
  return lines;
}

// PDF text fallback: each line with a date and at least one amount becomes a statement line.
// Direction comes from the running balance when the statement shows one; otherwise from the wording.
const OUT_WORDS = /(payment to|paid to|pay bill|sent to|transfer to|withdraw|purchase|buy goods|lipa|malipo kwa|kutoa|umetuma|tuma|debit|charge|fee)/;
export function pdfTextToLines(text) {
  const out = [];
  let prevBal = null;
  const amountRe = /-?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\d+\.\d{2}/g;
  for (const raw of String(text || "").split(/\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (/opening balance|salio la kuanzia|balance b\/f|brought forward/i.test(line)) {
      const a = [...line.matchAll(amountRe)].map((m) => Number(m[0].replace(/,/g, "")));
      if (a.length) prevBal = a[a.length - 1];
      continue;
    }
    const dm = line.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2} [A-Za-z]{3,9},? \d{4})/);
    if (!dm) continue;
    const date = parseDate(dm[1]);
    if (!date) continue;
    const rest = line.slice(dm.index + dm[1].length);
    const amounts = [...rest.matchAll(amountRe)].map((m) => Number(m[0].replace(/,/g, "")));
    if (!amounts.length) continue;
    const description = rest.replace(amountRe, "").replace(/\s+/g, " ").trim();
    const amount = Math.abs(amounts[0]);
    const balance = amounts.length > 1 ? amounts[amounts.length - 1] : null;
    let isOut;
    if (balance != null && prevBal != null && Math.abs(Math.abs(balance - prevBal) - amount) < 1) isOut = balance < prevBal;
    else isOut = amounts[0] < 0 || OUT_WORDS.test(description.toLowerCase());
    if (balance != null) prevBal = balance;
    out.push({ date, description, reference: "", amountIn: isOut ? 0 : amount, amountOut: isOut ? amount : 0, balance });
  }
  return out;
}

const tokens = (s) => String(s || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);

export function nameMatches(accountName, business) {
  const target = new Set([...tokens(business.profile?.ownerName), ...tokens(business.profile?.businessName)]);
  const got = tokens(accountName);
  if (!got.length) return false;
  return got.filter((w) => target.has(w)).length >= Math.min(2, got.length);
}

export function runningBalanceOk(lines) {
  const withBal = lines.filter((l) => l.balance != null);
  if (withBal.length < 2) return null; // cannot be checked
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (a.balance == null || b.balance == null) continue;
    if (Math.abs(a.balance + b.amountIn - b.amountOut - b.balance) > 1) return false;
  }
  return true;
}

export function matchExisting(line, entries) {
  const amt = line.amountIn || line.amountOut;
  return (entries || []).find((e) => Number(e.amount) === Number(amt) && Math.abs((new Date(e.date) - new Date(line.date)) / 86400000) <= 1 && e.status !== "declined") || null;
}

export function checkStatement({ lines, accountName, business, entries, todayISO, layoutRecognised }) {
  const dates = lines.map((l) => l.date).sort();
  const datesOk = lines.length > 0 && dates[0] >= addDays(todayISO, -400) && dates[dates.length - 1] <= todayISO;
  return {
    nameMatch: nameMatches(accountName, business),
    layout: Boolean(layoutRecognised),
    runningBalance: runningBalanceOk(lines),
    datesInRange: datesOk,
    duplicates: lines.filter((l) => matchExisting(l, entries)).length
  };
}

// Lines without a clear description go back to the business (IMP-04).
export const needsExplanation = (line) => tokens(line.description).length < 2;
