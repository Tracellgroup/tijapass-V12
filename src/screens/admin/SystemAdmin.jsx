// System Admin screens (ADM-03, ADM-04, PKG-01 to PKG-04, BOT-08, ROLE-05) and web MVP test tools.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { annualFromMonthly, canAssignTier, sponsorCounts } from "../../core/billing.js";
import { DEFAULT_SETTINGS } from "../../core/seed.js";
import { money, today, uid } from "../../core/util.js";
import { buildTestData, loadTestData, removeTestData } from "../../lib/testData.js";
import { approveStaff, audit, generateSampleActivity, proposeRoleChange, proposeStaff } from "../../lib/actions.js";
import { ROLE_NAMES } from "../../lib/access.js";
import { clearFiles } from "../../lib/files.js";
import { L, tl } from "../../lib/i18n.js";
import { useAction, useStore } from "../../lib/store.jsx";
import { AmountInput, BusinessPicker, Card, Chips, Confirm, Empty, Field, Pill, ReasonModal, Select, Text, fmtDateTime } from "../../ui/components.jsx";

const STAFF_ROLES = ["officer", "dataAdmin", "systemAdmin", "super", "reports"];

// Staff accounts follow maker-checker (29 Oct): a System Admin proposes; a Super user approves.
// System Admin and Super user accounts, and role changes to them, need two approvers. Nobody approves their own.
export function Users() {
  const { state, user } = useStore();
  const act = useAction();
  const [f, setF] = useState({ role: "officer", name: "", login: "", password: "", orgName: "" });
  const [modal, setModal] = useState(null);
  const [role, setRole] = useState("");
  const staff = state.users.filter((u) => STAFF_ROLES.includes(u.role) || ["fi", "supplier"].includes(u.role));
  const ok = f.name.trim().length > 2 && /@/.test(f.login) && f.password.length >= 8 && !state.users.some((u) => u.login === f.login.trim().toLowerCase());
  const waiting = state.users.filter((u) => u.status === "pending" || u.pendingRole);
  const canApprove = (u) => u.proposedBy?.id !== user.id && u.id !== user.id && !(u.approvals || []).some((a) => a.id === user.id) && (user.role === "super" || (user.role === "systemAdmin" && (u.approvals || []).length > 0));
  return (
    <div className="stack">
      <Card title={L("Propose a staff account", "Pendekeza akaunti ya mfanyakazi")}>
        <p className="small muted mb">{L("A Super user must approve every new account. System Admin and Super user accounts need two approvers. Nobody approves their own proposal.", "Mtumiaji mkuu lazima aidhinishe kila akaunti mpya. Akaunti za Msimamizi wa Mfumo na Mtumiaji mkuu zinahitaji waidhinishaji wawili. Hakuna anayeidhinisha pendekezo lake.")}</p>
        <div className="form two">
          <Field label={L("Role", "Jukumu")}><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={STAFF_ROLES.map((r) => ({ value: r, label: tl(ROLE_NAMES[r]) }))} /></Field>
          <Field label={L("Name", "Jina")}><Text value={f.name} onChange={(v) => setF({ ...f, name: v })} /></Field>
          <Field label={L("Sign-in email", "Barua pepe ya kuingia")}><Text value={f.login} onChange={(v) => setF({ ...f, login: v })} /></Field>
          <Field label={L("Password (8+)", "Nenosiri (8+)")} hint={L("Test version only.", "Toleo la majaribio tu.")}><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          {f.role === "reports" && <Field label={L("Organisation (e.g. Bank of Tanzania, an NGO)", "Taasisi (k.m. Benki Kuu, NGO)")}><Text value={f.orgName} onChange={(v) => setF({ ...f, orgName: v })} /></Field>}
        </div>
        <button className="btn primary mt" disabled={!ok} onClick={() => { if (act((d) => proposeStaff(d, user, { id: uid("U"), role: f.role, name: f.name, login: f.login, password: f.password, orgName: f.orgName.trim() || undefined }), L("Sent for approval", "Imetumwa kwa idhini"))) setF({ ...f, name: "", login: "", password: "" }); }}>{L("Propose account", "Pendekeza akaunti")}</button>
      </Card>
      <Card title={L("Waiting for approval", "Zinazosubiri idhini")}>
        {!waiting.length && <Empty text={L("Nothing waiting.", "Hakuna kinachosubiri.")} />}
        <div className="list">
          {waiting.map((u) => (
            <div key={u.id} className="item">
              <div className="grow">
                <b>{u.name}</b> · {tl(ROLE_NAMES[u.pendingRole || u.role])}{u.pendingRole ? ` (${L("now", "sasa")} ${tl(ROLE_NAMES[u.role])})` : ""}
                <div className="small muted">{L("Proposed by", "Imependekezwa na")} {u.proposedBy?.name} · {L("approvals", "idhini")} {(u.approvals || []).length}/{u.needs || 1}{(u.approvals || []).length ? ` (${u.approvals.map((a) => a.name).join(", ")})` : ""}</div>
              </div>
              {canApprove(u) ? <button className="btn small primary" onClick={() => setModal({ type: "approve", u })}>{L("Approve", "Idhinisha")}</button> : <span className="tiny muted">{L("Another person must approve", "Mtu mwingine lazima aidhinishe")}</span>}
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Users", "Watumiaji")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Name", "Jina")}</th><th>{L("Role", "Jukumu")}</th><th>{L("Sign-in", "Kuingia")}</th><th>{L("Status", "Hali")}</th><th /></tr></thead><tbody>
          {staff.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.test && <Pill tone="grey">test</Pill>}</td><td>{tl(ROLE_NAMES[u.role])}</td><td className="small">{u.login}<div className="tiny muted">{u.lastSignIn ? fmtDateTime(u.lastSignIn) : ""}</div></td>
              <td>{u.status === "pending" ? <Pill tone="orange">{L("Waiting for approval", "Inasubiri idhini")}</Pill> : u.active === false ? <Pill tone="red">{L("Inactive", "Imezimwa")}</Pill> : <Pill tone="green">{L("Active", "Hai")}</Pill>}</td>
              <td className="nowrap">
                {u.id !== user.id && STAFF_ROLES.includes(u.role) && u.status !== "pending" && !u.pendingRole && <button className="btn small" onClick={() => { setRole(u.role); setModal({ type: "role", u }); }}>{L("Role", "Jukumu")}</button>}{" "}
                {u.id !== user.id && u.status !== "pending" && (u.active !== false || user.role === "super") && <button className="btn small" onClick={() => setModal({ type: "active", u })}>{u.active === false ? L("Activate", "Washa") : L("Deactivate", "Zima")}</button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
        <p className="tiny muted mt">{L("Deactivating takes effect at once. Reactivating needs a Super user.", "Kuzima kunaanza mara moja. Kuwasha upya kunahitaji Mtumiaji mkuu.")}</p>
      </Card>
      {modal?.type === "role" && (
        <ReasonModal title={`${L("Propose a role change", "Pendekeza kubadilisha jukumu")}: ${modal.u.name}`} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => proposeRoleChange(d, user, modal.u.id, role, reason), L("Sent for approval", "Imetumwa kwa idhini"))}>
          <Field label={L("Role", "Jukumu")}><Select value={role} onChange={setRole} options={STAFF_ROLES.map((r) => ({ value: r, label: tl(ROLE_NAMES[r]) }))} /></Field>
        </ReasonModal>
      )}
      {modal?.type === "approve" && <ReasonModal title={`${L("Approve", "Idhinisha")}: ${modal.u.name}`} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => approveStaff(d, user, modal.u.id, reason), L("Approved", "Imeidhinishwa"))} />}
      {modal?.type === "active" && <ReasonModal title={modal.u.active === false ? L("Activate user", "Washa mtumiaji") : L("Deactivate user", "Zima mtumiaji")} danger={modal.u.active !== false} onClose={() => setModal(null)} onSubmit={(reason) => act((d) => { const u = d.users.find((x) => x.id === modal.u.id); if (u.active === false && user.role !== "super") throw new Error("Only a Super user can reactivate an account."); u.active = u.active === false; audit(d, user, u.active ? "User activated" : "User deactivated", u.id, { reason }); }, L("Saved", "Imehifadhiwa"))} />}
    </div>
  );
}

