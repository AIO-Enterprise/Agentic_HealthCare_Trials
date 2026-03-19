/**
 * Step 1 — Admin Account
 * Collects name, email, password for the primary admin user.
 * Calls onRegister which hits the API and advances to step 2 on success.
 *
 * Props:
 *   form         {object}   — shared form state { admin_name, admin_email, admin_password }
 *   updateForm   {function} — (key, value) => void
 *   loading      {boolean}  — unused here, kept for prop-shape consistency
 *   onBack       {function} — navigate back to step 0
 *   onRegister   {function} — advances to step 2 (actual registration deferred to Step 4)
 */
export default function AdminAccountStep({ form, updateForm, loading, onBack, onRegister }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Admin Account</h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Register the primary admin user (required).
        </p>
      </div>

      <input
        placeholder="Full Name *"
        value={form.admin_name}
        onChange={(e) => updateForm("admin_name", e.target.value)}
        className="field-input"
      />
      <input
        placeholder="Email *"
        type="email"
        value={form.admin_email}
        onChange={(e) => updateForm("admin_email", e.target.value)}
        className="field-input"
      />
      <input
        placeholder="Password *"
        type="password"
        value={form.admin_password}
        onChange={(e) => updateForm("admin_password", e.target.value)}
        className="field-input"
      />

      <div className="flex gap-3 pt-1">
        <button onClick={onBack} className="btn--ghost flex-1 py-3">
          ← Back
        </button>
        <button
          onClick={onRegister}
          disabled={!form.admin_email || !form.admin_password || !form.admin_name}
          className="btn--primary flex-1 py-3"
        >
          "Save & Continue →"
        </button>
      </div>
    </div>
  );
}