// Writes docs/ACCOUNTING_MAP.md: the chart of accounts and the ready-phrase mapping table (phrase -> accounts).
// Run: npm run accounting-map
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, KINDS, READY_KINDS } from "../src/core/kinds.js";
import { CASHFLOW_LINES } from "../src/core/accounting.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acc = (a) => (a === "CH" ? "the entry's money channel (cash / wallet / bank)" : a === "TO" ? "destination channel" : `${ACCOUNTS[a]?.en || a} (\`${a}\`)`);
let md = "# Chart of accounts and ready-phrase mapping\n\nGenerated from `src/core/kinds.js` by `npm run accounting-map`. The AI only suggests the entry type; the engine (`src/core/accounting.js`) posts these lines. Every journal balances.\n\n";
md += "## Chart of accounts (ACC-02)\n\n| Key | Group | English | Kiswahili |\n|---|---|---|---|\n";
md += "| `ch:<id>` | asset | One account per money channel: cash in hand, each mobile money wallet, each bank account | Akaunti moja kwa kila njia ya pesa |\n";
for (const [k, v] of Object.entries(ACCOUNTS)) md += `| \`${k}\` | ${v.group} | ${v.en} | ${v.sw} |\n`;
md += "| (calculated) | equity | Retained earnings = cumulative profit from posted entries; never typed (ACC-03) | Faida iliyobaki |\n";
md += "\n## Ready phrases and their accounting (REC-05, REC-09, REC-10)\n\n| Entry type | Ready phrase (English) | Ready phrase (Kiswahili) | Debit | Credit | Cash flow line |\n|---|---|---|---|---|---|\n";
for (const k of READY_KINDS) { const v = KINDS[k]; md += `| \`${k}\` | ${v.en} | ${v.sw} | ${acc(v.dr)} | ${acc(v.cr)} | ${v.cf ? CASHFLOW_LINES[v.cf].en : "none (no money moves)"} |\n`; }
md += "\n## System entry types (created by the daily close, loans or Admin)\n\n| Entry type | Meaning | Debit | Credit |\n|---|---|---|---|\n";
for (const [k, v] of Object.entries(KINDS)) if (v.hidden) md += `| \`${k}\` | ${v.en} | ${acc(v.dr)} | ${acc(v.cr)} |\n`;
md += `
## Special rules

- **group_payout**: debit the channel; credit group savings up to the amount saved; any surplus is credited to other income.
- **loan_repayment**: reduces loans due within 12 months first, then longer loans.
- **loan_received / asset_financed** with more than 12 monthly (or 52 weekly) instalments post to longer loans.
- **stock_adjust**: signed amount; positive raises stock (credit stock change), negative lowers it. Purchases are expensed to cost of sales (periodic stock method); the stock value changes only through the starting position and stock adjustments after a count.
- **Corrections** are reversals (\`contra\`: debit and credit swapped) with a reason, never deletions.
- **Opening balances**: channels and assets are debited, liabilities credited, and the difference is credited (or debited) to opening equity, which is calculated, never typed.
`;
fs.writeFileSync(path.join(root, "docs/ACCOUNTING_MAP.md"), md);
console.log("docs/ACCOUNTING_MAP.md written");
