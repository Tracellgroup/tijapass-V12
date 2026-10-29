// Sign-in (ROLE-01): no role drop-down; each user signs in to its own workspace. Test accounts are for the web MVP only.
import { Building2, Globe, Landmark, LogIn, Store, UserPlus } from "lucide-react";
import { useState } from "react";
import logo from "../assets/tijapass-logo-dark-transparent.png";
import { REGIONS } from "../core/seed.js";
import { uid } from "../core/util.js";
import { passwordSignIn, pinSignIn, registerOrg, resetPinWithCode } from "../lib/actions.js";
import { ROLE_NAMES } from "../lib/access.js";
import { L, tl } from "../lib/i18n.js";
import { useAction, useStore } from "../lib/store.jsx";
import { Card, Field, Select, Tabs, Text } from "../ui/components.jsx";
import { BusinessWizard, PhoneCode, normPhone } from "./Onboard.jsx";

// Forgotten PIN: a code to the registered phone, then a new 4-digit PIN (not possible while blocked).
function ForgotPin({ onDone }) {
  const act = useAction();
  const [phone, setPhone] = useState("");
  const [ok, setOk] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  return (
    <Card title={L("Forgot my PIN", "Nimesahau PIN yangu")}>
      <div className="form">
        <Field label={L("Registered phone number", "Namba ya simu iliyosajiliwa")}><Text value={phone} onChange={(v) => { setPhone(v); setOk(false); }} inputMode="tel" placeholder="0712 345 678" /></Field>
        <PhoneCode phone={normPhone(phone)} done={ok} onDone={() => setOk(true)} />
        {ok && (
          <div className="form two">
            <Field label={L("New 4-digit PIN", "PIN mpya ya tarakimu 4")}><input className="input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label={L("Repeat the PIN", "Rudia PIN")}><input className="input" type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
        )}
        <button className="btn primary" disabled={!ok || pin.length !== 4 || pin !== pin2} onClick={() => act((d) => resetPinWithCode(d, phone, pin, ok), L("PIN changed. Sign in with the new PIN.", "PIN imebadilishwa. Ingia kwa PIN mpya.")) && onDone()}>{L("Save new PIN", "Hifadhi PIN mpya")}</button>
      </div>
    </Card>
  );
}

function OrgForm({ kind, onDone }) {
  const act = useAction();
  const [f, setF] = useState({ name: "", licence: "", region: "", address: "", phone: "", email: "", contactName: "", password: "", gps: null });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.name.trim() && f.licence.trim() && f.region && f.address.trim() && f.phone.trim() && /@/.test(f.email) && f.contactName.trim() && f.password.length >= 6;
  return (
    <Card title={kind === "fi" ? L("Register a financial institution", "Sajili taasisi ya fedha") : L("Register a supplier", "Sajili msambazaji")}>
      <div className="form two">
        <Field label={L("Organisation name *", "Jina la taasisi *")}><Text value={f.name} onChange={(v) => set("name", v)} /></Field>
        <Field label={L("Licence or registration number *", "Namba ya leseni au usajili *")}><Text value={f.licence} onChange={(v) => set("licence", v)} /></Field>
        <Field label={L("Region *", "Mkoa *")}><Select value={f.region} onChange={(v) => set("region", v)} placeholder={L("Choose", "Chagua")} options={REGIONS.map((r) => ({ value: r, label: r }))} /></Field>
        <Field label={L("Address *", "Anwani *")}><Text value={f.address} onChange={(v) => set("address", v)} /></Field>
        <Field label={L("Phone *", "Simu *")}><Text value={f.phone} onChange={(v) => set("phone", v)} inputMode="tel" /></Field>
        <Field label={L("Contact person *", "Mtu wa mawasiliano *")}><Text value={f.contactName} onChange={(v) => set("contactName", v)} /></Field>
        <Field label={L("Sign-in email *", "Barua pepe ya kuingia *")}><Text value={f.email} onChange={(v) => set("email", v)} inputMode="email" /></Field>
        <Field label={L("Password (6+ characters) *", "Nenosiri (herufi 6+) *")} hint={L("Test version: never use a real password.", "Toleo la majaribio: usitumie nenosiri halisi.")}><input type="password" className="input" value={f.password} onChange={(e) => set("password", e.target.value)} /></Field>
      </div>
      <p className="small muted mt">{L("TijaPass Admin checks and approves new organisations before they can see or receive anything.", "TijaPass Admin hukagua na kuidhinisha taasisi mpya kabla hazijaona au kupokea chochote.")}</p>
      <button className="btn primary mt" disabled={!ok} onClick={() => act((d) => registerOrg(d, null, kind, { id: uid(kind === "fi" ? "FI" : "SUP"), name: f.name.trim(), licence: f.licence.trim(), region: f.region, address: f.address.trim(), phone: f.phone.trim(), email: f.email.trim().toLowerCase(), contactName: f.contactName.trim(), password: f.password }), L("Registered. Waiting for approval.", "Umesajiliwa. Inasubiri idhini.")) && onDone()}>
        {L("Register", "Sajili")}
      </button>
    </Card>
  );
}

