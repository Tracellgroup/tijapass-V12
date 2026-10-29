import { Camera, Inbox, Mic, MicOff, X } from "lucide-react";
import { Children, useEffect, useRef, useState } from "react";
import { BANDS, GREY, bandFor, ratingStatus, ratingsFor } from "../core/rating.js";
import { addDays, daysInMonth, endOfMonth, money, parseISO, startOfMonth, today, tzDateOf, tzTimeOf, uid } from "../core/util.js";
import { compressImage, getFile, putFile } from "../lib/files.js";
import { L, getLang, tl } from "../lib/i18n.js";
import { useStore } from "../lib/store.jsx";

export const Money = ({ v, className = "" }) => <span className={`mono ${className}`}>{money(v)}</span>;

export function Card({ title, actions, children, className = "", id }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && (
        <div className="between mb">
          {title && <h2>{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// A labelled field. Groups of buttons (chips) get a <div role="group"> instead of a <label>,
// so tapping the label never presses the first button and each button keeps its own name.
export function Field({ label, hint, children, className = "" }) {
  // Fields holding several controls render as a group, not a <label> (a label would press its first button).
  const group = Children.toArray(children).some((c) => c?.type === Chips || c?.type === DatePicker || c?.type?.isGroup);
  if (group) {
    return (
      <div className={`field ${className}`} role="group" aria-label={typeof label === "string" ? label : undefined}>
        {label && <span>{label}</span>}
        {children}
        {hint && <small>{hint}</small>}
      </div>
    );
  }
  return (
    <label className={`field ${className}`}>
      {label && <span>{label}</span>}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Text({ value, onChange, ...rest }) {
  return <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Area({ value, onChange, ...rest }) {
  return <textarea className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

// Date picker (agreed 29 Oct): year first, then month (1 to 12), then only the days that exist in that
// month and year. min and max are ISO dates; anything outside them cannot be chosen. value is "YYYY-MM-DD" or "".
const MONTH_LONG = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  sw: ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"]
};
export function DatePicker({ value, onChange, min = "1900-01-01", max = "2100-12-31", newestFirst = true, name }) {
  const split = (v) => (v ? v.split("-").map(Number) : [0, 0, 0]);
  const [parts, setParts] = useState(() => split(value));
  useEffect(() => { if (value) setParts(split(value)); }, [value]);
  const [y, m, d] = parts;
  const [minY, minM, minD] = split(min);
  const [maxY, maxM, maxD] = split(max);
  const years = [];
  for (let i = minY; i <= maxY; i++) years.push(i);
  if (newestFirst) years.reverse();
  const months = [];
  for (let i = 1; i <= 12; i++) if (y && !(y === minY && i < minM) && !(y === maxY && i > maxM)) months.push(i);
  const days = [];
  if (y && m) for (let i = 1; i <= daysInMonth(y, m); i++) if (!(y === minY && m === minM && i < minD) && !(y === maxY && m === maxM && i > maxD)) days.push(i);
  const emit = (ny, nm, nd) => {
    let mm = nm;
    let dd = nd;
    if (ny && mm && ((ny === minY && mm < minM) || (ny === maxY && mm > maxM))) mm = 0;
    if (ny && mm && dd && (dd > daysInMonth(ny, mm) || (ny === minY && mm === minM && dd < minD) || (ny === maxY && mm === maxM && dd > maxD))) dd = 0;
    if (!mm) dd = 0;
    setParts([ny, mm, dd]);
    onChange(ny && mm && dd ? `${ny}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : "");
  };
  const lang = getLang();
  return (
    <div className="date-pick" role="group" aria-label={name}>
      <select className="input" aria-label={L("Year", "Mwaka")} value={y || ""} onChange={(e) => emit(Number(e.target.value), m, d)}>
        <option value="">{L("Year", "Mwaka")}</option>
        {years.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select className="input" aria-label={L("Month", "Mwezi")} value={m || ""} disabled={!y} onChange={(e) => emit(y, Number(e.target.value), d)}>
        <option value="">{L("Month", "Mwezi")}</option>
        {months.map((x) => <option key={x} value={x}>{`${x} · ${MONTH_LONG[lang][x - 1]}`}</option>)}
      </select>
      <select className="input" aria-label={L("Day", "Siku")} value={d || ""} disabled={!m} onChange={(e) => emit(y, m, Number(e.target.value))}>
        <option value="">{L("Day", "Siku")}</option>
        {days.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

// Amount input with thousands separators; value is a number or "".
export function AmountInput({ value, onChange, big, placeholder = "0", allowNegative = false, ...rest }) {
  const shown = value === "" || value == null ? "" : `${value < 0 ? "-" : ""}${Math.abs(Number(value)).toLocaleString("en-US")}`;
  return (
    <input
      className={`input ${big ? "amount" : ""}`}
      inputMode="numeric"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d-]/g, "");
        if (raw === "" || raw === "-") return onChange("");
        const n = Number(allowNegative ? raw : raw.replace(/-/g, ""));
        onChange(Number.isFinite(n) ? n : "");
      }}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chips({ options, value, onChange, multi = false }) {
  const on = (v) => (multi ? (value || []).includes(v) : value === v);
  const click = (v) => (multi ? onChange(on(v) ? value.filter((x) => x !== v) : [...(value || []), v]) : onChange(v));
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o.value} className={`chip ${on(o.value) ? "on" : ""}`} onClick={() => click(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? "on" : ""}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count ? <span className="pill orange" style={{ marginLeft: 6 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, actions, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="between">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label={L("Close", "Funga")}>
              <X size={18} />
            </button>
          )}
        </div>
        <div className="mt">{children}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

// Designed confirmation (no browser pop-ups anywhere: REC-06).
export function Confirm({ title, body, okLabel, danger, onOk, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{L("Cancel", "Ghairi")}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { onOk(); onClose(); }}>{okLabel || L("Confirm", "Thibitisha")}</button>
        </>
      }
    >
      <div className="stack">{typeof body === "string" ? <p>{body}</p> : body}</div>
    </Modal>
  );
}

// Every Admin change needs a written reason (ROLE-05).
export function ReasonModal({ title, intro, okLabel, danger, onSubmit, onClose, children, min = 5 }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= min;
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>{L("Cancel", "Ghairi")}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} disabled={!ok} onClick={() => { if (onSubmit(reason.trim()) !== false) onClose(); }}>
            {okLabel || L("Save", "Hifadhi")}
          </button>
        </>
      }
    >
      <div className="form">
        {intro && <p>{intro}</p>}
        {children}
        <Field label={L("Reason (required)", "Sababu (lazima)")} hint={L("Kept in the audit trail.", "Inahifadhiwa kwenye kumbukumbu za mabadiliko.")}>
          <Area value={reason} onChange={setReason} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

export function Stat({ label, value, note, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="stat" onClick={onClick}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <em>{note}</em>}
    </Tag>
  );
}

export function Empty({ text, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <Icon size={30} />
      <p className="mt">{text}</p>
    </div>
  );
}

export function Steps({ count, at }) {
  return (
    <div className="steps" aria-label={`${at + 1} / ${count}`}>
      {Array.from({ length: count }, (_, i) => <i key={i} className={i <= at ? "on" : ""} />)}
    </div>
  );
}

export const Pill = ({ tone = "", children }) => <span className={`pill ${tone}`}>{children}</span>;

export function StatusPill({ status }) {
  const map = {
    posted: ["green", L("Posted", "Imeingizwa")], held: ["orange", L("Waiting for Admin", "Inasubiri Msimamizi")], declined: ["red", L("Declined", "Imekataliwa")],
    pending: ["orange", L("Waiting", "Inasubiri")], approved: ["green", L("Approved", "Imeidhinishwa")], submitted: ["orange", L("Submitted", "Imewasilishwa")], draft: ["grey", L("Draft", "Rasimu")],
    requested: ["orange", L("Requested", "Imeombwa")], offered: ["orange", L("Offer made", "Ofa imetolewa")], accepted: ["green", L("Accepted", "Imekubaliwa")], rejected: ["red", L("Not approved", "Haikuidhinishwa")],
    disbursed: ["green", L("Disbursed", "Imetolewa")], repaid: ["green", L("Repaid", "Imelipwa yote")], quoted: ["orange", L("Quoted", "Nukuu imetolewa")], ordered: ["orange", L("Ordered", "Imeagizwa")],
    invoiced: ["orange", L("Invoiced", "Ankara imetolewa")], delivered: ["green", L("Delivered", "Imefikishwa")], received: ["green", L("Received", "Imepokelewa")], paid: ["green", L("Paid", "Imelipwa")],
    open: ["orange", L("Open", "Wazi")], answered: ["green", L("Answered", "Imejibiwa")], reviewed: ["green", L("Reviewed", "Imekaguliwa")], active: ["green", L("Active", "Hai")],
    verified: ["green", L("Verified", "Imehakikiwa")],
    final: ["green", L("Final", "Ya mwisho")], disputed: ["orange", L("Under review", "Inapitiwa")], success: ["green", L("Paid", "Imelipwa")], failed: ["red", L("Failed", "Imeshindikana")]
  };
  const [tone, label] = map[status] || ["grey", status];
  return <Pill tone={tone}>{label}</Pill>;
}

// Records Rating badge: colour plus band name and date, never colour alone (RAT-09, UX-06).
export function RatingBadge({ business, big, withDate = true }) {
  const { state } = useStore();
  if (!business) return null;
  const rs = ratingStatus(state, business, today(state));
  let label;
  if (rs.state === "not_checked") label = L("Not yet checked", "Bado haijakaguliwa");
  else if (rs.state === "under_review") label = `${tl(rs.band)}, ${rs.rating.score}% · ${L("under review", "inapitiwa")}`;
  else if (rs.state === "overdue") label = `${L("Check overdue", "Ukaguzi umechelewa")} · ${L("last", "mwisho")}: ${tl(rs.band)} ${rs.rating.score}%`;
  else label = `${tl(rs.band)}, ${rs.rating.score}%`;
  return (
    <span className={`badge ${big ? "big" : ""}`} style={{ background: rs.color }} title={L("TijaPass Records Rating", "Kiwango cha Kumbukumbu cha TijaPass")}>
      <i className="sw" />
      {label}
      {withDate && rs.rating && <span style={{ fontWeight: 500, opacity: 0.9 }}>· {fmtDate(rs.rating.date)}</span>}
    </span>
  );
}

export const bandLabel = (score) => `${tl(bandFor(score))}, ${score}%`;

// Monthly trend of ratings (RAT-14).
export function RatingTrend({ businessId, months = 6 }) {
  const { state } = useStore();
  const list = ratingsFor(state, businessId).filter((r) => r.status !== "draft").slice(-months);
  if (!list.length) return <p className="muted small">{L("No ratings yet.", "Bado hakuna viwango.")}</p>;
  return (
    <div className="bars" aria-label={L("Records Rating trend", "Mwenendo wa Kiwango cha Kumbukumbu")}>
      {list.map((r) => (
        <div className="bar" key={r.id}>
          <b>{r.score}%</b>
          <i style={{ height: `${Math.max(6, r.score)}%`, background: bandFor(r.score).color }} />
          <small>{fmtDate(r.date, true)}</small>
        </div>
      ))}
    </div>
  );
}

export const BandLegend = () => (
  <div className="row small">
    {BANDS.map((b) => (
      <span key={b.key} className="badge" style={{ background: b.color }}><i className="sw" />{tl(b)} {b.key === "excellent" ? "≥90" : b.key === "good" ? "70–89" : b.key === "okay" ? "50–69" : "<50"}</span>
    ))}
    <span className="badge" style={{ background: GREY }}><i className="sw" />{L("Not yet checked / overdue", "Bado / umechelewa")}</span>
  </div>
);

const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], sw: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"] };
export function fmtDate(iso, short = false) {
  if (!iso) return "";
  const d = parseISO(String(iso).slice(0, 10));
  const m = MONTHS[getLang()][d.getMonth()];
  return short ? `${m} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${m} ${d.getFullYear()}`;
}
// Times are shown in Tanzania time whatever the phone's own zone.
export const fmtTime = (iso) => (iso ? tzTimeOf(Date.parse(iso)) : "");
export const fmtDateTime = (iso) => (iso ? `${fmtDate(tzDateOf(Date.parse(iso)))} ${fmtTime(iso)}` : "");

// Date range with presets (REP-02).
export function rangeFor(preset, todayISO) {
  const d = parseISO(todayISO);
  const dow = (d.getDay() + 6) % 7;
  if (preset === "today") return { from: todayISO, to: todayISO };
  if (preset === "week") return { from: addDays(todayISO, -dow), to: todayISO };
  if (preset === "month") return { from: startOfMonth(todayISO), to: todayISO };
  if (preset === "last") {
    const lastEnd = addDays(startOfMonth(todayISO), -1);
    return { from: startOfMonth(lastEnd), to: endOfMonth(lastEnd) };
  }
  if (preset === "90") return { from: addDays(todayISO, -89), to: todayISO };
  return null;
}

export function DateRange({ value, onChange, minDate = "2020-01-01" }) {
  const { state } = useStore();
  const t = today(state);
  const maxDate = t;
  const presets = [
    ["today", L("Today", "Leo")], ["week", L("This week", "Wiki hii")], ["month", L("This month", "Mwezi huu")],
    ["last", L("Last month", "Mwezi uliopita")], ["custom", L("Custom", "Chagua")]
  ];
  return (
    <div className="stack no-print">
      <div className="chips">
        {presets.map(([k, label]) => (
          <button key={k} className={`chip ${value.preset === k ? "on" : ""}`} onClick={() => onChange(k === "custom" ? { ...value, preset: k } : { preset: k, ...rangeFor(k, t) })}>
            {label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="form two">
          <Field label={L("From", "Kuanzia")}><DatePicker name={L("From", "Kuanzia")} value={value.from} min={minDate} max={value.to || maxDate} onChange={(v) => v && onChange({ ...value, from: v })} /></Field>
          <Field label={L("To", "Hadi")}><DatePicker name={L("To", "Hadi")} value={value.to} min={value.from || minDate} max={maxDate} onChange={(v) => v && onChange({ ...value, to: v })} /></Field>
        </div>
      )}
    </div>
  );
}

export const useRange = (preset = "month") => {
  const { state } = useStore();
  return useState(() => ({ preset, ...rangeFor(preset, today(state)) }));
};

// Photo from the phone camera or a file; kept in IndexedDB, the state stores only its id.
export function PhotoInput({ value, onChange, label, required, capture = "environment" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = file.type.startsWith("image/") ? await compressImage(file) : await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const id = uid("F");
      await putFile(id, { name: file.name, type: file.type, data });
      onChange(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      {label && <span>{label}{required && " *"}</span>}
      <div className="row">
        {value && <StoredImage id={value} />}
        <button type="button" className="btn" onClick={() => ref.current?.click()} disabled={busy}>
          <Camera size={18} />
          {busy ? L("Saving…", "Inahifadhi…") : value ? L("Change photo", "Badilisha picha") : L("Take or choose photo", "Piga au chagua picha")}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" capture={capture} hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

export function StoredImage({ id, className = "photo-thumb" }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    getFile(id).then((f) => live && setSrc(f?.data || null)).catch(() => {});
    return () => { live = false; };
  }, [id]);
  if (!src) return <span className="pill grey">{L("Photo", "Picha")}</span>;
  return <img src={src} alt="" className={className} />;
}

// Voice input with the browser's speech recognition (Kiswahili or English), where available.
export function VoiceButton({ onText }) {
  const [on, setOn] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  if (!SR) return null;
  const toggle = () => {
    if (on) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = getLang() === "sw" ? "sw-TZ" : "en-GB";
    rec.interimResults = false;
    rec.onresult = (e) => onText(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    rec.onend = () => setOn(false);
    rec.onerror = () => setOn(false);
    recRef.current = rec;
    rec.start();
    setOn(true);
  };
  return (
    <button type="button" className={`btn ${on ? "navy" : ""}`} onClick={toggle} aria-label={L("Speak", "Ongea")}>
      {on ? <MicOff size={18} /> : <Mic size={18} />}
      {on ? L("Stop", "Simamisha") : L("Speak", "Ongea")}
    </button>
  );
}

export function Meter({ value, color }) {
  return <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} /></div>;
}

export function BusinessPicker({ businesses, value, onChange, placeholder }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? L("Choose a business", "Chagua biashara")}
      options={businesses.map((b) => ({ value: b.id, label: `${b.profile.businessName} · ${b.profile.ownerName}` }))}
    />
  );
}

export function downloadText(name, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
