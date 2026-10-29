// App state: one object kept in browser storage under "tijapass-v12" (web MVP only).
// The native build replaces this with the server API; the domain actions stay the same.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SCHEMA_VERSION, initialState } from "../core/seed.js";
import { syncProfile } from "../core/people.js";
import { today } from "../core/util.js";
import { getLang, setLang as setLangGlobal } from "./i18n.js";

const KEY = "tijapass-v12";
const SESSION = "tijapass-v12-session";
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === SCHEMA_VERSION) return migrate(s);
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return initialState(today(null));
}

// Older saved data gets any settings added since it was saved (keeps testers' data across updates).
function migrate(s) {
  const base = initialState(today(null)).settings;
  s.settings = { ...base, ...s.settings };
  if (!s.settings.scoreWeights?.first) s.settings.scoreWeights = base.scoreWeights;
  if (!s.settings.fiFees) s.settings.fiFees = base.fiFees;
  for (const b of s.businesses || []) {
    if (b.baseline && !b.baseline.original) b.baseline.original = { ...b.baseline };
    if (b.profile && !Array.isArray(b.profile.owners)) b.profile = syncProfile(b.profile);
    if (!b.kyc) b.kyc = { status: b.testData ? "verified" : "pending" };
  }
  // 29 Oct: PINs became 4 digits. Loaded test businesses get the test PIN; anyone else is asked to reset theirs.
  for (const u of s.users || []) if (u.role === "business" && u.testData && String(u.pin).length !== 4) u.pin = "2468";
  if (!s.users.some((u) => u.id === "U-SUPER2")) s.users.push({ id: "U-SUPER2", role: "super", name: "Super user 2", login: "super2@tijapass.test", active: true, test: true });
  return s;
}

// The session lives in sessionStorage, so it ends when the browser or tab is closed (V11), and an idle
// timer signs the user out after the minutes set by System Admin (default 15) on a shared phone.
function readSession() {
  try {
    return sessionStorage.getItem(SESSION) || null;
  } catch {
    return null;
  }
}

function parseHash() {
  const h = (typeof location !== "undefined" ? location.hash : "").replace(/^#\/?/, "");
  const [path, q] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(q || ""));
  return { route: path || "", params };
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const stateRef = useRef(state);
  const [userId, setUserId] = useState(readSession);
  const [lang, setLangState] = useState(getLang());
  const [toast, setToast] = useState(null);
  const [loc, setLoc] = useState(parseHash);

  // Persist (debounced).
  useEffect(() => {
    stateRef.current = state;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        setToast({ text: "Browser storage is full. Reset test data in Settings.", bad: true });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [state]);

  // Never lose the last change when the page is closed or reloaded within the save delay.
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(stateRef.current));
      } catch {
        /* ignore */
      }
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => {
    const on = () => setLoc(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.bad ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Run a domain action on a copy of the state. Throws on error (callers show the message).
  const update = useCallback((fn) => {
    const draft = structuredClone(stateRef.current);
    const result = fn(draft);
    stateRef.current = draft;
    setState(draft);
    return result;
  }, []);

  const user = useMemo(() => state.users.find((u) => u.id === userId && u.active !== false) || null, [state.users, userId]);

  const signIn = useCallback((id) => {
    try {
      sessionStorage.setItem(SESSION, id);
    } catch {
      /* ignore */
    }
    setUserId(id);
    update((d) => {
      const u = d.users.find((x) => x.id === id);
      if (u) {
        u.previousSignIn = u.lastSignIn || null;
        u.lastSignIn = new Date(Date.now() + (d.clock?.offsetMs || 0)).toISOString();
      }
    });
    location.hash = "#/";
  }, [update]);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION);
    } catch {
      /* ignore */
    }
    setUserId(null);
    location.hash = "#/";
  }, []);

  const setLang = useCallback((l) => {
    setLangGlobal(l);
    setLangState(getLang());
  }, []);

  const go = useCallback((route, params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
    location.hash = `#/${route}${q ? `?${q}` : ""}`;
    window.scrollTo({ top: 0 });
  }, []);

  const notify = useCallback((text, bad = false) => setToast({ text, bad }), []);

  // Idle sign-out (29 Oct): any tap, key or scroll counts as activity.
  const lastActive = useRef(Date.now());
  useEffect(() => {
    if (!userId) return undefined;
    lastActive.current = Date.now();
    const touch = () => { lastActive.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"];
    for (const e of evs) window.addEventListener(e, touch, { passive: true });
    const timer = setInterval(() => {
      const mins = stateRef.current.settings?.idleMinutes ?? 15;
      if (mins > 0 && Date.now() - lastActive.current > mins * 60000) {
        try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
        setUserId(null);
        location.hash = "#/";
        setToast({ text: "Signed out after a period without use. / Umetolewa baada ya muda bila kutumia.", bad: true });
      }
    }, 20000);
    return () => { for (const e of evs) window.removeEventListener(e, touch); clearInterval(timer); };
  }, [userId]);

  const resetAll = useCallback(() => {
    const fresh = initialState(today(null));
    stateRef.current = fresh;
    setState(fresh);
  }, []);

  const value = { state, update, user, signIn, signOut, lang, setLang, toast, notify, route: loc.route, params: loc.params, go, resetAll };
  // Messages from every action (saved, refused and why) show here on every screen, signed in or not.
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role={toast.bad ? "alert" : "status"} aria-live="polite">{toast.text}</div>}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

// Run an action and show its error in plain words instead of crashing.
export function useAction() {
  const { update, notify } = useStore();
  return useCallback(
    (fn, okText) => {
      try {
        const r = update(fn);
        if (okText) notify(okText);
        return r ?? true;
      } catch (e) {
        notify(e.message || String(e), true);
        return false;
      }
    },
    [update, notify]
  );
}
