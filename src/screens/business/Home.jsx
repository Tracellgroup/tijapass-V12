// Business home (HOME-01), My activity, Reports and the Records Rating screen.
import { ArrowDownLeft, ArrowUpRight, ChevronRight, ClipboardList, Moon } from "lucide-react";
import { useState } from "react";
import { closingDue, daySummary, isClosed, unclosedPastDays } from "../../core/dailyClose.js";
import { score } from "../../core/credit.js";
import { latestRating } from "../../core/rating.js";
import { daysBetween, money, timeHM, today } from "../../core/util.js";
import { saveQuarterly } from "../../lib/actions.js";
import { myBusiness } from "../../lib/access.js";
import { L } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, Card, Chips, DateRange, Field, Modal, RatingBadge, Stat, fmtDate, fmtDateTime, useRange } from "../../ui/components.jsx";
import { ActivityList, EntryLine, RatingHistory, Statements, daysClosed30, myThreads } from "../common.jsx";
import { EntryForm } from "./Record.jsx";

export function QuarterlyQuestions({ business, onDone }) {
  const { user } = useStore();
  const act = useAction();
  const [a, setA] = useState({ outsideLoan: "", outsideSource: "", outsideAmount: "", needFinance: "", needAmount: "" });
  const ok = a.outsideLoan && a.needFinance && (a.outsideLoan === "no" || (a.outsideSource && a.outsideAmount)) && (a.needFinance === "no" || a.needAmount);
  const yn = [{ value: "yes", label: L("Yes", "Ndiyo") }, { value: "no", label: L("No", "Hapana") }];
  return (
    <Modal title={L("Three-month check-in", "Maswali ya kila miezi mitatu")} onClose={onDone} actions={<button className="btn primary" disabled={!ok} onClick={() => { act((d) => saveQuarterly(d, user, { businessId: business.id, ...a, outsideAmount: Number(a.outsideAmount) || 0, needAmount: Number(a.needAmount) || 0 }), L("Thank you", "Asante")); onDone(); }}>{L("Send", "Tuma")}</button>}>
      <div className="form">
        <Field label={L("Did you get any loan outside TijaPass in the last 3 months?", "Ulipata mkopo wowote nje ya TijaPass miezi 3 iliyopita?")}><Chips value={a.outsideLoan} onChange={(v) => setA({ ...a, outsideLoan: v })} options={yn} /></Field>
        {a.outsideLoan === "yes" && (
          <div className="form two">
            <Field label={L("From where?", "Kutoka wapi?")}><Chips value={a.outsideSource} onChange={(v) => setA({ ...a, outsideSource: v })} options={[["formal", L("Bank, MFI or SACCO", "Benki, taasisi au SACCOS")], ["vicoba", "VICOBA"], ["app", L("Loan app", "Programu ya mkopo")], ["family", L("Family", "Familia")], ["other", L("Other", "Nyingine")]].map(([value, label]) => ({ value, label }))} /></Field>
            <Field label={L("Amount (TZS)", "Kiasi (TZS)")}><AmountInput value={a.outsideAmount} onChange={(v) => setA({ ...a, outsideAmount: v })} /></Field>
          </div>
        )}
        <Field label={L("Will you need finance in the next 6 months?", "Utahitaji mkopo miezi 6 ijayo?")}><Chips value={a.needFinance} onChange={(v) => setA({ ...a, needFinance: v })} options={yn} /></Field>
        {a.needFinance === "yes" && <Field label={L("Rough amount (TZS)", "Kiasi cha makadirio (TZS)")}><AmountInput value={a.needAmount} onChange={(v) => setA({ ...a, needAmount: v })} /></Field>}
      </div>
    </Modal>
  );
}

export const quarterlyDue = (state, b) => daysBetween(b.lastQuarterlyAt ? b.lastQuarterlyAt.slice(0, 10) : b.startDate, today(state)) >= (state.settings.quarterlyDays ?? 90);

