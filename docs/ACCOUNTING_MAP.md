# Chart of accounts and ready-phrase mapping

Generated from `src/core/kinds.js` by `npm run accounting-map`. The AI only suggests the entry type; the engine (`src/core/accounting.js`) posts these lines. Every journal balances.

## Chart of accounts (ACC-02)

| Key | Group | English | Kiswahili |
|---|---|---|---|
| `ch:<id>` | asset | One account per money channel: cash in hand, each mobile money wallet, each bank account | Akaunti moja kwa kila njia ya pesa |
| `receivables` | asset | Money customers owe | Madeni ya wateja |
| `inventory` | asset | Stock | Bidhaa (stoku) |
| `groupSavings` | asset | Group savings (mchezo, upatu, VICOBA) | Akiba ya kikundi (mchezo, upatu, VICOBA) |
| `equipment` | asset | Equipment and other business assets | Vifaa na mali nyingine za biashara |
| `payables` | liability | Money owed to suppliers | Madeni ya wasambazaji |
| `loansShort` | liability | Loans due within 12 months | Mikopo ya chini ya miezi 12 |
| `loansLong` | liability | Longer loans | Mikopo ya muda mrefu |
| `groupLoans` | liability | Group loans (VICOBA) | Mikopo ya kikundi (VICOBA) |
| `openingEquity` | equity | Opening equity | Mtaji wa kuanzia |
| `capital` | equity | Owner capital | Mtaji wa mmiliki |
| `drawings` | equity | Owner drawings | Matumizi binafsi ya mmiliki |
| `sales` | income | Sales | Mauzo |
| `otherIncome` | income | Other income | Mapato mengine |
| `purchases` | cos | Stock purchases | Manunuzi ya bidhaa |
| `stockChange` | cos | Stock change | Mabadiliko ya stoku |
| `rent` | expense | Rent | Kodi ya pango |
| `utilities` | expense | Electricity and water | Umeme na maji |
| `transport` | expense | Transport | Usafiri |
| `wages` | expense | Wages | Mishahara |
| `otherExpenses` | expense | Other business costs | Gharama nyingine za biashara |
| `loss` | expense | Losses | Hasara |
| `interest` | expense | Loan interest and fees | Riba na ada za mkopo |
| `cashDifference` | expense | Cash differences written off | Tofauti za pesa zilizofutwa |
| `suspense` | asset | Cash differences to resolve | Tofauti za pesa zinazosubiri ufumbuzi |
| (calculated) | equity | Retained earnings = cumulative profit from posted entries; never typed (ACC-03) | Faida iliyobaki |

## Ready phrases and their accounting (REC-05, REC-09, REC-10)

