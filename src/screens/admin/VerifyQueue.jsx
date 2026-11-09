// "To verify" (decided 9 Nov 2026). Businesses start using TijaPass at once; their own figures count, marked
// "not verified". Staff see how many are waiting and work through them in priority order: first those who asked
// for a check, then those who want a loan, shared records with a lender or said they need finance.
import { useState } from "react";
import { SIGNALS, verifyQueue } from "../../core/verify.js";
import { today } from "../../core/util.js";
import { atLeast } from "../../lib/access.js";
import { L, tl } from "../../lib/i18n.js";
import { useStore } from "../../lib/store.jsx";
import { Card, Chips, Empty, Pill, Stat } from "../../ui/components.jsx";

const NEEDS = {
  opening: { en: "Starting position", sw: "Hali ya kuanzia" },
  openingReturned: { en: "Starting position (correction asked)", sw: "Hali ya kuanzia (marekebisho yameombwa)" },
  identity: { en: "Identity", sw: "Utambulisho" },
  coOwners: { en: "Co-owners to confirm", sw: "Wamiliki wenza kuthibitisha" },
  accounts: { en: "New account balance", sw: "Salio la akaunti mpya" },
  neverRated: { en: "Never rated", sw: "Hakijawahi kupimwa" }
};
const PAGE = 50;

export default function VerifyQueue() {
  const { state, user, go } = useStore();
  const [only, setOnly] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const q = verifyQueue(state, user, today(state));
  const c = q.counts;
  const rows = q.rows.filter((r) => only === "all" || (only === "asked" ? r.signals.includes("askedCheck") : only === "loan" ? r.signals.some((s) => ["loanRequest", "lenderConsent", "needsFinance"].includes(s)) : r.needs.includes(only) || (only === "opening" && r.needs.includes("openingReturned"))));
  return (
    <div className="stack">
      <p className="muted">{atLeast(user, "dataAdmin") ? L("All businesses. Their own figures are in use now, marked not verified. Check the top of the list first.", "Biashara zote. Takwimu zao zinatumika sasa, zikiwa hazijahakikiwa. Kagua za juu kwanza.") : L("Your businesses. Their own figures are in use now, marked not verified. Visit or call the top of the list first.", "Biashara zako. Takwimu zao zinatumika sasa, zikiwa hazijahakikiwa. Tembelea au piga simu za juu kwanza.")}</p>
      <div className="grid g4">
        <Stat label={L("Starting position not verified", "Hali ya kuanzia haijahakikiwa")} value={c.opening} note={`${L("of", "kati ya")} ${c.businesses}`} onClick={() => setOnly("opening")} />
        <Stat label={L("Identity not verified", "Utambulisho haujahakikiwa")} value={c.identity} onClick={() => setOnly("identity")} />
        <Stat label={L("Asked for a check", "Wameomba ukaguzi")} value={c.asked} onClick={() => setOnly("asked")} />
        <Stat label={L("Want a loan or shared with a lender", "Wanataka mkopo au wameshiriki na mkopeshaji")} value={c.loanInterest} onClick={() => setOnly("loan")} />
      </div>
      <p className="tiny muted">{L("Also", "Pia")}: {c.accounts} {L("new account balances to verify", "salio la akaunti mpya za kuhakiki")} · {c.noOpening} {L("have not entered a starting position yet", "bado hawajaweka hali ya kuanzia")} · {c.neverRated} {L("never rated", "hawajawahi kupimwa")}</p>
      <Chips value={only} onChange={(v) => { setOnly(v); setShown(PAGE); }} options={[
        { value: "all", label: L("All, by priority", "Zote, kwa kipaumbele") }, { value: "asked", label: L("Asked for a check", "Wameomba ukaguzi") },
        { value: "loan", label: L("Loan interest", "Wanataka mkopo") }, { value: "opening", label: L("Starting position", "Hali ya kuanzia") },
        { value: "identity", label: L("Identity", "Utambulisho") }, { value: "accounts", label: L("New accounts", "Akaunti mpya") }
      ]} />
      <Card title={`${L("To verify", "Za kuhakiki")} (${rows.length})`}>
        {!rows.length && <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />}
        <div className="list">
          {rows.slice(0, shown).map(({ business: b, needs, signals, waiting }, i) => (
            <div key={b.id} className="item">
              <div className="grow">
                <b>{i + 1}. {b.profile.businessName}</b> <span className="small muted">· {b.profile.region} · {L("waiting", "inasubiri")} {waiting} {L("days", "siku")}</span>
                <div className="row mt" style={{ gap: 6 }}>
                  {signals.map((s) => <Pill key={s} tone="orange">{tl(SIGNALS[s])}</Pill>)}
                  {needs.filter((n) => n !== "noOpening").map((n) => <Pill key={n} tone="grey">{tl(NEEDS[n])}</Pill>)}
                </div>
                {b.checkRequest && !b.checkRequest.doneAt && b.checkRequest.note && <div className="small mt">“{b.checkRequest.note}”</div>}
              </div>
              <button className="btn small" onClick={() => go("business", { id: b.id, tab: needs.includes("identity") && !needs.some((n) => n.startsWith("opening")) ? "profile" : "opening" })}>{L("Open", "Fungua")}</button>
            </div>
          ))}
        </div>
        {rows.length > shown && <button className="btn mt" onClick={() => setShown(shown + PAGE)}>{L("Show more", "Onyesha zaidi")} ({rows.length - shown})</button>}
      </Card>
    </div>
  );
}
