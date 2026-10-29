# Handover to the native pilot app developer

The web MVP is the **reference design** for the Stage 2 controlled live pilot (spec tab 3): an installable phone web app (PWA) plus a secure backend, with native Android/iOS apps later. Copy its screens, flows, wording and rules; replace its browser-only parts (storage, simulated payments, tester tools, test-data loader) with the live services described in tab 3.

## What is handed over

| Item (spec tab 2, sign-off) | Where |
|---|---|
| V12 code with a README on how to run it and its tests | This repository; [README.md](README.md) |
| Rule modules as plain JavaScript with their tests | `src/core/*.js` (no screen code) and `tests/*.test.js` (`npm test`, 62 tests) |
| Chart of accounts and ready-phrase mapping table | [docs/ACCOUNTING_MAP.md](docs/ACCOUNTING_MAP.md) (generated from `src/core/kinds.js`) |
| All Kiswahili and English text in one translation file | [docs/translations.csv](docs/translations.csv) (`npm run extract-text`) |
| AI instructions with sample inputs and expected outputs | [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md); source `netlify/functions/ai/prompts.mjs` |
| Screen list per user type, with screenshots | Below; images in `docs/guide-screenshots.zip` (`<user>-<screen>-<en|sw>.jpg`) |
| Acceptance test results and known limitations | [TESTING.md](TESTING.md) (same as spec tab 4); limitations below |

## Rule modules to move to the server

| Module | Responsibility | Key functions |
|---|---|---|
| `kinds.js` | Chart of accounts (incl. `suspense`), entry types, ready phrases | `ACCOUNTS`, `KINDS`, `READY_KINDS`, `GROUP_KINDS`, `SUSPENSE_TARGETS`, `flowOf` |
| `accounting.js` | Double entry, statements, ledger | `linesFor`, `journal`, `balancesAt`, `incomeStatement`, `balanceSheet`, `cashFlowDirect`, `trialBalance`, `ledger`, `openingLines` |
| `posting.js` | Post or hold | `evaluateEntry`, `findDuplicate`, `isUnusual`, `wouldOverdraw` |
| `dailyClose.js` | Daily close and catch-up | `unclosedPastDays`, `compareCounts`, `tolerance`, `isOnTime`, `shouldFlag`, `REASONS` |
| `rating.js` | Records Rating | `scoreCash`, `scoreCompleteness`, `scoreCorrectness`, `scoreTimeliness`, `scoreStock`, `bandFor`, `riskOf`, `pickSample` (risk-based), `ratingStatus`, `nextDue`, `dueList`, `tips` |
| `people.js` | Identity and owners (29 Oct) | `pinProblem`, `PIN_LOCK`, `dobBounds`, `dobProblem`, `ageOn`, `validNida`, `ownersOf`, `mainOwner`, `syncProfile`, `ownershipGender`, `profileProblems`, `linkedBusinesses`, `isAdultMain` |
| `credit.js` | Passport and lending | `isSupported`, `evidenceMix`, `score`, `GATES`, `gates`, `ratingGate`, `reconciliation`, `monthlyBase`, `affordability`, `maxInstalments`, `maxPrincipal`, `schedule`, `offerFits`, `linkedExposure` |
| `billing.js` | Packages and FI billing | `assessmentFee`, `needsAssessment`, `fiBill`, `sponsorDiscountPct`, `canAssignTier`, `activePackage` |
| `kpi.js` | BOT KPIs and privacy (minimum group, minimum cell, complementary suppression) | `computeKpis`, `filterBusinesses`, `kpiCsv` |
| `statements.js` | Statement parsing and checks | `rowsToLines`, `pdfTextToLines`, `checkStatement`, `matchExisting`, `needsExplanation` |
| `reader.js` | Rules reader (AI fallback) | `readDescription`, `parseAmount`, `wordsToNumber` |
| `src/lib/actions.js` | Every state change, audit and alerts | becomes the server's API handlers one to one (`createBusiness`, `pinSignIn`, `resetPinWithCode`, `unlockPin`, `verifyIdentity`, `confirmOwner`, `changeProfile`, `decideChange`, `addChannel`, `addEntry`, `reviewPosted`, `closeDay`, `resolveSuspense`, `correctBaseline`, `saveRating`, `recordRecheck`, `decideHeld`, `requestLoan`, `makeOffer`, `disburse`, `proposeStaff`, `approveStaff`, `checkOrg`, `decideOrg`, …). Since 29 Oct every action checks its own inputs and the caller's role, so the server is safe even without the screens |
| `src/lib/testData.js` | Super user test-data loader (web MVP only) | `buildTestData`, `loadTestData`, `removeTestData`, `hasTestData` |
| `src/lib/access.js` | Who may see what | becomes server-side authorisation on every request (ROLE-03) |

All functions take the full state plus arguments, so on the server they can run against the database records of one business.

## Data (browser storage key `tijapass-v12`)

One JSON object with: `settings`, `packages`, `users`, `fis` (with `products`), `suppliers` (with `products`), `businesses` (profile, channels, baseline, opening, consent, officer history), `entries` (kind, amount, channel, date, source, status, createdBy, AI suggestion, import link), `closes` (counts, book, differences, on-time), `ratings` (points, details, evidence ids, GPS, dispute, re-check), `changeRequests`, `externalLoans` (with revisions), `loans` (offer, schedule, history), `quoteRequests` (quote, invoice, delivery, history), `messages`, `notifications`, `queries`, `assessments`, `payments`, `subscriptions`, `quarterly`, `imports` (checks, pending lines), `audit`. Photos and statement files are in IndexedDB `tijapass-v12-files`, referenced by id.

## Screens per user type

