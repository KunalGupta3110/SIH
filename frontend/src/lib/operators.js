/* ═══════════════════════════════════════════════════════════════════════
   Demo operator directory for the /login page.

   CLIENT-SIDE ONLY. This hackathon build has no auth backend, so the
   "directory" is this file. Replace `authenticate()` with a real
   `POST /auth/login` call when the backend exposes one — the LoginPage
   only depends on the { ok, error, operator } shape it returns.

   Sector codes: SSB = Sashastra Seema Bal · GDP = Gurdaspur sector ·
   BSF = Border Security Force · IBVAP = platform service account.
   ═══════════════════════════════════════════════════════════════════════ */

export const OPERATORS = [
  { id: "SSB-GDP-01",   pass: "Ganga@Watch01",       mfa: "402913", name: "Cdr. A. Rautela",  role: "Duty Commander" },
  { id: "SSB-GDP-04",   pass: "Ravi-Sector-4471",    mfa: "118605", name: "Ops. S. Kaur",     role: "Command Operator" },
  { id: "SSB-GDP-07",   pass: "NightPatrol#07",      mfa: "774320", name: "Sub-Insp. M. Thapa", role: "Watch Officer" },
  { id: "BSF-INT-12",   pass: "Falcon.Delta.19",     mfa: "560184", name: "Anl. P. Menon",    role: "Intel Analyst" },
  { id: "IBVAP-SYS-00", pass: "Sentinel_root_2026",  mfa: "903117", name: "root",             role: "System Administrator" },
  { id: "SSB-GDP-19",   pass: "QRT-Bravo-8890",      mfa: "245079", name: "Insp. D. Negi",    role: "QRT Lead" },
];

// case-insensitive on the ID, exact on the passphrase; MFA only checked
// when the operator supplies one (the field is optional in the demo).
export function authenticate(id, pass, mfa) {
  const op = OPERATORS.find(
    (o) => o.id.trim().toLowerCase() === String(id).trim().toLowerCase()
  );
  if (!op || op.pass !== pass) {
    return { ok: false, error: "Invalid Operator ID or passphrase." };
  }
  if (mfa && String(mfa).trim() && String(mfa).trim() !== op.mfa) {
    return { ok: false, error: "MFA token rejected." };
  }
  return { ok: true, operator: { id: op.id, name: op.name, role: op.role } };
}
