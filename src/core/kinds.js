// Chart of accounts (ACC-02) and entry types ("kinds") with their accounting treatment.
// Each kind is one ready phrase (REC-05). Channel accounts are per business: "ch:<channelId>".

export const ACCOUNTS = {
  receivables: { group: "asset", en: "Money customers owe", sw: "Madeni ya wateja" },
  inventory: { group: "asset", en: "Stock", sw: "Bidhaa (stoku)" },
  groupSavings: { group: "asset", en: "Group savings (mchezo, upatu, VICOBA)", sw: "Akiba ya kikundi (mchezo, upatu, VICOBA)" },
  equipment: { group: "asset", en: "Equipment and other business assets", sw: "Vifaa na mali nyingine za biashara" },
  payables: { group: "liability", en: "Money owed to suppliers", sw: "Madeni ya wasambazaji" },
  loansShort: { group: "liability", en: "Loans due within 12 months", sw: "Mikopo ya chini ya miezi 12" },
  loansLong: { group: "liability", en: "Longer loans", sw: "Mikopo ya muda mrefu" },
  groupLoans: { group: "liability", en: "Group loans (VICOBA)", sw: "Mikopo ya kikundi (VICOBA)" },
  openingEquity: { group: "equity", en: "Opening equity", sw: "Mtaji wa kuanzia" },
  capital: { group: "equity", en: "Owner capital", sw: "Mtaji wa mmiliki" },
  drawings: { group: "equity", en: "Owner drawings", sw: "Matumizi binafsi ya mmiliki" },
  sales: { group: "income", en: "Sales", sw: "Mauzo" },
  otherIncome: { group: "income", en: "Other income", sw: "Mapato mengine" },
  purchases: { group: "cos", en: "Stock purchases", sw: "Manunuzi ya bidhaa" },
  stockChange: { group: "cos", en: "Stock change", sw: "Mabadiliko ya stoku" },
  rent: { group: "expense", en: "Rent", sw: "Kodi ya pango" },
  utilities: { group: "expense", en: "Electricity and water", sw: "Umeme na maji" },
  transport: { group: "expense", en: "Transport", sw: "Usafiri" },
  wages: { group: "expense", en: "Wages", sw: "Mishahara" },
  otherExpenses: { group: "expense", en: "Other business costs", sw: "Gharama nyingine za biashara" },
  loss: { group: "expense", en: "Losses", sw: "Hasara" },
  interest: { group: "expense", en: "Loan interest and fees", sw: "Riba na ada za mkopo" },
  cashDifference: { group: "expense", en: "Cash differences written off", sw: "Tofauti za pesa zilizofutwa" },
  // Unexplained daily-close differences wait here until an authorised person resolves them (suspense account).
  suspense: { group: "asset", en: "Cash differences to resolve", sw: "Tofauti za pesa zinazosubiri ufumbuzi" }
};

export const CHANNEL_TYPES = {
  cash: { en: "Cash", sw: "Taslimu" },
  mobile: { en: "Mobile money", sw: "Pesa ya simu" },
  bank: { en: "Bank", sw: "Benki" }
};

