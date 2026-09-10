import { useEffect, useRef, useState } from "react";
import { Bot, X, CornerDownLeft, Sparkles } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   AssistantPanel — the "Sentinel Copilot" slide-over.

   Opens on Ctrl+K (or a double-tap of Ctrl, or the floating button).
   No LLM in this build: a keyword intent engine answers from the live
   console state (incidents, cameras, allowlist, sectors, evidence) and
   can deep-link the operator to a view.
   ═══════════════════════════════════════════════════════════════════════ */

const NAV_WORDS = {
  watchfloor: ["watchfloor", "command watchfloor", "home"],
  surveillance: ["surveillance", "live feeds", "cameras view", "3d terrain", "terrain"],
  incidents: ["incidents", "incident workspace", "alerts view"],
  map: ["border map", "map", "geo-fence", "geofence", "zone editor"],
  tracking: ["tracking", "targets", "target tracking"],
  reconstruction: ["reconstruction", "recon"],
  evidence: ["evidence vault", "evidence", "chain of custody", "65b"],
  analytics: ["analytics", "heatmap", "trends"],
  hardware: ["hardware", "actuators", "relay"],
  reports: ["reports"],
  settings: ["settings"],
};

function answer(qRaw, ctx) {
  const q = qRaw.toLowerCase().trim();
  const inc = ctx.incidents || [];
  const cams = ctx.cameras || [];

  // ── navigation ──
  if (/^(go to|open|show me|take me to|switch to|navigate to)\b/.test(q) || /\bview$/.test(q)) {
    for (const [nav, words] of Object.entries(NAV_WORDS)) {
      if (words.some((w) => q.includes(w))) {
        return { text: `Opening the ${words[0]} view.`, nav };
      }
    }
  }

  // ── help ──
  if (!q || /\b(help|what can you do|commands|hi|hello|hey)\b/.test(q)) {
    return {
      text:
        "I read the live sector state. Ask me about:\n• incidents / threats — a severity breakdown and the top event\n• cameras / feeds — online, stale and alerting nodes\n• allowlist — enrolled authorized personnel\n• sectors — the three terrain sectors\n• evidence — how the SHA-256 chain works\nOr say “open incidents”, “open analytics”, etc.",
    };
  }

  // ── incidents / threats ──
  if (/\b(incident|threat|alert|event)s?\b/.test(q) && !/camera|feed|cctv/.test(q)) {
    if (!inc.length) return { text: "No incidents on the board right now." };
    const bySev = inc.reduce((m, i) => ((m[i.severity] = (m[i.severity] || 0) + 1), m), {});
    const top = [...inc].sort((a, b) => b.threat - a.threat)[0];
    const parts = Object.entries(bySev).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ");
    let text = `${inc.length} incidents — ${parts}.\nHighest: ${top.id} on ${top.cameras || top.cam} — ${top.type}, threat ${top.threat}/100 (${top.severity}).`;
    if (/why|explain|breakdown|factor/.test(q) && top.factors?.length) {
      text += "\n\nScore breakdown:\n" + top.factors.map((f) => `• ${f.label}`).join("\n");
    }
    return { text };
  }

  // ── cameras ──
  if (/\b(camera|feed|cctv|node)s?\b/.test(q) || /\b(online|offline|stale|down)\b/.test(q)) {
    const by = cams.reduce((m, c) => ((m[c.status] = (m[c.status] || 0) + 1), m), {});
    const alerting = cams.filter((c) => c.status === "ALERT").map((c) => c.name || c.id);
    const stale = cams.filter((c) => c.status === "STALE").map((c) => c.name || c.id);
    let text = `${cams.length} feeds — ${Object.entries(by).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ")}.`;
    if (alerting.length) text += `\nAlerting: ${alerting.join(", ")}.`;
    if (stale.length && /stale|down|offline/.test(q)) text += `\nStale: ${stale.join(", ")}.`;
    return { text };
  }

  // ── allowlist / personnel ──
  if (/\b(allowlist|authoriz|personnel|registered|friend|patrol staff|officer)s?\b/.test(q)) {
    return {
      text: `${ctx.allowlistCount} authorized personnel are enrolled. A face or plate match against the allowlist inside a restricted zone is tagged “authorized” and the incident is cleared, not escalated. Enrol more at /register.`,
    };
  }

  // ── sectors ──
  if (/\b(sector|terrain|border|alpine|desert|thar|river|bridge)s?\b/.test(q)) {
    return {
      text:
        "Three terrain sectors are configured:\n• Sector 4-B — Alpine Ridge Frontier (SSB)\n• Sector 8-A — Thar Desert Frontier (BSF)\n• Sector 2-C — River Bridge Crossing (SSB)\nSwitch between them in the 3D terrain view.",

    };
  }

  // ── evidence ──
  if (/\b(evidence|hash|sha-?256|chain|custody|65b|tamper)\b/.test(q)) {
    return {
      text:
        "Every snapshot, bounding box and operator action is SHA-256 hash-chained the moment it's written. Edit one capsule and every capsule after it fails verification. A Section 65B certificate template is generated alongside.",

    };
  }

  // ── threat scoring ──
  if (/\b(score|scoring|weight|rule|how.*work|0-?100)\b/.test(q)) {
    return {
      text:
        "The 0–100 threat score is an additive rule sum — e.g. +30 restricted-zone breach, +20 heading toward the zero line, +12 cross-camera Re-ID match, +10 night-curfew window. No black-box model in the decision path.",
    };
  }

  return {
    text:
      "I didn't catch that. I can talk about incidents, cameras, the authorized-personnel allowlist, sectors, evidence and threat scoring — or open any console view for you.",
  };
}

export default function AssistantPanel({ open, onClose, context, onNavigate }) {
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "Sentinel Copilot online. Ask about incidents, cameras, the allowlist or a sector — or type “help”." },
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setTimeout(() => {
      const res = answer(t, context);
      setMsgs((m) => [...m, { role: "bot", text: res.text, nav: res.nav }]);
      if (res.nav) onNavigate?.(res.nav);
    }, 260);
  };

  if (!open) return null;

  const chips = ["Any critical incidents?", "Camera status", "How many on the allowlist?", "Explain the threat score"];

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-md flex-col border-l border-white/12 bg-[#000000] shadow-2xl animate-fadeIn"
      >
        <div className="flex items-center justify-between border-b border-white/12 px-4 py-3">
          <span className="flex items-center gap-2 font-heading text-[13px] font-bold text-white">
            <Bot size={15} className="text-[#3ff09a]" /> Sentinel Copilot
          </span>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center border border-white/20 text-white/60 hover:bg-white hover:text-black">
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap border px-3 py-2 text-[12px] leading-relaxed ${
                  m.role === "user"
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-[#3ff09a]/25 bg-[#3ff09a]/[0.06] text-white/85"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {msgs.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-4 pt-3">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                className="flex items-center gap-1 border border-white/15 px-2 py-1 text-[10.5px] text-white/60 hover:border-white/40 hover:text-white"
              >
                <Sparkles size={9} /> {c}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2 border-t border-white/12 px-3 py-3"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the Copilot…"
            className="flex-1 border border-white/15 bg-black px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-white/45 focus:outline-none"
          />
          <button type="submit" className="grid h-9 w-9 place-items-center border border-white bg-white text-black hover:bg-black hover:text-white">
            <CornerDownLeft size={13} />
          </button>
        </form>
        <div className="border-t border-white/10 px-4 py-1.5 text-center text-[9.5px] text-white/30">
          Ctrl+K to toggle · demo assistant, reads live console state
        </div>
      </div>
    </div>
  );
}
