// Daily close and catch-up (DAY-01 to DAY-08, REC-11).
import { CheckCircle2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { REASONS, closesFor, compareCounts, daySummary, isClosed, unclosedPastDays } from "../../core/dailyClose.js";
import { addDays, money, round, sum, today } from "../../core/util.js";
import { closeDay } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, Field, Steps, fmtDate, fmtTime } from "../../ui/components.jsx";
import { EntryLine } from "../common.jsx";
import { EntryForm } from "./Record.jsx";

function DayReview({ business, day, title, onNext, nextLabel }) {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  const [n, setN] = useState(0);
  const s = daySummary(state, business.id, day);
  return (
    <Card>
      <h2>{title}</h2>
      <div className="grid g2 keep2 mt">
        <div className="stat"><small>{L("Money in", "Pesa iliyoingia")}</small><strong className="green">{money(s.totalIn)}</strong><em>{s.countIn} {L("entries", "miamala")}</em></div>
        <div className="stat"><small>{L("Money out", "Pesa iliyotoka")}</small><strong className="amber">{money(s.totalOut)}</strong><em>{s.countOut} {L("entries", "miamala")}</em></div>
      </div>
      <div className="list mt">{s.entries.map((e) => <EntryLine key={e.id} e={e} business={business} />)}</div>
      <h3 className="mt">{L("Anything missing?", "Kuna kilichosahaulika?")}</h3>
      {adding ? (
        <div className="mt"><EntryForm key={n} business={business} fixedDate={day} compact onCancel={() => setAdding(false)} onPosted={() => setTimeout(() => { setAdding(false); setN(n + 1); }, 900)} /></div>
      ) : (
        <button className="btn mt" onClick={() => setAdding(true)}><Plus size={18} />{L("Add what is missing", "Ongeza kilichosahaulika")}</button>
      )}
      <button className="btn primary big block mt" onClick={onNext}>{nextLabel}</button>
    </Card>
  );
}

