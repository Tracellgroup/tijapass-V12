// Collects every English / Kiswahili text pair into docs/translations.csv for translator review (UX-01, handover).
// Run: npm run extract-text
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
const seen = new Set();
const add = (where, en, sw) => {
  if (!String(en || "").trim() || (en === sw && /^\$\{/.test(en))) return;
  const key = `${en}\u0000${sw}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push([where, en, sw]);
};

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(f)) scan(p);
  }
}

const STR = String.raw`(["'\x60])((?:\\.|(?!\1)[\s\S])*?)\1`;
const reL = new RegExp(String.raw`\bL\(\s*${STR}\s*,\s*${STR.replace(/\\1/g, "\\3")}\s*\)`, "g");
const reObj = new RegExp(String.raw`\ben:\s*${STR}\s*,\s*sw:\s*${STR.replace(/\\1/g, "\\3")}`, "g");
const reTriple = /\[\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\s*\]/g;
const unescape = (s) => s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");

function scan(file) {
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(reL)) add(rel, unescape(m[2]), unescape(m[4]));
  for (const m of src.matchAll(reObj)) add(rel, unescape(m[2]), unescape(m[4]));
  for (const m of src.matchAll(reTriple)) if (/[A-Z]/.test(m[2][0]) && /[A-Z]/.test(m[3][0])) add(rel, m[2], m[3]);
}

walk(path.join(root, "src"));

// Structured text that lives in data modules.
const { KINDS, ACCOUNTS } = await import(path.join(root, "src/core/kinds.js"));
for (const [k, v] of Object.entries(KINDS)) { add(`kinds.${k}`, v.en, v.sw); add(`kinds.${k}.plain`, v.plainEn, v.plainSw); }
for (const [k, v] of Object.entries(ACCOUNTS)) add(`accounts.${k}`, v.en, v.sw);
const { FAQ } = await import(path.join(root, "src/content/faq.js"));
FAQ.forEach((f, i) => { add(`faq.${i}.q`, f.q.en, f.q.sw); add(`faq.${i}.a`, f.a.en, f.a.sw); });
const { GUIDE } = await import(path.join(root, "src/content/guide.js"));
for (const [role, items] of Object.entries(GUIDE)) for (const [id, v] of Object.entries(items)) add(`guide.${role}.${id}`, v.en, v.sw);
const { DEFAULT_PACKAGES } = await import(path.join(root, "src/core/seed.js"));
for (const p of DEFAULT_PACKAGES.business) p.featuresEn.forEach((f, i) => add(`packages.${p.id}.${i}`, f, p.featuresSw[i]));

const csv = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const out = [["where", "english", "kiswahili"], ...rows].map((r) => r.map(csv).join(",")).join("\n");
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/translations.csv"), `\ufeff${out}\n`);
console.log(`docs/translations.csv: ${rows.length} text pairs`);