| Entry type | Ready phrase (English) | Ready phrase (Kiswahili) | Debit | Credit | Cash flow line |
|---|---|---|---|---|---|
| `sale_cash` | I sold goods for cash | Nimeuza bidhaa kwa pesa taslimu | the entry's money channel (cash / wallet / bank) | Sales (`sales`) | Cash from sales |
| `sale_credit` | I sold on credit | Nimeuza kwa mkopo (mteja atalipa baadaye) | Money customers owe (`receivables`) | Sales (`sales`) | none (no money moves) |
| `debtor_receipt` | A customer paid what they owed | Mteja amelipa deni lake | the entry's money channel (cash / wallet / bank) | Money customers owe (`receivables`) | Cash from customers who owed you |
| `stock_cash` | I bought stock with cash | Nimenunua bidhaa za kuuza kwa pesa taslimu | Stock purchases (`purchases`) | the entry's money channel (cash / wallet / bank) | Paid to suppliers for stock |
| `stock_credit` | I bought stock on credit | Nimenunua bidhaa kwa mkopo | Stock purchases (`purchases`) | Money owed to suppliers (`payables`) | none (no money moves) |
| `supplier_payment` | I paid a supplier I owed | Nimemlipa msambazaji deni nililokuwa nadaiwa | Money owed to suppliers (`payables`) | the entry's money channel (cash / wallet / bank) | Paid to suppliers for stock |
| `rent` | I paid rent | Nimelipa kodi ya pango | Rent (`rent`) | the entry's money channel (cash / wallet / bank) | Paid for business costs |
| `utilities` | I paid electricity or water | Nimelipa umeme au maji | Electricity and water (`utilities`) | the entry's money channel (cash / wallet / bank) | Paid for business costs |
| `transport` | I paid transport | Nimelipa usafiri | Transport (`transport`) | the entry's money channel (cash / wallet / bank) | Paid for business costs |
| `wages` | I paid wages | Nimelipa mshahara au ujira | Wages (`wages`) | the entry's money channel (cash / wallet / bank) | Paid for business costs |
| `other_expense` | I paid another business cost | Nimelipa gharama nyingine ya biashara | Other business costs (`otherExpenses`) | the entry's money channel (cash / wallet / bank) | Paid for business costs |
| `equipment` | I bought equipment or furniture | Nimenunua kifaa au samani ya biashara | Equipment and other business assets (`equipment`) | the entry's money channel (cash / wallet / bank) | Paid for equipment |
| `drawings` | I took money for home use | Nimechukua pesa kwa matumizi ya nyumbani | Owner drawings (`drawings`) | the entry's money channel (cash / wallet / bank) | Owner money in less taken out |
| `capital` | I put my own money into the business | Nimeweka pesa yangu binafsi kwenye biashara | the entry's money channel (cash / wallet / bank) | Owner capital (`capital`) | Owner money in less taken out |
| `group_contribution` | I paid into mchezo, upatu or VICOBA | Nimechangia mchezo, upatu au VICOBA | Group savings (mchezo, upatu, VICOBA) (`groupSavings`) | the entry's money channel (cash / wallet / bank) | Group savings received less paid in |
| `group_payout` | I received my group payout | Nimepokea mgao wangu wa kikundi | the entry's money channel (cash / wallet / bank) | Group savings (mchezo, upatu, VICOBA) (`groupSavings`) | Group savings received less paid in |
| `loan_received` | I borrowed money | Nimekopa pesa | the entry's money channel (cash / wallet / bank) | Loans due within 12 months (`loansShort`) | Loans received less repaid |
| `loan_repayment` | I repaid a loan | Nimelipa mkopo | Loans due within 12 months (`loansShort`) | the entry's money channel (cash / wallet / bank) | Loans received less repaid |
| `group_loan_received` | I borrowed from VICOBA or my group | Nimekopa kutoka VICOBA au kikundi | the entry's money channel (cash / wallet / bank) | Group loans (VICOBA) (`groupLoans`) | Loans received less repaid |
| `group_loan_repayment` | I repaid my group loan | Nimerejesha mkopo wa kikundi | Group loans (VICOBA) (`groupLoans`) | the entry's money channel (cash / wallet / bank) | Loans received less repaid |
| `other_income` | I received other income | Nimepokea mapato mengine | the entry's money channel (cash / wallet / bank) | Other income (`otherIncome`) | Other income received |
| `transfer` | I moved money between cash, mobile money and bank | Nimehamisha pesa kati ya taslimu, simu na benki | destination channel | the entry's money channel (cash / wallet / bank) | none (no money moves) |

## System entry types (created by the daily close, loans or Admin)

| Entry type | Meaning | Debit | Credit |
|---|---|---|---|
| `loss` | Money lost or stolen | Losses (`loss`) | the entry's money channel (cash / wallet / bank) |
| `sale_credit_fix` | A sale I recorded as paid was on credit | Money customers owe (`receivables`) | the entry's money channel (cash / wallet / bank) |
| `cash_over` | Unexplained extra money (to resolve) | the entry's money channel (cash / wallet / bank) | Cash differences to resolve (`suspense`) |
| `cash_short` | Unexplained missing money (to resolve) | Cash differences to resolve (`suspense`) | the entry's money channel (cash / wallet / bank) |
| `cash_over_small` | Small extra money within tolerance | the entry's money channel (cash / wallet / bank) | Cash differences written off (`cashDifference`) |
| `cash_short_small` | Small shortfall within tolerance | Cash differences written off (`cashDifference`) | the entry's money channel (cash / wallet / bank) |
| `suspense_resolve` | Cash difference resolved | Cash differences to resolve (`suspense`) | Cash differences to resolve (`suspense`) |
| `asset_financed` | Asset received through a loan | Equipment and other business assets (`equipment`) | Loans due within 12 months (`loansShort`) |
| `loan_interest` | Loan interest and fees | Loan interest and fees (`interest`) | the entry's money channel (cash / wallet / bank) |
| `channel_opening` | Starting balance of a newly added account | the entry's money channel (cash / wallet / bank) | Opening equity (`openingEquity`) |
| `stock_adjust` | Stock count adjustment | Stock (`inventory`) | Stock change (`stockChange`) |

## Special rules

- **group_payout**: debit the channel; credit group savings up to the amount saved; any surplus is credited to other income.
- **loan_repayment**: reduces loans due within 12 months first, then longer loans.
- **loan_received / asset_financed** with more than 12 monthly (or 52 weekly) instalments post to longer loans.
- **stock_adjust**: signed amount; positive raises stock (credit stock change), negative lowers it. Purchases are expensed to cost of sales (periodic stock method); the stock value changes only through the starting position and stock adjustments after a count.
- **Corrections** are reversals (`contra`: debit and credit swapped) with a reason, never deletions.
- **Opening balances**: channels and assets are debited, liabilities credited, and the difference is credited (or debited) to opening equity, which is calculated, never typed.
