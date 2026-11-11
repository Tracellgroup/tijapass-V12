// Paid package benefits on screen (11 Nov 2026): the lock card, the 12-month trend and the financial analysis.
import { AlertTriangle, CheckCircle2, Info, Lock, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { openingVerified } from "../../core/accounting.js";
import { enoughHistory, keyRatios, monthComparison, monthLabel, monthlySeries, trendFindings } from "../../core/analysis.js";
import { FEATURES, cheapestWith, featuresOf, hasFeature } from "../../core/billing.js";
import { money, today } from "../../core/util.js";
import { myBusiness } from "../../lib/access.js";
import { L, getLang, tl } from "../../lib/i18n.js";
import { useStore } from "../../lib/store.jsx";
import { Card, Pill } from "../../ui/components.jsx";

// Which benefits the signed-in business has today.
export function useBenefits() {
  const { state, user } = useStore();
  const b = myBusiness(state, user);
  const t = today(state);
  return { b, t, member: !!user?.member, has: (f) => hasFeature(state, b, f, t) };
}

export const tnote = (f) => (FEATURES[f]?.note ? tl(FEATURES[f].note) : "");

// Shown where a paid benefit would be: what it does, which packages include it, and one tap to get it.
export function LockedCard({ feature, compact = false }) {
  const { state, user, go } = useStore();
  const pk = cheapestWith(state, feature);
  const inPkgs = (state.packages.business || []).filter((p) => p.price > 0 && featuresOf(p.id).includes(feature)).map((p) => tl(p));
  const list = inPkgs.length > 1 ? `${inPkgs.slice(0, -1).join(", ")} ${L("and", "na")} ${inPkgs[inPkgs.length - 1]}` : inPkgs[0];
  return (
    <Card className="lock-card">
      <div className="lock-head">
        <Lock size={22} className="muted" />
        <div className="grow">
          <b>{tl(FEATURES[feature])}</b>
          {!compact && tnote(feature) && <p className="small muted">{tnote(feature)}</p>}
          <p className="small mt">{L("Included in", "Kimo kwenye")}: <b>{list}</b></p>
          {user?.member ? (
            <p className="small muted mt">{L("Ask the business owner to get a package.", "Mwombe mmiliki wa biashara apate kifurushi.")}</p>
          ) : (
            <div className="row mt">
              {pk && <button className="btn primary" onClick={() => go("packages", { choose: pk.id })}>{L("Get", "Pata")} {tl(pk)} · {money(pk.price)}</button>}
              <button className="btn ghost" onClick={() => go("packages")}>{L("See all packages", "Angalia vifurushi vyote")}</button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ 12-month trend (Day pass and up)
export function TrendView({ business }) {
  const { state } = useStore();
  const t = today(state);
  const lang = getLang();
  const series = useMemo(() => monthlySeries(state, business.id, t, 12), [state, business.id, t]);
  const cmp = monthComparison(series);
  const max = Math.max(1, ...series.map((r) => Math.max(r.sales, r.costs)));
  const ch = (x) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`);
  if (!series.length) return <Card><p className="muted">{L("Your first month will show here.", "Mwezi wako wa kwanza utaonekana hapa.")}</p></Card>;
  return (
    <div className="stack">
      {cmp && (
        <Card title={`${monthLabel(cmp.last.month, lang)} ${L("compared with", "ukilinganisha na")} ${monthLabel(cmp.prev.month, lang)}`}>
          <div className="grid g3">
            {[["sales", L("Sales", "Mauzo"), true], ["costs", L("Costs", "Gharama"), false], ["profit", L("Profit", "Faida"), true]].map(([k, name, up]) => {
              const good = cmp[k] == null ? null : up ? cmp[k] >= 0 : cmp[k] <= 0;
              return (
                <div key={k} className="stat">
                  <small>{name}</small>
                  <strong>{money(cmp.last[k])}</strong>
                  <em className={good == null ? "" : good ? "green" : "red"}>{cmp[k] != null && (cmp[k] >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />)} {ch(cmp[k])} {L("vs", "dhidi ya")} {money(cmp.prev[k])}</em>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card title={L("Sales and costs by month", "Mauzo na gharama kwa mwezi")}>
        <div className="bars">
          {series.map((r) => (
            <div key={r.month}>
              <div className="bar-row"><span>{monthLabel(r.month, lang)}{r.partial ? "*" : ""}</span><div className="bar-track"><i style={{ width: `${(r.sales / max) * 100}%`, background: "var(--green)" }} /></div><span className="mono right">{money(r.sales)}</span></div>
              <div className="bar-row"><span /><div className="bar-track"><i style={{ width: `${(r.costs / max) * 100}%`, background: "#e8a33d" }} /></div><span className="mono right small muted">{money(r.costs)}</span></div>
            </div>
          ))}
        </div>
        <p className="tiny muted mt"><span className="green">■</span> {L("Sales", "Mauzo")} · <span style={{ color: "#e8a33d" }}>■</span> {L("Costs (goods sold and business costs)", "Gharama (bidhaa zilizouzwa na gharama za biashara)")} · * {L("part of a month", "sehemu ya mwezi")}</p>
      </Card>
      <Card title={L("Month by month", "Mwezi kwa mwezi")}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>{L("Month", "Mwezi")}</th><th className="num">{L("Sales", "Mauzo")}</th><th className="num">{L("Costs", "Gharama")}</th><th className="num">{L("Profit", "Faida")}</th><th className="num">{L("Money at the end", "Pesa mwishoni")}</th></tr></thead>
            <tbody>
              {[...series].reverse().map((r) => (
                <tr key={r.month}><td>{monthLabel(r.month, lang)}{r.partial ? "*" : ""}</td><td className="num">{money(r.sales)}</td><td className="num">{money(r.costs)}</td><td className={`num ${r.profit < 0 ? "red" : ""}`}>{money(r.profit)}</td><td className="num">{money(r.cashEnd)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Financial analysis (Premium)
const tone = (s) => ({ good: ["green", L("Good", "Nzuri")], watch: ["orange", L("Watch", "Angalia")], act: ["red", L("Act now", "Chukua hatua")] })[s] || ["grey", "—"];

export function AnalysisView({ business }) {
  const { state } = useStore();
  const t = today(state);
  const series = useMemo(() => monthlySeries(state, business.id, t, 12), [state, business.id, t]);
  const kr = useMemo(() => keyRatios(state, business.id, t), [state, business.id, t]);
  const findings = useMemo(() => trendFindings(series), [series]);
  if (!enoughHistory(series)) return <Card><p className="muted">{L("Keep recording: the analysis starts after your first full month with sales.", "Endelea kuandika: uchambuzi unaanza baada ya mwezi wako wa kwanza kamili wenye mauzo.")}</p></Card>;
  const Icon = { good: CheckCircle2, act: AlertTriangle, watch: Info, info: Info };
  return (
    <div className="stack">
      {!openingVerified(business) && <p className="notice warn"><b>{L("Based on your own records", "Kwa kumbukumbu zako mwenyewe")}</b>{L("Your starting position is not verified yet, so the figures may change after TijaPass checks it.", "Hali yako ya kuanzia bado haijahakikiwa, hivyo takwimu zinaweza kubadilika baada ya TijaPass kuikagua.")}</p>}
      <Card title={L("What changed", "Kilichobadilika")}>
        {!findings.length && <p className="muted small">{L("Not enough months yet to see a trend.", "Bado hakuna miezi ya kutosha kuona mwenendo.")}</p>}
        <div className="list">
          {findings.map((f, i) => {
            const I = Icon[f.tone] || Info;
            return <div key={i} className="item"><I size={18} className={f.tone === "good" ? "green" : f.tone === "act" ? "red" : "muted"} /><div className="grow small">{tl(f)}</div></div>;
          })}
        </div>
      </Card>
      <h2>{L("Key ratios", "Uwiano muhimu")}</h2>
      <p className="small muted">{L("Last 90 days of records, and what you own and owe today.", "Kumbukumbu za siku 90 zilizopita, na unachomiliki na unachodaiwa leo.")}</p>
      <div className="grid g2">
        {kr.ratios.map((r) => (
          <Card key={r.id} className={`ratio ${r.status}`}>
            <div className="between"><b>{tl(r.name)}</b><Pill tone={tone(r.status)[0]}>{tone(r.status)[1]}</Pill></div>
            <div className="big">{r.shown}{r.unit ? <span className="small muted"> {tl(r.unit)}</span> : null}</div>
            <p className="small">{tl(r.says)}</p>
            {r.status !== "good" && <p className="small muted mt">{tl(r.todo)}</p>}
          </Card>
        ))}
      </div>
      <p className="tiny muted">{L("Prepared by TijaPass from the business's own records. A guide, not financial advice.", "Imeandaliwa na TijaPass kutoka kumbukumbu za biashara yenyewe. Ni mwongozo, si ushauri wa kifedha.")}</p>
    </div>
  );
}