export function AdminPackages() {
  const { state, user } = useStore();
  const act = useAction();
  const [pk, setPk] = useState(() => ({ ...structuredClone(state.packages), fees: { ...state.settings.fiFees } }));
  const [reason, setReason] = useState("");
  const [tierFor, setTierFor] = useState(null);
  const [tier, setTier] = useState("");
  const counts = sponsorCounts(state);
  const save = () => act((d) => { const { fees, ...packages } = pk; const before = { packages: d.packages, fees: d.settings.fiFees }; for (const p of packages.fi) p.annual = annualFromMonthly(p.monthly); d.packages = packages; d.settings.fiFees = fees; audit(d, user, "Packages and prices changed", "packages", { before, after: pk, reason }); }, L("Prices saved", "Bei zimehifadhiwa"));
  const setBiz = (i, k, v) => setPk({ ...pk, business: pk.business.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  const setFi = (i, k, v) => setPk({ ...pk, fi: pk.fi.map((p, j) => (j === i ? { ...p, [k]: v } : p)) });
  return (
    <div className="stack">
      <Card title={L("Business packages", "Vifurushi vya biashara")}>
        <p className="small muted mb">{L("Seen only by businesses. Recording is always free on Basic.", "Vinaonekana na biashara tu. Kuandika ni bure daima kwenye Msingi.")}</p>
        {pk.business.map((p, i) => (
          <div key={p.id} className="form two mb">
            <Field label={`${tl(p)} · ${L("price (TZS)", "bei (TZS)")}`}><AmountInput value={p.price} onChange={(v) => setBiz(i, "price", Number(v) || 0)} disabled={p.id === "basic"} /></Field>
            <Field label={L("Features (one per line, English | Kiswahili)", "Huduma (moja kwa mstari, Kiingereza | Kiswahili)")}><textarea className="input" rows={2} value={p.featuresEn.map((x, k) => `${x} | ${p.featuresSw[k] || ""}`).join("\n")} onChange={(e) => { const rows = e.target.value.split("\n"); setPk({ ...pk, business: pk.business.map((q, j) => (j === i ? { ...q, featuresEn: rows.map((r) => r.split("|")[0].trim()), featuresSw: rows.map((r) => (r.split("|")[1] || "").trim()) } : q)) }); }} /></Field>
          </div>
        ))}
      </Card>
      <Card title={L("Lender packages", "Vifurushi vya wakopeshaji")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Package", "Kifurushi")}</th><th>{L("Monthly", "Kwa mwezi")}</th><th className="num">{L("Annual (10% off)", "Kwa mwaka (punguzo 10%)")}</th><th>{L("Per assessment", "Kwa tathmini")}</th></tr></thead><tbody>
          {pk.fi.map((p, i) => <tr key={p.id}><td>{tl(p)}</td><td><AmountInput value={p.monthly} onChange={(v) => setFi(i, "monthly", Number(v) || 0)} /></td><td className="num">{money(annualFromMonthly(p.monthly))}</td><td><AmountInput value={p.perAssessment} onChange={(v) => setFi(i, "perAssessment", Number(v) || 0)} /></td></tr>)}
        </tbody></table></div>
        <p className="small muted mt">{L("Assessments are unlimited; each one is charged at the package rate.", "Tathmini hazina kikomo; kila moja inalipiwa kwa kiwango cha kifurushi.")}</p>
      </Card>
      <Card title={L("Optional lender services", "Huduma za hiari kwa wakopeshaji")}>
        <p className="small muted mb">{L("Off until agreed with partners. When on, they appear on lenders' monthly bills.", "Zimezimwa hadi zikubaliwe na washirika. Zikiwashwa, zinaonekana kwenye bili za kila mwezi za wakopeshaji.")}</p>
        <div className="form two">
          <label className="check"><input type="checkbox" checked={pk.fees.disbursementOn} onChange={(e) => setPk({ ...pk, fees: { ...pk.fees, disbursementOn: e.target.checked } })} />{L("Disbursement service fee", "Ada ya huduma ya utoaji")}</label>
          <Field label={L("Disbursement fee (% of amount)", "Ada ya utoaji (% ya kiasi)")}><input className="input" inputMode="decimal" value={pk.fees.disbursementPct} onChange={(e) => setPk({ ...pk, fees: { ...pk.fees, disbursementPct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } })} /></Field>
          <label className="check"><input type="checkbox" checked={pk.fees.collectionOn} onChange={(e) => setPk({ ...pk, fees: { ...pk.fees, collectionOn: e.target.checked } })} />{L("Collection service fee", "Ada ya huduma ya ukusanyaji")}</label>
          <Field label={L("Collection fee (% of each repayment)", "Ada ya ukusanyaji (% ya kila rejesho)")}><input className="input" inputMode="decimal" value={pk.fees.collectionPct} onChange={(e) => setPk({ ...pk, fees: { ...pk.fees, collectionPct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } })} /></Field>
        </div>
      </Card>
      <Card title={L("Pilot sponsorship tiers", "Ngazi za udhamini wa majaribio")}>
        <div className="table-wrap"><table className="t"><thead><tr><th>{L("Tier", "Ngazi")}</th><th className="num">{L("Contribution", "Mchango")}</th><th className="num">{L("Year 1", "Mwaka 1")}</th><th className="num">{L("Years 2–3", "Miaka 2–3")}</th><th className="num">{L("Used / max", "Imetumika / juu")}</th></tr></thead><tbody>
          {pk.sponsorTiers.map((t) => <tr key={t.id}><td>{tl(t)}</td><td className="num">{money(t.contribution)}</td><td className="num">{t.year1}%</td><td className="num">{t.years23}%</td><td className="num">{t.id === "standard" ? "—" : `${counts[t.id]} / ${t.max}`}</td></tr>)}
        </tbody></table></div>
        <p className="small muted mt">{L("Discounts apply to subscription and assessment fees; standard pricing from year 4; no ownership or exclusive rights.", "Punguzo linahusu ada za usajili na tathmini; bei ya kawaida kuanzia mwaka 4; hakuna umiliki wala haki za kipekee.")}</p>
        <div className="list mt">
          {state.fis.filter((f) => f.status === "approved").map((f) => (
            <div key={f.id} className="item"><div className="grow"><b>{f.name}</b><div className="small muted">{tl(state.packages.fi.find((p) => p.id === f.packageId))} · {f.billing}</div></div><Pill>{tl(state.packages.sponsorTiers.find((t) => t.id === (f.sponsorTier || "standard")))}</Pill><button className="btn small" onClick={() => { setTier(f.sponsorTier || "standard"); setTierFor(f); }}>{L("Change tier", "Badilisha ngazi")}</button></div>
          ))}
        </div>
      </Card>
      <Card>
        <Field label={L("Reason for the price change", "Sababu ya mabadiliko ya bei")}><Text value={reason} onChange={setReason} /></Field>
        <button className="btn primary mt" disabled={reason.trim().length < 5} onClick={save}>{L("Save prices", "Hifadhi bei")}</button>
      </Card>
      {tierFor && (
        <ReasonModal title={`${L("Sponsorship tier", "Ngazi ya udhamini")}: ${tierFor.name}`} onClose={() => setTierFor(null)} onSubmit={(r) => { if (!canAssignTier(state, tierFor, tier)) { act(() => { throw new Error(L("That tier is full.", "Ngazi hiyo imejaa.")); }); return false; } return act((d) => { const f = d.fis.find((x) => x.id === tierFor.id); const before = f.sponsorTier; f.sponsorTier = tier; audit(d, user, "Sponsorship tier changed", f.id, { before, after: tier, reason: r }); }, L("Saved", "Imehifadhiwa")); }}>
          <Field label={L("Tier", "Ngazi")}><Chips value={tier} onChange={setTier} options={state.packages.sponsorTiers.map((t) => ({ value: t.id, label: `${tl(t)}${t.id !== "standard" ? ` (${counts[t.id]}/${t.max})` : ""}` }))} /></Field>
        </ReasonModal>
      )}
    </div>
  );
}

const SETTING_FIELDS = [
  ["ratingAutoMin", "Records Rating for automatic loan eligibility", "Kiwango cha ustahiki wa mkopo wa moja kwa moja"], ["ratingReviewMin", "Records Rating allowed with lender review", "Kiwango kinachoruhusiwa kwa mapitio ya mkopeshaji"],
  ["reviewFloor", "Accountant review of uncertain entries from (TZS)", "Mapitio ya mhasibu kwa miamala isiyo na uhakika kuanzia (TZS)"], ["minCellSize", "Reports: hide figures based on fewer than", "Ripoti: ficha takwimu za chini ya"],
  ["closeToleranceAbs", "Daily close tolerance (TZS)", "Kiwango cha kuvumilia tofauti (TZS)"], ["closeTolerancePct", "Daily close tolerance (% of balance)", "Kiwango cha kuvumilia (% ya salio)"],
  ["differenceFlagLevel", "Flag differences to officer from (TZS)", "Ripoti tofauti kwa afisa kuanzia (TZS)"], ["duplicateWindowMin", "Duplicate time window (minutes)", "Muda wa kurudia (dakika)"],
  ["unusualFactor", "Unusual amount: times the usual", "Kiasi kisicho cha kawaida: mara ya kawaida"], ["unusualFloor", "Unusual amount: at least (TZS)", "Kiasi kisicho cha kawaida: angalau (TZS)"],
  ["disputeDays", "Rating dispute window (days)", "Muda wa kupinga kiwango (siku)"], ["ratingOverdueDays", "Rating overdue after (days)", "Kiwango kimechelewa baada ya (siku)"],
  ["firstCheckDays", "First check after joining (days)", "Ukaguzi wa kwanza baada ya kujiunga (siku)"], ["recheckRate", "Share of checks re-checked (0–1)", "Sehemu ya ukaguzi upya (0–1)"],
  ["recheckGapFlag", "Re-check gap flagged above (points)", "Tofauti ya ukaguzi upya inayoripotiwa (alama)"], ["visitDistanceFlagM", "Visit distance flagged above (metres)", "Umbali wa ziara unaoripotiwa (mita)"],
  ["minGroupSize", "Minimum group size in reports", "Ukubwa wa chini wa kundi kwenye ripoti"], ["activeMinDays", "Active = days with entries in last 30", "Hai = siku zenye miamala katika 30"],
  ["youthMaxAge", "Youth: age up to", "Vijana: umri hadi"], ["qualifyScore", "Qualifying credit score", "Alama ya kufuzu mkopo"], ["cashBuffer", "Cash buffer (0–1)", "Akiba ya pesa (0–1)"], ["quarterlyDays", "Quarterly questions every (days)", "Maswali ya robo mwaka kila (siku)"]
];

export function Settings() {
  const { state, user } = useStore();
  const act = useAction();
  const [s, setS] = useState(() => structuredClone(state.settings));
  const num = (k, v) => setS({ ...s, [k]: v === "" ? "" : Number(v) });
  const save = () => act((d) => { const before = d.settings; d.settings = { ...s }; audit(d, user, "Settings changed", "settings", { before, after: s }); }, L("Settings saved", "Mipangilio imehifadhiwa"));
  return (
    <div className="stack">
      <Card title={L("Rules", "Kanuni")}>
        <div className="form two">
          {SETTING_FIELDS.map(([k, en, sw]) => <Field key={k} label={L(en, sw)}><input className="input" inputMode="decimal" value={s[k] ?? ""} onChange={(e) => num(k, e.target.value.replace(/[^\d.]/g, ""))} /></Field>)}
        </div>
      </Card>
      <Card title={L("Records Rating frequency per band (months)", "Marudio ya ukaguzi kwa kiwango (miezi)")}>
        <div className="form two">{["excellent", "good", "okay", "poor"].map((k) => <Field key={k} label={k}><input className="input" inputMode="numeric" value={s.ratingFrequency[k]} onChange={(e) => setS({ ...s, ratingFrequency: { ...s.ratingFrequency, [k]: Number(e.target.value.replace(/\D/g, "")) || 1 } })} /></Field>)}</div>
      </Card>
      <Card title={L("Credit score weights", "Uzito wa alama ya mkopo")}>
        <p className="small muted mb">{L("V9's five factors are kept; the Records Rating has a small weight because it also gates eligibility. Each score is stored with the weights used.", "Vipengele vitano vya V9 vimebaki; Kiwango cha Kumbukumbu kina uzito mdogo kwa sababu pia kinaamua ustahiki.")}</p>
        {["first", "repeat"].map((set) => (
          <div key={set} className="mb">
            <h3>{set === "first" ? L("First loan", "Mkopo wa kwanza") : L("Repeat borrower", "Mkopaji wa marudio")}</h3>
            <div className="form two mt">{Object.keys(DEFAULT_SETTINGS.scoreWeights[set]).map((k) => <Field key={k} label={k}><input className="input" inputMode="numeric" value={s.scoreWeights[set][k]} onChange={(e) => setS({ ...s, scoreWeights: { ...s.scoreWeights, [set]: { ...s.scoreWeights[set], [k]: Number(e.target.value.replace(/\D/g, "")) || 0 } } })} /></Field>)}</div>
            <p className="small muted mt">{L("Total", "Jumla")}: {Object.values(s.scoreWeights[set]).reduce((a, b) => a + b, 0)}</p>
          </div>
        ))}
      </Card>
      <Card title={L("Support contacts", "Mawasiliano ya msaada")}>
        <div className="form two">
          <Field label="WhatsApp"><Text value={s.support.whatsapp} onChange={(v) => setS({ ...s, support: { ...s.support, whatsapp: v } })} /></Field>
          <Field label={L("Phone", "Simu")}><Text value={s.support.phone} onChange={(v) => setS({ ...s, support: { ...s.support, phone: v } })} /></Field>
          <Field label={L("Hours", "Saa")}><Text value={s.support.hours} onChange={(v) => setS({ ...s, support: { ...s.support, hours: v } })} /></Field>
        </div>
      </Card>
      <button className="btn primary" onClick={save}>{L("Save settings", "Hifadhi mipangilio")}</button>
      <TestTools />
    </div>
  );
}

function TestTools() {
  const { state, user, resetAll, signOut } = useStore();
  const act = useAction();
  const [bid, setBid] = useState("");
  const [days, setDays] = useState("95");
  const [share, setShare] = useState("0.9");
  const [confirm, setConfirm] = useState(false);
  return (
    <Card title={L("Test tools (web MVP only)", "Zana za majaribio (toleo la wavuti tu)")}>
      <p className="small muted mb">{L("Fill a business with sample past activity and daily closes, so ratings, scores and reports can be tested without waiting weeks. Replaces that business's earlier entries and closes.", "Jaza biashara kwa shughuli za mfano za nyuma na kufunga siku, ili viwango, alama na ripoti vijaribiwe bila kusubiri wiki. Inabadilisha miamala na kufunga siku kwa biashara hiyo.")}</p>
      <div className="form two">
        <Field label={L("Business", "Biashara")}><BusinessPicker businesses={state.businesses} value={bid} onChange={setBid} /></Field>
        <Field label={L("Days of history", "Siku za historia")}><Text value={days} onChange={(v) => setDays(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
        <Field label={L("Share of days closed on time (0–1)", "Sehemu ya siku zilizofungwa kwa wakati (0–1)")}><Text value={share} onChange={(v) => setShare(v.replace(/[^\d.]/g, ""))} /></Field>
      </div>
      <button className="btn mt" disabled={!bid || !(Number(days) > 0)} onClick={() => act((d) => generateSampleActivity(d, user, bid, Number(days), Number(share)), L("Sample activity added", "Shughuli za mfano zimeongezwa"))}>{L("Generate sample activity", "Tengeneza shughuli za mfano")}</button>
      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
      <button className="btn danger" onClick={() => setConfirm(true)}>{L("Reset all data", "Futa data yote")}</button>
      {confirm && <Confirm title={L("Reset all test data?", "Futa data yote ya majaribio?")} danger okLabel={L("Reset everything", "Futa kila kitu")} body={L("All businesses, entries, ratings, loans, messages and photos in this browser are removed. Test sign-in accounts and default settings come back. This cannot be undone.", "Biashara, miamala, viwango, mikopo, ujumbe na picha zote kwenye kivinjari hiki zinaondolewa. Akaunti za majaribio na mipangilio ya awali zinarudi. Haiwezi kurudishwa.")} onClose={() => setConfirm(false)} onOk={async () => { await clearFiles().catch(() => {}); resetAll(); signOut(); }} />}
    </Card>
  );
}

export function Fields() {
  const { state, user } = useStore();
  const act = useAction();
  const [f, setF] = useState({ en: "", sw: "", type: "text", options: "", required: false });
  const list = state.settings.customFields || [];
  return (
    <div className="stack">
      <Card title={L("Optional onboarding fields", "Sehemu za hiari za usajili")}>
        {!list.length && <Empty text={L("No extra fields yet.", "Bado hakuna sehemu za ziada.")} />}
        <div className="list">
          {list.map((x) => (
            <div key={x.id} className="item"><div className="grow"><b>{tl(x.label)}</b><div className="small muted">{x.type}{x.required ? ` · ${L("required", "lazima")}` : ""}{x.options?.length ? ` · ${x.options.join(", ")}` : ""}</div></div>
              <button className="icon-btn" aria-label={L("Remove", "Ondoa")} onClick={() => act((d) => { d.settings.customFields = d.settings.customFields.filter((y) => y.id !== x.id); audit(d, user, "Input field removed", x.id, { before: x }); })}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Add a field", "Ongeza sehemu")}>
        <div className="form two">
          <Field label={L("Label in English", "Jina kwa Kiingereza")}><Text value={f.en} onChange={(v) => setF({ ...f, en: v })} /></Field>
          <Field label={L("Label in Kiswahili", "Jina kwa Kiswahili")}><Text value={f.sw} onChange={(v) => setF({ ...f, sw: v })} /></Field>
          <Field label={L("Type", "Aina")}><Chips value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "text", label: L("Text", "Maandishi") }, { value: "number", label: L("Number", "Namba") }, { value: "select", label: L("Choice", "Chaguo") }]} /></Field>
          {f.type === "select" && <Field label={L("Choices (comma separated)", "Machaguo (tenganisha kwa koma)")}><Text value={f.options} onChange={(v) => setF({ ...f, options: v })} /></Field>}
          <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />{L("Required", "Lazima")}</label>
        </div>
        <button className="btn primary mt" disabled={!f.en.trim() || !f.sw.trim()} onClick={() => { act((d) => { const x = { id: uid("FLD"), label: { en: f.en.trim(), sw: f.sw.trim() }, type: f.type, options: f.type === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : [], required: f.required }; d.settings.customFields = [...(d.settings.customFields || []), x]; audit(d, user, "Input field added", x.id, { after: x }); }, L("Field added", "Sehemu imeongezwa")); setF({ en: "", sw: "", type: "text", options: "", required: false }); }}><Plus size={18} />{L("Add field", "Ongeza sehemu")}</button>
      </Card>
    </div>
  );
}

const TILES = [["k2", "2 Financial inclusion"], ["k3", "3 Credit readiness"], ["k4", "4 Financing gap"], ["k5", "5 Credit access"], ["k1", "1 Registered and active"], ["k6", "6 Portfolio quality"], ["k7", "7 Digital adoption"], ["k8", "8 Women and youth"], ["k9", "9 Productive assets"], ["k10", "10 Business growth"], ["extra", "Extra tiles"]];

export function ReportDesign() {
  const { state, user } = useStore();
  const act = useAction();
  const [tiles, setTiles] = useState(() => ({ ...state.settings.reportTiles }));
  const [min, setMin] = useState(String(state.settings.minGroupSize));
  return (
    <Card title={L("KPI dashboard design", "Muundo wa dashibodi ya viashiria")}>
      <p className="small muted mb">{L("Report users only ever see totals and shares for groups of businesses.", "Watumiaji wa ripoti wanaona jumla na sehemu za makundi ya biashara tu.")}</p>
      <div className="stack">{TILES.map(([k, label]) => <label key={k} className="check"><input type="checkbox" checked={tiles[k] !== false} onChange={(e) => setTiles({ ...tiles, [k]: e.target.checked })} />{label}</label>)}</div>
      <Field label={L("Minimum group size (smaller groups hidden)", "Ukubwa wa chini wa kundi (madogo yanafichwa)")} className="mt"><Text value={min} onChange={(v) => setMin(v.replace(/\D/g, ""))} inputMode="numeric" /></Field>
      <button className="btn primary mt" onClick={() => act((d) => { const before = { tiles: d.settings.reportTiles, min: d.settings.minGroupSize }; d.settings.reportTiles = tiles; d.settings.minGroupSize = Math.max(1, Number(min) || 1); audit(d, user, "Report design changed", "reports", { before, after: { tiles, min } }); }, L("Saved", "Imehifadhiwa"))}>{L("Save", "Hifadhi")}</button>
    </Card>
  );
}

export function Audit() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const list = state.audit.filter((a) => !q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  const show = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v));
  return (
    <Card title={L("Audit trail", "Kumbukumbu za mabadiliko")}>
      <input className="input mb" placeholder={L("Search", "Tafuta")} value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length && <Empty text={L("Nothing yet.", "Bado hakuna.")} />}
      <div className="table-wrap"><table className="t"><thead><tr><th>{L("When", "Lini")}</th><th>{L("Who", "Nani")}</th><th>{L("What", "Nini")}</th><th>{L("Before → after", "Kabla → baada")}</th><th>{L("Reason", "Sababu")}</th></tr></thead><tbody>
        {list.map((a) => (
          <tr key={a.id}><td className="nowrap small">{fmtDateTime(a.at)}</td><td className="small">{a.actor.name}<div className="tiny muted">{a.actor.role}</div></td><td className="small">{a.action}<div className="tiny muted">{a.target}</div></td><td className="tiny" style={{ maxWidth: 320, overflowWrap: "anywhere" }}>{show(a.before)}{a.before != null || a.after != null ? " → " : ""}{show(a.after)}</td><td className="small">{a.reason}</td></tr>
        ))}
      </tbody></table></div>
    </Card>
  );
}


// Super user test-data loader (feedback 27 Oct, item 7).
export function TestData() {
  const { state, user, notify } = useStore();
  const act = useAction();
  const [files, setFiles] = useState({});
  const [history, setHistory] = useState(true);
  const [closes, setCloses] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const loaded = state.businesses.filter((b) => b.testData);
  const readFile = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(f); });
  const load = async () => {
    setBusy(true);
    try {
      const get = async (key, name) => (files[key] ? readFile(files[key]) : fetch(`/samples/test-data/${name}`).then((r) => { if (!r.ok) throw new Error(`Missing ${name}`); return r.text(); }));
      const [profilesCsv, transactionsCsv, ratingsCsv] = await Promise.all([get("profiles", "profiles.csv"), get("transactions", "transactions.csv"), get("ratings", "ratings.csv")]);
      const built = buildTestData({ profilesCsv, transactionsCsv, ratingsCsv }, { history, closes, todayISO: today(state) });
      const r = act((d) => loadTestData(d, user, built));
      if (r) notify(L(`Loaded ${r.businesses} businesses, ${r.entries} entries, ${r.ratings} ratings`, `Imepakia biashara ${r.businesses}, miamala ${r.entries}, viwango ${r.ratings}`));
    } catch (e) {
      notify(e.message, true);
    }
    setBusy(false);
  };
  return (
    <div className="stack">
      <div className="notice warn"><b>{L("Test data only", "Data ya majaribio tu")}</b>{L("Loads 10 fictional businesses, their transactions and simulated Records Ratings, all marked as test data. Remove them in one step when testing is done.", "Inapakia biashara 10 za kubuni, miamala yao na Viwango vya Kumbukumbu vya mfano, vyote vikiwa na alama ya majaribio. Viondoe kwa hatua moja majaribio yakiisha.")}</div>
      <Card title={L("Status", "Hali")}>
        {loaded.length ? (
          <div className="stack">
            <p>{loaded.length} {L("test businesses loaded", "biashara za majaribio zimepakiwa")} · {state.entries.filter((e) => e.testData).length} {L("entries", "miamala")} · {state.ratings.filter((r) => r.testData).length} {L("ratings", "viwango")}</p>
            <div className="table-wrap"><table className="t"><thead><tr><th>ID</th><th>{L("Business", "Biashara")}</th><th>{L("Sign in (phone / PIN)", "Kuingia (simu / PIN)")}</th><th>{L("Officer", "Afisa")}</th></tr></thead><tbody>
              {loaded.map((b) => { const u = state.users.find((x) => x.businessId === b.id); return <tr key={b.id}><td className="small">{b.id}</td><td>{b.profile.businessName}<div className="tiny muted">{b.profile.ownerName}</div></td><td className="small">{u?.login} / {u?.pin}</td><td className="small">{state.users.find((x) => x.id === b.officerId)?.name}</td></tr>; })}
            </tbody></table></div>
            <button className="btn danger" onClick={() => setConfirm(true)}>{L("Remove all test data", "Ondoa data yote ya majaribio")}</button>
          </div>
        ) : <p className="muted">{L("No test data loaded.", "Hakuna data ya majaribio iliyopakiwa.")}</p>}
      </Card>
      {!loaded.length && (
        <Card title={L("Load test data", "Pakia data ya majaribio")}>
          <p className="small muted mb">{L("Uses the built-in sample files unless you choose your own CSV files in the same format.", "Inatumia mafaili ya mfano yaliyomo isipokuwa uchague mafaili yako ya CSV yenye muundo uleule.")}</p>
          <div className="form two">
            {[["profiles", L("Profiles CSV (optional)", "CSV ya wasifu (si lazima)")], ["transactions", L("Transactions CSV (optional)", "CSV ya miamala (si lazima)")], ["ratings", L("Records Ratings CSV (optional)", "CSV ya viwango (si lazima)")]].map(([k, label]) => (
              <Field key={k} label={label}><input className="input" type="file" accept=".csv,.txt" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] || null })} /></Field>
            ))}
          </div>
          <label className="check mt"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />{L("Add 6 months of earlier activity (repeats each business's own pattern) so loan journeys can be tested", "Ongeza shughuli za miezi 6 iliyopita (zinarudia mtindo wa kila biashara) ili safari za mikopo zijaribiwe")}</label>
          <label className="check"><input type="checkbox" checked={closes} onChange={(e) => setCloses(e.target.checked)} />{L("Add daily closes up to yesterday (on time in line with each rating)", "Ongeza kufunga siku hadi jana (kwa wakati kulingana na kila kiwango)")}</label>
          <button className="btn primary mt" disabled={busy} onClick={load}>{busy ? L("Loading…", "Inapakia…") : L("Load test data", "Pakia data ya majaribio")}</button>
          <p className="small muted mt"><a href="/samples/test-data/profiles.csv" download>profiles.csv</a> · <a href="/samples/test-data/transactions.csv" download>transactions.csv</a> · <a href="/samples/test-data/ratings.csv" download>ratings.csv</a></p>
        </Card>
      )}
      {confirm && <Confirm title={L("Remove all test data?", "Ondoa data yote ya majaribio?")} danger okLabel={L("Remove", "Ondoa")} body={L("Removes the test businesses and everything linked to them: entries, closes, ratings, loans, messages and alerts. Other data stays.", "Inaondoa biashara za majaribio na kila kitu kinachohusiana nazo: miamala, kufunga siku, viwango, mikopo, ujumbe na taarifa. Data nyingine inabaki.")} onClose={() => setConfirm(false)} onOk={() => act((d) => removeTestData(d, user), L("Test data removed", "Data ya majaribio imeondolewa"))} />}
    </div>
  );
}
