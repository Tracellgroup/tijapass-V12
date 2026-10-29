// The one Record screen (REC-01 to REC-11, IMP-01 to IMP-05).
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCircle2, FileUp, Loader2, Moon, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { GROUP_KINDS, KINDS, READY_KINDS, flowOf } from "../../core/kinds.js";
import { isClosed, unclosedPastDays } from "../../core/dailyClose.js";
import { checkStatement, detectColumns, matchExisting, needsExplanation, pdfTextToLines, rowsToLines } from "../../core/statements.js";
import { readDescription } from "../../core/reader.js";
import { readStatementFile } from "../../core/xlsxReader.js";
import { money, nowISO, today, uid } from "../../core/util.js";
import { addEntry, audit, notify } from "../../lib/actions.js";
import { readEntry, readStatementText } from "../../lib/ai.js";
import { putFile } from "../../lib/files.js";
import { L, getLang, tl } from "../../lib/i18n.js";
import { pdfText } from "../../lib/pdf.js";
import { myBusiness } from "../../lib/access.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Area, Card, Chips, DatePicker, Field, PhotoInput, Pill, Select, Text, VoiceButton, downloadText, fmtDate } from "../../ui/components.jsx";
import { holdText, kindPlain } from "../common.jsx";

const DIRS = { in: { icon: ArrowDownLeft }, out: { icon: ArrowUpRight }, transfer: { icon: ArrowLeftRight } };

// Ready phrases for a direction (REC-05): kinds whose money moves that way, plus credit sales/purchases.
export function readyFor(dir) {
  return READY_KINDS.filter((k) => {
    const f = flowOf(k);
    if (dir === "in") return f === "in" || k === "sale_credit";
    if (dir === "out") return f === "out" || k === "stock_credit";
    return f === "transfer";
  });
}

const GROUP_OUT = [
  { key: "save", kind: "group_contribution", mode: "savings", en: "My contribution, saved until my turn or the share-out", sw: "Mchango wangu, akiba hadi zamu yangu au mgao" },
  { key: "after", kind: "group_contribution", mode: "afterPayout", en: "My contribution after I already received my payout this round", sw: "Mchango wangu baada ya kupokea mgao wangu wa mzunguko huu" },
  { key: "loan", kind: "group_loan_repayment", mode: null, en: "Repaying a loan I took from the group", sw: "Kurejesha mkopo nilioukopa kwenye kikundi" },
  { key: "fee", kind: "other_expense", mode: null, en: "A fine or fee paid to the group", sw: "Faini au ada iliyolipwa kwa kikundi" }
];
const GROUP_IN = [
  { key: "done", kind: "group_payout", mode: "complete", en: "My payout or share-out, and I have finished paying in", sw: "Mgao wangu, na nimemaliza kuchangia" },
  { key: "early", kind: "group_payout", mode: "early", en: "My payout, but I still have contributions to pay", sw: "Mgao wangu, lakini bado nina michango ya kulipa" },
  { key: "loan", kind: "group_loan_received", mode: null, en: "A loan from the group", sw: "Mkopo kutoka kikundi" }
];

