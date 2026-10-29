// Monthly records check (RAT-02 to RAT-08): due list and the step-by-step checklist on the officer's phone.
import { CheckCircle2, MapPin, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CHECKS, bandFor, bookFigures, dueList, pickSample, ratingPeriod, scoreCash, scoreCompleteness, scoreCorrectness, scoreStock, timelinessFor, totalScore } from "../../core/rating.js";
import { distanceM, money, nowISO, today, uid } from "../../core/util.js";
import { saveRating } from "../../lib/actions.js";
import { businessesInScope, canSeeBusiness } from "../../lib/access.js";
import { getLocation } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, BandLegend, Card, Empty, Field, PhotoInput, RatingBadge, Steps, Text, fmtDate, fmtDateTime } from "../../ui/components.jsx";
import { kindPlain } from "../common.jsx";

export function RatingDue() {
  const { state, user, go } = useStore();
  const t = today(state);
  const list = businessesInScope(state, user);
  const due = dueList(state, list, t);
  const soon = dueList(state, list, t.slice(0, 8) + "31").filter((x) => !due.some((d) => d.business.id === x.business.id));
  const Row = ({ x }) => (
    <div className="item" style={{ flexWrap: "wrap" }}>
      <div className="grow" style={{ minWidth: 180 }}><b>{x.business.profile.businessName}</b><div className="small muted">{L("Due", "Inatakiwa")} {fmtDate(x.due)}{x.overdue ? ` · ${L("overdue", "imechelewa")}` : ""}</div></div>
      <RatingBadge business={x.business} />
      <button className="btn small primary" onClick={() => go("rating-check", { id: x.business.id })}>{L("Start check", "Anza ukaguzi")}</button>
    </div>
  );
  return (
    <div className="stack">
      <BandLegend />
      <Card title={L("Due and overdue", "Zinazotakiwa na zilizochelewa")}>
        {!due.length && <Empty text={L("No checks due today.", "Hakuna ukaguzi unaotakiwa leo.")} />}
        <div className="list">{due.map((x) => <Row key={x.business.id} x={x} />)}</div>
      </Card>
      <Card title={L("Coming up this month", "Zinazokuja mwezi huu")}>
        {!soon.length && <p className="small muted">{L("None.", "Hakuna.")}</p>}
        <div className="list">{soon.map((x) => <Row key={x.business.id} x={x} />)}</div>
      </Card>
      <Card title={L("Check any business", "Kagua biashara yoyote")}>
        <div className="list">{list.map((b) => <div key={b.id} className="item"><div className="grow"><b>{b.profile.businessName}</b></div><RatingBadge business={b} /><button className="btn small" onClick={() => go("rating-check", { id: b.id })}>{L("Start", "Anza")}</button></div>)}</div>
      </Card>
    </div>
  );
}

const STEPS = ["start", "cash", "completeness", "correctness", "timeliness", "stock", "review"];

