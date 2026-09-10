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
import { authenticate } from "../lib/operators.js";

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
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
        <Icon size={11} /> {label}
      </span>
      <input
        {...props}
        className="w-full border border-white/20 bg-black px-3 py-2.5 font-mono text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-white"
      />
      {hint && <span className="mt-1 block text-[10px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  // where to go after a successful sign-in (?next=/register etc.) — default console
  const nextPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      return n && n.startsWith("/") ? n : "/console";
    } catch {
      return "/console";
    }
  })();
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
    // client-side demo directory (src/lib/operators.js) — no auth backend
    window.setTimeout(() => {
      const res = authenticate(id, pass, token);
      if (!res.ok) {
        setBusy(false);
        setErr(res.error);
        return;
      }
      try {
        sessionStorage.setItem("ibvap.operator", JSON.stringify(res.operator));
      } catch {
        /* private mode — non-fatal */
      }
      navigate(nextPath);
    }, 650);
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
          className="press mb-8 inline-flex items-center gap-2 text-[12px] font-medium text-zinc-400 hover:text-white"
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
              <div className="text-[14px] font-semibold tracking-tight text-zinc-100">IBVAP Sentinel</div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Command Console · Operator Sign-in
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-y border-white/10 py-2 text-[10.5px] text-zinc-500">
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
              <p className="border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="press group flex w-full items-center justify-center gap-2 border border-white bg-white px-4 py-3 text-[11px] font-bold text-black transition-colors hover:bg-black hover:text-white disabled:opacity-70"
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

          <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-3 text-[10.5px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => navigate("/console")}
              className="text-left hover:text-white/70"
            >
              Continue as guest →
            </button>
            <Link to="/register" className="hover:text-white/70">
              Enrol authorized personnel →
            </Link>
          </div>
        </div>

        <div className="mt-4 border border-white/10 bg-white/[0.02] px-3 py-2.5 text-center text-[10.5px] leading-relaxed text-zinc-500">
          Demo build · client-side operator directory (src/lib/operators.js).
          <br />
          Try <span className="text-white/60">SSB-GDP-04</span> / <span className="text-white/60">Ravi-Sector-4471</span>
          {" · MFA "}<span className="text-white/60">118605</span>
          <br />
          Authorised use only · sessions logged under Section 65B.
        </div>
      </div>
    </div>
  );
}