export function EntryForm({ business, initial = {}, fixedDate, onPosted, onCancel, compact }) {
  const { state, user } = useStore();
  const act = useAction();
  const t = today(state);
  const [dir, setDir] = useState(initial.dir || null);
  const [amount, setAmount] = useState(initial.amount ?? "");
  const [channelId, setChannelId] = useState(initial.channelId || business.channels[0]?.id);
  const [touchedChannel, setTouchedChannel] = useState(Boolean(initial.channelId));
  const [toChannelId, setToChannelId] = useState(business.channels[1]?.id || "");
  const [date, setDate] = useState(fixedDate || t);
  const [description, setDescription] = useState(initial.description || "");
  const [payer, setPayer] = useState("");
  const [reference, setReference] = useState("");
  const [interest, setInterest] = useState("");
  const [photoId, setPhotoId] = useState(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [stage, setStage] = useState("form");
  const [reading, setReading] = useState(null);
  const [kind, setKind] = useState(null);
  const [fails, setFails] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState(null);
  const [fromReady, setFromReady] = useState(false);
  const [groupMode, setGroupMode] = useState(null);
  const [groupLabel, setGroupLabel] = useState("");
  // Group savings need one clarifying question before posting (REC-09, revised 27 Oct).
  const toConfirm = (k, ready = false) => {
    setKind(k);
    if (ready) setFromReady(true);
    setGroupMode(null);
    setGroupLabel("");
    setStage(GROUP_KINDS.includes(k) ? "group" : "confirm");
  };

  const closedDay = !fixedDate && isClosed(state, business.id, date) && date !== t;
  const read = async () => {
    setBusy(true);
    setHint("");
    const r = await readEntry(description, dir, getLang());
    setBusy(false);
    if (amount === "" && r.amount) setAmount(r.amount);
    if (!touchedChannel && r.channelType) {
      const ch = business.channels.find((c) => c.type === r.channelType);
      if (ch) setChannelId(ch.id);
    }
    if (!r.kind || r.confidence < 0.4) {
      const n = fails + 1;
      setFails(n);
      if (n >= 2) return setStage("ready");
      setHint(r.question || L("Sorry, I did not understand. Say what the money was for, for example \"nimeuza nyanya\" or \"nimelipa kodi\".", "Samahani, sijaelewa. Sema pesa ilikuwa ya nini, kwa mfano \"nimeuza nyanya\" au \"nimelipa kodi\"."));
      return undefined;
    }
    setReading(r);
    setKind(r.kind);
    setStage("reading");
    return undefined;
  };

  const next = () => {
    if (dir === "transfer") {
      setKind("transfer");
      return setStage("confirm");
    }
    return read();
  };

  const rewrite = () => {
    const n = fails + 1;
    setFails(n);
    setStage(n >= 2 ? "ready" : "form");
    if (n < 2) setHint(L("Write it again in your own words.", "Andika tena kwa maneno yako."));
  };

  const amt = Number(amount) || 0;
  const flow = kind ? flowOf(kind) : null;
  const needsChannel = flow !== "none";
  const isRepayment = kind === "loan_repayment" || kind === "group_loan_repayment";
  const formOk = dir && (dir === "transfer" ? amt > 0 && channelId && toChannelId && channelId !== toChannelId : description.trim().length > 1 || amt > 0);
  const conflict = Boolean(reading?.conflict && kind === reading.kind);

  const post = () => {
    const entry = {
      id: uid("E"), businessId: business.id, date, kind, amount: amt, channelId: needsChannel ? channelId : null, toChannelId: kind === "transfer" ? toChannelId : null,
      groupMode, description: description.trim(), payer: payer.trim(), reference: reference.trim(), photoId, source: fromReady ? "ready" : usedVoice ? "voice" : initial.source || "typed",
      ai: reading ? { engine: reading.engine, suggested: reading.kind, confidence: reading.confidence } : null, importId: initial.importId || null,
      interest: isRepayment && Number(interest) > 0 ? Number(interest) : undefined
    };
    const ev = act((d) => {
      const r = addEntry(d, user, entry, { directionConflict: conflict, aiRecommendation: reading ? { kind: reading.kind, alternatives: reading.alternatives, engine: reading.engine } : null });
      if (initial.importLineId) {
        const imp = d.imports.find((x) => x.id === initial.importId);
        if (imp) imp.pending = imp.pending.filter((p) => p.lineId !== initial.importLineId);
      }
      return r;
    });
    if (ev) {
      setResult(ev);
      setStage("done");
      onPosted?.(ev, entry);
    }
  };

  const reset = () => {
    setDir(initial.dir || null); setAmount(""); setDescription(""); setPayer(""); setReference(""); setPhotoId(null); setInterest(""); setReading(null); setKind(null); setFails(0); setStage("form"); setHint(""); setResult(null); setFromReady(false); setUsedVoice(false); setTouchedChannel(false); setGroupMode(null); setGroupLabel("");
  };

  if (stage === "done") {
    const held = result.action === "hold";
    return (
      <Card>
        <div className="stack" style={{ textAlign: "center" }}>
          <CheckCircle2 size={44} className={held ? "amber" : "green"} style={{ margin: "0 auto" }} />
          <h2>{held ? L("Saved, waiting for TijaPass Admin", "Imehifadhiwa, inasubiri TijaPass Admin") : L("Recorded", "Imeandikwa")}</h2>
          {held && <p className="notice warn" style={{ textAlign: "left" }}>{result.reasons.map((r) => holdText(r)).join(" ")} {L("TijaPass Admin will check it and tell you.", "TijaPass Admin wataukagua na kukujulisha.")}</p>}
          {!compact && <div className="row" style={{ justifyContent: "center" }}><button className="btn primary" onClick={reset}>{L("Record another", "Andika mwingine")}</button></div>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {stage === "form" && (
        <div className="form">
          {!initial.lockDir && (
            <div className="inout" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {["in", "out", "transfer"].map((k) => {
                const Icon = DIRS[k].icon;
                return (
                  <button key={k} type="button" className={`btn ${k === "in" ? "in" : k === "out" ? "out" : ""} ${dir === k ? "sel" : ""}`} onClick={() => { setDir(k); setFails(0); setHint(""); }}>
                    <Icon size={26} />
                    {k === "in" ? L("Money in", "Pesa imeingia") : k === "out" ? L("Money out", "Pesa imetoka") : L("Move money", "Hamisha pesa")}
                  </button>
                );
              })}
            </div>
          )}
          {dir && (
            <>
              <Field label={L("Amount (TZS)", "Kiasi (TZS)")} hint={dir !== "transfer" ? L("You can also say the amount in your words below.", "Unaweza pia kusema kiasi kwa maneno hapa chini.") : null}>
                <AmountInput big value={amount} onChange={setAmount} />
              </Field>
              <Field label={dir === "transfer" ? L("From", "Kutoka") : L("Where did the money go in or out?", "Pesa iliingia au kutoka wapi?")}>
                <Chips value={channelId} onChange={(v) => { setChannelId(v); setTouchedChannel(true); }} options={business.channels.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))} />
              </Field>
              {dir === "transfer" && (
                <Field label={L("To", "Kwenda")}>
                  <Chips value={toChannelId} onChange={setToChannelId} options={business.channels.filter((c) => c.id !== channelId && !c.archived).map((c) => ({ value: c.id, label: c.name }))} />
                </Field>
              )}
              {!fixedDate && (
                <Field label={L("Date", "Tarehe")} hint={closedDay ? L("This day is already closed and counted: the entry will go to TijaPass Admin as a correction.", "Siku hii imeshafungwa na kuhesabiwa: muamala utakwenda kwa TijaPass Admin kama marekebisho.") : null}>
                  <DatePicker name={L("Date", "Tarehe")} value={date} max={t} min={business.startDate} onChange={(v) => v && setDate(v)} />
                </Field>
              )}
              {dir !== "transfer" && (
                <Field label={L("What was it for? Type or speak, in Kiswahili or English", "Ilikuwa ya nini? Andika au ongea, kwa Kiswahili au Kiingereza")}>
                  <Area value={description} onChange={setDescription} rows={2} placeholder={dir === "in" ? "nimeuza mboga elfu ishirini cash" : "nimelipa kodi ya pango"} />
                  <div className="row"><VoiceButton onText={(txt) => { setDescription((x) => `${x ? `${x} ` : ""}${txt}`); setUsedVoice(true); }} /></div>
                </Field>
              )}
              {hint && <p className="notice warn">{hint}</p>}
              {!compact && (
                <details>
                  <summary className="small bold" style={{ cursor: "pointer", padding: "6px 0" }}>{L("More (optional): who, reference, receipt photo", "Zaidi (si lazima): nani, kumbukumbu, picha ya risiti")}</summary>
                  <div className="form two mt">
                    <Field label={dir === "in" ? L("From whom (optional)", "Kutoka kwa nani (si lazima)") : L("To whom (optional)", "Kwa nani (si lazima)")}><Text value={payer} onChange={setPayer} /></Field>
                    <Field label={L("Reference or receipt number (optional)", "Namba ya kumbukumbu au risiti (si lazima)")}><Text value={reference} onChange={setReference} /></Field>
                    <PhotoInput label={L("Receipt photo (optional)", "Picha ya risiti (si lazima)")} value={photoId} onChange={setPhotoId} />
                  </div>
                </details>
              )}
              <div className="row">
                {onCancel && <button className="btn" onClick={onCancel}>{L("Cancel", "Ghairi")}</button>}
                <button className="btn primary big" style={{ flex: 1 }} disabled={!formOk || busy} onClick={next}>
                  {busy ? <Loader2 size={20} className="spin" /> : <Sparkles size={20} />}
                  {busy ? L("Reading…", "Inasoma…") : L("Continue", "Endelea")}
                </button>
              </div>
              {dir !== "transfer" && fails === 0 && <button className="btn ghost small" onClick={() => setStage("ready")}>{L("Choose from a list instead", "Chagua kutoka orodha badala yake")}</button>}
            </>
          )}
        </div>
      )}

      {stage === "reading" && reading && (
        <div className="stack">
          <div className="reading">
            <p className="small muted">{L("TijaPass understood:", "TijaPass imeelewa:")}</p>
            <p className="big mt">{kindPlain(kind)}{flowOf(kind) !== "none" ? "" : ""}, {money(amt)}.</p>
            <p className="mt">{L("Correct?", "Ni sahihi?")}</p>
            {reading.engine === "rules" && <p className="tiny muted mt">{L("Reading by built-in rules (AI not connected in this test).", "Usomaji kwa kanuni za ndani (AI haijaunganishwa kwenye majaribio haya).")}</p>}
          </div>
          {reading.conflict && (flowOf(kind) === "in" || flowOf(kind) === "out") && flowOf(kind) !== dir && (
            <div className="notice warn">
              <b>{holdText("direction")}</b>
              <button className="btn small mt" onClick={() => { setDir(flowOf(kind)); setReading({ ...reading, conflict: false }); }}>{flowOf(kind) === "in" ? L("Change to money in", "Badilisha kuwa pesa imeingia") : L("Change to money out", "Badilisha kuwa pesa imetoka")}</button>
            </div>
          )}
          {amt <= 0 && <p className="notice warn">{L("Please type the amount above.", "Tafadhali andika kiasi.")}</p>}
          <button className="btn primary big" disabled={amt <= 0} onClick={() => toConfirm(kind)}>{L("Yes, correct", "Ndiyo, sahihi")}</button>
          {reading.alternatives?.length > 0 && <p className="small bold">{L("Or did you mean:", "Au ulimaanisha:")}</p>}
          {reading.alternatives?.slice(0, 3).map((k) => (
            <button key={k} className="choice" disabled={amt <= 0} onClick={() => toConfirm(k)}>{kindPlain(k)}</button>
          ))}
          <button className="btn" onClick={rewrite}><RotateCcw size={18} />{L("No, let me write it again", "Hapana, nitaandika tena")}</button>
        </div>
      )}

      {stage === "group" && (
        <div className="stack">
          <h3>{L("One question about your group money", "Swali moja kuhusu pesa ya kikundi")}</h3>
          <p className="small muted">{L("Mchezo, upatu and VICOBA work differently. Choose what this money was.", "Mchezo, upatu na VICOBA vinafanya kazi tofauti. Chagua pesa hii ilikuwa nini.")}</p>
          {(flowOf(kind) === "in" ? GROUP_IN : GROUP_OUT).map((o) => (
            <button key={o.key} className="choice" onClick={() => { setKind(o.kind); setGroupMode(o.mode); setGroupLabel(tl(o)); setStage("confirm"); }}>{tl(o)}</button>
          ))}
          <button className="btn" onClick={() => setStage("reading")}>{L("Back", "Rudi")}</button>
        </div>
      )}

      {stage === "ready" && (
        <div className="stack">
          <h3>{L("Choose what happened", "Chagua kilichotokea")}</h3>
          <p className="small muted">{L("Tap the sentence that fits best.", "Gusa sentensi inayofaa zaidi.")}</p>
          {readyFor(dir || "in").map((k) => (
            <button key={k} className="choice" disabled={amt <= 0} onClick={() => toConfirm(k, true)}>{tl(KINDS[k])}</button>
          ))}
          {amt <= 0 && (
            <Field label={L("Amount (TZS)", "Kiasi (TZS)")}><AmountInput big value={amount} onChange={setAmount} /></Field>
          )}
          <button className="btn" onClick={() => { setStage("form"); setFails(0); }}>{L("Back", "Rudi")}</button>
        </div>
      )}

      {stage === "confirm" && (
        <div className="stack">
          <h2>{L("Check before saving", "Hakiki kabla ya kuhifadhi")}</h2>
          <div className="confirm-sheet">
            <div className="row2"><span>{L("Amount", "Kiasi")}</span><b className="mono" style={{ fontSize: 20 }}>{money(amt)}</b></div>
            <div className="row2"><span>{L("Money", "Pesa")}</span><b>{flow === "in" ? L("In", "Imeingia") : flow === "out" ? L("Out", "Imetoka") : flow === "transfer" ? L("Moved", "Imehamishwa") : L("No money moved now", "Hakuna pesa iliyohamia sasa")}</b></div>
            {needsChannel && <div className="row2"><span>{L("Where", "Wapi")}</span><b>{business.channels.find((c) => c.id === channelId)?.name}{kind === "transfer" ? ` → ${business.channels.find((c) => c.id === toChannelId)?.name}` : ""}</b></div>}
            <div className="row2"><span>{L("Date", "Tarehe")}</span><b>{fmtDate(date)}</b></div>
            {payer && <div className="row2"><span>{dir === "in" ? L("From", "Kutoka") : L("To", "Kwa")}</span><b>{payer}</b></div>}
            <div className="row2"><span>{L("Meaning", "Maana")}</span><b>{groupLabel || kindPlain(kind)}</b></div>
          </div>
          {isRepayment && (
            <Field label={L("Of this, how much was interest or fees? (TZS)", "Kati ya hizi, riba au ada ilikuwa kiasi gani? (TZS)")} hint={L("Leave empty if you don't know; the rest reduces the loan.", "Acha wazi kama hujui; kinachobaki kinapunguza mkopo.")}>
              <AmountInput value={interest} onChange={setInterest} />
            </Field>
          )}
          {isRepayment && Number(interest) >= amt && amt > 0 && <p className="notice warn">{L("Interest must be less than the whole repayment.", "Riba lazima iwe chini ya rejesho lote.")}</p>}
          {closedDay && <p className="notice warn">{holdText("closedDay")}</p>}
          {conflict && <p className="notice warn">{holdText("direction")} {L("If you save, TijaPass Admin will check it first.", "Ukihifadhi, TijaPass Admin wataukagua kwanza.")}</p>}
          {reading?.amount && amt && reading.amount !== amt && <p className="notice warn">{L("Your words said", "Maneno yako yalisema")} {money(reading.amount)}. {L("The amount typed above will be used.", "Kiasi kilichoandikwa juu ndicho kitatumika.")}</p>}
          <div className="row">
            <button className="btn" onClick={() => setStage("form")}>{L("Edit", "Badilisha")}</button>
            <button className="btn primary big" style={{ flex: 1 }} disabled={isRepayment && Number(interest) >= amt && amt > 0} onClick={post}>{L("Save", "Hifadhi")}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Statement upload (IMP-01 to IMP-05)
const findAccountName = (text) => {
  const m = String(text).match(/(account name|customer name|name|jina(?: la mteja)?)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,60})/i);
  return m ? m[2].replace(/\s{2,}.*$/, "").trim() : "";
};
// Test version helper: a small CSV statement in the owner's name with recent dates, for trying the upload checks.
function sampleCsv(business, channelId, state) {
  const ch = business.channels.find((c) => c.id === channelId);
  const t = today(state);
  const rows = [["Account name", business.profile.ownerName.toUpperCase()], ["Provider", ch?.name || "M-Pesa"], [], ["Date", "Details", "Reference", "Paid in", "Paid out", "Balance"]];
  const lines = [
    [3, "Customer payment from JOHN PETER", 25000, 0], [3, "Payment to LUKU electricity", 0, 12000], [2, "Customer payment from AMINA SAID", 18000, 0],
    [2, "Payment", 0, 7000], [1, "Withdrawal at agent Kariakoo", 0, 30000], [1, "Received from MAMA ZURI shop", 40500, 0], [0, "Sent to transport BODA", 0, 3500]
  ];
  let bal = 150000;
  for (const [ago, desc, inn, out] of lines) {
    bal += inn - out;
    const d = new Date(`${t}T12:00:00`);
    d.setDate(d.getDate() - ago);
    rows.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, desc, `TP${Math.random().toString(36).slice(2, 9).toUpperCase()}`, inn || "", out || "", bal]);
  }
  downloadText(`sample-statement-${(ch?.name || "wallet").replace(/\W+/g, "-").toLowerCase()}.csv`, rows.map((r) => r.join(",")).join("\n"));
}
// Evidence-quality grade for an uploaded statement (IMP-02, IMP-03 revised): A and B count as supported evidence.
const GRADES = {
  A: { en: "PDF; name, layout, dates and running balances all check out", sw: "PDF; jina, muundo, tarehe na salio vyote vinalingana" },
  B: { en: "All checks that could be made passed (editable file, or no running balance shown)", sw: "Vipimo vyote vilivyowezekana vimepita (faili linaloharirika, au hakuna salio)" },
  C: { en: "Some checks failed: lines are kept as the business's own declaration", sw: "Baadhi ya vipimo vimeshindwa: mistari inahesabiwa kama maelezo ya biashara" },
  D: { en: "Statement in another name: nothing is saved", sw: "Taarifa ya jina jingine: hakuna kinachohifadhiwa" }
};
export function gradeStatement(c, isPdf) {
  if (!c.nameMatch) return "D";
  const ok = c.layout && c.datesInRange && c.runningBalance !== false;
  if (ok && isPdf && c.runningBalance === true) return "A";
  if (ok) return "B";
  return "C";
}
const PROVIDERS = [/m-?pesa/i, /airtel money/i, /mixx|tigo ?pesa/i, /halopesa/i, /crdb/i, /nmb/i, /nbc/i, /azam ?pesa/i];

function StatementUpload({ business }) {
  const { state, user } = useStore();
  const act = useAction();
  const [channelId, setChannelId] = useState(business.channels.find((c) => c.type !== "cash")?.id || business.channels[0].id);
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [needPw, setNeedPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  const analyse = async () => {
    setBusy(true); setErr(""); setRes(null);
    try {
      let lines; let accountName = ""; let layout = false; let engine = "rules";
      if (/\.pdf$/i.test(file.name)) {
        const text = await pdfText(file, password);
        const ai = await readStatementText(text, getLang());
        if (ai?.lines?.length) { lines = ai.lines; accountName = ai.accountName; engine = "ai"; layout = Boolean(ai.provider); }
        else { lines = pdfTextToLines(text); accountName = findAccountName(text); layout = PROVIDERS.some((r) => r.test(text)) && lines.length > 0; }
      } else {
        const rows = await readStatementFile(file);
        lines = rowsToLines(rows);
        layout = Boolean(detectColumns(rows));
        accountName = findAccountName(rows.slice(0, 8).map((r) => r.join(" : ")).join("\n"));
      }
      const mine = state.entries.filter((e) => e.businessId === business.id && e.channelId === channelId);
      const checks = checkStatement({ lines, accountName, business, entries: mine, todayISO: today(state), layoutRecognised: layout });
      const items = lines.map((l, i) => {
        const dirn = l.amountIn ? "in" : "out";
        const dup = matchExisting(l, mine);
        const unclear = needsExplanation(l);
        const r = unclear ? null : readDescription(l.description, dirn);
        // A withdrawal or deposit may be a transfer, a payment or personal use: the business says which (feedback 27 Oct).
        const transferLike = r?.kind === "transfer";
        return { ...l, lineId: `L${i}`, dir: dirn, amount: l.amountIn || l.amountOut, status: l.date < business.startDate ? "before" : dup ? "dup" : unclear || !r?.kind || transferLike ? "explain" : "post", kind: r?.kind || null, suggestTransfer: transferLike };
      });
      setRes({ lines: items, checks, accountName, engine, grade: gradeStatement(checks, /\.pdf$/i.test(file.name)) });
      setNeedPw(false);
    } catch (e) {
      if (e.code === "needs-password" || e.code === "wrong-password") { setNeedPw(true); setErr(e.code === "wrong-password" ? L("Wrong password. Try again.", "Nenosiri si sahihi. Jaribu tena.") : L("This PDF has a password. Type it below.", "PDF hii ina nenosiri. Liandike hapa chini.")); }
      else setErr(e.message || String(e));
    }
    setBusy(false);
  };

  const postAll = async () => {
    const importId = uid("IMP");
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    await putFile(importId, { name: file.name, type: file.type, data });
    const toPost = res.lines.filter((l) => l.status === "post");
    const toExplain = res.lines.filter((l) => l.status === "explain");
    act((d) => {
      const evidence = ["A", "B"].includes(res.grade) ? "supported" : "declared";
      for (const l of toPost) d.entries.push({ id: uid("E"), businessId: business.id, date: l.date, kind: l.kind, amount: l.amount, channelId, description: l.description, reference: l.reference, status: "posted", source: "import", importId, importGrade: res.grade, evidence, createdAt: nowISO(d), createdBy: { id: user.id, name: user.name, role: user.role } });
      d.imports.unshift({ id: importId, businessId: business.id, channelId, fileName: file.name, at: nowISO(d), grade: res.grade, checks: res.checks, accountName: res.accountName, posted: toPost.length, duplicates: res.lines.filter((l) => l.status === "dup").length, pending: toExplain.map((l) => ({ lineId: l.lineId, date: l.date, description: l.description, amount: l.amount, dir: l.dir, channelId, suggestTransfer: l.suggestTransfer, grade: res.grade })) });
      audit(d, user, "Statement uploaded", business.id, { after: { file: file.name, posted: toPost.length } });
      if (!res.checks.runningBalance && res.checks.runningBalance !== null) notify(d, { role: "dataAdmin" }, { en: "Statement balances do not add up", sw: "Salio la taarifa halilingani" }, { en: `${business.profile.businessName}: ${file.name}`, sw: `${business.profile.businessName}: ${file.name}` }, "ledger");
    }, L("Statement lines saved", "Mistari ya taarifa imehifadhiwa"));
    setRes(null); setFile(null);
  };

  const c = res?.checks;
  const nameBad = c && !c.nameMatch;
  return (
    <Card title={L("Upload a bank or mobile money statement", "Pakia taarifa ya benki au pesa ya simu")}>
      <div className="form">
        <Field label={L("Which account is this statement for?", "Taarifa hii ni ya akaunti ipi?")}><Chips value={channelId} onChange={setChannelId} options={business.channels.filter((x) => x.type !== "cash").map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label={L("Statement file (PDF, CSV or Excel)", "Faili la taarifa (PDF, CSV au Excel)")}><input className="input" type="file" accept=".pdf,.csv,.tsv,.txt,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setRes(null); setErr(""); setNeedPw(false); }} /></Field>
        {needPw && <Field label={L("PDF password", "Nenosiri la PDF")}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
        {err && <p className="notice bad">{err}</p>}
        <button type="button" className="btn ghost small" onClick={() => sampleCsv(business, channelId, state)}>{L("Test version: download a sample statement for this business", "Toleo la majaribio: pakua taarifa ya mfano ya biashara hii")}</button>
        <button className="btn primary" disabled={!file || busy} onClick={analyse}>{busy ? <Loader2 size={18} /> : <FileUp size={18} />}{busy ? L("Reading the statement…", "Inasoma taarifa…") : L("Read the statement", "Soma taarifa")}</button>
      </div>
      {res && (
        <div className="stack mt2">
          <div className={`notice ${nameBad ? "bad" : "good"}`}>
            <b>{L("Reliability checks", "Vipimo vya kuaminika")}</b>
            <div>{c.nameMatch ? "✓" : "✗"} {L("Name on the statement matches this business or owner", "Jina kwenye taarifa linalingana na biashara au mmiliki")}{res.accountName ? ` (“${res.accountName}”)` : ` (${L("no name found", "jina halikupatikana")})`}</div>
            <div>{c.layout ? "✓" : "✗"} {L("Statement layout recognised", "Muundo wa taarifa umetambuliwa")}</div>
            <div>{c.runningBalance === null ? "–" : c.runningBalance ? "✓" : "✗"} {L("Running balances add up", "Salio linaendana")}{c.runningBalance === null ? ` (${L("not shown on statement", "halionyeshwi")})` : ""}</div>
            <div>{c.datesInRange ? "✓" : "✗"} {L("Dates are in the expected range", "Tarehe ziko kwenye kipindi kinachotarajiwa")}</div>
            <div>✓ {c.duplicates} {L("lines already recorded by hand will not be added again", "mistari iliyoandikwa tayari haitaongezwa tena")}</div>
            <p className="mt"><b>{L("Evidence grade", "Daraja la ushahidi")}: {res.grade}</b> · {tl(GRADES[res.grade])}</p>
            <p className="tiny mt">{L("These checks help, but they do not prove a document is genuine. Only direct links to the bank or mobile money provider can do that (live pilot).", "Vipimo hivi vinasaidia, lakini havithibitishi kuwa hati ni halisi. Ni muunganisho wa moja kwa moja na benki au mtoa huduma pekee unaoweza (majaribio halisi).")}</p>
          </div>
          {nameBad && <p className="notice bad"><b>{L("Statement in another name", "Taarifa ya jina jingine")}</b>{L("This statement does not seem to belong to this business or its owner, so no line will be saved. Upload a statement in your own name.", "Taarifa hii haionekani kuwa ya biashara hii au mmiliki wake, hivyo hakuna mstari utakaohifadhiwa. Pakia taarifa ya jina lako.")}</p>}
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>{L("Date", "Tarehe")}</th><th>{L("Details", "Maelezo")}</th><th className="num">{L("Amount", "Kiasi")}</th><th>{L("What happens", "Kitakachofanyika")}</th></tr></thead>
              <tbody>
                {res.lines.map((l) => (
                  <tr key={l.lineId}>
                    <td className="nowrap">{fmtDate(l.date)}</td>
                    <td>{l.description || <span className="muted">—</span>}</td>
                    <td className={`num ${l.dir === "in" ? "green" : "amber"}`}>{l.dir === "out" ? "−" : ""}{money(l.amount)}</td>
                    <td>{l.status === "before" ? <Pill tone="grey">{L("Before you joined: not added", "Kabla hujajiunga: haiongezwi")}</Pill> : l.status === "dup" ? <Pill tone="grey">{L("Already recorded", "Imeshaandikwa")}</Pill> : l.status === "explain" ? <Pill tone="orange">{l.suggestTransfer ? L("Withdrawal or deposit: you will say what it was", "Kutoa au kuweka: utasema ilikuwa nini") : L("You will explain it", "Utaueleza")}</Pill> : <span className="small">{kindPlain(l.kind)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn primary" disabled={nameBad || !res.lines.some((l) => l.status === "post" || l.status === "explain")} onClick={postAll}>{L("Save these lines", "Hifadhi mistari hii")}</button>
        </div>
      )}
    </Card>
  );
}

export default function Record() {
  const { state, user, go, params } = useStore();
  const b = myBusiness(state, user);
  const [mode, setMode] = useState(params.mode === "upload" ? "upload" : "entry");
  const t = today(state);
  const missed = unclosedPastDays(state, b, t);
  return (
    <div className="stack">
      <div className="between">
        <div className="chips">
          <button className={`chip ${mode === "entry" ? "on" : ""}`} onClick={() => setMode("entry")}>{L("Record money", "Andika pesa")}</button>
          <button className={`chip ${mode === "upload" ? "on" : ""}`} onClick={() => setMode("upload")}><FileUp size={16} />{L("Upload a statement", "Pakia taarifa")}</button>
        </div>
        <button className="btn navy" onClick={() => go("close")}><Moon size={18} />{L("Close my day", "Funga siku yangu")}</button>
      </div>
      {missed.length > 0 && (
        <div className="notice warn">
          <b>{missed.length === 1 ? L(`${fmtDate(missed[0])} is not closed`, `${fmtDate(missed[0])} haijafungwa`) : L(`${missed.length} days are not closed`, `Siku ${missed.length} hazijafungwa`)}</b>
          {L("You can keep recording. Please catch up soon: loans are only possible when every day is closed.", "Unaweza kuendelea kuandika. Tafadhali fidia mapema: mikopo inawezekana tu siku zote zikiwa zimefungwa.")}
          <div className="mt"><button className="btn small" onClick={() => go("close")}><Moon size={16} />{L("Catch up now", "Fidia sasa")}</button></div>
        </div>
      )}
      {mode === "entry" ? <EntryForm key={params.dir || "x"} business={b} initial={{ dir: params.dir }} /> : <StatementUpload business={b} />}
    </div>
  );
}