export function RatingCheck() {
  const { state, user, params, go } = useStore();
  const act = useAction();
  const b = state.businesses.find((x) => x.id === params.id);
  const [visit] = useState(() => ({ id: uid("R"), at: nowISO(state), date: today(state) }));
  const [step, setStep] = useState(0);
  const [gps, setGps] = useState(undefined);
  const [counts, setCounts] = useState({});
  const [cashPhoto, setCashPhoto] = useState(null);
  const [sampled, setSampled] = useState(10);
  const [evidence, setEvidence] = useState(() => Array.from({ length: 10 }, () => ({ text: "", found: null })));
  const [docPhoto, setDocPhoto] = useState(null);
  const [checks, setChecks] = useState({});
  const [stockEst, setStockEst] = useState("");
  const [equipEst, setEquipEst] = useState("");
  const [stockPhoto, setStockPhoto] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => { getLocation().then((g) => setGps(g)); }, []);
  const sampleIds = useMemo(() => (b ? pickSample(state, b, visit.date, `${b.id}-${visit.date}`) : []), [b?.id, visit.date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b || !canSeeBusiness(state, user, b.id)) return <Empty text={L("This business is not assigned to you.", "Biashara hii haijapangiwa kwako.")} />;

  const book = bookFigures(state, b, visit.date);
  const countedTotal = b.channels.reduce((t, c) => t + (Number(counts[c.id]) || 0), 0);
  const allCounted = b.channels.every((c) => counts[c.id] !== undefined && counts[c.id] !== "");
  const ev = evidence.slice(0, sampled);
  const found = ev.filter((x) => x.found === true).length;
  const sample = sampleIds.map((id) => state.entries.find((e) => e.id === id)).filter(Boolean);
  const correct = sample.filter((e) => checks[e.id]?.ok === true).length;
  const time = timelinessFor(state, b, visit.date);
  const bookStockTotal = book.inventory + book.equipment;
  const estTotal = (Number(stockEst) || 0) + (Number(equipEst) || 0);
  const points = {
    cash: scoreCash(countedTotal, book.cash, state.settings),
    completeness: scoreCompleteness(found, sampled),
    correctness: sample.length ? scoreCorrectness(correct, sample.length) : 0,
    timeliness: time.points,
    stock: scoreStock(estTotal, bookStockTotal)
  };
  const total = totalScore(points);
  const dist = gps && b.profile.gps ? distanceM(gps, b.profile.gps) : null;
  const locationFlag = !gps || (dist != null && dist > (state.settings.visitDistanceFlagM ?? 500));

  const stepOk = {
    start: gps !== undefined,
    cash: allCounted && cashPhoto,
    completeness: ev.every((x) => x.text.trim() && x.found !== null) && docPhoto,
    correctness: sample.every((e) => checks[e.id]?.ok === true || (checks[e.id]?.ok === false && checks[e.id]?.note?.trim())),
    timeliness: true,
    stock: stockEst !== "" && equipEst !== "" && stockPhoto,
    review: true
  }[STEPS[step]];

  const submit = () => {
    const rating = {
      id: visit.id, businessId: b.id, businessName: b.profile.businessName, date: visit.date, visitAt: visit.at, gps: gps || null, distanceM: dist, locationFlag,
      period: ratingPeriod(b, visit.date), points, score: total,
      details: {
        cash: { counted: countedTotal, book: book.cash, counts },
        completeness: { sampled, found, items: ev },
        correctness: { sampled: sample.length, correct, items: sample.map((e) => ({ entryId: e.id, ok: checks[e.id]?.ok, note: checks[e.id]?.note || "" })) },
        timeliness: { tradingDays: time.tradingDays, onTime: time.onTime },
        stock: { stockEst: Number(stockEst) || 0, equipEst: Number(equipEst) || 0, bookStock: book.inventory, bookEquip: book.equipment }
      },
      evidence: [cashPhoto, docPhoto, stockPhoto].filter(Boolean), note: note.trim(), weights: Object.fromEntries(Object.entries(CHECKS).map(([k, v]) => [k, v.max]))
    };
    if (act((d) => saveRating(d, user, rating), L("Records Rating saved", "Kiwango cha Kumbukumbu kimehifadhiwa"))) go("business", { id: b.id, tab: "rating" });
  };

  const s = STEPS[step];
  return (
    <div className="stack">
      <div className="between"><h2>{b.profile.businessName}</h2><RatingBadge business={b} /></div>
      <Steps count={STEPS.length} at={step} />
      <Card title={`${step + 1}. ${{ start: L("Start the visit", "Anza ziara"), cash: tl(CHECKS.cash), completeness: tl(CHECKS.completeness), correctness: tl(CHECKS.correctness), timeliness: tl(CHECKS.timeliness), stock: tl(CHECKS.stock), review: L("Review and submit", "Hakiki na wasilisha") }[s]}`}>
        {s === "start" && (
          <div className="stack">
            <div className="kv">
              <span>{L("Time", "Muda")}</span><span>{fmtDateTime(visit.at)}</span>
              <span>{L("Location", "Mahali")}</span><span>{gps === undefined ? L("Finding…", "Inatafuta…") : gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : L("Not available", "Haipatikani")}</span>
              <span>{L("Distance from business", "Umbali kutoka biashara")}</span><span>{dist != null ? `${dist} m` : "—"}</span>
              <span>{L("Period checked", "Kipindi kinachokaguliwa")}</span><span>{fmtDate(ratingPeriod(b, visit.date).from)} – {fmtDate(ratingPeriod(b, visit.date).to)}</span>
            </div>
            {gps === null && <p className="notice warn">{L("Location is not available. You can continue; Data Admin will see that the location is missing.", "Mahali hapapatikani. Unaweza kuendelea; Msimamizi wa Data ataona kuwa mahali hapapo.")}</p>}
            {gps === null && <button className="btn" onClick={() => { setGps(undefined); getLocation().then(setGps); }}><MapPin size={18} />{L("Try location again", "Jaribu mahali tena")}</button>}
            {locationFlag && gps && <p className="notice warn">{L("You are far from the business's recorded location. This will be flagged.", "Uko mbali na eneo la biashara lililosajiliwa. Hii itaripotiwa.")}</p>}
            <p className="small muted">{L("You cannot change any entry during the check. Errors you find go to the business and Data Admin as correction requests.", "Huwezi kubadilisha muamala wowote wakati wa ukaguzi. Makosa unayoyapata yanaenda kwa biashara na Msimamizi wa Data kama maombi ya marekebisho.")}</p>
          </div>
        )}
        {s === "cash" && (
          <div className="form">
            <p className="muted">{L("Count the cash with the owner, then look at each wallet and bank balance on the owner's phone.", "Hesabu taslimu pamoja na mmiliki, kisha angalia salio la kila pochi na benki kwenye simu ya mmiliki.")}</p>
            {b.channels.map((c) => <Field key={c.id} label={c.name}><AmountInput value={counts[c.id] ?? ""} onChange={(v) => setCounts({ ...counts, [c.id]: v })} /></Field>)}
            <PhotoInput label={L("Photo of the cash count", "Picha ya hesabu ya pesa")} required value={cashPhoto} onChange={setCashPhoto} />
            {allCounted && <div className="kv"><span>{L("Counted", "Iliyohesabiwa")}</span><span>{money(countedTotal)}</span><span>{L("Books", "Vitabu")}</span><span>{money(book.cash)}</span><span>{L("Points", "Alama")}</span><span>{points.cash} / 25</span></div>}
          </div>
        )}
        {s === "completeness" && (
          <div className="form">
            <p className="muted">{L("Pick transactions from the business's own evidence (mobile money messages, receipts, invoices, sales book) and check whether each is in TijaPass.", "Chagua miamala kutoka ushahidi wa biashara (ujumbe wa pesa ya simu, risiti, ankara, daftari la mauzo) na angalia kama kila mmoja upo TijaPass.")}</p>
            <Field label={L("How many transactions you checked (up to 10)", "Miamala mingapi umekagua (hadi 10)")}><Text value={String(sampled)} onChange={(v) => setSampled(Math.max(1, Math.min(10, Number(v.replace(/\D/g, "")) || 1)))} inputMode="numeric" /></Field>
            {ev.map((x, i) => (
              <div key={i} className="row">
                <span className="bold">{i + 1}.</span>
                <div style={{ flex: "1 1 180px" }}><input className="input" value={x.text} placeholder={L("e.g. M-Pesa 12 Oct, 15,000 from Juma", "k.m. M-Pesa 12 Okt, 15,000 kutoka Juma")} onChange={(e) => setEvidence(evidence.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} /></div>
                <button className={`chip ${x.found === true ? "on" : ""}`} onClick={() => setEvidence(evidence.map((y, j) => (j === i ? { ...y, found: true } : y)))}><CheckCircle2 size={16} />{L("Found", "Imepatikana")}</button>
                <button className={`chip ${x.found === false ? "on" : ""}`} onClick={() => setEvidence(evidence.map((y, j) => (j === i ? { ...y, found: false } : y)))}><XCircle size={16} />{L("Missing", "Haipo")}</button>
              </div>
            ))}
            <PhotoInput label={L("Photo of the documents sampled", "Picha ya nyaraka zilizokaguliwa")} required value={docPhoto} onChange={setDocPhoto} />
            <p className="small">{L("Points", "Alama")}: <b>{points.completeness} / 25</b></p>
          </div>
        )}
        {s === "correctness" && (
          <div className="form">
            <p className="muted">{L("TijaPass picked these recorded entries at random. Check each one's amount, date and purpose against the evidence.", "TijaPass imechagua miamala hii bila mpangilio. Hakiki kiasi, tarehe na madhumuni ya kila mmoja dhidi ya ushahidi.")}</p>
            {!sample.length && <p className="notice warn">{L("No entries were recorded in the period, so there is nothing to test (0 points).", "Hakuna miamala iliyoandikwa katika kipindi, hivyo hakuna cha kupima (alama 0).")}</p>}
            {sample.map((e, i) => (
              <div key={e.id} className="card" style={{ boxShadow: "none" }}>
                <b>{i + 1}. {fmtDate(e.date)} · {money(e.amount)}</b>
                <div className="small muted">{kindPlain(e.kind)}{e.description ? ` · “${e.description}”` : ""}</div>
                <div className="row mt">
                  <button className={`chip ${checks[e.id]?.ok === true ? "on" : ""}`} onClick={() => setChecks({ ...checks, [e.id]: { ok: true } })}><CheckCircle2 size={16} />{L("Correct", "Sahihi")}</button>
                  <button className={`chip ${checks[e.id]?.ok === false ? "on" : ""}`} onClick={() => setChecks({ ...checks, [e.id]: { ok: false, note: checks[e.id]?.note || "" } })}><XCircle size={16} />{L("Wrong", "Si sahihi")}</button>
                </div>
                {checks[e.id]?.ok === false && <input className="input mt" placeholder={L("What is wrong?", "Nini si sahihi?")} value={checks[e.id].note} onChange={(ev2) => setChecks({ ...checks, [e.id]: { ok: false, note: ev2.target.value } })} />}
              </div>
            ))}
            <p className="small">{L("Points", "Alama")}: <b>{points.correctness} / 20</b></p>
          </div>
        )}
        {s === "timeliness" && (
          <div className="stack">
            <p className="muted">{L("Calculated by TijaPass from the daily closes.", "Imekokotolewa na TijaPass kutoka kufunga siku.")}</p>
            <div className="kv"><span>{L("Days closed on time", "Siku zilizofungwa kwa wakati")}</span><span>{time.onTime} / {time.tradingDays}</span><span>{L("Points", "Alama")}</span><span>{points.timeliness} / 15</span></div>
          </div>
        )}
        {s === "stock" && (
          <div className="form two">
            <Field label={L("Estimated value of stock seen", "Thamani ya makadirio ya stoku iliyoonekana")} hint={`${L("Books", "Vitabu")}: ${money(book.inventory)}`}><AmountInput value={stockEst} onChange={setStockEst} /></Field>
            <Field label={L("Estimated value of main equipment", "Thamani ya makadirio ya vifaa vikuu")} hint={`${L("Books", "Vitabu")}: ${money(book.equipment)}`}><AmountInput value={equipEst} onChange={setEquipEst} /></Field>
            <PhotoInput label={L("Photo of stock and equipment", "Picha ya stoku na vifaa")} required value={stockPhoto} onChange={setStockPhoto} />
            <p className="small">{L("Points", "Alama")}: <b>{points.stock} / 15</b></p>
          </div>
        )}
        {s === "review" && (
          <div className="stack">
            <div className="table-wrap"><table className="t"><tbody>
              {Object.keys(CHECKS).map((k) => <tr key={k}><td>{tl(CHECKS[k])}</td><td className="num">{points[k]} / {CHECKS[k].max}</td></tr>)}
              <tr className="total"><td>{L("Total", "Jumla")}</td><td className="num">{total} / 100</td></tr>
            </tbody></table></div>
            <span className="badge big" style={{ background: bandFor(total).color, alignSelf: "flex-start" }}><i className="sw" />{tl(bandFor(total))}, {total}%</span>
            <Field label={L("Note for the business (optional)", "Ujumbe kwa biashara (si lazima)")}><Text value={note} onChange={setNote} /></Field>
          </div>
        )}
      </Card>
      <div className="between">
        <button className="btn" onClick={() => (step ? setStep(step - 1) : go("off-rating"))}>{L("Back", "Rudi")}</button>
        {s !== "review" ? <button className="btn primary" disabled={!stepOk} onClick={() => setStep(step + 1)}>{L("Next", "Endelea")}</button> : <button className="btn primary" onClick={submit}>{L("Submit rating", "Wasilisha kiwango")}</button>}
      </div>
    </div>
  );
}
