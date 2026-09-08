import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  ArrowRight,
  ArrowLeft,
  Lock,
  User,
  KeyRound,
  Fingerprint,
  Loader2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   LoginPage — operator sign-in for the IBVAP Sentinel command console.
   Same pure-B&W tactical language as the landing page (sharp corners,
   mono labels, corner brackets). This is a front-end shell: there is no
   live directory in this build, so any non-empty credentials continue to
   the console. Wire it to the backend auth endpoint when one exists.
   ═══════════════════════════════════════════════════════════════════════ */

function Corners() {
  return (
    <>
      {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map((c) => (
        <span key={c} className={`pointer-events-none absolute h-3.5 w-3.5 border-white/30 ${c}`} />
      ))}
    </>
  );
}

function Field({ icon: Icon, label, hint, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
        <Icon size={11} /> {label}
      </span>
      <input
        {...props}
        className="w-full border border-white/20 bg-black px-3 py-2.5 font-mono text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
      />
      {hint && <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">{hint}</span>}
    </label>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [pass, setPass] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }) + " UTC"
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    if (!id.trim() || !pass.trim()) {
      setErr("Operator ID and passphrase are required.");
      return;
    }
    setBusy(true);
    // no live directory in this build — accept any non-empty credentials
    window.setTimeout(() => navigate("/console"), 850);
  };

  return (
    <div className="relative min-h-screen bg-black font-sans text-white">
      {/* faint grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-14">
        <Link
          to="/"
          className="press mb-8 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 hover:text-white"
        >
          <ArrowLeft size={12} /> Back to site
        </Link>

        <div className="relative border border-white/12 bg-black p-6 sm:p-8">
          <Corners />

          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center border border-white bg-white text-black">
              <Shield size={17} />
            </span>
            <div className="leading-none">
              <div className="text-[14px] font-bold tracking-wide">IBVAP SENTINEL</div>
              <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.22em] text-white/45">
                Command Console · Operator Sign-in
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-y border-white/10 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
            <span className="flex items-center gap-1.5">
              <Lock size={9} /> Restricted · SSB / MHA
            </span>
            <span className="tabular-nums">{clock}</span>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              icon={User}
              label="Operator ID"
              placeholder="e.g. SSB-GDP-04"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              autoFocus
            />
            <Field
              icon={KeyRound}
              label="Passphrase"
              type="password"
              placeholder="••••••••••••"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />
            <Field
              icon={Fingerprint}
              label="MFA token"
              hint="Optional — 6-digit authenticator code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
            />

            {err && (
              <p className="border border-white/25 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-white/70">
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="press group flex w-full items-center justify-center gap-2 border border-white bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-white disabled:opacity-70"
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Authenticating…
                </>
              ) : (
                <>
                  Authenticate
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => navigate("/console")}
              className="text-left hover:text-white/70"
            >
              Continue as guest →
            </button>
            <span>Need access? Contact your duty commander</span>
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.14em] text-white/25">
          Demo build · no live personnel directory — any non-empty credentials continue.
          Authorised use only · all sessions are logged under Section 65B.
        </p>
      </div>
    </div>
  );
}
