// Starting state for the web MVP: setup lists and test sign-in accounts only. No businesses, entries or ratings.
import { annualFromMonthly } from "./billing.js";

export const SCHEMA_VERSION = 10;

export const REGIONS = ["Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara", "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga", "Kaskazini Pemba", "Kusini Pemba", "Kaskazini Unguja", "Kusini Unguja", "Mjini Magharibi"];

export const SECTORS = [
  { id: "retail", en: "Retail shop", sw: "Duka la rejareja" },
  { id: "food", en: "Food vendor (mama lishe)", sw: "Mama/baba lishe" },
  { id: "produce", en: "Fresh produce", sw: "Matunda na mboga" },
  { id: "agri", en: "Farming", sw: "Kilimo" },
  { id: "livestock", en: "Livestock and poultry", sw: "Mifugo na kuku" },
  { id: "fishing", en: "Fishing", sw: "Uvuvi" },
  { id: "tailoring", en: "Tailoring and fashion", sw: "Ushonaji na mitindo" },
  { id: "beauty", en: "Beauty and salon", sw: "Urembo na saluni" },
  { id: "transport", en: "Transport (boda, bajaji)", sw: "Usafirishaji (boda, bajaji)" },
  { id: "hardware", en: "Hardware and construction", sw: "Vifaa vya ujenzi" },
  { id: "repairs", en: "Repairs and workshop", sw: "Matengenezo na karakana" },
  { id: "phones", en: "Phones and electronics", sw: "Simu na elektroniki" },
  { id: "hospitality", en: "Hospitality", sw: "Huduma za malazi na vinywaji" },
  { id: "processing", en: "Food processing and manufacturing", sw: "Usindikaji na uzalishaji" },
  { id: "services", en: "Other services", sw: "Huduma nyingine" }
];

export const BUSINESS_TYPES = [
  { id: "shop", en: "Shop", sw: "Duka" },
  { id: "service", en: "Service", sw: "Huduma" },
  { id: "production", en: "Production", sw: "Uzalishaji" },
  { id: "farming", en: "Farming", sw: "Kilimo" },
  { id: "trading", en: "Trading or wholesale", sw: "Biashara ya jumla" },
  { id: "other", en: "Other", sw: "Nyingine" }
];

export const DEFAULT_SETTINGS = {
  closeToleranceAbs: 1000,
  closeTolerancePct: 1,
  differenceFlagLevel: 10000,
  duplicateWindowMin: 10,
  unusualFactor: 5,
  unusualFloor: 100000,
  disputeDays: 7,
  ratingOverdueDays: 45,
  ratingMinGapDays: 25,
  idleMinutes: 15,
  firstCheckDays: 30,
  ratingFrequency: { excellent: 1, good: 1, okay: 1, poor: 1 },
  recheckRate: 0.1,
  recheckGapFlag: 15,
  visitDistanceFlagM: 500,
  minGroupSize: 10,
  minCellSize: 3,
  activeMinDays: 10,
  youthMaxAge: 35,
  qualifyScore: 70,
  cashBuffer: 0.8,
  scoreWeights: {
    first: { kyc: 20, coverage: 25, records: 25, months: 20, rating: 10, repayment: 0 },
    repeat: { kyc: 15, coverage: 20, records: 15, months: 10, rating: 5, repayment: 35 }
  },
  ratingAutoMin: 70,
  ratingReviewMin: 50,
  reviewFloor: 50000,
  // Optional FI services kept for partner negotiation; off until agreed (PKG-06 as revised 27 Oct).
  fiFees: { disbursementOn: false, disbursementPct: 1.5, collectionOn: false, collectionPct: 2 },
  quarterlyDays: 90,
  support: { whatsapp: "+255 700 000 000", phone: "+255 700 000 000", hours: "Mon–Sat 08:00–18:00" },
  customFields: [],
  reportTiles: { k1: true, k2: true, k3: true, k4: true, k5: true, k6: true, k7: true, k8: true, k9: true, k10: true, extra: true }
};

const fiPkg = (id, en, sw, monthly, perAssessment) => ({ id, en, sw, monthly, annual: annualFromMonthly(monthly), perAssessment });

