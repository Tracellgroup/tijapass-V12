# TijaPass V12 web MVP · release notes

V12 is the V10 web MVP with the pre-live upgrades of 29 October 2026, deployed as its own site. Built from the *TijaPass V10 Master Functional Specification* (tabs 1 and 2; tab 4 is the acceptance-test matrix). It is a new code base in the V9 look (navy #071B3D, orange #F86C12, card layout); V9's repository, site and data are untouched. Each line gives the requirement ID and where it lives.

## Revisions of 11 November 2026 (package benefits, version 12.1.0)

Until now the paid business packages named no benefits ("Premium features") and paying unlocked nothing. Decided with TFL on 11 Nov (closes open question 2):

| Package | Gives | Where |
|---|---|---|
| Basic (free) | Recording by typing or voice with no limit, daily close, on-screen reports, credit passport, loan requests, supplier quotes, help | unchanged |
| Day pass 500, Weekly 1,500, Monthly 5,000 | Everything in Basic, plus PDF statements, bank and mobile money statement upload, 12-month trend and month comparison | `billing.js` `PACKAGE_FEATURES`; Reports, Record |
| Premium 10,000 a month | Everything in Monthly, plus financial analysis (key ratios and trends in plain words), up to 3 staff sign-ins, faster TijaPass check, priority support | `analysis.js`; Reports → Financial analysis; Profile → Staff; `verify.js`; Queries |

The Packages screen now shows on each card what it adds, for how long and who it is for, a table of every benefit, and what happens when a package ends. Locked features say which packages include them, with one tap to the cheapest. Benefits are enforced by the rules (`hasFeature`), not only the screens. `tests/packages.test.js` (8 tests) and walk-through t11 prove it.

## Revisions of 10 November 2026 (field-by-field review, version 12.0.0)

From TFL's tests of V12, a review of every field and rule (69 issues) and the confirmed findings of an outside audit. Decisions: D1 refuse money out above the balance; D2 entries after today's close go to Data Admin as corrections; D3 NIDA optional until a loan; D4 NIDA must match the date of birth; D5 business address required; D6 settings and prices need a second person. And, decided on 9 Nov: the business's own figures count at once, marked "not verified", and staff verify them from a priority list. `tests/review.test.js` (22 tests) proves each fix.

| Change | Issues | Where |
|---|---|---|
| Starting position counts as soon as it is saved, marked "Not verified yet"; correctable until TijaPass verifies and locks it; a correction request keeps it counting. Drafts never count | VF-05, decision 9 Nov | `accounting.js` `openingLines`; `actions.js` `saveOpening`, `decideOpening`; `Profile.jsx` |
| New "To verify" list for officers, Data Admin, System Admin and Super users: counts, then businesses in priority order (asked for a check, loan request, shared with a lender, needs finance, large position, longest waiting). Business button "Ask TijaPass to check my records" | decision 9 Nov | `core/verify.js`; `VerifyQueue.jsx`; `actions.js` `requestCheck` |
| NIDA: digits only, stops at 20, shown 8-5-5-2; its first 8 digits must equal the date of birth (and fill it); the same NIDA elsewhere must be the same person | REG-1/2/3, D4 | `people.js` `typeNida`, `nidaDob`, `nidaConflicts` |
| Owners and business: shares 1-100%; ownership type fits the number of owners; company needs BRELA number; names need two names, letters only; email checked; staff counts and months operating checked; managers and guardians use their own phones; address required | REG-5 to REG-9, REG-13, REG-14, REG-16, VF-15, D5 | `people.js` `profileProblems`; `actions.js` `createBusiness`; `Onboard.jsx` |
| Joining questions must agree with the accounts listed (filled in from them); wallet numbers are phone numbers; a repeated provider needs each number; banks chosen from a list; last 4 digits exactly; no duplicate accounts | REG-10/11/12, VF-17 | `actions.js` `channelProblems`, `baselineProblems`, `addChannel`; `Onboard.jsx` `BankName` |
| Money accounts: list first, "Open a new account" shows the form; a new account's balance shows at once, "not verified"; it is never also in the starting position; closing needs an empty account | PRO-1 to PRO-5, VF-06/10 | `Profile.jsx` `MoneyAccounts`; `actions.js` `addChannel`, `requestCloseChannel` |
| Profile: one pending request per detail; months operating counts up from joining (corrections need approval); plain labels; every amount says TZS; every starting-position box answered; Data Admin edits checked like the business's | PRO-6 to PRO-9, OPN-1 to OPN-5, VF-07/08 | `Profile.jsx`, `Onboard.jsx` `OpeningForm` |
| Money out or moved above what the account holds is refused, checked for every later day too; Data Admin cannot approve such an entry either; available balance shown on screen | REC-A/B/C, VF-04, D1 | `accounting.js` `availableFrom`; `actions.js` `addEntry`, `decideHeld`; `Record.jsx` |
| Nobody pays back more than is owed (customers, suppliers, loans, group loans), including the close reason "a customer paid" | REC-D, DAY-D | `actions.js` `owedFor`; `Close.jsx` |
| Statement lines go through the same rules as typed entries; refused lines go to "lines to explain" with the reason | REC-E | `Record.jsx` `StatementUpload` |
| Amount cap TZS 10 billion; only references with digits count as duplicates; text limits; a business records only its own money; one tap saves once | REC-F/H/I, GEN-A, VF-12 | `actions.js`, `components.jsx`, `Record.jsx` |
| Entries after today's close go to Data Admin as corrections and the screens say so; "on time" uses Tanzania time; close reasons checked; counts in TZS | DAY-A/B/C/E, D2 | `Close.jsx`, `Record.jsx`, `dailyClose.js` `isOnTime`, `actions.js` `closeDay` |
| Loans: request must fit the product's limits; "Withdraw request"; outside-loan instalment checks; expired quotes cannot be used; lender products checked (rate 0-100%, fee 0-20%, min TZS 10,000, 1-60 instalments) | FIN-A to FIN-G | `actions.js` `requestLoan`, `withdrawLoan`, `saveProduct`; `Finance.jsx`, `Fi.jsx` |
| Quote steps belong to one side (supplier quotes, invoices, delivers; requester accepts, pays, receives); quote requests checked | SUP-A/B, VF-18 | `actions.js` `quoteStep`, `requestQuote` |
| Right person only: consent, baseline corrections, rating disputes (once, in the window, with a reason), help answers, messages, quarterly answers, packages, assessments; role changes only for staff; reversals once; corrections keep their evidence level; identity verified only when complete | ADM-A/B/D/E/F/G, VF-13/14/20 | `actions.js` |
| Settings and prices: proposed by System Admin, approved by a different Super user; settings range-checked, score weights must total 100 | ADM-C/H, D6 | `actions.js` `proposeConfig`, `decideConfig`, `settingsProblems`; `SystemAdmin.jsx` |
| Lenders and suppliers: unique sign-in email, valid phone, 8-character password typed twice, unique licence; cannot sign in until approved | ORG-A/B/C | `actions.js` `registerOrg`, `decideOrg`; `SignIn.jsx` |
| A new package starts when the current one ends | PKG-A | `actions.js` `payPackage` |
| BOT report amounts from fewer than the minimum number of loans or businesses are hidden | VF-19 | `kpi.js`, `Kpi.jsx` |
| Version number 12.0.0; test counts corrected; superseded 6-digit PIN note marked as history | VF-23 | `package.json`, docs |

## Revisions of 29 October 2026 (pre-live review)

Agreed with TFL after comparing another TijaPass version and testing many practical scenarios (47 gap scenarios, all now refused). Every control is enforced in the rule layer (`src/lib/actions.js`, `src/core/people.js`), not only on screen; `tests/controls.test.js` (26 tests) proves each one. Spec: second decision log on the Overview tab; tab 4 rows marked (29 Oct).

| Change | Requirements | Where |
|---|---|---|
| 4-digit PIN; easy PINs refused (1234, birth year, phone ending); 5 wrong tries lock 15 minutes, 10 block until the officer or Data Admin unlocks; "Forgot my PIN" with a phone code | ROLE-01 | `people.js` `pinProblem`, `PIN_LOCK`; `actions.js` `pinSignIn`, `resetPinWithCode`, `unlockPin`; `SignIn.jsx` |
| Sign-in lasts for the browser tab; signed out after 15 idle minutes (setting) | ROLE-01 | `store.jsx` (sessionStorage, idle timer) |
| Only the business registers itself; "Onboard a business" removed; staff attempts refused by the rules | ONB-05, ADM-01 | `actions.js` `createBusiness`; `Officer.jsx`, `menus.js`, `App.jsx` |
| Registration: business details first, then owners (several, with shares adding to 100%), management, accounts, questions, phone code and PIN | ONB-01, ONB-02, ONB-11 | `Onboard.jsx` (`OwnerForm`, `PhoneCode`) |
| Dates picked year → month → real day; owners 12 to 100; under 18 needs a guardian and cannot borrow | ONB-01, UX-07, CRD-03 | `components.jsx` `DatePicker`; `people.js` `dobBounds`, `dobProblem`, `isAdultMain` |
| Education level (optional); legal form and registration number | ONB-01, ONB-02 | `people.js` `EDUCATION`, `LEGAL_FORMS` |
| NIDA checked (20 digits); co-owners confirm by their own phone code; Data Admin verifies identity before credit | ONB-11, ADM-02, CRD-03 | `actions.js` `confirmOwner`, `verifyIdentity`; Approval queue → Identity to verify; `credit.js` kyc gate |
| One person's businesses linked by NIDA; Data Admin alerted; lenders see what the same owner owes elsewhere, without names | ONB-12 | `people.js` `linkedBusinesses`; `credit.js` `linkedExposure`; `common.jsx` Passport |
| Profile changes: fitting ones apply at once, contradicting ones go to Data Admin; owner changes need every owner's code | ONB-09 | `actions.js` `classifyProfileChange`, `changeProfile`, `decideChange`; `Profile.jsx` |
| Money accounts added from Profile; starting balance and closure approved by Data Admin | ONB-03, ONB-09 | `actions.js` `addChannel`, `requestCloseChannel`; kind `channel_opening` |
| Starting position typed by the business only, never negative, approved by someone else | ONB-08 | `actions.js` `saveOpening`, `decideOpening` |
| Maker-checker: staff accounts (System Admin proposes, Super user approves; two for powerful roles); lenders and suppliers (Data Admin checks, a different System Admin approves); nobody decides their own proposal | ADM-01, ADM-02 | `actions.js` `proposeStaff`, `approveStaff`, `checkOrg`, `decideOrg`, `decideChange`; `SystemAdmin.jsx` Users, `DataAdmin.jsx` |
| Only the assigned officer rates, once per period; first rating always re-checked by someone else; admins review only | RAT-02, RAT-11 | `actions.js` `saveRating`, `recordRecheck`; menus |
| Repeated transaction reference = duplicate | REC-07 | `posting.js` `findDuplicate` |
| Entries on a closed day held as corrections for Data Admin | DAY-10 | `posting.js` `closedDay`; `actions.js` `addEntry`, `decideHeld` |
| Loan repayment split into principal and interest | REC-13 | `actions.js` `addEntry`; `Record.jsx` |
| Amounts, dates, accounts, loan steps, consent and quote steps checked by the rules | REC, FIN, SUP | `actions.js` guards |
| Tanzania time everywhere | UX-07 | `util.js` `tzDateOf`, `tzTimeOf`, `today` |
| Help guide: phone users see phone-sized pictures, desk users desktop ones; tap to enlarge | HLP-01 | `shared.jsx` Guide; `public/guide/*.json` regenerated |
| Messages (success and error notices) are now always shown; previously they were never displayed | UX | `store.jsx` toast |
| From TFL's first test of V12: the Send code button is orange with a short how-to; PIN problems show under the PIN box at once; the last registration step lists everything still missing; Forgot my PIN says when a number is not registered | ROLE-01, ONB-05 | `Onboard.jsx` `PhoneCode`, `SignIn.jsx` `ForgotPin` |
| Test data: PIN 2468, valid NIDAs, identity verified; second Super user test account | Tab 2, Test data | `testData.js`, `seed.js` |

## Revisions of 27 October 2026 (developer review)

Agreed with TFL after an independent developer reviewed V10. The spec is now the *TijaPass V10 Master Functional Specification*; its decision log and tab 4 (acceptance-test matrix) cover each item.

| Change | Requirements | Where |
|---|---|---|
| Recording never blocked by unclosed days; warning banner and "Catch up now"; financing waits until records are reconciled | DAY-08, REC-11, CRD-03 | `Record.jsx`, `Home.jsx`, `Close.jsx`, `credit.js` `reconciliation` |
| Unexplained count differences go to a `suspense` account; Data Admin resolves them with a reason; within-tolerance differences written off | DAY-07 | `kinds.js`, `accounting.js`, `actions.js` `closeDay` / `resolveSuspense`, Approval queue → Cash differences to resolve |
| Mchezo, upatu, VICOBA: one clarifying question; early payout above savings owed to the group | REC-09 | `Record.jsx` group step, `accounting.js` `linesFor` |
| Imported withdrawals and deposits need their purpose; statement evidence grade A–D | IMP-02, IMP-04 | `Record.jsx` `gradeStatement`, `Home.jsx` explain |
| Risk-based rating sample (half higher-risk, half random) | RAT-06 | `rating.js` `riskOf`, `pickSample` |
| Rating gate: 70%+ automatic, 50–69% lender's recorded review, below 50% blocked | RAT-13, CRD-03 | `credit.js` `ratingGate`, `gates`; `Fi.jsx` review checkbox and note |
| V9's five criteria restored, rating weight reduced; repeat weights only once an instalment is due | CRD-01, CRD-02 | `credit.js` `score`, `DEFAULT_WEIGHTS`; Settings → two weight sets |
| Self-declared entries count half as credit evidence; passport shows how reliable the records are | CRD-01 | `credit.js` `isSupported`, `evidenceMix`; `common.jsx` Passport |
| Affordability uses the lower of profit and operating cash flow | CRD-04 | `credit.js` `monthlyBase`, `affordability` |
| Optional FI disbursement and collection fees, off by default | PKG-06 | `billing.js` `fiBill`; Packages and prices → Optional lender services |
| BOT privacy: minimum group 10, minimum cell 3, complementary suppression, export rules, export log | BOT-01, BOT-07 | `kpi.js`, `Kpi.jsx` |
| Baseline corrections keep the original answers | ONB-06 | `actions.js` `correctBaseline`; Officer → business file |
| 6-digit PINs (OTP and MFA in the live pilot). *Replaced on 29 Oct by 4-digit PINs; kept here as history.* | ROLE-01 | `Onboard.jsx`, `SignIn.jsx` |
| Accountant review after posting for material uncertain entries | REC-12 | `actions.js` `addEntry` / `reviewPosted`; Approval queue → Accountant review |
| Super user test-data loader: 10 businesses, 100 transactions, 8 ratings; load and remove | Tab 2, Test data | `src/lib/testData.js`, `SystemAdmin.jsx` `TestData`, `public/samples/test-data/` |
| Stage 2 = installable web app (PWA) plus secure backend; native apps later | Tab 3 | Spec only |

## Biggest changes from V9

- **Real sign-in per user type** instead of V9's role drop-down and business/FI/supplier pickers. Every screen checks access, not just the menu.
- **One Record screen**, description first, read by AI (or built-in rules) and confirmed in plain words; V9's Business Transactions form and `window.confirm` pop-ups are gone.
- **Entries post at once**; only serious conflicts wait for Data Admin. All posted entries count for credit.
- **Daily close** with counting of all money, per-channel differences, guided reasons, catch-up and the tester clock. New.
- **TijaPass Records Rating**: monthly officer checklist, five checks, bands, badges, disputes and re-checks, linked to credit. New.
- **Clean start**: no seeded businesses; test accounts only. Storage key `tijapass-v12`.
- **New prices, FI packages and sponsorship**; V9 FI fees removed.
- **BOT dashboard** with ten KPIs and three extra tiles, privacy by minimum group size. New.
- **Kiswahili and English everywhere**, switchable at any time; all text in `docs/translations.csv`.

## Requirement map

### Users, access and admin

| ID | Implemented in |
|---|---|
| ROLE-01 | `src/screens/SignIn.jsx`: business phone + PIN, lenders/suppliers by email, test accounts tab (web MVP only); no role switcher anywhere |
| ROLE-02 | `src/lib/access.js` `businessesInScope`: officers see assigned businesses, FIs only consenting ones, suppliers and report users none; supplier screens show only their own requests, quotes, orders |
| ROLE-03 | `src/App.jsx` route table: each screen lists allowed user types; any other address returns to the user's home. Business data reads are re-checked inside screens (`canSeeBusiness`) |
| ROLE-04 | Texts use TijaPass and Business / Mjasiriamali; footer names Tracell Finance Limited as operator |
| ROLE-05 | `src/lib/actions.js` `audit()`: who, when, before, after, reason; every Admin change asks for a reason (`ReasonModal`); corrections are reversals |
| ADM-01 | Four tiers with menus in `src/ui/menus.js`; officers limited to assigned businesses |
| ADM-02 | Approval queue `src/screens/admin/DataAdmin.jsx`: held entries with AI recommendation, starting positions, profile changes, corrections and stock updates from ratings, declared loans, new lenders and suppliers, businesses without an officer, rating disputes |
| ADM-03 | Settings screen: tolerance, flag level, duplicate window, dispute window, rating frequency per band, minimum group size, score weights, support contacts and more |
| ADM-04 | Input fields screen: optional onboarding fields (text, number, choice; required or not) |
| ADM-05 | Assign officer from My businesses or the approval queue, with history |

### Menus and homes

| ID | Implemented in |
|---|---|
| MENU-01 | `src/ui/menus.js`, exactly as specified; alerts behind the bell. Super user has the System Admin menu plus the KPI dashboard |
| HOME-01 | Business home: Record money in / out first, today's totals, close status, Records Rating badge, passport score, last sign-in, new messages, to-dos |
| HOME-02 | FI dashboard: consenting businesses, requests by status, portfolio, due and overdue, assessments this month; each tile opens its list |
| HOME-03 | Supplier dashboard: open requests, quotes awaiting reply, orders to deliver, payments due |
| HOME-04 | Officer/Admin home (My businesses): businesses in scope, closed today, flagged differences, checks due this week, pending approvals, open queries |

### Onboarding and profile

| ID | Implemented in |
|---|---|
| ONB-01 to ONB-03 | `src/screens/Onboard.jsx` five-step wizard: owner (photo, NIDA and ID photo, DOB, gender, phones, email, address), business (type, sector, region, months, staff, GPS + address, closing time, custom fields), money channels (cash, each wallet, each bank) |
| ONB-04, ONB-05 | Self sign-up leaves the officer empty and alerts Data Admin; officers onboard in the field and the business can sign in at once |
| ONB-06 | Baseline questions asked once, stored on the business, never editable; feed KPIs 2, 4, 7 |
| ONB-07, ONB-08 | Starting position in plain words, equity calculated; submitted by business or officer, approved by Data Admin, then locked (only Admin edits, with a reason) |
| ONB-09 | Phone, second phone, email, address and location changes go to the approval queue; identity fields are Admin-only |
| ONB-10 | Consent with scope and time; per-FI consent and withdrawal in Profile; FI access stops at once |

### Recording

| ID | Implemented in |
|---|---|
| REC-01 | Only the Record screen (and the close/catch-up quick-add that uses the same form) creates entries |
| REC-02 | Field order: in/out/move, amount, channel, date, description (typed or voice); payer, reference and receipt photo optional |
| REC-03 | `src/lib/ai.js` → Netlify Function `ai` (task `read_entry`); fallback `src/core/reader.js` reads Kiswahili/English number words, slang and channels |
| REC-04 | Reading card: plain sentence + amount + "Correct?", Yes, up to three alternatives, or write again; no account names on business screens |
| REC-05 | After two failed tries the ready phrases appear (also available at any time via "Choose from a list") |
| REC-06 | Designed check screen (amount, in/out, where, date, who, meaning) with Edit / Save; no browser pop-ups anywhere |
| REC-07, REC-08 | `src/core/posting.js`: duplicate only with same payer and reference or same payer within the window; holds for direction conflict, unusual amount, overdraw, with plain reasons to the business and the AI recommendation to Admin |
| REC-09, REC-10 | Drawings, capital, group savings (payout surplus → other income), group loans, transfers: `src/core/kinds.js`, `accounting.js` |
| REC-11 | Catch-up screen, one missed day at a time, oldest first |

### Statement upload

| ID | Implemented in |
|---|---|
| IMP-01 | PDF (with password), CSV and Excel (.xlsx) in `Record.jsx` → `src/lib/pdf.js` (PDF.js), `xlsxReader.js`; AI task `read_statement` when available, otherwise text rules |
| IMP-02, IMP-03 | `checkStatement`: name match, layout, running balances, date range, matched lines; shown as a reliability list that never claims the file is genuine; another name blocks saving |
| IMP-04 | Unclear lines go to My activity → "Statement lines to explain"; the rest post as normal entries (no automatic hold). Lines dated before the business joined are skipped |
| IMP-05 | Original file kept (IndexedDB) and linked from every entry it produced; Admin opens it from the journal |

### Daily close

| ID | Implemented in |
|---|---|
| DAY-01 | Alert and home banner at each business's closing time; "Close my day" always available |
| DAY-02 to DAY-05 | `src/screens/business/Close.jsx`: summary and "Anything missing?", count of all money with book figures hidden, per-channel comparison, tolerance from Settings |
| DAY-06, DAY-07 | Guided reasons create their entries; remainder posts to cash difference; large or repeated differences flagged to the officer |
| DAY-08 | 09:00 reminder; Record blocked while earlier days are open; catch-up then one count covering the gap |
| DAY-09 | On time = closed the same day or before 09:00 next morning; feeds timeliness and "days closed" on the passport |

### Records Rating

| ID | Implemented in |
|---|---|
| RAT-01 | Name "TijaPass Records Rating" / "Kiwango cha Kumbukumbu cha TijaPass" (translator to confirm) |
| RAT-02 | `dueList`, `nextDue`: first check about 30 days after joining, then per band frequency (Settings) |
| RAT-03, RAT-08 | `src/core/rating.js` scoring table; each check rounded to whole points so the total equals the sum |
| RAT-04 to RAT-07 | `src/screens/admin/RatingCheck.jsx`: one check per screen with required photos and answers, GPS and time stamp, distance flag, app-picked sample, no editing; wrong entries become correction requests and stock differences become stock update requests |
| RAT-09 | `RatingBadge`: colour + band name + date everywhere (home, profile, passport, FI directory and file, officer and admin lists) |
| RAT-10 | Business rating screen: breakdown, tips, acknowledge, dispute within the window; "under review" until Data Admin decides |
| RAT-11 | Random re-check share (Settings), re-check score and gap flag beside the original |
| RAT-12 | Business: all; FI with consent: band, score, date, checks, six months; Admin: all plus evidence; Reports: band shares only |
| RAT-13, RAT-14 | Credit gate and score factor; monthly trend chart |

### Accounting and reports

| ID | Implemented in |
|---|---|
| ACC-01 to ACC-04 | `src/core/accounting.js`, `kinds.js` (see `docs/ACCOUNTING_MAP.md`); entries store their source (typed, voice, ready phrase, upload, close, Admin, loan) and approver |
| REP-01 to REP-03 | Business Reports: income statement, balance sheet, direct cash flow, date presets and custom range, PDF via the browser's print to PDF in the chosen language; My activity |
| REP-04 | Data Admin ledger screen: journal (source filter), ledger by account, trial balance, reverse, change treatment, stock adjustment |

### Credit, finance, suppliers, FI workspace

| ID | Implemented in |
|---|---|
| CRD-01 to CRD-07 | `src/core/credit.js`: all posted entries count; rating factor with weights from Settings; gates incl. rating; affordability with external loans; instalment limits; passport; "indicative" labels |
| FIN-01 to FIN-06 | Loan types (asset needs an accepted supplier quote), external-loan declaration (Admin edits with history), three-month questions, offers with full cost, checks at request/offer/disbursement, tracker, asset finance paid to the supplier with delivery confirmation |
| SUP-01 to SUP-04 | Quote requests from businesses and FIs, supplier product list, quote → invoice → payment → delivery → receipt, supplier self-registration with approval |
| FIW-01 to FIW-06 | FI self-registration with approval, consent-only directory with filters, business file (passport, rating history, statements, cash movement, loans, messages), products, assessment logging and billing, no accounting screens |
| WAL-01 | Wallet screens labelled "Simulated wallet" |
| PKG-01 to PKG-06 | Per-user packages, new prices, FI packages with 10% annual discount, sponsorship tiers and limits (1 VIP, 2 Partners), simulated payments (failure and repeat-safe), no V9 FI fees |

### Help, alerts, BOT, language

| ID | Implemented in |
|---|---|
| HLP-01 to HLP-04 | Guide per user type with screenshots (`public/guide/en.json`, `sw.json`), searchable FAQ by topic, chat (AI or FAQ) that becomes an Admin query with the chat attached, WhatsApp and phone from Settings |
| NOT-01, NOT-02 | Bell alerts for close, 09:00 reminder, holds, decisions, ratings, offers, repayments, quotes, answers; officers' weekly list of checks due |
| MSG-01 | Threads tied to a loan, quote, business file or Admin conversation |
| BOT-01 to BOT-08 | `src/core/kpi.js`, `src/screens/reports/Kpi.jsx`: aggregated only, minimum group and cell size with complementary suppression, priority KPIs first, KPI 2 as two shares, KPI 4 requests vs approvals, three extra tiles, definitions, filters, CSV and PDF export; more Reports users can be added in Users and roles |
| UX-01 to UX-06 | Kiswahili/English toggle on every screen; V9 brand; plain words on business screens; 320 px layouts and voice input; one "Test version" marker; band names with colours |

## Web MVP simulations (tab 2)

Sign-in with test accounts; AI through a Netlify Function with labelled rules fallback; tester clock; officer checklist with camera/upload photos and browser location; simulated payments and wallets; messages, queries and approvals stored in the browser; BOT dashboard from browser data with an adjustable minimum group size.
