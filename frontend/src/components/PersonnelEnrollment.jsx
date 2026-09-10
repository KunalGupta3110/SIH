import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  ArrowLeft,
  ArrowRight,
  User,
  Hash,
  BadgeCheck,
  Camera,
  Upload,
  Trash2,
  RotateCcw,
  Users,
} from "lucide-react";
import {
  listPersonnel,
  enrollPersonnel,
  removePersonnel,
  resetPersonnel,
  CLEARANCE,
  CATEGORIES,
} from "../lib/personnel.js";

/* ═══════════════════════════════════════════════════════════════════════
   PersonnelEnrollment — /register

   Enrol authorized personnel (officers, patrol staff, marked vehicles)
   into the friend-force allowlist. Gated behind operator authentication:
   an un-signed-in visitor is bounced to /login.

   Same B&W tactical language as the sign-in page.
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

function Field({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
        {Icon && <Icon size={11} />} {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full border border-white/15 bg-black px-3 py-2.5 font-mono text-[13px] text-white placeholder:text-zinc-600 focus:border-white/45 focus:outline-none";

export default function PersonnelEnrollment() {
  const navigate = useNavigate();
  const [operator, setOperator] = useState(null);
  const [checked, setChecked] = useState(false);
  const [roster, setRoster] = useState(() => listPersonnel());

  const [form, setForm] = useState({
    name: "",
    serviceId: "",
    category: CATEGORIES[0],
    unit: "",
    clearance: CLEARANCE[1],
    phone: "",
    vehiclePlate: "",
  });
  const [face, setFace] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [saved, setSaved] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  // ── auth gate ──
  useEffect(() => {
    let op = null;
    try {
      op = JSON.parse(sessionStorage.getItem("ibvap.operator") || "null");
    } catch {
      op = null;
    }
    setOperator(op);
    setChecked(true);
  }, []);

  // ── webcam lifecycle ──
  useEffect(() => {
    if (!camOn) return undefined;
    let cancelled = false;
    setCamErr("");
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setCamErr("Camera unavailable — upload a photo instead."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [camOn]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const size = 320;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const s = Math.min(v.videoWidth, v.videoHeight);
    ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, size, size);
    setFace(c.toDataURL("image/jpeg", 0.82));
    setCamOn(false);
  };

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setFace(String(rd.result));
    rd.readAsDataURL(f);
  };

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.serviceId.trim()) return;
    const entry = enrollPersonnel({ ...form, face, enrolledBy: operator?.id || "operator" });
    setRoster(listPersonnel());
    setSaved(entry);
    setForm({ name: "", serviceId: "", category: CATEGORIES[0], unit: "", clearance: CLEARANCE[1], phone: "", vehiclePlate: "" });
    setFace("");
    setTimeout(() => setSaved(null), 4000);
  };

  const drop = (id) => setRoster(removePersonnel(id));

  if (!checked) return null;

  // ── not signed in: inline sign-in prompt (URL stays /register) ──
  if (!operator) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-black px-5 font-sans text-zinc-200">
        <div className="relative w-full max-w-md border border-white/15 bg-black p-8 text-center">
          <Corners />
          <span className="mx-auto grid h-11 w-11 place-items-center border border-white/20 bg-white text-black">
            <Shield size={20} />
          </span>
          <div className="mt-4 font-heading text-[15px] font-bold text-white">Operator sign-in required</div>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
            Enrolling authorized personnel changes the analytics allowlist. Sign in with an operator ID to continue.
          </p>
          <Link
            to="/login?next=/register"
            className="press mt-5 flex w-full items-center justify-center gap-2 border border-white bg-white px-4 py-3 text-[11px] font-bold text-black hover:bg-black hover:text-white"
          >
            Sign in <ArrowRight size={13} />
          </Link>
          <Link to="/" className="mt-3 inline-block text-[11px] text-zinc-500 hover:text-white">
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black font-sans text-zinc-200">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/console" className="flex items-center gap-2 text-[12px] font-medium text-zinc-400 hover:text-white">
            <ArrowLeft size={14} /> Back to console
          </Link>
          <span className="font-mono text-[11px] text-zinc-500">
            {operator.name} · {operator.role}
          </span>
        </div>

        <div className="relative border border-white/15 bg-black p-6 sm:p-8">
          <Corners />

          {/* header */}
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center border border-white/20 bg-white text-black">
              <Shield size={20} />
            </span>
            <div>
              <div className="font-heading text-[16px] font-bold text-white">Authorized Personnel Enrolment</div>
              <div className="text-[12px] text-zinc-400">Friend-force allowlist · IBVAP Sentinel</div>
            </div>
          </div>

          <p className="mt-5 border-y border-white/10 py-3 text-[12px] leading-relaxed text-zinc-400">
            Enrolled officers, patrol staff and marked vehicles are pushed to the analytics allowlist. When the
            face-recognition / ANPR stage matches an enrolled subject inside a restricted zone, the detection is
            tagged <span className="text-[#3ff09a]">authorized</span> and the incident is <span className="text-white">cleared,
            not escalated</span> — routine patrols no longer trip a threat alert.
          </p>

          {saved && (
            <div className="mt-4 flex items-center gap-2 border border-[#3ff09a]/40 bg-[#3ff09a]/10 px-3 py-2 text-[12px] text-[#3ff09a]">
              <BadgeCheck size={14} /> Enrolled {saved.name} as {saved.id} — added to the allowlist.
            </div>
          )}

          <form onSubmit={submit} className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
            {/* face capture */}
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <Camera size={11} /> Face ID
              </span>
              <div className="relative aspect-square w-full overflow-hidden border border-white/15 bg-zinc-950">
                {camOn ? (
                  <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                ) : face ? (
                  <img src={face} alt="enrolment" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center px-4 text-center text-[10.5px] text-zinc-600">
                    No face on file — capture or upload
                  </div>
                )}
                <Corners />
              </div>
              {camErr && <p className="mt-1 text-[10px] text-amber-400">{camErr}</p>}
              <div className="mt-2 flex gap-1.5">
                {camOn ? (
                  <button type="button" onClick={capture} className="press flex-1 border border-white bg-white px-2 py-1.5 text-[11px] font-bold text-black">
                    Capture
                  </button>
                ) : (
                  <button type="button" onClick={() => setCamOn(true)} className="press flex-1 border border-white/25 px-2 py-1.5 text-[11px] font-semibold text-white/80 hover:border-white">
                    <Camera size={11} className="mr-1 inline" /> Webcam
                  </button>
                )}
                <button type="button" onClick={() => fileRef.current?.click()} className="press border border-white/25 px-2 py-1.5 text-[11px] font-semibold text-white/80 hover:border-white">
                  <Upload size={11} />
                </button>
                {face && (
                  <button type="button" onClick={() => setFace("")} className="press border border-white/25 px-2 py-1.5 text-[11px] text-white/50 hover:text-white">
                    <RotateCcw size={11} />
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
              </div>
            </div>

            {/* details */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" icon={User}>
                <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Rank + name" required />
              </Field>
              <Field label="Service / ID number" icon={Hash}>
                <input className={inputCls} value={form.serviceId} onChange={set("serviceId")} placeholder="SSB/GDP/…" required />
              </Field>
              <Field label="Category">
                <select className={inputCls} value={form.category} onChange={set("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unit / posting">
                <input className={inputCls} value={form.unit} onChange={set("unit")} placeholder="Bn · sub-unit" />
              </Field>
              <Field label="Sector clearance">
                <select className={inputCls} value={form.clearance} onChange={set("clearance")}>
                  {CLEARANCE.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Contact number">
                <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+91 …" />
              </Field>
              <Field label="Marked vehicle plate (optional)">
                <input className={inputCls} value={form.vehiclePlate} onChange={set("vehiclePlate")} placeholder="PB 08 …" />
              </Field>
              <div className="flex items-end">
                <button type="submit" className="press group flex w-full items-center justify-center gap-2 border border-white bg-white px-4 py-2.5 text-[11px] font-bold text-black hover:bg-black hover:text-white">
                  Enrol to allowlist
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* roster */}
        <div className="mt-6 border border-white/15 bg-black">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
              <Users size={13} /> Allowlist · {roster.length} enrolled
            </span>
            <button
              onClick={() => setRoster(resetPersonnel())}
              className="font-mono text-[10px] text-zinc-500 hover:text-white"
            >
              reset demo roster
            </button>
          </div>
          <ul className="divide-y divide-white/8">
            {roster.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="h-9 w-9 shrink-0 overflow-hidden border border-white/12 bg-zinc-900">
                  {p.face ? (
                    <img src={p.face} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-zinc-600"><User size={14} /></span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-white">{p.name}</div>
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    {p.id} · {p.serviceId || "no ID"} · {p.category}
                    {p.vehiclePlate ? ` · ${p.vehiclePlate}` : ""}
                  </div>
                </div>
                <span className="hidden font-mono text-[10px] text-[#3ff09a] sm:inline">{p.clearance.split(" ")[0]}</span>
                <button onClick={() => drop(p.id)} className="text-zinc-600 hover:text-rose-400">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {roster.length === 0 && (
              <li className="px-4 py-6 text-center text-[11px] text-zinc-600">No personnel enrolled — every detection escalates.</li>
            )}
          </ul>
        </div>

        <p className="mt-4 text-center text-[10.5px] text-zinc-600">
          Demo build · client-side roster (src/lib/personnel.js). Authorised use only · Section 65B logging.
        </p>
      </div>
    </div>
  );
}
