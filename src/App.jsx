// Routes and access checks (ROLE-03): every screen states who may open it; anything else returns the user to their home.
import { useEffect } from "react";
import { myOrg } from "./lib/access.js";
import { L, tl } from "./lib/i18n.js";
import { useStore } from "./lib/store.jsx";
import { Shell } from "./ui/Shell.jsx";
import { MENUS, homeFor } from "./ui/menus.js";
import SignIn from "./screens/SignIn.jsx";
import Home, { Activity, RatingScreen, Reports } from "./screens/business/Home.jsx";
import Record from "./screens/business/Record.jsx";
import Close from "./screens/business/Close.jsx";
import Finance from "./screens/business/Finance.jsx";
import Profile from "./screens/business/Profile.jsx";
import { BusinessSuppliers, Help, Messages, OrgProfile, Packages, PendingApproval, Wallet } from "./screens/shared.jsx";
import { BusinessRoute, OffActivity, OffChanges, OffClose, OfficerHome } from "./screens/admin/Officer.jsx";
import { RatingCheck, RatingDue } from "./screens/admin/RatingCheck.jsx";
import { AdminLoans, Approvals, Ledger, Queries, RatingReview, approvalCounts } from "./screens/admin/DataAdmin.jsx";
import { AdminPackages, Audit, Fields, ReportDesign, Settings, TestData, Users } from "./screens/admin/SystemAdmin.jsx";
import { Billing, Directory, FiBusiness, FiHome, FiLoan, FiLoans, FiSuppliers, Products } from "./screens/fi/Fi.jsx";
import { SupHome, SupOrders, SupProducts, SupQuotes } from "./screens/supplier/Supplier.jsx";
import Kpi from "./screens/reports/Kpi.jsx";

const B = ["business"];
const OFF = ["officer", "dataAdmin", "systemAdmin", "super"];
const DA = ["dataAdmin", "systemAdmin", "super"];
const SA = ["systemAdmin", "super"];
const FI = ["fi"];
const SUP = ["supplier"];
const ALL = ["business", "fi", "supplier", "officer", "dataAdmin", "systemAdmin", "super", "reports"];
const t = (en, sw) => ({ en, sw });

export const ROUTES = {
  home: { C: Home, roles: B }, record: { C: Record, roles: B }, close: { C: Close, roles: B, title: t("Close my day", "Funga siku yangu") }, activity: { C: Activity, roles: B },
  reports: { C: Reports, roles: B }, finance: { C: Finance, roles: B }, suppliers: { C: BusinessSuppliers, roles: B }, packages: { C: Packages, roles: B }, profile: { C: Profile, roles: B },
  rating: { C: RatingScreen, roles: B, title: t("Records Rating", "Kiwango cha Kumbukumbu") },
  wallet: { C: Wallet, roles: [...B, ...FI, ...SUP] }, messages: { C: Messages, roles: [...B, ...FI, ...SUP, ...OFF] }, help: { C: Help, roles: ALL.filter((r) => r !== "reports") },
  "fi-home": { C: FiHome, roles: FI }, "fi-directory": { C: Directory, roles: FI }, "fi-business": { C: FiBusiness, roles: FI, title: t("Business file", "Faili la biashara") }, "fi-loans": { C: FiLoans, roles: FI },
  "fi-loan": { C: FiLoan, roles: FI, title: t("Loan request", "Ombi la mkopo") }, "fi-products": { C: Products, roles: FI }, "fi-suppliers": { C: FiSuppliers, roles: FI }, "fi-billing": { C: Billing, roles: FI }, "org-profile": { C: OrgProfile, roles: [...FI, ...SUP] },
  "sup-home": { C: SupHome, roles: SUP }, "sup-products": { C: SupProducts, roles: SUP }, "sup-quotes": { C: SupQuotes, roles: SUP }, "sup-orders": { C: SupOrders, roles: SUP },
  "off-businesses": { C: OfficerHome, roles: OFF }, "off-rating": { C: RatingDue, roles: ["officer"] }, "off-activity": { C: OffActivity, roles: OFF },
  "off-close": { C: OffClose, roles: OFF }, "off-changes": { C: OffChanges, roles: OFF }, business: { C: BusinessRoute, roles: OFF, title: t("Business file", "Faili la biashara") },
  "rating-check": { C: RatingCheck, roles: ["officer"], title: t("Monthly records check", "Ukaguzi wa kumbukumbu wa mwezi") },
  approvals: { C: Approvals, roles: DA }, ledger: { C: Ledger, roles: DA }, "rating-review": { C: RatingReview, roles: DA }, "admin-queries": { C: Queries, roles: DA }, "admin-loans": { C: AdminLoans, roles: DA },
  users: { C: Users, roles: SA }, "admin-packages": { C: AdminPackages, roles: SA }, settings: { C: Settings, roles: SA }, fields: { C: Fields, roles: SA }, "report-design": { C: ReportDesign, roles: SA }, audit: { C: Audit, roles: SA },
  kpi: { C: Kpi, roles: ["reports", "super"] }, "test-data": { C: TestData, roles: ["super"] }, "kpi-filters": { C: () => <Kpi focus="kpi-filters" />, roles: ["reports"] }, "kpi-export": { C: () => <Kpi focus="kpi-export" />, roles: ["reports"] }
};

export default function App() {
  const { state, user, route, params, go } = useStore();
  const home = user ? homeFor(user.role) : "";
  const r = ROUTES[route];
  const allowed = user && r && r.roles.includes(user.role);
  useEffect(() => {
    if (user && route && !allowed) go(home);
  }, [user, route, allowed, home, go]);
  if (!user) return <SignIn />;
  const org = myOrg(state, user);
  if ((user.role === "fi" || user.role === "supplier") && org?.status !== "approved") return <PendingApproval />;
  const id = allowed ? route : home;
  const R = ROUTES[id];
  const item = (MENUS[user.role] || []).find((m) => m.id === id);
  const title = item ? tl(item) : R?.title ? tl(R.title) : L("TijaPass", "TijaPass");
  const counts = {};
  if (["dataAdmin", "systemAdmin", "super"].includes(user.role)) counts.approvals = approvalCounts(state).total || 0;
  if (user.role === "business") counts.finance = state.loans.filter((l) => l.businessId === user.businessId && l.status === "offered").length;
  if (user.role === "fi") counts["fi-loans"] = state.loans.filter((l) => l.fiId === user.orgId && ["requested", "accepted"].includes(l.status)).length;
  if (user.role === "supplier") counts["sup-quotes"] = state.quoteRequests.filter((q) => q.supplierId === user.orgId && q.status === "requested").length;
  const C = R.C;
  return (
    <Shell title={title} counts={counts}>
      <C key={id + JSON.stringify(params)} />
    </Shell>
  );
}