export default function Close() {
  const { state, user, go } = useStore();
  const act = useAction();
  const b = myBusiness(state, user);
  const t = today(state);
  const missed = useMemo(() => unclosedPastDays(state, b, t), [state, b, t]);
  const catchUp = missed.length > 0;
  const from = catchUp ? missed[0] : t;
  // Recording is never blocked, so if today already has entries the catch-up count also covers today.
  const todayHasEntries = state.entries.some((e) => e.businessId === b.id && e.date === t && e.status !== "declined");
  const to = catchUp ? (todayHasEntries ? t : addDays(t, -1)) : t;
  const reviewDays = catchUp ? (todayHasEntries ? [...missed, t] : missed) : [t];
  const [step, setStep] = useState(0); // 0..reviewDays-1 review, then count, compare, done
  const [counts, setCounts] = useState({});
  const [reasons, setReasons] = useState({}); // channelId -> { key: amount }
  const [done, setDone] = useState(null);

  if (done) {
    return (
      <Card>
        <div className="stack" style={{ textAlign: "center" }}>
          <CheckCircle2 size={48} className="green" style={{ margin: "0 auto" }} />
          <h2>{catchUp ? L("Days closed", "Siku zimefungwa") : L("Day closed", "Siku imefungwa")}</h2>
          <p>{fmtDate(done.from)}{done.from !== done.to ? ` – ${fmtDate(done.to)}` : ""} · {L("closed at", "imefungwa saa")} {fmtTime(done.closedAt)}</p>
          {Math.abs(done.remainder) > 0.5 && <p className="notice warn">{L("Unexplained difference held for TijaPass to resolve with you", "Tofauti isiyoelezeka imewekwa kando ili TijaPass waitatue nawe")}: {money(done.remainder)}</p>}
          <button className="btn primary" onClick={() => go("home")}>{L("Back home", "Rudi nyumbani")}</button>
        </div>
      </Card>
    );
  }

  if (!catchUp && isClosed(state, b.id, t)) {
    const c = closesFor(state, b.id).filter((x) => x.to === t).pop();
    return (
      <Card>
        <h2>{L("Today is closed", "Leo imefungwa")}</h2>
        <p className="mt">{L("Closed at", "Imefungwa saa")} {fmtTime(c?.closedAt)}. {L("You can still record money; it will count in today's figures.", "Bado unaweza kuandika pesa; itahesabiwa kwenye takwimu za leo.")}</p>
        <button className="btn mt" onClick={() => go("record")}>{L("Record money", "Andika pesa")}</button>
      </Card>
    );
  }

  const reviewing = step < reviewDays.length;
  const countStep = step === reviewDays.length;
  const compareStep = step === reviewDays.length + 1;
  const totalSteps = reviewDays.length + 2;
  const allCounted = b.channels.filter((c) => !c.archived).every((c) => counts[c.id] !== undefined && counts[c.id] !== "");

  const cmp = compareStep ? compareCounts(state, b.id, counts, to) : null;
  const explained = (chId) => sum(Object.values(reasons[chId] || {}), (v) => Number(v) || 0);
  const remainderFor = (r) => round(Math.abs(r.diff) - explained(r.channelId), 2);

  const finish = () => {
    const list = [];
    for (const r of cmp.rows) {
      if (r.withinTolerance) continue;
      const side = r.diff > 0 ? "higher" : "lower";
      for (const [key, amount] of Object.entries(reasons[r.channelId] || {})) {
        const def = REASONS[side].find((x) => x.key === key);
        if (def && Number(amount) > 0) list.push({ kind: def.kind, amount: Math.min(Number(amount), Math.abs(r.diff)), channelId: r.channelId, label: def.en });
      }
    }
    const c = act((d) => closeDay(d, user, { businessId: b.id, from, to, counts, reasons: list, catchUp }));
    if (c) setDone(c);
  };

  return (
    <div className="stack">
      <Steps count={totalSteps} at={step} />
      {catchUp && step === 0 && <p className="notice warn"><b>{L("Catch-up", "Kufidia siku")}</b>{L(`${missed.length} day(s) were not closed. Check each day's money in and out, oldest first, then count your money once.`, `Siku ${missed.length} hazikufungwa. Hakiki pesa iliyoingia na kutoka kila siku, kuanzia ya zamani, kisha hesabu pesa zako mara moja.`)}</p>}
      {reviewing && (
        <DayReview
          key={reviewDays[step]}
          business={b}
          day={reviewDays[step]}
          title={`${catchUp ? `${L("Day", "Siku")} ${step + 1} ${L("of", "kati ya")} ${reviewDays.length}: ` : `${L("Today", "Leo")}: `}${fmtDate(reviewDays[step])}`}
          nextLabel={step < reviewDays.length - 1 ? L("This day is complete, next day", "Siku hii imekamilika, siku inayofuata") : L("All recorded, count my money", "Vyote vimeandikwa, hesabu pesa zangu")}
          onNext={() => setStep(step + 1)}
        />
      )}
      {countStep && (
        <Card title={L("Count all the money you hold", "Hesabu pesa zote ulizonazo")}>
          <p className="muted">{L("Count everything, business and personal: first the cash in hand, then look at each wallet and bank balance on your phone.", "Hesabu zote, za biashara na binafsi: kwanza pesa taslimu mkononi, kisha angalia salio la kila pochi na benki kwenye simu yako.")}</p>
          <div className="form mt">
            {b.channels.filter((c) => !c.archived).map((c) => (
              <Field key={c.id} label={c.type === "cash" ? L("Cash in hand now", "Pesa taslimu mkononi sasa") : `${c.name}: ${L("balance now", "salio sasa")}`}>
                <AmountInput big value={counts[c.id] ?? ""} onChange={(v) => setCounts({ ...counts, [c.id]: v === "" ? "" : v })} />
              </Field>
            ))}
          </div>
          <div className="row mt">
            <button className="btn" onClick={() => setStep(step - 1)}>{L("Back", "Rudi")}</button>
            <button className="btn primary big" style={{ flex: 1 }} disabled={!allCounted} onClick={() => setStep(step + 1)}>{L("Compare with my records", "Linganisha na kumbukumbu zangu")}</button>
          </div>
        </Card>
      )}
      {compareStep && cmp && (
        <Card title={L("Your count and your records", "Hesabu yako na kumbukumbu zako")}>
          <div className="list">
            {cmp.rows.map((r) => {
              const side = r.diff > 0 ? "higher" : "lower";
              const rem = remainderFor(r);
              return (
                <div key={r.channelId} className="item" style={{ display: "block" }}>
                  <div className="between">
                    <b>{r.name}</b>
                    {r.withinTolerance ? <span className="pill green">✓ {L("Matches", "Inalingana")}</span> : <span className="pill orange">{side === "higher" ? L("More than records", "Zaidi ya kumbukumbu") : L("Less than records", "Pungufu ya kumbukumbu")}</span>}
                  </div>
                  <div className="kv mt">
                    <span>{L("You counted", "Ulihesabu")}</span><span className="mono">{money(r.counted)}</span>
                    <span>{L("Your records say", "Kumbukumbu zinasema")}</span><span className="mono">{money(r.book)}</span>
                    <span>{L("Difference", "Tofauti")}</span><span className={`mono ${r.withinTolerance ? "" : "amber"}`}>{r.diff > 0 ? "+" : ""}{money(r.diff)}</span>
                  </div>
                  {!r.withinTolerance && (
                    <div className="stack mt">
                      <p className="small bold">{side === "higher" ? L("Why is there more money? Choose what happened and how much.", "Kwa nini kuna pesa zaidi? Chagua kilichotokea na kiasi gani.") : L("Why is there less money? Choose what happened and how much.", "Kwa nini kuna pesa pungufu? Chagua kilichotokea na kiasi gani.")}</p>
                      {REASONS[side].map((x) => {
                        const val = reasons[r.channelId]?.[x.key];
                        const on = val !== undefined;
                        return (
                          <div key={x.key} className="row">
                            <button className={`choice ${on ? "on" : ""}`} style={{ flex: "1 1 220px" }} onClick={() => {
                              const cur = { ...(reasons[r.channelId] || {}) };
                              if (on) delete cur[x.key];
                              else cur[x.key] = Math.max(0, remainderFor(r));
                              setReasons({ ...reasons, [r.channelId]: cur });
                            }}>{on ? "✓ " : ""}{tl(x)}</button>
                            {on && <div style={{ flex: "0 1 170px" }}><AmountInput value={val} onChange={(v) => setReasons({ ...reasons, [r.channelId]: { ...reasons[r.channelId], [x.key]: v } })} /></div>}
                          </div>
                        );
                      })}
                      <p className="small">{L("Still unexplained", "Bado haielezeki")}: <b className={rem > 0.5 ? "amber" : "green"}>{money(Math.max(0, rem))}</b>{rem > 0.5 ? ` · ${L("this will be held as an unexplained difference for TijaPass to resolve with you", "itawekwa kando kama tofauti isiyoelezeka ili TijaPass waitatue nawe")}` : ""}</p>
                      {rem < -0.5 && <p className="small red">{L("Your reasons add up to more than the difference.", "Sababu zako zinazidi tofauti.")}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="row mt">
            <button className="btn" onClick={() => setStep(step - 1)}>{L("Count again", "Hesabu tena")}</button>
            <button className="btn primary big" style={{ flex: 1 }} disabled={cmp.rows.some((r) => remainderFor(r) < -0.5)} onClick={finish}>{catchUp ? L("Close these days", "Funga siku hizi") : L("Close my day", "Funga siku yangu")}</button>
          </div>
        </Card>
      )}
    </div>
  );
}
