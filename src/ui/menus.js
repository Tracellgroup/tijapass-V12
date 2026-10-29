// Menus per user and admin tier (MENU-01), in the agreed order. Alerts sit behind the bell, not in the menu.
import {
  Activity, BadgeCheck, BarChart3, Building2, ClipboardCheck, ClipboardList, CreditCard, FileBarChart, FileSearch, Filter,
  HandCoins, Download, HelpCircle, Home, Inbox, Landmark, LayoutDashboard, ListChecks, MessageSquare, Package, PenLine,
  ScrollText, Settings, Database, ShieldCheck, ShoppingCart, SlidersHorizontal, Store, Tags, Truck, UserCircle, Users, Wallet, BookOpen
} from "lucide-react";

const m = (id, en, sw, icon) => ({ id, en, sw, icon });

// Revised 29 Oct: nobody on staff onboards a business, and only officers do Records Ratings.
const OFFICER = [
  m("off-businesses", "My businesses", "Biashara zangu", Building2),
  m("off-rating", "Monthly records check", "Ukaguzi wa kumbukumbu wa mwezi", ClipboardCheck),
  m("off-activity", "Their activity and statements", "Shughuli na taarifa zao", FileSearch),
  m("off-close", "Daily-close follow-up", "Ufuatiliaji wa kufunga siku", ListChecks),
  m("off-changes", "Change requests", "Maombi ya mabadiliko", PenLine)
];
const ADMIN_VIEW = OFFICER.filter((x) => x.id !== "off-rating");

const DATA_ADMIN = [
  ...ADMIN_VIEW,
  m("approvals", "Approval queue", "Foleni ya idhini", Inbox),
  m("ledger", "Ledger, journal and trial balance", "Leja, jarida na mizania", BookOpen),
  m("rating-review", "Records Rating review", "Mapitio ya Viwango vya Kumbukumbu", BadgeCheck),
  m("admin-queries", "Queries", "Maswali", MessageSquare),
  m("admin-loans", "Loans and repayments", "Mikopo na marejesho", HandCoins)
];

const SYSTEM_ADMIN = [
  ...DATA_ADMIN,
  m("users", "Users and roles", "Watumiaji na majukumu", Users),
  m("admin-packages", "Packages and prices", "Vifurushi na bei", Tags),
  m("settings", "Settings", "Mipangilio", Settings),
  m("fields", "Input fields", "Sehemu za fomu", SlidersHorizontal),
  m("report-design", "Report design", "Muundo wa ripoti", FileBarChart),
  m("audit", "Audit trail", "Kumbukumbu za mabadiliko", ScrollText)
];

const HELP = m("help", "Help", "Msaada", HelpCircle);

export const MENUS = {
  business: [
    m("home", "Home", "Nyumbani", Home),
    m("record", "Record", "Andika", PenLine),
    m("activity", "My activity", "Shughuli zangu", Activity),
    m("reports", "Reports", "Ripoti", BarChart3),
    m("finance", "Finance", "Fedha", HandCoins),
    m("suppliers", "Suppliers", "Wasambazaji", Store),
    m("wallet", "Wallet", "Pochi", Wallet),
    m("packages", "Packages", "Vifurushi", Package),
    HELP,
    m("profile", "Profile", "Wasifu", UserCircle)
  ],
  fi: [
    m("fi-home", "Dashboard", "Dashibodi", LayoutDashboard),
    m("fi-directory", "Business directory", "Orodha ya biashara", Building2),
    m("fi-loans", "Loan requests", "Maombi ya mikopo", HandCoins),
    m("fi-products", "Products and pricing", "Bidhaa na bei", Landmark),
    m("fi-suppliers", "Suppliers", "Wasambazaji", Store),
    m("messages", "Messages", "Ujumbe", MessageSquare),
    m("wallet", "Wallet", "Pochi", Wallet),
    m("fi-billing", "Packages and billing", "Vifurushi na malipo", CreditCard),
    HELP,
    m("org-profile", "Profile", "Wasifu", UserCircle)
  ],
  supplier: [
    m("sup-home", "Dashboard", "Dashibodi", LayoutDashboard),
    m("sup-products", "Products and prices", "Bidhaa na bei", ShoppingCart),
    m("sup-quotes", "Quote requests and quotes", "Maombi ya nukuu na nukuu", ClipboardList),
    m("sup-orders", "Orders, invoices and delivery", "Oda, ankara na usafirishaji", Truck),
    m("messages", "Messages", "Ujumbe", MessageSquare),
    m("wallet", "Wallet", "Pochi", Wallet),
    HELP,
    m("org-profile", "Profile", "Wasifu", UserCircle)
  ],
  officer: [...OFFICER, HELP],
  dataAdmin: [...DATA_ADMIN, HELP],
  systemAdmin: [...SYSTEM_ADMIN, HELP],
  super: [...SYSTEM_ADMIN, m("kpi", "KPI dashboard", "Dashibodi ya viashiria", BarChart3), m("test-data", "Test data", "Data ya majaribio", Database), HELP],
  reports: [
    m("kpi", "KPI dashboard", "Dashibodi ya viashiria", BarChart3),
    m("kpi-filters", "Filters", "Vichujio", Filter),
    m("kpi-export", "Export", "Pakua", Download)
  ]
};

export const homeFor = (role) => MENUS[role]?.[0]?.id || "help";

export const ShieldIcon = ShieldCheck;
