// KPI dashboard for BOT and other report users (BOT-01 to BOT-08). Aggregated and de-identified only.
import { Download, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { computeKpis, kpiCsv } from "../../core/kpi.js";
import { BANDS, GREY } from "../../core/rating.js";
import { REGIONS, SECTORS } from "../../core/seed.js";
import { addDays, money, pct, today } from "../../core/util.js";
import { L, tl } from "../../lib/i18n.js";
import { audit } from "../../lib/actions.js";
import { useStore } from "../../lib/store.jsx";
import { Card, DatePicker, Field, Select, downloadText, fmtDate } from "../../ui/components.jsx";

function Tile({ n, title, def, children, priority }) {
  return (
    <section className="card" style={priority ? { borderColor: "#f6c19c" } : undefined}>
      <div className="between"><h3>{n ? `${n}. ` : ""}{title}</h3>{priority && <span className="pill orange">{L("Priority", "Kipaumbele")}</span>}</div>
      <div className="mt">{children}</div>
      <p className="tiny muted mt">{def}</p>
    </section>
  );
}
const Big = ({ v, label }) => <div><strong style={{ fontSize: 24, fontFamily: "Manrope, Inter, sans-serif" }}>{v}</strong><div className="small muted">{label}</div></div>;

export default function Kpi({ focus }) {
  const { state, user, update } = useStore();
  const t = today(state);
  const [f, setF] = useState({ from: addDays(t, -89), to: t, region: "", sector: "", gender: "", age: "" });
  const k = useMemo(() => computeKpis(state, f, t), [state, f, t]);
  const tiles = state.settings.reportTiles || {};
  useEffect(() => { if (focus) document.getElementById(focus)?.scrollIntoView({ behavior: "smooth" }); }, [focus]);
  // Export restrictions (BOT-07 revised): filtered exports need a group at least twice the minimum; every export is logged.
  const canExport = !k.hidden && (!k.filtered || k.count >= 2 * k.minGroup);
  const logExport = (kind) => update((d) => audit(d, user, `KPI export (${kind})`, "reports", { after: { ...f, count: k.count } }));
  const csv = () => { logExport("CSV"); downloadText(`tijapass-kpis-${f.from}-${f.to}.csv`, kpiCsv(k)); };
  const sup = (n, v) => (n > 0 && n < (k.minCell || 3) ? L(`fewer than ${k.minCell || 3}`, `chini ya ${k.minCell || 3}`) : v);
  const on = (key) => tiles[key] !== false;
  return (
    <div className="stack">
      <Card id="kpi-filters" title={L("Filters", "Vichujio")} actions={<span className="small muted">{L("Share of TijaPass businesses, not national rates", "Sehemu ya biashara za TijaPass, si viwango vya kitaifa")}</span>}>
        <div className="form two no-print">
          <Field label={L("From", "Kuanzia")}><DatePicker name={L("From", "Kuanzia")} min="2020-01-01" max={f.to || today(state)} value={f.from} onChange={(v) => v && setF({ ...f, from: v })} /></Field>
          <Field label={L("To", "Hadi")}><DatePicker name={L("To", "Hadi")} min={f.from || "2020-01-01"} max={today(state)} value={f.to} onChange={(v) => v && setF({ ...f, to: v })} /></Field>
          <Field label={L("Region", "Mkoa")}><Select value={f.region} onChange={(v) => setF({ ...f, region: v })} placeholder={L("All", "Yote")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
          <Field label={L("Sector", "Sekta")}><Select value={f.sector} onChange={(v) => setF({ ...f, sector: v })} placeholder={L("All", "Zote")} options={SECTORS.map((s) => ({ value: s.id, label: tl(s) }))} /></Field>
          <Field label={L("Gender", "Jinsia")}><Select value={f.gender} onChange={(v) => setF({ ...f, gender: v })} placeholder={L("All", "Wote")} options={[{ value: "female", label: L("Women", "Wanawake") }, { value: "male", label: L("Men", "Wanaume") }]} /></Field>
          <Field label={L("Age group", "Kundi la umri")}><Select value={f.age} onChange={(v) => setF({ ...f, age: v })} placeholder={L("All", "Wote")} options={[{ value: "youth", label: L(`Youth (up to ${state.settings.youthMaxAge})`, `Vijana (hadi ${state.settings.youthMaxAge})`) }, { value: "adult", label: L("Older", "Wakubwa") }]} /></Field>
        </div>
        <p className="print-only">{fmtDate(f.from)} – {fmtDate(f.to)} · {[f.region, f.sector, f.gender, f.age].filter(Boolean).join(" · ")}</p>
      </Card>
      <div id="kpi-export" className="row no-print">
        <button className="btn" disabled={!canExport} onClick={csv}><Download size={18} />{L("Export CSV", "Pakua CSV")}</button>
        <button className="btn" disabled={!canExport} onClick={() => { logExport("PDF"); window.print(); }}><Printer size={18} />{L("Export PDF", "Pakua PDF")}</button>
        {!k.hidden && !canExport && <span className="small muted">{L(`Exports of filtered groups need at least ${2 * k.minGroup} businesses.`, `Kupakua makundi yaliyochujwa kunahitaji biashara angalau ${2 * k.minGroup}.`)}</span>}
      </div>
      {k.hidden ? (
        <div className="notice warn"><b>{L("Group too small to show", "Kundi ni dogo mno kuonyeshwa")}</b>{k.reason === "complement" ? L(`The businesses outside this filter number fewer than ${k.minGroup}, so they could be identified by subtraction. Figures are hidden to protect privacy.`, `Biashara zilizo nje ya kichujio hiki ni chini ya ${k.minGroup}, hivyo zingeweza kutambulika kwa kutoa. Takwimu zimefichwa kulinda faragha.`) : L(`Fewer than ${k.minGroup} businesses match these filters, so figures are hidden to protect privacy.`, `Biashara chini ya ${k.minGroup} zinalingana na vichujio hivi, hivyo takwimu zimefichwa kulinda faragha.`)}</div>
      ) : (
        <>
          <p className="small muted">{k.count} {L("businesses in this group", "biashara katika kundi hili")} · {fmtDate(k.from)} – {fmtDate(k.to)}</p>
          <div className="grid g2">
            {on("k2") && <Tile n={2} priority title={L("Financial inclusion", "Ujumuishaji wa kifedha")} def={L(`Answers given once at joining (${k.k2.answered} answered). Share of TijaPass businesses.`, `Majibu yaliyotolewa mara moja wakati wa kujiunga (${k.k2.answered}). Sehemu ya biashara za TijaPass.`)}><div className="grid g2 keep2"><Big v={sup(k.k2.noBankN, pct(k.k2.noBank))} label={L("had no bank account when they joined", "hawakuwa na akaunti ya benki walipojiunga")} /><Big v={sup(k.k2.neverBorrowedN, pct(k.k2.neverBorrowed))} label={L("had never borrowed formally", "hawakuwahi kukopa rasmi")} /></div></Tile>}
            {on("k3") && <Tile n={3} priority title={L("Credit readiness", "Utayari wa mkopo")} def={L("Share at or above the qualifying score with a Records Rating of Okay or better and all lending checks met.", "Sehemu yenye alama ya kufuzu au zaidi, Kiwango cha Wastani au zaidi na vigezo vyote vimetimia.")}><Big v={sup(k.k3.readyCount, pct(k.k3.ready))} label={`${sup(k.k3.readyCount, k.k3.readyCount)} ${L("businesses", "biashara")}`} /></Tile>}
            {on("k4") && <Tile n={4} priority title={L("Financing gap", "Pengo la ufadhili")} def={L("Loan amounts requested in the period compared with amounts approved. Stated needs are shown separately and not used in the gap.", "Kiasi cha mikopo kilichoombwa kikilinganishwa na kilichoidhinishwa. Mahitaji yaliyotajwa yanaonyeshwa kando.")}><div className="grid g2 keep2"><Big v={money(k.k4.requested)} label={L("requested", "kiliombwa")} /><Big v={money(k.k4.approved)} label={L("approved", "kiliidhinishwa")} /><Big v={money(k.k4.gap)} label={L("gap", "pengo")} /><Big v={money(k.k4.statedNeed)} label={L("stated need (separate)", "mahitaji yaliyotajwa (kando)")} /></div></Tile>}
            {on("k5") && <Tile n={5} priority title={L("Credit access and disbursement", "Upatikanaji na utoaji wa mikopo")} def={L("Loans approved and disbursed through TijaPass in the period, and loans reported from outside TijaPass in the 3-month check-ins.", "Mikopo iliyoidhinishwa na kutolewa kupitia TijaPass, na mikopo ya nje iliyoripotiwa kwenye maswali ya miezi mitatu.")}><div className="grid g2 keep2"><Big v={sup(k.k5.approvedCount, k.k5.approvedCount)} label={L("approved", "iliidhinishwa")} /><Big v={sup(k.k5.disbursedCount, `${k.k5.disbursedCount} · ${money(k.k5.disbursedValue)}`)} label={L("disbursed", "ilitolewa")} /><Big v={sup(k.k5.outsideCount, `${k.k5.outsideCount} · ${money(k.k5.outsideValue)}`)} label={L("outside TijaPass", "nje ya TijaPass")} /></div></Tile>}
            {on("k1") && <Tile n={1} title={L("Businesses registered and active", "Biashara zilizosajiliwa na hai")} def={L(`Active = entries on at least ${state.settings.activeMinDays} days in the last 30.`, `Hai = miamala angalau siku ${state.settings.activeMinDays} katika 30 zilizopita.`)}><div className="grid g2 keep2"><Big v={k.k1.registered} label={L("registered", "zimesajiliwa")} /><Big v={k.k1.active} label={L("active", "hai")} /></div></Tile>}
            {on("k6") && <Tile n={6} title={L("Portfolio quality", "Ubora wa jalada")} def={L("PAR30: share of outstanding principal on loans with an instalment more than 30 days late. On-time rate: instalments due that were paid by their due date.", "PAR30: sehemu ya mkopo unaodaiwa wenye rejesho lililochelewa zaidi ya siku 30. Kiwango cha wakati: marejesho yaliyolipwa kwa tarehe yake.")}><div className="grid g2 keep2"><Big v={pct(k.k6.par30, 1)} label="PAR30" /><Big v={pct(k.k6.repaymentRate)} label={L("paid on time", "yalilipwa kwa wakati")} /></div></Tile>}
            {on("k7") && <Tile n={7} title={L("Digital adoption", "Matumizi ya kidijitali")} def={L("Share recording in the period, share uploading statements, and share using mobile money at joining.", "Sehemu inayoandika, inayopakia taarifa, na inayotumia pesa ya simu wakati wa kujiunga.")}><div className="grid g3 keep2"><Big v={pct(k.k7.recording)} label={L("recording", "wanaandika")} /><Big v={pct(k.k7.importing)} label={L("uploading statements", "wanapakia taarifa")} /><Big v={pct(k.k7.mobileMoney)} label={L("use mobile money", "wanatumia pesa ya simu")} /></div></Tile>}
            {on("k8") && <Tile n={8} title={L("Women and youth", "Wanawake na vijana")} def={L(`From gender and date of birth at joining; youth = ${state.settings.youthMaxAge} and under.`, `Kutoka jinsia na tarehe ya kuzaliwa; vijana = ${state.settings.youthMaxAge} na chini.`)}><div className="grid g2 keep2"><Big v={pct(k.k8.womenShare)} label={L("women-owned", "zinamilikiwa na wanawake")} /><Big v={pct(k.k8.youthShare)} label={L("youth-owned", "zinamilikiwa na vijana")} /><Big v={sup(k.k8.womenFundedN, pct(k.k8.womenFunded))} label={L("of women funded", "ya wanawake walifadhiliwa")} /><Big v={sup(k.k8.youthFundedN, pct(k.k8.youthFunded))} label={L("of youth funded", "ya vijana walifadhiliwa")} /></div></Tile>}
            {on("k9") && <Tile n={9} title={L("Productive assets financed", "Mali za uzalishaji zilizofadhiliwa")} def={L("Asset loans disbursed and paid to suppliers in the period.", "Mikopo ya mali iliyotolewa na kulipwa kwa wasambazaji.")}><div className="grid g2 keep2"><Big v={sup(k.k9.count, k.k9.count)} label={L("asset loans", "mikopo ya mali")} /><Big v={sup(k.k9.count, money(k.k9.value))} label={L("value", "thamani")} /></div></Tile>}
            {on("k10") && <Tile n={10} title={L("Business growth", "Ukuaji wa biashara")} def={L("Total sales and profit in the first and last month of the period; staff as reported at joining.", "Jumla ya mauzo na faida mwezi wa kwanza na wa mwisho wa kipindi; wafanyakazi kama walivyoripotiwa.")}><div className="grid g2 keep2"><Big v={`${money(k.k10.revenueFirst)} → ${money(k.k10.revenueLast)}`} label={L("sales", "mauzo")} /><Big v={`${money(k.k10.profitFirst)} → ${money(k.k10.profitLast)}`} label={L("profit", "faida")} /><Big v={k.k10.staff} label={L("staff", "wafanyakazi")} /></div></Tile>}
          </div>
          {on("extra") && (
            <div className="grid g3">
              <Tile title={L("Average cost of credit", "Wastani wa gharama ya mkopo")} def={L("Interest plus fees as an approximate yearly % of the amount, for offers in the period.", "Riba pamoja na ada kama % ya mwaka ya kiasi, kwa ofa za kipindi.")}><Big v={`${k.extra.avgCostPct}%`} label={L("a year", "kwa mwaka")} /></Tile>
              <Tile title={L("Complaints", "Malalamiko")} def={L("Queries marked as complaints, and how many were answered.", "Maswali yaliyowekwa kama malalamiko, na mangapi yalijibiwa.")}><Big v={sup(k.extra.complaints, `${k.extra.complaintsResolved} / ${k.extra.complaints}`)} label={L("resolved / received", "yametatuliwa / yamepokelewa")} /></Tile>
              <Tile title={L("Data quality", "Ubora wa data")} def={L("Share of businesses in each TijaPass Records Rating band (latest rating).", "Sehemu ya biashara katika kila kiwango cha Kumbukumbu (cha mwisho).")}>
                <div className="stack">{[...BANDS.map((b) => [b.key, tl(b), b.color]), ["not_checked", L("Not yet checked", "Bado haijakaguliwa"), GREY]].map(([key, label, color]) => <div key={key} className="between small"><span className="badge" style={{ background: color }}><i className="sw" />{label}</span><b>{sup(k.extra.bands[key], pct(k.count ? k.extra.bands[key] / k.count : 0))}</b></div>)}</div>
              </Tile>
            </div>
          )}
        </>
      )}
    </div>
  );
}