export default function Home() {
  const { state, user, go } = useStore();
  const b = myBusiness(state, user);
  const t = today(state);
  const [quarterly, setQuarterly] = useState(false);
  const s = daySummary(state, b.id, t);
  const missed = unclosedPastDays(state, b, t);
  const closedToday = isClosed(state, b.id, t);
  const due = closingDue(state, b, t, timeHM(state));
  const sc = score(state, b, t);
  const dc = daysClosed30(state, b);
  const unreadMsgs = myThreads(state, user).filter((m) => m.from.id !== user.id && m.at > (user.previousSignIn || "")).length;
  const held = state.entries.filter((e) => e.businessId === b.id && e.status === "held");
  const toExplain = state.imports.filter((i) => i.businessId === b.id).flatMap((i) => i.pending);
  const r = latestRating(state, b.id);
  const needAck = r && !r.acknowledgedAt;
  const qDue = quarterlyDue(state, b);
  const recent = state.entries.filter((e) => e.businessId === b.id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 5);
  return (
    <div className="stack">
      <section className="hero">
        <p className="eyebrow">{b.profile.businessName}</p>
        <h1>{L("Hello", "Habari")}, {b.profile.ownerName.split(" ")[0]}</h1>
        <p>{L("Record every shilling in and out. Close your day each evening.", "Andika kila shilingi inayoingia na kutoka. Funga siku yako kila jioni.")}</p>
        <div className="inout mt2">
          <button className="btn big primary" onClick={() => go("record", { dir: "in" })}><ArrowDownLeft size={26} />{L("Record money in", "Andika pesa iliyoingia")}</button>
          <button className="btn big" onClick={() => go("record", { dir: "out" })}><ArrowUpRight size={26} />{L("Record money out", "Andika pesa iliyotoka")}</button>
        </div>
      </section>

      {missed.length > 0 && (
        <div className="notice bad"><b>{missed.length === 1 ? L("Yesterday is not closed", "Jana haijafungwa") : L(`${missed.length} days not closed`, `Siku ${missed.length} hazijafungwa`)}</b>{L("You can keep recording. Catch up soon: loans need every day closed.", "Unaweza kuendelea kuandika. Fidia mapema: mikopo inahitaji siku zote zimefungwa.")}<div className="mt"><button className="btn primary" onClick={() => go("close")}><Moon size={18} />{L("Close now", "Funga sasa")}</button></div></div>
      )}
      {!missed.length && due && (
        <div className="notice warn"><b>{L("Close your day?", "Funga siku yako?")}</b>{L(`It is past your closing time (${b.closingTime}). Count your money and close today.`, `Muda wako wa kufunga (${b.closingTime}) umepita. Hesabu pesa zako na ufunge leo.`)}<div className="mt"><button className="btn primary" onClick={() => go("close")}><Moon size={18} />{L("Close my day", "Funga siku yangu")}</button></div></div>
      )}
      {!b.opening || b.opening.status === "draft" ? (
        <div className="notice"><b>{L("Set your starting position", "Weka hali yako ya kuanzia")}</b>{L("Tell TijaPass what the business had and owed when it joined.", "Iambie TijaPass biashara ilikuwa na nini na ilidaiwa nini ilipojiunga.")}<div className="mt"><button className="btn" onClick={() => go("profile", { tab: "opening" })}>{L("Set up now", "Weka sasa")}</button></div></div>
      ) : null}
      {(held.length > 0 || toExplain.length > 0) && (
        <div className="notice warn"><b>{L("To do", "Ya kufanya")}</b>{held.length > 0 && <div>{held.length} {L("entries are waiting for TijaPass Admin.", "miamala inasubiri TijaPass Admin.")}</div>}{toExplain.length > 0 && <div>{toExplain.length} {L("statement lines need your explanation.", "mistari ya taarifa inahitaji maelezo yako.")}</div>}<div className="mt"><button className="btn" onClick={() => go("activity")}><ClipboardList size={18} />{L("Open", "Fungua")}</button></div></div>
      )}
      {needAck && <div className="notice good"><b>{L("Your new Records Rating is ready", "Kiwango chako kipya cha Kumbukumbu kiko tayari")}</b><div className="mt"><button className="btn" onClick={() => go("rating")}>{L("See it", "Kione")}</button></div></div>}
      {qDue && <div className="notice"><b>{L("Two quick questions", "Maswali mawili mafupi")}</b>{L("Every three months we ask about loans and finance needs.", "Kila miezi mitatu tunauliza kuhusu mikopo na mahitaji ya fedha.")}<div className="mt"><button className="btn" onClick={() => setQuarterly(true)}>{L("Answer", "Jibu")}</button></div></div>}

      <div className="grid g4 keep2">
        <Stat label={L("Money in today", "Pesa iliyoingia leo")} value={money(s.totalIn)} note={`${s.countIn} ${L("entries", "miamala")}`} onClick={() => go("activity")} />
        <Stat label={L("Money out today", "Pesa iliyotoka leo")} value={money(s.totalOut)} note={`${s.countOut} ${L("entries", "miamala")}`} onClick={() => go("activity")} />
        <Stat label={L("Today", "Leo")} value={closedToday ? L("Closed", "Imefungwa") : L("Open", "Wazi")} note={`${L("Days closed", "Siku zilizofungwa")}: ${dc.closed}/${dc.days}`} onClick={() => go("close")} />
        <Stat label={L("Credit passport", "Pasipoti ya mkopo")} value={`${sc.value}/100`} note={L("Indicative score", "Alama ya makadirio")} onClick={() => go("finance")} />
      </div>
      <div className="grid g2">
        <Card title={L("Records Rating", "Kiwango cha Kumbukumbu")} actions={<button className="btn small" onClick={() => go("rating")}>{L("Details", "Maelezo")} <ChevronRight size={16} /></button>}>
          <RatingBadge business={b} big />
          <p className="small muted mt">{L("Your officer checks your records each month.", "Afisa wako hukagua kumbukumbu zako kila mwezi.")}</p>
        </Card>
        <Card title={L("Recent", "Karibuni")}>
          <div className="kv mb">
            <span>{L("Last sign-in", "Uliingia mara ya mwisho")}</span><span>{user.previousSignIn ? fmtDateTime(user.previousSignIn) : L("First time", "Mara ya kwanza")}</span>
            <span>{L("New messages", "Ujumbe mpya")}</span><span>{unreadMsgs}</span>
          </div>
          <div className="list">{recent.map((e) => <EntryLine key={e.id} e={e} business={b} />)}</div>
        </Card>
      </div>
      {quarterly && <QuarterlyQuestions business={b} onDone={() => setQuarterly(false)} />}
    </div>
  );
}

