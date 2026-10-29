// User guide (HLP-01): every menu item explained in a few lines, per user type. Screenshots live in public/guide/<role>-<id>.png.
const g = (en, sw) => ({ en, sw });

export const GUIDE = {
  business: {
    home: g("Your day at a glance: money in and out today, whether today is closed, your Records Rating and your credit score. The two big buttons record money in or out in one tap.", "Siku yako kwa haraka: pesa iliyoingia na kutoka leo, kama leo imefungwa, Kiwango chako cha Kumbukumbu na alama ya mkopo. Vitufe viwili vikubwa vinaandika pesa iliyoingia au kutoka kwa mguso mmoja."),
    record: g("Choose money in, money out or move money. Type the amount, pick cash, wallet or bank, then say or type what it was for in your own words. TijaPass shows what it understood; tap Yes, pick another meaning, or write again. 'Close my day' is here too, and you can upload a bank or mobile money statement.", "Chagua pesa imeingia, imetoka au hamisha pesa. Andika kiasi, chagua taslimu, pochi au benki, kisha sema au andika ilikuwa ya nini kwa maneno yako. TijaPass inaonyesha ilichoelewa; gusa Ndiyo, chagua maana nyingine, au andika tena. 'Funga siku yangu' iko hapa pia, na unaweza kupakia taarifa ya benki au pesa ya simu."),
    activity: g("Everything you recorded, day by day, in plain words. Statement lines that need your explanation appear at the top.", "Kila ulichoandika, siku kwa siku, kwa maneno rahisi. Mistari ya taarifa inayohitaji maelezo yako inaonekana juu."),
    reports: g("Your income statement, balance sheet and cash flow for any period: today, this week, this month, last month or dates you choose. Download them as PDF in Kiswahili or English.", "Taarifa ya mapato, ya mali na madeni, na mtiririko wa pesa kwa kipindi chochote: leo, wiki hii, mwezi huu, mwezi uliopita au tarehe unazochagua. Zipakue kama PDF kwa Kiswahili au Kiingereza."),
    finance: g("Your credit passport: indicative score, Records Rating, proposed limits and the checks a lender needs. Request a loan, see offers with the full cost before you accept, pay instalments, and declare loans you have outside TijaPass.", "Pasipoti yako ya mkopo: alama ya makadirio, Kiwango cha Kumbukumbu, viwango vinavyopendekezwa na vigezo vya mkopeshaji. Omba mkopo, ona ofa na gharama kamili kabla ya kukubali, lipa marejesho, na taja mikopo uliyonayo nje ya TijaPass."),
    suppliers: g("Ask a supplier for a price: pick from their list or describe the item. Accept a quote, pay directly or use it for an asset loan, and confirm when the goods arrive.", "Omba bei kwa msambazaji: chagua kwenye orodha yao au eleza bidhaa. Kubali nukuu, lipa moja kwa moja au itumie kwa mkopo wa mali, na thibitisha bidhaa zikifika."),
    wallet: g("A simulated wallet for testing payments. No real money is held in this test version.", "Pochi ya mfano kwa majaribio ya malipo. Hakuna pesa halisi kwenye toleo hili la majaribio."),
    packages: g("Recording is always free on Basic. Day, week, month and premium packages add extra features; pay by mobile money, bank or wallet.", "Kuandika ni bure daima kwenye Msingi. Vifurushi vya siku, wiki, mwezi na premium vinaongeza huduma; lipa kwa pesa ya simu, benki au pochi."),
    help: g("This guide, common questions, a chat that answers questions, and a way to send a question to TijaPass Admin.", "Mwongozo huu, maswali ya kawaida, mazungumzo yanayojibu maswali, na njia ya kutuma swali kwa TijaPass Admin."),
    profile: g("Your details, your starting position, and which lenders may see your records. Phone, email and location changes wait for Admin approval.", "Taarifa zako, hali yako ya kuanzia, na wakopeshaji wanaoweza kuona kumbukumbu zako. Mabadiliko ya simu, barua pepe na mahali yanasubiri idhini ya Msimamizi.")
  },
  fi: {
    "fi-home": g("Businesses that consented to you, loan requests by status, your portfolio, repayments due and overdue, and assessments used this month. Tap a figure to open its list.", "Biashara zilizokupa ridhaa, maombi ya mikopo kwa hali, jalada lako, marejesho yanayodaiwa na yaliyochelewa, na tathmini za mwezi huu. Gusa takwimu kufungua orodha yake."),
    "fi-directory": g("Only businesses that consented to you. Filter by sector, region, score, Records Rating band, gender and age group. Opening a business is one billed assessment (once per business per day).", "Biashara zilizokupa ridhaa tu. Chuja kwa sekta, mkoa, alama, kiwango, jinsia na umri. Kufungua biashara ni tathmini moja inayolipiwa (mara moja kwa biashara kwa siku)."),
    "fi-loans": g("Review requests, make offers that show rate, fees, schedule and total cost, and disburse once the business accepts. Affordability and the Records Rating are checked again before money moves.", "Kagua maombi, toa ofa zinazoonyesha riba, ada, ratiba na gharama yote, na toa pesa baada ya biashara kukubali. Uwezo wa kulipa na Kiwango cha Kumbukumbu vinakaguliwa tena kabla ya pesa kutoka."),
    "fi-products": g("Your loan products: rate, fees, amounts, repayment frequencies and maximum instalments. New products appear in businesses' loan options.", "Bidhaa zako za mikopo: riba, ada, kiasi, marudio ya marejesho na idadi ya juu ya marejesho. Bidhaa mpya zinaonekana kwenye chaguo za biashara."),
    "fi-suppliers": g("Request quotes from approved suppliers, for example to price an asset before financing it.", "Omba nukuu kutoka kwa wasambazaji walioidhinishwa, kwa mfano kupata bei ya mali kabla ya kuifadhili."),
    messages: g("Messages with businesses, suppliers and TijaPass Admin, each tied to a loan request, quote, entry or rating.", "Ujumbe na biashara, wasambazaji na TijaPass Admin, kila mmoja ukihusiana na ombi la mkopo, nukuu, muamala au kiwango."),
    wallet: g("A simulated wallet: disbursements go out and repayments come in. No real money moves in this test version.", "Pochi ya mfano: mikopo inatoka na marejesho yanaingia. Hakuna pesa halisi kwenye toleo hili."),
    "fi-billing": g("Your package (Starter, Growth or Enterprise), monthly or annual billing, sponsorship discount, and this month's bill listing every assessment.", "Kifurushi chako (Mwanzo, Ukuaji au Biashara kubwa), malipo ya mwezi au mwaka, punguzo la udhamini, na bili ya mwezi huu ikiorodhesha kila tathmini."),
    help: g("Guide, common questions, chat and queries to TijaPass Admin.", "Mwongozo, maswali ya kawaida, mazungumzo na maswali kwa TijaPass Admin."),
    "org-profile": g("Your organisation's details as approved by TijaPass Admin.", "Taarifa za taasisi yako kama zilivyoidhinishwa na TijaPass Admin.")
  },
  supplier: {
    "sup-home": g("Open quote requests, quotes waiting for a reply, orders to deliver and payments due. Tap a figure to open its list.", "Maombi ya nukuu yaliyo wazi, nukuu zinazosubiri jibu, oda za kupeleka na malipo yanayotarajiwa. Gusa takwimu kufungua orodha."),
    "sup-products": g("Your product and price list. Businesses and lenders can pick from it when they ask for a quote.", "Orodha ya bidhaa na bei zako. Biashara na wakopeshaji wanaweza kuchagua humo wanapoomba nukuu."),
    "sup-quotes": g("Requests sent to you. Reply with a quote: price, quantity, how long it is valid and notes.", "Maombi uliyotumiwa. Jibu kwa nukuu: bei, idadi, muda wa kudumu na maelezo."),
    "sup-orders": g("Accepted quotes become orders. Issue the invoice, confirm payment, deliver and confirm delivery. Financed orders are paid by the lender.", "Nukuu zilizokubaliwa zinakuwa oda. Toa ankara, thibitisha malipo, peleka na thibitisha kufikisha. Oda zinazofadhiliwa hulipwa na mkopeshaji."),
    messages: g("Messages with the businesses and lenders that asked you for quotes.", "Ujumbe na biashara na wakopeshaji waliokuomba nukuu."),
    wallet: g("A simulated wallet showing payments received. No real money in this test version.", "Pochi ya mfano inayoonyesha malipo uliyopokea. Hakuna pesa halisi kwenye toleo hili."),
    help: g("Guide, common questions, chat and queries to TijaPass Admin.", "Mwongozo, maswali ya kawaida, mazungumzo na maswali kwa TijaPass Admin."),
    "org-profile": g("Your organisation's details as approved by TijaPass Admin.", "Taarifa za taasisi yako kama zilivyoidhinishwa na TijaPass Admin.")
  },
  admin: {
    "off-businesses": g("Businesses in your care with their Records Rating, days closed and flags. Data Admin and above see all businesses and assign officers.", "Biashara unazozihudumia pamoja na Kiwango, siku zilizofungwa na tahadhari. Msimamizi wa Data na juu wanaona biashara zote na kupanga maafisa."),
    "off-onboard": g("Register a business during a visit: owner, business, money channels, baseline questions, PIN and consent. The business can sign in at once with its phone and PIN.", "Sajili biashara wakati wa ziara: mmiliki, biashara, njia za pesa, maswali ya msingi, PIN na ridhaa. Biashara inaweza kuingia mara moja kwa simu na PIN yake."),
    "off-rating": g("Businesses due and overdue for their monthly records check. The checklist runs one check per screen; each step needs its evidence; the app picks the entries to test.", "Biashara zinazohitaji ukaguzi wa kumbukumbu wa mwezi. Orodha inaenda hatua moja kwa skrini; kila hatua inahitaji ushahidi; programu inachagua miamala ya kupima."),
    "off-activity": g("A business's activity and statements for any period, read-only.", "Shughuli na taarifa za biashara kwa kipindi chochote, kusoma tu."),
    "off-close": g("Which businesses closed today, which missed days, and cash differences flagged to you.", "Biashara zipi zimefunga leo, zipi zimekosa siku, na tofauti za pesa zilizoletwa kwako."),
    "off-changes": g("Recommend a change to a business's data; it waits for Data Admin.", "Pendekeza mabadiliko ya taarifa za biashara; yanasubiri Msimamizi wa Data."),
    approvals: g("Everything waiting for a decision: held entries with the AI's recommendation, starting positions, profile changes, corrections, declared loans, new lenders and suppliers, businesses without an officer. Each decision needs a reason.", "Kila kinachosubiri uamuzi: miamala iliyosimamishwa pamoja na pendekezo la AI, hali za kuanzia, mabadiliko ya wasifu, marekebisho, mikopo iliyotajwa, wakopeshaji na wasambazaji wapya, biashara bila afisa. Kila uamuzi unahitaji sababu."),
    ledger: g("Daily journal, ledger by account and trial balance for each business, filtered by source. Reverse an entry or change its treatment, with a reason.", "Jarida la kila siku, leja kwa akaunti na mizania ya majaribio kwa kila biashara, kwa chanzo. Geuza muamala au badilisha jinsi ulivyoingizwa, kwa sababu."),
    "rating-review": g("All Records Ratings with evidence, disputes to decide and checks picked for re-check.", "Viwango vyote vya Kumbukumbu pamoja na ushahidi, mapingamizi ya kuamua na ukaguzi uliochaguliwa kukaguliwa upya."),
    "admin-queries": g("Questions sent by users from Help. Reply and the user is told.", "Maswali yaliyotumwa na watumiaji kutoka Msaada. Jibu na mtumiaji anajulishwa."),
    "admin-loans": g("All loans with their schedules, payments and arrears.", "Mikopo yote pamoja na ratiba, malipo na madeni yaliyochelewa."),
    users: g("Add users, change roles and deactivate accounts.", "Ongeza watumiaji, badilisha majukumu na zima akaunti."),
    "admin-packages": g("Prices and features for business packages, lender packages and pilot sponsorship tiers.", "Bei na huduma za vifurushi vya biashara, vya wakopeshaji na ngazi za udhamini wa majaribio."),
    settings: g("Daily close tolerance, flag levels, duplicate window, rating rules, report group size, score weights, support contacts, and test tools.", "Kiwango cha kuvumilia tofauti, viwango vya tahadhari, muda wa kurudia, kanuni za viwango, ukubwa wa kundi la ripoti, uzito wa alama, mawasiliano ya msaada, na zana za majaribio."),
    fields: g("Add or remove optional fields on the onboarding form.", "Ongeza au ondoa sehemu za hiari kwenye fomu ya usajili."),
    "report-design": g("Choose which KPI tiles report users see and the minimum group size.", "Chagua vigae vya viashiria ambavyo watumiaji wa ripoti wanaona na ukubwa wa chini wa kundi."),
    audit: g("Every change: who, when, value before and after, and the reason.", "Kila badiliko: nani, lini, thamani kabla na baada, na sababu."),
    kpi: g("The KPI dashboard as report users see it.", "Dashibodi ya viashiria kama watumiaji wa ripoti wanavyoiona."),
    "test-data": g("Super user only: load 10 fictional businesses with transactions and ratings for testing, and remove them in one step.", "Mtumiaji mkuu pekee: pakia biashara 10 za kubuni zenye miamala na viwango kwa majaribio, na uziondoe kwa hatua moja."),
    help: g("Guide, common questions and chat.", "Mwongozo, maswali ya kawaida na mazungumzo.")
  },
  reports: {
    kpi: g("Ten KPIs, priorities first, plus three extra tiles. Every figure is a total or share for a group of businesses; groups smaller than the minimum are hidden.", "Viashiria kumi, vya kipaumbele kwanza, pamoja na vigae vitatu vya ziada. Kila takwimu ni jumla au sehemu ya kundi la biashara; makundi madogo yanafichwa."),
    "kpi-filters": g("Filter by period, region, sector, gender and age group.", "Chuja kwa kipindi, mkoa, sekta, jinsia na umri."),
    "kpi-export": g("Download the figures on screen as CSV or PDF.", "Pakua takwimu zilizo kwenye skrini kama CSV au PDF.")
  }
};

export const guideFor = (role) => (["officer", "dataAdmin", "systemAdmin", "super"].includes(role) ? GUIDE.admin : GUIDE[role] || {});
