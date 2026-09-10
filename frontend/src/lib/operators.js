/* ═══════════════════════════════════════════════════════════════════════
   Demo operator directory for the /login page.

   CLIENT-SIDE ONLY. This hackathon build has no auth backend, so the
   "directory" is this file. Replace `authenticate()` with a real
   `POST /auth/login` call when the backend exposes one — the LoginPage
   only depends on the { ok, error, operator } shape it returns.

   Single demo credential: id "abc" / passphrase "123" (MFA optional).
   ═══════════════════════════════════════════════════════════════════════ */

export const OPERATORS = [
  { id: "abc", pass: "123", mfa: "", name: "Demo Operator", role: "Command Operator" },
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
