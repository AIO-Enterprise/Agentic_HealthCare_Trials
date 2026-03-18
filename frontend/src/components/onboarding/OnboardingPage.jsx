/**
 * M9: Onboarding UI
 * Owner: Frontend Dev 1
 * Dependencies: onboardingAPI
 *
 * Multi-step wizard:
 * Step 1: Company name, logo (file upload), industry
 * Step 2: Admin registration
 * Step 3: Upload company documents (USP, Compliance, Policies, etc.)
 * Step 4: Trigger AI Training → initializes Curator + Reviewer skills
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onboardingAPI, authAPI } from "../../services/api";
import { Building2, UserPlus, FileUp, Cpu, Check, Upload, X, FileText } from "lucide-react";

const STEPS = [
  { label: "Company Info",      icon: Building2 },
  { label: "Admin Account",     icon: UserPlus },
  { label: "Upload Documents",  icon: FileUp },
  { label: "AI Training",       icon: Cpu },
];

const DOC_TYPES = [
  { value: "usp",               label: "Unique Selling Proposition" },
  { value: "compliance",        label: "Compliance Documents" },
  { value: "policy",            label: "Company Policies" },
  { value: "marketing_goal",    label: "Marketing Goals" },
  { value: "ethical_guideline", label: "Ethical Guidelines" },
  { value: "input",             label: "Input Documents / Briefs" },
];

export default function OnboardingPage() {
  const [step,         setStep]         = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const navigate = useNavigate();

  const [form, setForm] = useState({
    company_name: "", industry: "", logo_url: "",
    admin_email: "", admin_password: "", admin_name: "",
  });

  const [logoFile,    setLogoFile]    = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const logoInputRef = useRef(null);

  const [docs,    setDocs]    = useState([]);
  const [docForm, setDocForm] = useState({ doc_type: "usp", title: "", content: "" });

  const [companyId,    setCompanyId]    = useState(null);
  const [trainingDone, setTrainingDone] = useState(false);

  const updateForm = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      setError("Logo must be a JPEG or PNG file.");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError("");
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleRegister = async () => {
    setLoading(true); setError("");
    try {
      const res = await onboardingAPI.register(form);
      setCompanyId(res.company_id);
      const loginRes = await authAPI.login(form.admin_email, form.admin_password);
      localStorage.setItem("token", loginRes.access_token);
      setStep(2);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleUploadDoc = async () => {
    setLoading(true);
    try {
      const res = await onboardingAPI.uploadDocument(docForm.doc_type, docForm.title, docForm.content);
      setDocs((p) => [...p, res]);
      setDocForm({ doc_type: "usp", title: "", content: "" });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleTrain = async () => {
    setLoading(true); setError("");
    try {
      await onboardingAPI.triggerTraining();
      setTrainingDone(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">

      {/* Subtle grid background */}
      <div className="fixed inset-0" style={{
        backgroundColor: "var(--color-sidebar-bg)",
        backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
      }} />

      <div className="relative w-full max-w-lg">

        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="sidebar__logo-mark w-8 h-8 rounded-lg">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--color-sidebar-bg)" }} />
          </div>
          <span className="sidebar__app-name text-lg">AgenticMarketing</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((s, i) => {
            const done   = i < step;
            const active = i === step;
            const Icon   = s.icon;
            return (
              <React.Fragment key={i}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={done ? "wizard-step-dot--done" : active ? "wizard-step-dot--active" : "wizard-step-dot"}>
                    {done
                      ? <Check size={14} strokeWidth={3} style={{ color: "var(--color-sidebar-bg)" }} />
                      : <Icon  size={14} style={{ color: active ? "var(--color-sidebar-text-active)" : "var(--color-sidebar-text)" }} />
                    }
                  </div>
                  <span className={active ? "wizard-step-label--active" : done ? "wizard-step-label--done" : "wizard-step-label"}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={i < step ? "wizard-step-connector--done" : "wizard-step-connector"} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Wizard card */}
        <div className="onboarding-card">
          <div className="onboarding-card__accent-bar" />
          <div className="onboarding-card__body">

            {error && (
              <div className="alert--error mb-6">
                <X size={14} className="shrink-0" /> {error}
              </div>
            )}

            {/* ── Step 0: Company Info ── */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Company Info</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>Set up your company profile.</p>
                </div>

                <input
                  placeholder="Company Name *"
                  value={form.company_name}
                  onChange={(e) => updateForm("company_name", e.target.value)}
                  className="field-input"
                />
                <input
                  placeholder="Industry (e.g. SaaS, Retail, Finance)"
                  value={form.industry}
                  onChange={(e) => updateForm("industry", e.target.value)}
                  className="field-input"
                />

                {/* Logo upload */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-input-text)" }}>
                    Company Logo (optional)
                  </label>
                  {!logoPreview ? (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full border-2 border-dashed rounded-lg py-8 flex flex-col items-center gap-2 transition-colors"
                      style={{ borderColor: "var(--color-input-border)" }}
                    >
                      <Upload size={24} style={{ color: "var(--color-sidebar-text)" }} />
                      <span className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                        Click to upload JPEG or PNG
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-lg border"
                      style={{ borderColor: "var(--color-input-border)", backgroundColor: "var(--color-page-bg)" }}>
                      <img src={logoPreview} alt="logo preview" className="w-10 h-10 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--color-input-text)" }}>{logoFile?.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>
                          {(logoFile?.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button onClick={clearLogo} className="btn--icon">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </div>

                <button onClick={() => setStep(1)} disabled={!form.company_name} className="btn--primary-full">
                  Next: Admin Account →
                </button>
              </div>
            )}

            {/* ── Step 1: Admin Account ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Admin Account</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
                    Register the primary admin user (required).
                  </p>
                </div>

                <input placeholder="Full Name *"   value={form.admin_name}     onChange={(e) => updateForm("admin_name", e.target.value)}     className="field-input" />
                <input placeholder="Email *"       type="email" value={form.admin_email}    onChange={(e) => updateForm("admin_email", e.target.value)}    className="field-input" />
                <input placeholder="Password *"    type="password" value={form.admin_password} onChange={(e) => updateForm("admin_password", e.target.value)} className="field-input" />

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setStep(0)} className="btn--ghost flex-1 py-3">← Back</button>
                  <button
                    onClick={handleRegister}
                    disabled={loading || !form.admin_email || !form.admin_password || !form.admin_name}
                    className="btn--primary flex-1 py-3"
                  >
                    {loading ? "Registering…" : "Register & Continue →"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Upload Documents ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Company Documents</h2>
                  <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
                    Add your USP, compliance docs, policies, and guidelines.
                  </p>
                </div>

                <select value={docForm.doc_type} onChange={(e) => setDocForm((p) => ({ ...p, doc_type: e.target.value }))} className="field-select">
                  {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <input
                  placeholder="Document Title *"
                  value={docForm.title}
                  onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                  className="field-input"
                />

                <textarea
                  placeholder="Paste document content here…"
                  rows={4}
                  value={docForm.content}
                  onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                  className="field-textarea"
                />

                <button onClick={handleUploadDoc} disabled={loading || !docForm.title} className="btn--accent-full">
                  <FileUp size={15} />
                  {loading ? "Uploading…" : "Add Document"}
                </button>

                {docs.length > 0 && (
                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-card-border)" }}>
                    <div className="px-4 py-2.5 border-b" style={{ backgroundColor: "var(--color-page-bg)", borderColor: "var(--color-card-border)" }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-sidebar-text)" }}>
                        {docs.length} document{docs.length > 1 ? "s" : ""} added
                      </p>
                    </div>
                    {docs.map((d, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-0"
                        style={{ borderColor: "var(--color-card-border)" }}>
                        <FileText size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
                        <span className="text-sm flex-1" style={{ color: "#374151" }}>{d.title}</span>
                        <span className="text-xs capitalize" style={{ color: "var(--color-sidebar-text)" }}>
                          {d.doc_type?.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => setStep(3)} className="btn--primary-full">
                  Next: AI Training →
                </button>
              </div>
            )}

            {/* ── Step 3: AI Training ── */}
            {step === 3 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ backgroundColor: "var(--color-sidebar-bg)" }}>
                  <Cpu size={28} style={{ color: "var(--color-sidebar-text-active)" }} />
                </div>

                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>AI Skill Initialization</h2>
                  <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: "var(--color-sidebar-text)" }}>
                    Reads Curator and Reviewer skill templates, fills them with your company data,
                    and generates customized AI skills for your marketing pipeline.
                  </p>
                </div>

                {!trainingDone ? (
                  <button onClick={handleTrain} disabled={loading} className="btn--accent px-8 py-3">
                    {loading ? <><span className="spinner" /> Training AI Skills…</> : "Start Training"}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="alert--success justify-center">
                      <Check size={16} strokeWidth={2.5} /> Skills initialized successfully
                    </div>
                    <button onClick={() => navigate("/admin")} className="btn--primary-full">
                      Go to Dashboard →
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--color-sidebar-text)" }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium transition-colors"
            style={{ color: "var(--color-sidebar-text-active)" }}
            onMouseEnter={(e) => e.target.style.color = "var(--color-accent-hover)"}
            onMouseLeave={(e) => e.target.style.color = "var(--color-sidebar-text-active)"}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}