export function Activity() {
  const { state, user } = useStore();
  const b = myBusiness(state, user);
  const [range, setRange] = useRange("week");
  const [explain, setExplain] = useState(null);
  const pending = state.imports.filter((i) => i.businessId === b.id).flatMap((i) => i.pending.map((p) => ({ ...p, importId: i.id })));
  return (
    <div className="stack">
      {pending.length > 0 && (
        <Card title={L("Statement lines to explain", "Mistari ya taarifa ya kueleza")}>
          <p className="small muted mb">{L("These lines had no clear description. Say in your words what each one was.", "Mistari hii haikuwa na maelezo wazi. Sema kwa maneno yako kila mmoja ulikuwa nini.")}</p>
          {pending.map((p) => (
            <div key={`${p.importId}-${p.lineId}`} className="stack">
              <div className="item">
                <div className="grow"><b>{fmtDate(p.date)}</b><div className="small muted">{p.description || "—"}</div>{p.suggestTransfer && <div className="small amber">{L("A withdrawal or deposit: was it moved to cash, a payment, or personal use?", "Kutoa au kuweka: ilihamishiwa taslimu, ilikuwa malipo, au matumizi binafsi?")}</div>}</div>
                <b className={p.dir === "in" ? "green" : "amber"}>{p.dir === "out" ? "−" : ""}{money(p.amount)}</b>
                {explain !== p.lineId + p.importId && <button className="btn small" onClick={() => setExplain(p.lineId + p.importId)}>{L("Explain", "Eleza")}</button>}
              </div>
              {explain === p.lineId + p.importId && <EntryForm business={b} fixedDate={p.date} compact initial={{ dir: p.dir, lockDir: !p.suggestTransfer, amount: p.amount, channelId: p.channelId, source: "import", importId: p.importId, importLineId: p.lineId }} onCancel={() => setExplain(null)} onPosted={() => setTimeout(() => setExplain(null), 900)} />}
            </div>
          ))}
        </Card>
      )}
      <DateRange value={range} onChange={setRange} />
      <ActivityList business={b} from={range.from} to={range.to} />
    </div>
  );
}

export function Reports() {
  const { state, user } = useStore();
  return <Statements business={myBusiness(state, user)} />;
}

export function RatingScreen() {
  const { state, user } = useStore();
  return <RatingHistory business={myBusiness(state, user)} mode="business" />;
}

