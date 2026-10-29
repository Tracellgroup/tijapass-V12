# Acceptance tests (web MVP)

This file mirrors **tab 4, Acceptance-test matrix**, of the *TijaPass V10 Master Functional Specification*. The web MVP passes when every test passes in both Kiswahili and English. The **Result** column is the developer's automated browser run (Chromium, 390 px, 320 px and 1280 px) on 29 October 2026, after the pre-live revisions agreed that day (rows marked **29 Oct** are new or changed). TFL runs every test again on the deployed site. The language switch is the globe button in the top bar.

"Rule test" means the outcome is checked by the automated rule tests (`npm test`, 62 tests) rather than clicked through on screen. Every rule is enforced by the rule layer itself, not only by the screens, because the pilot's server will run the same rules.

## Before you start

1. Open the site in a fresh browser profile, or use **System Admin → Settings → Test tools → Reset all data**.
2. Use the **Test accounts** tab to sign in as each staff, lender, supplier or report user. Business users sign in with phone number and a **4-digit PIN**.
3. Businesses are created only by **Register my business** on the sign-in screen (staff cannot create them). The test version shows the SMS code on screen. Suggested test business, so the sample statements match: business **Neema Mboga Shop**, owner **Neema Juma Mushi**, phone **0712 345 678**, PIN **4826** (easy PINs such as 1234 are refused). Then, as Data Admin: verify identity, approve the starting position, assign **Neema Officer**.
4. Ready-made data: **Super user → Test data → Load test data** loads 10 fictional businesses (TPDEMO-B01 to B10), the 100 sample transactions and 8 Records Ratings, with identity already verified. Tick "Add 6 months of earlier activity" to test loan journeys. Business logins are `+2557000010xx` (B01 = `+255700001001`), PIN **2468**. **Remove test data** deletes all of it.
5. To fill one hand-made business with past activity: **System Admin → Settings → Test tools → Generate sample activity** (95 days).
6. **Tester clock** (clock button in the top bar): 17:00, next morning, several days ahead, end of month, or 46 days ahead. All dates follow Tanzania time.
7. A second Super user test account exists, so the two-approver rule for powerful staff accounts can be tried.

Expected spread after loading test data with history: B01, B02, B03, B05 and B07 are automatically eligible for a loan; B04 and B06 (Okay) need the lender's recorded review; B08 (Poor) is blocked; B09 and B10 are not yet rated.

## Matrix