export default function SignIn() {
  const { state, signIn, lang, setLang, update, notify } = useStore();
  const [tab, setTab] = useState("business");
  const [join, setJoin] = useState(null);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  // Wrong PINs are counted: 5 lock the account for 15 minutes, 10 block it until an officer unlocks it.
  const bizSignIn = () => {
    const r = update((d) => pinSignIn(d, phone, pin));
    if (r.id) signIn(r.id);
    else { notify(r.error, true); setPin(""); }
  };
  const orgSignIn = () => {
    const r = update((d) => passwordSignIn(d, email, pw));
    if (r.id) signIn(r.id);
    else notify(r.error, true);
  };
  const testUsers = state.users.filter((u) => u.test && u.active !== false);
  const bizUsers = state.users.filter((u) => u.role === "business" && u.active !== false);

  return (
    <div className="signin-wrap">
      <div className="signin-side">
        <div>
          <img src={logo} alt="TijaPass" />
          <h1>{L("Simple records today. Fair finance tomorrow.", "Kumbukumbu rahisi leo. Mkopo wa haki kesho.")}</h1>
          <p>{L("TijaPass helps small businesses record money in and out in plain words, close each day, and build a credit passport lenders can trust.", "TijaPass inasaidia wajasiriamali kuandika pesa zinazoingia na kutoka kwa maneno rahisi, kufunga kila siku, na kujenga pasipoti ya mkopo ambayo wakopeshaji wanaiamini.")}</p>
        </div>
        <p className="small hide-m" style={{ color: "#8fa6c4" }}>{L("Test version with dummy data. Operated by Tracell Finance Limited.", "Toleo la majaribio lenye data ya mfano. Inaendeshwa na Tracell Finance Limited.")}</p>
      </div>
      <div className="signin-main">
        <div className="between">
          <span className="test-marker" style={{ display: "inline-block" }}>{L("Test version", "Toleo la majaribio")}</span>
          <button className="lang" onClick={() => setLang(lang === "sw" ? "en" : "sw")}><Globe size={16} />{lang === "sw" ? "English" : "Kiswahili"}</button>
        </div>
        {join === "business" && (
          <>
            <button className="btn ghost" onClick={() => setJoin(null)}>← {L("Back to sign in", "Rudi kuingia")}</button>
            <BusinessWizard onDone={({ userId }) => signIn(userId)} />
          </>
        )}
        {join === "forgot" && (
          <>
            <button className="btn ghost" onClick={() => setJoin(null)}>← {L("Back to sign in", "Rudi kuingia")}</button>
            <ForgotPin onDone={() => setJoin(null)} />
          </>
        )}
        {(join === "fi" || join === "supplier") && (
          <>
            <button className="btn ghost" onClick={() => setJoin(null)}>← {L("Back to sign in", "Rudi kuingia")}</button>
            <OrgForm kind={join} onDone={() => { setJoin(null); setTab("org"); }} />
          </>
        )}
        {!join && (
          <>
            <h1>{L("Sign in", "Ingia")}</h1>
            <Tabs value={tab} onChange={setTab} tabs={[{ value: "business", label: L("Business", "Mjasiriamali") }, { value: "org", label: L("Lenders and suppliers", "Wakopeshaji na wasambazaji") }, { value: "test", label: L("Test accounts", "Akaunti za majaribio") }]} />
            {tab === "business" && (
              <Card>
                <div className="form">
                  <Field label={L("Phone number", "Namba ya simu")}><Text value={phone} onChange={setPhone} inputMode="tel" placeholder="0712 345 678" /></Field>
                  <Field label={L("4-digit PIN", "PIN ya tarakimu 4")}><input className="input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && bizSignIn()} /></Field>
                  <button className="btn primary big" onClick={bizSignIn}><LogIn size={20} />{L("Sign in", "Ingia")}</button>
                  <button className="btn ghost small" onClick={() => setJoin("forgot")}>{L("Forgot my PIN", "Nimesahau PIN yangu")}</button>
                </div>
                <div className="notice mt">
                  <b>{L("New to TijaPass?", "Mgeni TijaPass?")}</b>
                  {L("Only the business itself can register, with a code sent to the owner's phone. A TijaPass officer can explain the steps but cannot register you.", "Biashara yenyewe pekee inaweza kujisajili, kwa msimbo unaotumwa kwenye simu ya mmiliki. Afisa wa TijaPass anaweza kueleza hatua lakini hawezi kukusajili.")}
                  <div className="mt"><button className="btn" onClick={() => setJoin("business")}><UserPlus size={18} />{L("Register my business", "Sajili biashara yangu")}</button></div>
                </div>
              </Card>
            )}
            {tab === "org" && (
              <Card>
                <div className="form">
                  <Field label={L("Email", "Barua pepe")}><Text value={email} onChange={setEmail} inputMode="email" /></Field>
                  <Field label={L("Password", "Nenosiri")}><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && orgSignIn()} /></Field>
                  <button className="btn primary big" onClick={orgSignIn}><LogIn size={20} />{L("Sign in", "Ingia")}</button>
                </div>
                <div className="row mt">
                  <button className="btn" onClick={() => setJoin("fi")}><Landmark size={18} />{L("Register a lender", "Sajili mkopeshaji")}</button>
                  <button className="btn" onClick={() => setJoin("supplier")}><Store size={18} />{L("Register a supplier", "Sajili msambazaji")}</button>
                </div>
              </Card>
            )}
            {tab === "test" && (
              <Card>
                <p className="small muted mb">{L("Web MVP only: one tap signs in as each user type and admin tier. Not in the live app.", "Kwa toleo la wavuti tu: bofya mara moja kuingia kama kila aina ya mtumiaji. Haipo kwenye programu halisi.")}</p>
                <div className="list">
                  {testUsers.map((u) => (
                    <button key={u.id} className="item" onClick={() => signIn(u.id)}>
                      <LogIn size={18} />
                      <div className="grow"><b>{tl(ROLE_NAMES[u.role])}</b><div className="small muted">{u.name} · {u.login}</div></div>
                    </button>
                  ))}
                </div>
                <h3 className="mt2">{L("Businesses registered in this browser", "Biashara zilizosajiliwa kwenye kivinjari hiki")}</h3>
                {!bizUsers.length && <p className="small muted mt">{L("None yet. Register one with \"Register my business\", or load test data as the Super user.", "Bado hakuna. Sajili moja kwa \"Sajili biashara yangu\", au pakia data ya majaribio kama Mtumiaji mkuu.")}</p>}
                <div className="list">
                  {bizUsers.map((u) => {
                    const b = state.businesses.find((x) => x.id === u.businessId);
                    return (
                      <button key={u.id} className="item" onClick={() => signIn(u.id)}>
                        <Building2 size={18} />
                        <div className="grow"><b>{b?.profile.businessName}</b><div className="small muted">{u.name} · {u.login}</div></div>
                      </button>
                    );
                  })}
                  {state.users.filter((u) => !u.test && ["fi", "supplier"].includes(u.role)).map((u) => (
                    <button key={u.id} className="item" onClick={() => signIn(u.id)}>
                      {u.role === "fi" ? <Landmark size={18} /> : <Store size={18} />}
                      <div className="grow"><b>{tl(ROLE_NAMES[u.role])}</b><div className="small muted">{u.name} · {u.login}</div></div>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
