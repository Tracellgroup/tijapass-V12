# TijaPass V12 · web MVP (test version)

TijaPass helps small Tanzanian businesses (Business / Mjasiriamali) record money in and out in plain words, close each day by counting their money, get a monthly **TijaPass Records Rating** from their officer, and build a credit passport that lenders see only with consent. Lenders assess and lend, suppliers quote and deliver, TijaPass Admin supervises, and report users (BOT and others) see aggregated, de-identified KPIs.

This repository is the **V12 web MVP** (the V10 build with the pre-live upgrades of 29 October 2026): a single-page React app with **dummy data only**, built to test design, flow, rules and look before the native pilot app is developed. It implements the *TijaPass V10 Master Functional Specification* (tab 1 shared requirements, tab 2 web MVP, tab 4 acceptance-test matrix), including the revisions agreed on 27 and 29 October 2026. The specification keeps its V10 name; V12 is this release of it.

> Test version: no real money, no real security, data lives in the browser. Never enter real passwords, PINs or ID numbers.

## Run it locally

Requires Node.js 18 or later (20 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 36 rule and action tests
npm run build      # production build into dist/
npm run preview    # serve the build at http://localhost:4173
```

AI reading runs through a Netlify Function, so locally (without `netlify dev`) the app uses its built-in Kiswahili/English rules and says so on screen. To try the AI locally: `npm i -g netlify-cli`, put `AI_API_KEY=...` in `.env`, then `netlify dev`.

## Sign in

The app starts **empty**: no businesses, entries, ratings or loans. On the sign-in screen, the **Test accounts** tab signs in with one tap:

| Account | User type |
|---|---|
| officer1@tijapass.test, officer2@tijapass.test | TijaPass Admin · Officer |
| dataadmin@tijapass.test | TijaPass Admin · Data Admin |
| sysadmin@tijapass.test | TijaPass Admin · System Admin |
| super@tijapass.test, super2@tijapass.test | TijaPass Admin · Super user (two, so one can approve what the other proposes) |
| fi@tijapass.test | Financial institution (Test Bank Ltd) |
| supplier@tijapass.test | Supplier (Test Supplies Ltd) |
| bot@tijapass.test | Reports (Bank of Tanzania) |

Only the business itself can register ("Register my business"): business details first, then owners, management, money accounts, a few questions, a code sent to the main phone and a 4-digit PIN. In this test version the phone code is shown on screen instead of sent by SMS. Officers and admins cannot create businesses. Businesses then sign in with phone number and PIN (5 wrong tries lock for 15 minutes). New lenders and suppliers register themselves and wait for Data Admin approval. Businesses created in the browser also appear under Test accounts for quick switching.

### Testing helpers (web MVP only)

- **Tester clock** (clock button in the top bar): jump to 17:00, the next morning, several days later, the end of the month or 46 days ahead, to test the daily close, reminders, catch-up and rating overdue.
- **Test data** (Super user only): load 10 fictional businesses with the 100 sample transactions and 8 Records Ratings (`public/samples/test-data/`, or your own CSV files in the same format), optionally with 6 months of earlier activity and daily closes; remove them all in one step. Logins `+2557000010xx`, PIN 2468.
- **Settings → Test tools** (System Admin): fill a business with sample past activity and daily closes (default 95 days), and **Reset all data** behind a confirmation.
- **Sample statements** in `public/samples/` (also downloadable at `/samples/...` on the deployed site), plus a "download a sample statement for this business" link on the upload screen.

See [TESTING.md](TESTING.md) for the acceptance checklist and how to run each test.

## Deploy

GitHub repository `Tijapass-V12` → Netlify site `tijapass-v12`, build `npm run build`, publish `dist`. Step by step: [DEPLOYMENT.md](DEPLOYMENT.md).

## Project layout

```
src/core/        Rules as plain JavaScript, no screen code (moves to the native server unchanged)
  accounting.js  double-entry engine, statements (income, balance sheet, direct cash flow), ledger, trial balance
  kinds.js       chart of accounts and entry types (ready phrases) with their debit/credit
  reader.js      rules-based Kiswahili/English reader (fallback when AI is off)
  posting.js     post-or-hold rules: duplicates, direction conflict, unusual amount, overdraw
  dailyClose.js  daily close, tolerance, catch-up, on-time days
  rating.js      TijaPass Records Rating: five checks, bands, sampling, overdue, tips
  credit.js      score (V9's five criteria + rating, evidence-weighted), gates, affordability, instalment limits, schedules
  billing.js     packages, FI assessments, sponsorship discounts
  kpi.js         BOT KPIs with minimum group and cell size and complementary suppression
  statements.js  statement parsing (CSV/XLSX/PDF text) and reliability checks
  people.js      4-digit PINs, ages and dates of birth, NIDA, owners and shares, linking one person's businesses
  seed.js        setup lists, default settings, prices, test accounts (no business data)
src/lib/         store (browser storage), domain actions + audit trail, access rules, AI client, files, i18n, test-data loader
src/screens/     screens per user type (business, officer/admin, fi, supplier, reports, shared)
src/ui/          shell, menus, components
netlify/functions/ai/  AI function (key on the server) and its prompts
tests/           node:test unit tests for the rules and actions
scripts/         extract-text (translations CSV), accounting-map (docs table)
docs/            translations.csv, ACCOUNTING_MAP.md, AI_PROMPTS.md
public/guide/    help-guide screenshots per menu item (en.json, sw.json); the same images as JPGs in docs/guide-screenshots.zip
public/samples/  sample statements for upload tests; test-data/ holds the loader's sample CSV files
```

## Documents

- [V12_RELEASE_NOTES.md](V12_RELEASE_NOTES.md): what changed from V9, mapped to requirement IDs
- [TESTING.md](TESTING.md): acceptance tests and results
- [HANDOVER.md](HANDOVER.md): handover pack for the native pilot app developer
- [DEPLOYMENT.md](DEPLOYMENT.md): GitHub and Netlify steps

TijaPass is operated by Tracell Finance Limited.