// flow: "in" (money comes into a channel), "out" (money leaves a channel), "none" (no channel moves), "transfer".
// dr / cr: account keys; "CH" = the entry's channel; "TO" = transfer destination.
export const KINDS = {
  sale_cash: { flow: "in", dr: "CH", cr: "sales", cf: "sales", en: "I sold goods for cash", sw: "Nimeuza bidhaa kwa pesa taslimu", plainEn: "You sold goods and received the money", plainSw: "Umeuza bidhaa na kupokea pesa" },
  sale_credit: { flow: "none", dr: "receivables", cr: "sales", en: "I sold on credit", sw: "Nimeuza kwa mkopo (mteja atalipa baadaye)", plainEn: "You sold goods on credit; the customer will pay later", plainSw: "Umeuza kwa mkopo; mteja atalipa baadaye" },
  debtor_receipt: { flow: "in", dr: "CH", cr: "receivables", cf: "customers", en: "A customer paid what they owed", sw: "Mteja amelipa deni lake", plainEn: "A customer paid money they owed you", plainSw: "Mteja amelipa deni alilokuwa anadaiwa" },
  stock_cash: { flow: "out", dr: "purchases", cr: "CH", cf: "suppliers", en: "I bought stock with cash", sw: "Nimenunua bidhaa za kuuza kwa pesa taslimu", plainEn: "You bought stock to sell and paid now", plainSw: "Umenunua bidhaa za kuuza na kulipa sasa" },
  stock_credit: { flow: "none", dr: "purchases", cr: "payables", en: "I bought stock on credit", sw: "Nimenunua bidhaa kwa mkopo", plainEn: "You bought stock and will pay the supplier later", plainSw: "Umenunua bidhaa na utamlipa msambazaji baadaye" },
  supplier_payment: { flow: "out", dr: "payables", cr: "CH", cf: "suppliers", en: "I paid a supplier I owed", sw: "Nimemlipa msambazaji deni nililokuwa nadaiwa", plainEn: "You paid a supplier money you owed", plainSw: "Umemlipa msambazaji deni ulilokuwa unadaiwa" },
  rent: { flow: "out", dr: "rent", cr: "CH", cf: "expenses", en: "I paid rent", sw: "Nimelipa kodi ya pango", plainEn: "You paid rent", plainSw: "Umelipa kodi ya pango" },
  utilities: { flow: "out", dr: "utilities", cr: "CH", cf: "expenses", en: "I paid electricity or water", sw: "Nimelipa umeme au maji", plainEn: "You paid for electricity or water", plainSw: "Umelipa umeme au maji" },
  transport: { flow: "out", dr: "transport", cr: "CH", cf: "expenses", en: "I paid transport", sw: "Nimelipa usafiri", plainEn: "You paid for transport", plainSw: "Umelipa usafiri" },
  wages: { flow: "out", dr: "wages", cr: "CH", cf: "expenses", en: "I paid wages", sw: "Nimelipa mshahara au ujira", plainEn: "You paid wages", plainSw: "Umelipa mshahara au ujira" },
  other_expense: { flow: "out", dr: "otherExpenses", cr: "CH", cf: "expenses", en: "I paid another business cost", sw: "Nimelipa gharama nyingine ya biashara", plainEn: "You paid a business cost", plainSw: "Umelipa gharama ya biashara" },
  equipment: { flow: "out", dr: "equipment", cr: "CH", cf: "assets", en: "I bought equipment or furniture", sw: "Nimenunua kifaa au samani ya biashara", plainEn: "You bought equipment or furniture for the business", plainSw: "Umenunua kifaa au samani ya biashara" },
  drawings: { flow: "out", dr: "drawings", cr: "CH", cf: "owner", en: "I took money for home use", sw: "Nimechukua pesa kwa matumizi ya nyumbani", plainEn: "You took money for home or personal use", plainSw: "Umechukua pesa kwa matumizi ya nyumbani" },
  capital: { flow: "in", dr: "CH", cr: "capital", cf: "owner", en: "I put my own money into the business", sw: "Nimeweka pesa yangu binafsi kwenye biashara", plainEn: "You put your own money into the business", plainSw: "Umeweka pesa yako binafsi kwenye biashara" },
  group_contribution: { flow: "out", dr: "groupSavings", cr: "CH", cf: "groups", en: "I paid into mchezo, upatu or VICOBA", sw: "Nimechangia mchezo, upatu au VICOBA", plainEn: "You paid into your savings group", plainSw: "Umechangia kikundi chako cha akiba" },
  group_payout: { flow: "in", dr: "CH", cr: "groupSavings", cf: "groups", en: "I received my group payout", sw: "Nimepokea mgao wangu wa kikundi", plainEn: "You received your savings group payout", plainSw: "Umepokea mgao wako wa kikundi" },
  loan_received: { flow: "in", dr: "CH", cr: "loansShort", cf: "loans", en: "I borrowed money", sw: "Nimekopa pesa", plainEn: "You borrowed money", plainSw: "Umekopa pesa" },
  loan_repayment: { flow: "out", dr: "loansShort", cr: "CH", cf: "loans", en: "I repaid a loan", sw: "Nimelipa mkopo", plainEn: "You repaid part of a loan", plainSw: "Umelipa sehemu ya mkopo" },
  group_loan_received: { flow: "in", dr: "CH", cr: "groupLoans", cf: "loans", en: "I borrowed from VICOBA or my group", sw: "Nimekopa kutoka VICOBA au kikundi", plainEn: "You borrowed from your group", plainSw: "Umekopa kutoka kikundi chako" },
  group_loan_repayment: { flow: "out", dr: "groupLoans", cr: "CH", cf: "loans", en: "I repaid my group loan", sw: "Nimerejesha mkopo wa kikundi", plainEn: "You repaid your group loan", plainSw: "Umerejesha mkopo wa kikundi" },
  other_income: { flow: "in", dr: "CH", cr: "otherIncome", cf: "otherIn", en: "I received other income", sw: "Nimepokea mapato mengine", plainEn: "You received other income", plainSw: "Umepokea mapato mengine" },
  transfer: { flow: "transfer", dr: "TO", cr: "CH", en: "I moved money between cash, mobile money and bank", sw: "Nimehamisha pesa kati ya taslimu, simu na benki", plainEn: "You moved money between your own accounts", plainSw: "Umehamisha pesa kati ya akaunti zako" },
  // Not offered as ready phrases; created by the daily close, loans or Admin.
  loss: { flow: "out", dr: "loss", cr: "CH", cf: "expenses", hidden: true, en: "Money lost or stolen", sw: "Pesa imepotea au kuibiwa", plainEn: "Money was lost", plainSw: "Pesa imepotea" },
  sale_credit_fix: { flow: "out", dr: "receivables", cr: "CH", cf: "sales", hidden: true, en: "A sale I recorded as paid was on credit", sw: "Mauzo niliyoandika kama yamelipwa yalikuwa kwa mkopo", plainEn: "A sale recorded as paid was actually on credit", plainSw: "Mauzo yaliyoandikwa kama yamelipwa yalikuwa kwa mkopo" },
  cash_over: { flow: "in", dr: "CH", cr: "suspense", cf: "difference", hidden: true, en: "Unexplained extra money (to resolve)", sw: "Pesa ya ziada isiyoelezeka (inasubiri)", plainEn: "Extra money not yet explained", plainSw: "Pesa ya ziada bado haijaelezwa" },
  cash_short: { flow: "out", dr: "suspense", cr: "CH", cf: "difference", hidden: true, en: "Unexplained missing money (to resolve)", sw: "Pesa iliyopungua bila maelezo (inasubiri)", plainEn: "Missing money not yet explained", plainSw: "Pesa iliyopungua bado haijaelezwa" },
  cash_over_small: { flow: "in", dr: "CH", cr: "cashDifference", cf: "difference", hidden: true, en: "Small extra money within tolerance", sw: "Pesa ndogo ya ziada ndani ya kiwango", plainEn: "A small extra amount, accepted", plainSw: "Kiasi kidogo cha ziada, kimekubaliwa" },
  cash_short_small: { flow: "out", dr: "cashDifference", cr: "CH", cf: "difference", hidden: true, en: "Small shortfall within tolerance", sw: "Upungufu mdogo ndani ya kiwango", plainEn: "A small shortfall, accepted", plainSw: "Upungufu mdogo, umekubaliwa" },
  suspense_resolve: { flow: "none", dr: "suspense", cr: "suspense", hidden: true, en: "Cash difference resolved", sw: "Tofauti ya pesa imetatuliwa", plainEn: "A cash difference was explained", plainSw: "Tofauti ya pesa imeelezwa" },
  asset_financed: { flow: "none", dr: "equipment", cr: "loansShort", hidden: true, en: "Asset received through a loan", sw: "Mali iliyopatikana kwa mkopo", plainEn: "An asset was paid for by your lender", plainSw: "Mali imelipiwa na mkopeshaji wako" },
  loan_interest: { flow: "out", dr: "interest", cr: "CH", cf: "loans", hidden: true, en: "Loan interest and fees", sw: "Riba na ada za mkopo", plainEn: "You paid loan interest or fees", plainSw: "Umelipa riba au ada za mkopo" },
  channel_opening: { flow: "in", dr: "CH", cr: "openingEquity", cf: "owner", hidden: true, en: "Starting balance of a newly added account", sw: "Salio la kuanzia la akaunti mpya", plainEn: "The starting balance of a newly added account", plainSw: "Salio la kuanzia la akaunti mpya" },
  stock_adjust: { flow: "none", dr: "inventory", cr: "stockChange", hidden: true, en: "Stock count adjustment", sw: "Marekebisho ya hesabu ya stoku", plainEn: "Stock value updated after a count", plainSw: "Thamani ya stoku imesahihishwa baada ya kuhesabu" }
};