export const DEFAULT_PACKAGES = {
  business: [
    { id: "basic", en: "Basic", sw: "Msingi", price: 0, period: "free", featuresEn: ["Unlimited recording, free forever", "Daily close and reports", "Credit passport"], featuresSw: ["Kuandika bila kikomo, bure daima", "Kufunga siku na ripoti", "Pasipoti ya mkopo"] },
    { id: "day", en: "Day pass", sw: "Pasi ya siku", price: 500, period: "day", featuresEn: ["Everything in Basic", "Premium features for one day"], featuresSw: ["Vyote vya Msingi", "Huduma za ziada kwa siku moja"] },
    { id: "week", en: "Weekly", sw: "Wiki", price: 1500, period: "week", featuresEn: ["Everything in Basic", "Premium features for 7 days"], featuresSw: ["Vyote vya Msingi", "Huduma za ziada kwa siku 7"] },
    { id: "month", en: "Monthly", sw: "Mwezi", price: 5000, period: "month", featuresEn: ["Everything in Basic", "Premium features for a month"], featuresSw: ["Vyote vya Msingi", "Huduma za ziada kwa mwezi"] },
    { id: "premium", en: "Premium", sw: "Premium", price: 10000, period: "month", featuresEn: ["Everything in Monthly", "Priority support"], featuresSw: ["Vyote vya Mwezi", "Msaada wa kipaumbele"] }
  ],
  fi: [fiPkg("starter", "Starter", "Mwanzo", 500000, 3000), fiPkg("growth", "Growth", "Ukuaji", 2000000, 1500), fiPkg("enterprise", "Enterprise", "Biashara kubwa", 6000000, 500)],
  sponsorTiers: [
    { id: "vip", en: "VIP partner", sw: "Mshirika wa VIP", contribution: 180000000, year1: 100, years23: 50, max: 1 },
    { id: "partner", en: "Partner", sw: "Mshirika", contribution: 90000000, year1: 50, years23: 25, max: 2 },
    { id: "standard", en: "Standard FI", sw: "Taasisi ya kawaida", contribution: 0, year1: 0, years23: 0, max: 999 }
  ]
};

// Test sign-in accounts (web MVP only). Businesses are created only by their own sign-up (29 Oct).
export const TEST_USERS = [
  { id: "U-OFF1", role: "officer", name: "Neema Officer", login: "officer1@tijapass.test" },
  { id: "U-OFF2", role: "officer", name: "Paul Officer", login: "officer2@tijapass.test" },
  { id: "U-DATA", role: "dataAdmin", name: "Data Admin", login: "dataadmin@tijapass.test" },
  { id: "U-SYS", role: "systemAdmin", name: "System Admin", login: "sysadmin@tijapass.test" },
  { id: "U-SUPER", role: "super", name: "Super user", login: "super@tijapass.test" },
  { id: "U-SUPER2", role: "super", name: "Super user 2", login: "super2@tijapass.test" },
  { id: "U-FI1", role: "fi", name: "Test Bank (loan officer)", login: "fi@tijapass.test", orgId: "FI-1" },
  { id: "U-SUP1", role: "supplier", name: "Test Supplies (sales)", login: "supplier@tijapass.test", orgId: "SUP-1" },
  { id: "U-BOT", role: "reports", name: "BOT reports viewer", login: "bot@tijapass.test", orgName: "Bank of Tanzania" }
];

export function initialState(todayISO) {
  return {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    clock: { offsetMs: 0 },
    settings: structuredClone(DEFAULT_SETTINGS),
    packages: structuredClone(DEFAULT_PACKAGES),
    users: TEST_USERS.map((u) => ({ ...u, active: true, test: true })),
    fis: [
      {
        id: "FI-1", name: "Test Bank Ltd", licence: "TEST-LIC-001", region: "Dar es Salaam", address: "Test address, Dar es Salaam", phone: "+255 700 000 001", email: "fi@tijapass.test",
        status: "approved", packageId: "starter", billing: "monthly", sponsorTier: "standard", joinedAt: todayISO, walletBalance: 50000000,
        products: [
          { id: "P-1", name: "Biashara Working Capital", type: "working_capital", annualRate: 24, feePct: 2, feeFixed: 0, min: 100000, max: 3000000, frequencies: ["daily", "weekly", "monthly"], maxInstalments: 12, active: true },
          { id: "P-2", name: "Asset Finance", type: "asset", annualRate: 22, feePct: 1.5, feeFixed: 10000, min: 300000, max: 8000000, frequencies: ["weekly", "monthly"], maxInstalments: 24, active: true }
        ]
      }
    ],
    suppliers: [
      {
        id: "SUP-1", name: "Test Supplies Ltd", licence: "TEST-SUP-001", region: "Dar es Salaam", address: "Kariakoo, Dar es Salaam", phone: "+255 700 000 002", email: "supplier@tijapass.test", status: "approved", walletBalance: 0,
        products: [
          { id: "SP-1", name: "Display fridge 300L", price: 1450000, unit: "piece" },
          { id: "SP-2", name: "Sewing machine (industrial)", price: 950000, unit: "piece" },
          { id: "SP-3", name: "Maize flour 25kg bag", price: 42000, unit: "bag" }
        ]
      }
    ],
    businesses: [],
    entries: [],
    closes: [],
    ratings: [],
    changeRequests: [],
    externalLoans: [],
    loans: [],
    quoteRequests: [],
    messages: [],
    notifications: [],
    queries: [],
    assessments: [],
    payments: [],
    subscriptions: [],
    quarterly: [],
    imports: [],
    audit: []
  };
}
