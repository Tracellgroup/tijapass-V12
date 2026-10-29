// Access rules (ROLE-02, ROLE-03, ADM-01). Checked for every screen and every data read, not only by hiding menus.
export const ADMIN_ROLES = ["officer", "dataAdmin", "systemAdmin", "super"];
const RANK = { officer: 1, dataAdmin: 2, systemAdmin: 3, super: 4 };

export const isAdmin = (u) => Boolean(u && ADMIN_ROLES.includes(u.role));
export const atLeast = (u, role) => Boolean(u && RANK[u.role] && RANK[u.role] >= RANK[role]);

export const ROLE_NAMES = {
  business: { en: "Business", sw: "Mjasiriamali" },
  fi: { en: "Financial institution", sw: "Taasisi ya fedha" },
  supplier: { en: "Supplier", sw: "Msambazaji" },
  officer: { en: "TijaPass Admin · Officer", sw: "TijaPass Admin · Afisa" },
  dataAdmin: { en: "TijaPass Admin · Data Admin", sw: "TijaPass Admin · Msimamizi wa Data" },
  systemAdmin: { en: "TijaPass Admin · System Admin", sw: "TijaPass Admin · Msimamizi wa Mfumo" },
  super: { en: "TijaPass Admin · Super user", sw: "TijaPass Admin · Mtumiaji mkuu" },
  reports: { en: "Reports", sw: "Ripoti" }
};

// Businesses a user may open. Officers: only assigned ones. FIs: only those that consented to them.
export function businessesInScope(state, user) {
  if (!user) return [];
  const live = state.businesses.filter((b) => b.status !== "archived");
  if (user.role === "officer") return live.filter((b) => b.officerId === user.id);
  if (atLeast(user, "dataAdmin")) return live;
  if (user.role === "fi") return live.filter((b) => b.consent?.fis?.[user.orgId]?.granted);
  if (user.role === "business") return live.filter((b) => b.id === user.businessId);
  return []; // suppliers and reports users never open a business
}

export const canSeeBusiness = (state, user, businessId) => businessesInScope(state, user).some((b) => b.id === businessId);

// Does a notification or message target include this user?
export function targets(user, t) {
  if (!user || !t) return false;
  if (t.userId) return t.userId === user.id;
  if (t.businessId) return user.role === "business" && user.businessId === t.businessId;
  if (t.fiId) return user.role === "fi" && user.orgId === t.fiId;
  if (t.supplierId) return user.role === "supplier" && user.orgId === t.supplierId;
  if (t.role) return t.role === "dataAdmin" ? atLeast(user, "dataAdmin") : user.role === t.role;
  return false;
}

export const myNotifications = (state, user) => state.notifications.filter((n) => targets(user, n));

export function myOrg(state, user) {
  if (user?.role === "fi") return state.fis.find((f) => f.id === user.orgId) || null;
  if (user?.role === "supplier") return state.suppliers.find((s) => s.id === user.orgId) || null;
  return null;
}

export const myBusiness = (state, user) => (user?.role === "business" ? state.businesses.find((b) => b.id === user.businessId) || null : null);
