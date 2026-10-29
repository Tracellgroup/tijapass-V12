import { Bell, Clock, Globe, LogOut, Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import logo from "../assets/tijapass-logo-dark-transparent.png";
import { closingDue, isClosed } from "../core/dailyClose.js";
import { dueList } from "../core/rating.js";
import { addDays, endOfMonth, nowDate, timeHM, today, tzMoment, uid, nowISO } from "../core/util.js";
import { ROLE_NAMES, businessesInScope, myBusiness, myNotifications, myOrg } from "../lib/access.js";
import { L, tl } from "../lib/i18n.js";
import { useStore } from "../lib/store.jsx";
import { fmtDate, fmtDateTime } from "./components.jsx";
import { MENUS } from "./menus.js";

function isoWeek(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const first = new Date(d.getFullYear(), 0, 4);
  return `${d.getFullYear()}-W${1 + Math.round(((d - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7)}`;
}

// Time-based alerts (NOT-01, NOT-02, DAY-01, DAY-08): created once each, when the (tester) clock reaches them.
function useTimedAlerts() {
  const { state, update, user } = useStore();
  useEffect(() => {
    if (!user) return;
    const t = today(state);
    const hm = timeHM(state);
    const want = [];
    const b = myBusiness(state, user);
    if (b) {
      if (closingDue(state, b, t, hm)) want.push({ key: `close-${b.id}-${t}`, businessId: b.id, title: { en: "Close your day?", sw: "Funga siku yako?" }, body: { en: "Count your money and close today.", sw: "Hesabu pesa zako na ufunge siku ya leo." }, link: "close" });
      const y = addDays(t, -1);
      if (hm >= "09:00" && b.startDate <= y && !isClosed(state, b.id, y)) want.push({ key: `remind-${b.id}-${t}`, businessId: b.id, title: { en: "Yesterday is not closed", sw: "Jana haijafungwa" }, body: { en: "Please close yesterday. Loans need every day closed.", sw: "Tafadhali funga jana. Mikopo inahitaji siku zote zimefungwa." }, link: "close" });
      for (const l of state.loans.filter((x) => x.businessId === b.id && x.status === "disbursed")) {
        for (const i of l.schedule || []) {
          if (i.paidAt) continue;
          if (i.due === t) want.push({ key: `due-${l.id}-${i.n}`, businessId: b.id, title: { en: "Repayment due today", sw: "Rejesho linadaiwa leo" }, body: { en: `TZS ${Math.round(i.amount).toLocaleString("en-US")}`, sw: `TZS ${Math.round(i.amount).toLocaleString("en-US")}` }, link: "finance" });
          if (i.due < t) want.push({ key: `overdue-${l.id}-${i.n}`, businessId: b.id, title: { en: "Repayment overdue", sw: "Rejesho limechelewa" }, body: { en: `TZS ${Math.round(i.amount).toLocaleString("en-US")} was due ${i.due}`, sw: `TZS ${Math.round(i.amount).toLocaleString("en-US")} lilitakiwa ${i.due}` }, link: "finance" });
        }
      }
    }
    if (user.role === "officer") {
      const due = dueList(state, businessesInScope(state, user), addDays(t, 7));
      if (due.length) want.push({ key: `weekly-${user.id}-${isoWeek(t)}`, userId: user.id, title: { en: "Records checks due this week", sw: "Ukaguzi wa kumbukumbu wiki hii" }, body: { en: `${due.length}: ${due.map((x) => x.business.profile.businessName).join(", ")}`, sw: `${due.length}: ${due.map((x) => x.business.profile.businessName).join(", ")}` }, link: "off-rating" });
    }
    const have = new Set(state.notifications.map((n) => n.key).filter(Boolean));
    const add = want.filter((w) => !have.has(w.key));
    if (add.length) update((d) => { for (const a of add) d.notifications.unshift({ id: uid("N"), at: nowISO(d), readBy: [], ...a }); });
  }, [state.clock?.offsetMs, user?.id, state.loans, state.closes, state.businesses]); // eslint-disable-line react-hooks/exhaustive-deps
}

function TesterClock() {
  const { state, update } = useStore();
  const [open, setOpen] = useState(false);
  const now = nowDate(state);
  const set = (target) => { update((d) => { d.clock.offsetMs = target.getTime() - Date.now(); }); setOpen(false); };
  const at = (days, h, m = 0) => new Date(tzMoment(addDays(today(state), days), h, m));
  const opts = [
    [L("Today 17:00 (closing time)", "Leo saa 11 jioni (17:00)"), () => at(0, 17, 0)],
    [L("Next morning 08:00", "Kesho asubuhi 08:00"), () => at(1, 8, 0)],
    [L("Next morning 09:30", "Kesho asubuhi 09:30"), () => at(1, 9, 30)],
    [L("+1 day (same time)", "+ siku 1"), () => new Date(now.getTime() + 86400000)],
    [L("+3 days", "+ siku 3"), () => new Date(now.getTime() + 3 * 86400000)],
    [L("+7 days", "+ siku 7"), () => new Date(now.getTime() + 7 * 86400000)],
    [L("End of the month 17:00", "Mwisho wa mwezi 17:00"), () => new Date(tzMoment(endOfMonth(today(state)), 17, 0))],
    [L("+46 days (rating overdue)", "+ siku 46 (ukaguzi umechelewa)"), () => new Date(now.getTime() + 46 * 86400000)]
  ];
  const shifted = Math.abs(state.clock?.offsetMs || 0) > 60000;
  return (
    <div className="rel">
      <button className="lang" onClick={() => setOpen(!open)} title={L("Tester clock (test version only)", "Saa ya majaribio (toleo la majaribio tu)")} style={shifted ? { borderColor: "#f3b26b", background: "#fff7ec" } : undefined}>
        <Clock size={16} />
        <span>{fmtDate(today(state))} {timeHM(state)}</span>
      </button>
      {open && (
        <div className="clock-pop">
          <b className="small">{L("Tester clock", "Saa ya majaribio")}</b>
          <p className="tiny muted">{L("Moves the app's time for testing daily close, reminders and ratings.", "Inasogeza muda wa programu kwa majaribio.")}</p>
          {opts.map(([label, fn]) => <button key={label} className="btn small" onClick={() => set(fn())}>{label}</button>)}
          <button className="btn small navy" onClick={() => { update((d) => { d.clock.offsetMs = 0; }); setOpen(false); }}>{L("Back to real time", "Rudi kwenye muda halisi")}</button>
        </div>
      )}
    </div>
  );
}

function Notifications({ onClose }) {
  const { state, update, user, go } = useStore();
  const list = myNotifications(state, user).slice(0, 80);
  useEffect(() => {
    const unread = list.filter((n) => !n.readBy?.includes(user.id)).map((n) => n.id);
    if (unread.length) {
      const t = setTimeout(() => update((d) => { for (const n of d.notifications) if (unread.includes(n.id)) n.readBy = [...(n.readBy || []), user.id]; }), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="panel" aria-label={L("Alerts", "Taarifa")}>
        <header>
          <h2>{L("Alerts", "Taarifa")}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={L("Close", "Funga")}><X size={18} /></button>
        </header>
        <div className="body">
          {!list.length && <p className="empty">{L("No alerts yet.", "Bado hakuna taarifa.")}</p>}
          {list.map((n) => (
            <div key={n.id} className={`note-item ${n.readBy?.includes(user.id) ? "" : "unread"}`}>
              <b>{tl(n.title)}</b>
              {tl(n.body) && <p className="small">{tl(n.body)}</p>}
              <div className="between mt">
                <span className="tiny muted">{fmtDateTime(n.at)}</span>
                {n.link && <button className="btn small" onClick={() => { onClose(); go(n.link); }}>{L("Open", "Fungua")}</button>}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

export function Shell({ title, counts = {}, children }) {
  const { state, user, route, go, lang, setLang, signOut } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bell, setBell] = useState(false);
  useTimedAlerts();
  const menu = MENUS[user.role] || [];
  const unread = useMemo(() => myNotifications(state, user).filter((n) => !n.readBy?.includes(user.id)).length, [state.notifications, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = myBusiness(state, user);
  const org = myOrg(state, user);
  const sub = b ? b.profile.businessName : org ? org.name : user.orgName || user.login;
  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <img src={logo} alt="TijaPass" />
          <button className="icon-btn menu-btn" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.2)" }} onClick={() => setMenuOpen(false)} aria-label={L("Close menu", "Funga menyu")}><X size={18} /></button>
        </div>
        <div className="who">
          <span>{tl(ROLE_NAMES[user.role])}</span>
          <strong>{user.name}</strong>
          <small>{sub}</small>
        </div>
        <nav aria-label={L("Main menu", "Menyu kuu")}>
          {menu.map((m) => {
            const Icon = m.icon;
            const active = route === m.id || (!route && m === menu[0]);
            return (
              <button key={m.id} className={`nav ${active ? "active" : ""}`} onClick={() => { setMenuOpen(false); go(m.id); }}>
                <Icon size={18} />
                <span>{tl(m)}</span>
                {counts[m.id] ? <em>{counts[m.id]}</em> : null}
              </button>
            );
          })}
        </nav>
        <div className="side-foot">
          <button className="btn small block" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.25)" }} onClick={signOut}><LogOut size={16} />{L("Sign out", "Toka")}</button>
          {L("Trust · Access · Grow", "Uaminifu · Upatikanaji · Ukuaji")}
        </div>
      </aside>
      <div className={`scrim ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
      <main>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label={L("Open menu", "Fungua menyu")}><Menu size={20} /></button>
          <div className="title">
            <small>TijaPass</small>
            <strong>{title}</strong>
          </div>
          <span className="test-marker">{L("Test version", "Toleo la majaribio")}</span>
          <TesterClock />
          <button className="lang" onClick={() => setLang(lang === "sw" ? "en" : "sw")} aria-label={L("Change language", "Badilisha lugha")}>
            <Globe size={16} />
            <span>{lang === "sw" ? "Kiswahili" : "English"}</span>
            <b className="tiny">{lang === "sw" ? "EN" : "SW"}</b>
          </button>
          <button className="icon-btn" onClick={() => setBell(true)} aria-label={L("Alerts", "Taarifa")}>
            <Bell size={19} />
            {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
          </button>
        </header>
        <div className="content">{children}</div>
        <div className="footer-legal">TijaPass · {L("operated by Tracell Finance Limited", "inaendeshwa na Tracell Finance Limited")} · {L("Test version with dummy data", "Toleo la majaribio lenye data ya mfano")}</div>
      </main>
      {bell && <Notifications onClose={() => setBell(false)} />}
    </div>
  );
}