| ID | User | Action | Expected outcome | Requirements | Result |
|---|---|---|---|---|---|
| A1 | Each user type | Sign in with each test account | Exactly its own menu, in MENU-01 order (29 Oct: no "Onboard a business"; Records Rating only for officers) | MENU-01, ROLE-01 | Passed |
| A2 | Supplier | Type a ledger, business, FI-business, activity or reports address | Sent back to the supplier dashboard | ROLE-02, ROLE-03 | Passed |
| A3 | Officer 2 | Open a business assigned to officer 1 | "This business is not assigned to you" | ROLE-03 | Passed |
| A4 | Tester | Open the app in a fresh browser | No businesses, entries, ratings or loans | Tab 2, Test data | Passed |
| A5 | Business | Register, then sign in (29 Oct) | Code to the main phone required; 4-digit PIN; 1234 refused as too easy; one wrong PIN warns how many tries are left | ROLE-01, ONB-05 | Passed |
| A6 | Officer, Data Admin, System Admin | Look for business onboarding; type its old address (29 Oct) | No such menu item or screen; the address returns home; sign-in page says staff cannot register a business | ONB-05, ROLE-03 | Passed |
| A7 | Business | Enter wrong PINs (29 Oct) | 5 wrong: locked 15 minutes, even the right PIN waits; 10 in a row: blocked until the business's officer or Data Admin unlocks after checking the NIDA; forgot-PIN needs a phone code | ROLE-01 | Passed (rule test; warning checked on screen) |
| A8 | Business | Leave the app idle; open a new tab (29 Oct) | Signed out after 15 minutes idle (setting); session ends when the browser or tab closes | ROLE-01 | Passed |
| A9 | Business | Forgot my PIN with a number never registered; register with PIN 7654 (29 Oct, from TFL testing) | Told at once to register first, no code offered; the PIN problem shows under the PIN box straight away, and the last step lists everything still missing | ROLE-01, ONB-05 | Passed |
| O1 | Business, Data Admin | Business enters its starting position; Data Admin approves with a reason (29 Oct: officers cannot type it; the person who entered it cannot approve it) | Locked; business sees a summary, no form; equity calculated | ONB-07, ONB-08 | Passed |
| O4 | Business | Register: business first, then owners, management, money, questions, code and PIN (29 Oct) | Two owners with shares 60/40 (not 60/30); birth years end at 2014 (age 12+); 29 Feb only in leap years; NIDA counts its 20 digits; manager needs name and phone; education optional | ONB-01, ONB-02, ONB-11, ONB-12 | Passed |
| O5 | Business | Confirm the co-owner later from Profile, Owners (29 Oct) | Code to the co-owner's own phone; identity gate stays closed until every owner confirms | ONB-11 | Passed |
| O6 | Data Admin | Approval queue, Identity to verify (29 Oct) | Owners, shares, NIDA and photos shown; verified or not, with a reason; credit features need "verified" | ONB-05, CRD-03 | Passed |
| O7 | Business, Data Admin | Profile: change email; change main phone (29 Oct) | Email changes at once and is logged; the new phone needs a code, a reason and Data Admin approval, then becomes the sign-in | ONB-09 | Passed |
| O8 | Business, Data Admin | Profile, Owners: add an owner or change shares (29 Oct) | Needs every current owner's phone code, then Data Admin; identity is checked again | ONB-09, ONB-11 | Passed (rule test) |
| O9 | Business, Data Admin | Profile, Money accounts: add a bank account with TZS 150,000 (29 Oct) | Account usable at once; its starting balance counts only after Data Admin approves; closing an account needs a zero balance | ONB-03, ONB-09 | Passed |
| O10 | Business | Register two businesses with the same NIDA (29 Oct) | Allowed, linked to the same person and flagged to Data Admin; the lender's passport shows how many other businesses the owner has and what they owe and have overdue, without their names | ONB-12 | Passed (rule test) |
| O2 | Business, Data Admin | Change the main phone number | Old number works until Data Admin approves (29 Oct: the new number is confirmed by code first) | ONB-09 | Passed |
| O3 | Data Admin | Correct an inclusion-baseline answer with a reason (Officer → business file → Inclusion baseline) | Original kept; correction shown beside it with who and why | ONB-06 | Passed (rule test) |
| R1 | Business | Type "nimeuza mboga elfu ishirini cash" with no payer | Plain reading of a TZS 20,000 cash sale; posts after the check screen | REC-02 to REC-04, REC-06 | Passed |
| R2 | Business | Record two TZS 20,000 sales minutes apart, no payer | Both post | REC-07 | Passed |
| R3 | Business | Give two unclear descriptions in a row | Ready phrases on the third attempt | REC-05 | Passed |
| R4 | Business | Type "nimechangia mchezo" | One group question; saved as group savings; profit unchanged | REC-09 | Passed |
| R5 | Business | Record a group payout received early, then a contribution | Excess over savings is owed to the group; the contribution repays it; no income | REC-09 | Passed (rule test) |
| R6 | Business, Data Admin | Money out TZS 999,000 from M-Pesa | Held with a plain reason; Data Admin declines with a reason | REC-08 | Passed |
| R8 | Business | Record the same M-Pesa reference twice without a payer (29 Oct) | Second one held as a duplicate | REC-07 | Passed |
| R9 | Business, Data Admin | Record a sale dated on a day already closed (29 Oct) | Warned on the date picker; held for Data Admin as a correction; the close shows the adjustment after approval | DAY-10, REC-08 | Passed |
| R10 | Business | Record "I repaid a loan" of 12,000 with 2,000 interest (29 Oct) | 10,000 reduces the loan; 2,000 shows as interest cost; interest of the whole amount is refused | REC-13 | Passed (rule test) |
| R7 | Business, Data Admin | Record a material uncertain entry (TZS 50,000 or more, by ready phrase or low AI confidence) | Posts at once; joins **Approval queue → Accountant review**; Data Admin confirms or changes the treatment with a reason | REC-12 | Passed (rule test) |
| S1 | Business | Upload `nmb-statement-other-name.pdf` | Flagged, grade D; nothing can be saved | IMP-02, IMP-03 | Passed |
| S2 | Business | Upload `mpesa-statement-neema-password-1234.pdf` (password 1234) | Asks for the password; checks listed; grade A; no claim the PDF is genuine | IMP-01 to IMP-03 | Passed |
| S3 | Business | Save that statement | The unclear line and the withdrawal go to "Statement lines to explain"; transfer suggested, never assumed | IMP-04 | Passed |
| S4 | Business | Upload the same statement again, then `mpesa-statement-neema.csv` | Lines matched as "Already recorded", never posted twice | IMP-02 | Passed |
| D1 | Business | Clock 17:00; count cash 15,000 above book; choose "A customer paid what they owed" 10,000 | Receipt of 10,000 created; 5,000 waits in suspense, not profit; small M-Pesa difference accepted | DAY-01 to DAY-07 | Passed |
| D2 | Business | Clock +3 days, then Record | Recording works with a warning banner; records-reconciled gate fails; Catch up now shows Day 1 of 2, Day 2 of 2, then one count | DAY-08, REC-11, CRD-03 | Passed |
| D3 | Data Admin | Approval queue → Cash differences to resolve → Resolve to sales with a reason | Suspense cleared and logged; reconciled gate passes | DAY-07 | Passed |
| D4 | Business, Data Admin | Open Reports; open Ledger, journal and trial balance | Business sees the three statements and My activity; trial balance balanced | ACC, REP | Passed |
| T1 | Business | Open Home as a new business | "Not yet checked" in grey | RAT-09 | Passed |
| T2 | Officer | Complete a monthly check | GPS and time stamped; each step needs its evidence; the app picks 10 entries, half of them higher-risk | RAT-04 to RAT-06 | Passed |
| T3 | Officer | Review the points | Total equals the sum; band follows the table (e.g. "Excellent, 94%", "Okay, 54%") | RAT-03, RAT-08 | Passed |
| T4 | Business, Data Admin | Acknowledge a rating, then dispute one | "Under review" until Data Admin decides | RAT-10 | Passed |
| T5 | Data Admin | Records Rating review → Re-checks | About 1 in 10 checks picked; with "Share of checks re-checked" set to 1, every check is picked | RAT-11 | Passed by design |
| T6 | Business | Clock +46 days | "Check overdue" | RAT-02, RAT-13 | Passed |
| T8 | Officer, Data Admin | Try a second records check in the same period; try rating as Data Admin (29 Oct) | Not offered: "Next check possible from…"; admins have no rating screen; only the assigned officer can rate | RAT-02, RAT-04 | Passed |
| T9 | Officer, Data Admin | First rating of a business (29 Oct) | Always picked for re-check; the re-check must be by a different person | RAT-11 | Passed (rule test) |
| T7 | Each user type | Search every screen | No "audit" or "true and fair" (the System Admin menu item "Audit trail" is kept from MENU-01) | RAT-01, UX-05 | Passed |
| C1 | FI | Offer a loan to a business rated Poor | Blocked | CRD-03, RAT-13 | Passed |
| C2 | FI | Offer a loan to a business rated Okay (54%) | Allowed only after ticking "I have reviewed this business's records myself" and writing a note | CRD-03, RAT-13 | Passed |
| C3 | FI | Offer a loan to test business B01 (Excellent, clean gates) | Automatically eligible | CRD-03 | Passed |
| C4 | Business, FI | Open the credit passport | Five criteria plus rating with their weights; "How reliable the records are" card; affordability shows profit, cash and the lower one used | CRD-01, CRD-02, CRD-04, CRD-06 | Passed |
| C5 | FI, Supplier | Disburse, take the first instalment, then an asset loan paid to a supplier | First-loan weights until an instalment falls due; asset paid to the supplier, delivery confirmed, equipment on the books | CRD-02, FIN, SUP | Passed |
| C6 | System Admin, FI | Packages and prices → Optional lender services: switch fees on, then off | Off (default): no fee anywhere. On: the FI bill lists each disbursement and collection | PKG-06 | Passed (rule test; "off" checked on screen) |
| C7 | FI | Disburse after the business withdrew consent (29 Oct) | Payout button replaced by a notice; the rules refuse it too | CRD-03, ONB-10 | Passed (rule test) |
| C8 | Business | Send a second loan request to the same lender while one is open (29 Oct) | Refused until the first is answered | FIN-01 | Passed (rule test) |
| C9 | Business (owner aged 15) | Request a loan (29 Oct) | Refused: loans need a main owner aged 18 or older | CRD-03, ONB-01 | Passed (rule test) |
| P1 | Business | Fail a payment, pay, then repeat the confirmation | A failed payment unlocks nothing; no double charge | PKG-05 | Passed |
| P2 | Business, FI, Supplier | Open packages | Prices match (500 / 1,500 / 5,000 / 10,000; FI 500,000 / 2,000,000 / 6,000,000 a month); each sees only its own packages | PKG-01 to PKG-03 | Passed |
| B1 | Reports | Open the dashboard (minimum group 10) | Small groups hidden; no business name visible | BOT-01, RAT-12 | Passed |
| B2 | Reports | Filter to a small group | Hidden, including the complementary figure; export blocked below twice the minimum | BOT-01, BOT-07 | Passed |
| B3 | Reports | Export to CSV | Same suppression plus a privacy note; the export is logged | BOT-07 | Passed (rule test) |
| B4 | Reports | System Admin lowers the minimum group to 1 in Report design | Ten KPIs, priorities first, then three tiles | BOT-02, BOT-03, BOT-05 | Passed |
| S5 | System Admin, Super user | Propose an officer; propose a System Admin (29 Oct) | Officer active after one Super user approval; System Admin needs two different approvers; nobody approves their own proposal or role | ADM-01 | Passed (rule test) |
| S6 | Data Admin, System Admin | Approve a new lender (29 Oct) | Data Admin checks the licence first; a different System Admin approves | ADM-02 | Passed (rule test) |
| L4 | Any | Phone set to another time zone (29 Oct) | Days and times follow Tanzania time | UX-07 | Passed (rule test) |
| H1 | Business, Data Admin | Ask the help chat, send it as a complaint; Data Admin replies | The query carries the chat; the business sees the reply | HLP | Passed |
| H2 | Each user type | Open Help → Guide (29 Oct) | A screenshot for every menu item, in English and Kiswahili; phone users see phone-sized pictures beside the text (240 px on a wide screen), desk users see desktop pictures; tapping enlarges | HLP-01 | Passed |
| L1 | Business | Switch to Kiswahili on Home, Record, Close, Reports, Finance, Rating | No English left; no TFL, V8 or V9 labels | UX-01, UX-05 | Passed |
| L2 | Each user type | Open every menu item at 320 px wide | No sideways scrolling | UX-04 | Passed |
| X1 | Super user | Test data → Load (with history and closes) | 10 businesses, all 100 transactions with their references, 8 ratings; System Admin has no loader | Tab 2, Test data | Passed |
| X2 | Super user, FI, Reports | Check the loaded spread | B01 Excellent 94%; B08 Poor 42%; B09 not yet checked; FI directory lists them; Reports sees them only in aggregate | CRD-03, BOT-01 | Passed |
| X3 | Super user | Test data → Remove | Every test record deleted in one step and logged | Tab 2, Test data | Passed |

## Rule tests

`npm test` runs 62 tests. The 26 in `tests/controls.test.js` (29 Oct) cover every gap found in the pre-live scenario testing: registration only by the business, ages and dates, NIDA format and linking, owners and shares, PIN lockout and old 6-digit PINs, recording checks, closed days, interest split, daily-close checks, starting position, Records Rating limits, the loan order and consent, profile-change rules, money accounts, staff and lender approvals, quote steps, Tanzania time and the test data. The other 36 cover: amount words, Kiswahili/English reading, posting and holds, opening equity, personal and group money (including early rotating payouts), cash flow, daily close, suspense and its resolution, catch-up, rating points, bands and risk-based sampling, overdue, the revised credit gates (automatic, lender review, blocked), first-loan versus repeat-borrower weights, evidence weighting, affordability, schedules, prices and sponsorship, optional FI fees, KPI privacy with complementary suppression, statement parsing, the test-data loader, the accountant review after posting, baseline corrections, and the main actions (decisions, offers, payments, assessments, consent, scope).