export const READY_KINDS = Object.keys(KINDS).filter((k) => !KINDS[k].hidden);

// Guided reasons for daily-close differences (DAY-06).
export const CLOSE_REASONS_HIGHER = ["debtor_receipt", "capital", "group_payout", "other_income"];
export const CLOSE_REASONS_LOWER = ["other_expense", "drawings", "sale_credit_fix", "loss"];

export const flowOf = (kind) => KINDS[kind]?.flow || "none";

// Kinds that need one clarifying question before posting (group savings arrangements, REC-09).
export const GROUP_KINDS = ["group_contribution", "group_payout", "group_loan_received", "group_loan_repayment"];

// Where an authorised person can send a resolved cash difference (DAY-07).
export const SUSPENSE_TARGETS = {
  over: [
    { acc: "sales", en: "An unrecorded sale", sw: "Mauzo ambayo hayakuandikwa" },
    { acc: "receivables", en: "A customer paid what they owed", sw: "Mteja alilipa deni lake" },
    { acc: "capital", en: "Owner or family money put in", sw: "Pesa ya mmiliki au familia" },
    { acc: "otherIncome", en: "Other income", sw: "Mapato mengine" },
    { acc: "cashDifference", en: "Cannot be explained: write off", sw: "Haielezeki: futa" }
  ],
  short: [
    { acc: "otherExpenses", en: "An unrecorded business cost", sw: "Gharama ambayo haikuandikwa" },
    { acc: "drawings", en: "Owner's personal use", sw: "Matumizi binafsi ya mmiliki" },
    { acc: "receivables", en: "A sale was on credit", sw: "Mauzo yalikuwa kwa mkopo" },
    { acc: "loss", en: "Money lost or stolen", sw: "Pesa ilipotea au kuibiwa" },
    { acc: "cashDifference", en: "Cannot be explained: write off", sw: "Haielezeki: futa" }
  ]
};