Screenshots for every menu item are in `docs/guide-screenshots.zip` (English `-en`, Kiswahili `-sw`). The app shows the same images in each user's Help → Guide from `public/guide/en.json` and `sw.json` (packed into two files so the repository uploads through the GitHub website in one go).

| User | Screens (menu order) | Extra screens |
|---|---|---|
| Business | Home · Record (money in/out/move, upload statement, Close my day) · My activity (with lines to explain) · Reports (income, balance sheet, cash flow) · Finance (passport, request, my loans, outside loans) · Suppliers · Wallet · Packages · Help · Profile (details, starting position, consent) | Daily close / catch-up, Records Rating |
| FI | Dashboard · Business directory · Loan requests · Products and pricing · Suppliers · Messages · Wallet · Packages and billing · Help · Profile | Business file (passport, rating, statements, cash movement, loans, messages), loan request (offer, disburse, tracker) |
| Supplier | Dashboard · Products and prices · Quote requests and quotes · Orders, invoices and delivery · Messages · Wallet · Help · Profile | |
| Officer | My businesses · Monthly records check · Their activity and statements · Daily-close follow-up · Change requests · Help | Business file, records-check checklist |
| Data Admin | Officer menu for all businesses (no records check) + Approval queue (incl. Identity to verify) · Ledger, journal and trial balance · Records Rating review · Queries · Loans and repayments | |
| System Admin | Data Admin menu + Users and roles · Packages and prices · Settings (with web MVP test tools) · Input fields · Report design · Audit trail | |
| Super user | System Admin menu + KPI dashboard + Test data | |
| Reports (BOT) | KPI dashboard · Filters · Export | |

## Decisions taken in the MVP (please confirm or change)

1. **On time** = a day closed the same day or before 09:00 the next morning.
2. **Catch-up count** covers the missed days up to yesterday (and today, if today already has entries). Recording is never blocked; unclosed days are flagged and the records-reconciled gate holds financing until catch-up is done.
3. **Rating points** are rounded to whole points per check so the total always equals the sum.
4. **Stock**: periodic method. Purchases are cost of sales; stock value changes through the starting position and stock adjustments. A stock count during a rating that differs by more than 10% creates a stock update request for Data Admin.
5. **Imported withdrawals/deposits** go back to the business to state their purpose (a transfer is suggested, never assumed); statement lines dated before the business joined are skipped. Each statement gets an evidence grade A–D.
6. **FI depth of access by package**: Starter sees statements for the last 90 days; Growth and Enterprise any period (open question 2 decides final features).
7. **Credit gates at offer**: score, profile/ID/consent, 30 entries over 3 months, no overdue, outside loans reviewed, positive cash, records reconciled, and rating: 70%+ automatic, 50–69% only with the lender's recorded review (note of at least 10 characters), below 50% or overdue blocked. At disbursement affordability, rating, overdue and reconciliation are checked again. Repeat-borrower weights start once an instalment has fallen due.
8. **Interest** is a declining-balance instalment; fees are charged with the first instalment, and the largest instalment must fit affordability.
9. **Youth** = owner aged 35 or under; **active** = entries on at least 10 of the last 30 days (both in Settings; open question 9).
10. **Super user** has the System Admin menu plus the KPI dashboard and the test-data loader, and approves staff accounts proposed by System Admin (two Super users for System Admin and Super user roles).
11. **Affordability base** = the lower of average monthly profit and average monthly operating cash flow over the last 90 days.
12. **Accountant review** applies to entries of TZS 50,000 or more (setting) read by ready phrase, AI confidence below 0.6, or with the AI reading overridden.
13. **Owners (29 Oct)**: owners are 12 to 100; under 18 needs a guardian and cannot be the borrowing main owner (18 is the assumed age of majority; confirm with legal advice). Women-owned = women hold 51% or more of the shares.
14. **Profile changes**: a new location within 2 km applies at once; further away waits for Data Admin. An account can be closed only at a zero balance.
15. **Records Rating**: at most one per period, at least 25 days apart (setting); a business's first rating is always re-checked by someone other than the rater.
16. **Duplicates**: a repeated transaction reference of 4 or more characters within one business is held, whoever the payer.
17. **Time**: all dates and times follow Tanzania time (UTC+3), whatever the device's zone.
18. **Same owner, several businesses**: linked by NIDA; lenders see the count, open loans, monthly instalments and overdue amount of the others, never their names.

## Known limitations of the web MVP

- Single browser: data is shared only by users signing in on the same browser; no real security (plain test PINs and passwords; no OTP or MFA, which the live pilot adds).
- Phone codes (registration, co-owner confirmation, new main phone, forgotten PIN) are simulated: the code is shown on screen. Stage 2 sends a real SMS.
- Identity verification compares the photos and NIDA number by eye; Stage 2 should check NIDA through an approved service.
- Payments, wallets and disbursements are simulated; no money moves.
- Alerts appear in the app only (no SMS or push) and are created when the app is open.
- Photos and files stay in the browser where they were taken; another device cannot see them.
- PDF reading needs text PDFs; scanned images need the AI (no OCR). Excel: first sheet of `.xlsx` only, not `.xls`.
- AI reading needs `AI_API_KEY` on Netlify; without it the built-in rules read common Kiswahili/English phrases and number words.
- Sponsorship "agreed usage limits" are not enforced (no limits set yet).
- Report users other than BOT can be created in Users and roles; they currently share the BOT KPI set (BOT-08 custom sets later).
- The System Admin menu keeps the name "Audit trail" from MENU-01; consider "Change history" given the rule against the word "audit".
- Translations are first drafts for the translator to review in `docs/translations.csv`.
