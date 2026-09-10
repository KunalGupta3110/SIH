/* ═══════════════════════════════════════════════════════════════════════
   Authorized-personnel roster (friend-force allowlist).

   Officers, patrol staff and marked vehicles enrolled here are added to
   the analytics allowlist. When the pipeline's face-recognition / ANPR
   stage matches an enrolled subject, the detection is tagged
   `authorized` and the incident is CLEARED instead of escalated to the
   watchfloor — so a routine patrol inside a restricted zone does not
   trip a threat alert.

   Demo build: stored client-side in localStorage. Swap listPersonnel() /
   enrollPersonnel() for the backend `enrolled_people` table when the
   enrolment API is wired.
   ═══════════════════════════════════════════════════════════════════════ */

const KEY = "ibvap.personnel";

export const CLEARANCE = ["Alpha (full sector)", "Bravo (patrol only)", "Charlie (escort / visitor)"];
export const CATEGORIES = ["Officer", "Patrol staff", "QRT", "Engineer / technician", "Liaison / visitor"];

const SEED = [
  {
    id: "AUTH-001",
    name: "Sub-Insp. R. Chauhan",
    serviceId: "SSB/GDP/22187",
    category: "Patrol staff",
    unit: "SSB 44 Bn · Patrol Alpha",
    clearance: "Bravo (patrol only)",
    phone: "+91 98••• ••712",
    vehiclePlate: "",
    face: "",
    enrolledAt: "2026-09-02T04:10:00Z",
    enrolledBy: "abc",
  },
  {
    id: "AUTH-002",
    name: "Insp. D. Negi",
    serviceId: "SSB/GDP/19004",
    category: "QRT",
    unit: "QRT Bravo",
    clearance: "Alpha (full sector)",
    phone: "+91 90••• ••889",
    vehiclePlate: "PB 08 QR 0042",
    face: "",
    enrolledAt: "2026-09-05T22:31:00Z",
    enrolledBy: "abc",
  },
];

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode / cleared storage */
  }
  return SEED;
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore — the list still lives in memory for this session */
  }
}

export function listPersonnel() {
  return read();
}

export function enrollPersonnel(record) {
  const list = read();
  const n = list.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ""), 10) || 0), 0);
  const entry = {
    id: `AUTH-${String(n + 1).padStart(3, "0")}`,
    name: record.name?.trim() || "Unnamed",
    serviceId: record.serviceId?.trim() || "",
    category: record.category || CATEGORIES[0],
    unit: record.unit?.trim() || "",
    clearance: record.clearance || CLEARANCE[1],
    phone: record.phone?.trim() || "",
    vehiclePlate: (record.vehiclePlate || "").trim().toUpperCase(),
    face: record.face || "",
    enrolledAt: new Date().toISOString(),
    enrolledBy: record.enrolledBy || "operator",
  };
  const next = [entry, ...list];
  write(next);
  return entry;
}

export function removePersonnel(id) {
  const next = read().filter((p) => p.id !== id);
  write(next);
  return next;
}

export function resetPersonnel() {
  write(SEED);
  return SEED;
}
