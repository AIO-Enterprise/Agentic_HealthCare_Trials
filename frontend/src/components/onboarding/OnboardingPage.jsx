/**
 * M9: Onboarding UI
 * Owner: Frontend Dev 1
 * Dependencies: onboardingAPI, authAPI
 *
 * This file is the orchestrator only — state, API calls, and navigation logic.
 * Each step's UI lives in its own file under ./steps/.
 *
 * File structure:
 *   onboarding/
 *   ├── OnboardingPage.jsx        ← you are here
 *   ├── StepIndicator.jsx         ← top progress bar
 *   ├── constants.js              ← STEPS, DOC_TYPES, BRAND_PRESETS
 *   └── steps/
 *       ├── CompanyInfoStep.jsx   ← step 0
 *       ├── AdminAccountStep.jsx  ← step 1
 *       ├── UploadDocumentsStep.jsx ← step 2
 *       ├── BrandKitStep.jsx      ← step 3
 *       └── AITrainingStep.jsx    ← step 4
 *
 * Navigation rules:
 *  - Already-visited steps are clickable (click dot/label to jump back).
 *  - Future steps are not accessible until reached.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardingAPI, authAPI } from "../../services/api";
import { X } from "lucide-react";

import StepIndicator        from "./StepIndicator";
import CompanyInfoStep      from "./steps/CompanyInfoStep";
import AdminAccountStep     from "./steps/AdminAccountStep";
import UploadDocumentsStep  from "./steps/UploadDocumentsStep";
import BrandKitStep         from "./steps/BrandKitStep";
import AITrainingStep       from "./steps/AiTrainingStep";
import ErrorBoundary        from "./ErrorBoundary";

// Tracks the highest step index the user has legitimately reached,
// so they can navigate back to any previous step freely.
function useHighWaterMark(step) {
  const [hwm, setHwm] = useState(0);
  React.useEffect(() => {
    setHwm((prev) => Math.max(prev, step));
  }, [step]);
  return hwm;
}

export default function OnboardingPage() {
  const navigate = useNavigate();

  // ── Wizard state ────────────────────────────────────────────────────────
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const highWaterMark = useHighWaterMark(step);

  // ── Step 0 & 1: shared form ──────────────────────────────────────────────
  const [form, setForm] = useState({
    company_name: "", industry: "", logo_url: "",
    admin_email: "", admin_password: "", admin_name: "",
  });
  const updateForm = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Step 1: registration result ─────────────────────────────────────────
  const [companyId, setCompanyId] = useState(null);

  // ── Step 2: documents ────────────────────────────────────────────────────
  const [docs, setDocs] = useState([]);  // each entry: { doc_type, title, file, file_name, file_size, file_type }

  // ── Step 3: brand kit ────────────────────────────────────────────────────
  const [brand, setBrand] = useState({
    primaryColor: "#10b981", secondaryColor: "#0f172a", accentColor: "#6366f1",
    primaryFont: "DM Sans", secondaryFont: "Merriweather",
    adjectives: "", dos: "", donts: "",
  });
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [brandPdfFile,   setBrandPdfFile]   = useState(null);

  // ── Step 4: training ─────────────────────────────────────────────────────
  const [trainingDone, setTrainingDone] = useState(false);

  // ── Navigation helpers ───────────────────────────────────────────────────
  const goToStep = (i) => {
    if (i <= highWaterMark) { setError(""); setStep(i); }
  };

  // ── API handlers ─────────────────────────────────────────────────────────
  // Step 1 — just validates fields and advances; no API call yet.
  // Actual registration happens in handleTrain (Step 4) so an account
  // is only created once the user completes the full onboarding flow.
  const handleAdvanceFromAdmin = () => {
    setError("");
    setStep(2);
  };

  const handleTrain = async () => {
    setLoading(true); setError("");
    try {
      // Register the company + admin account first (deferred from Step 1)
      const res = await onboardingAPI.register(form);
      setCompanyId(res.company_id);

      // Log in to get the auth token before hitting protected endpoints
      const loginRes = await authAPI.login(form.admin_email, form.admin_password);
      localStorage.setItem("token", loginRes.access_token);

      // Now kick off AI skill training with all collected data
      await onboardingAPI.triggerTraining();
      setTrainingDone(true);
    } catch (err) {
      setError(err?.message || "Setup failed. Please try again.");
    } finally { setLoading(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem",
      backgroundColor: "var(--color-sidebar-bg)",
      backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
    }}>
      <div style={{ width: "100%", maxWidth: "32rem" }}>

        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "40px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            backgroundColor: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "var(--color-sidebar-bg)" }} />
          </div>
          <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.02em" }}>
            AgenticMarketing
          </span>
        </div>

        {/* Step progress indicator */}
        <StepIndicator currentStep={step} onStepClick={goToStep} />

        {/* Wizard card */}
        <div className="onboarding-card">
          <div className="onboarding-card__accent-bar" />
          <div className="onboarding-card__body">

            {error && (
              <div className="alert--error mb-6">
                <X size={14} className="shrink-0" /> {error}
              </div>
            )}

            <ErrorBoundary>
            {step === 0 && (
              <CompanyInfoStep
                form={form}
                updateForm={updateForm}
                onNext={() => setStep(1)}
                setError={setError}
              />
            )}

            {step === 1 && (
              <AdminAccountStep
                form={form}
                updateForm={updateForm}
                loading={loading}
                onBack={() => goToStep(0)}
                onRegister={handleAdvanceFromAdmin}
              />
            )}

            {step === 2 && (
              <UploadDocumentsStep
                docs={docs}
                onAddDoc={(entry) => setDocs((p) => [...p, entry])}
                onRemoveDoc={(i) => setDocs((p) => p.filter((_, idx) => idx !== i))}
                loading={loading}
                onBack={() => goToStep(1)}
                onNext={() => setStep(3)}
              />
            )}

            {step === 3 && (
              <BrandKitStep
                industry={form.industry}
                brand={brand}
                setBrand={setBrand}
                selectedPreset={selectedPreset}
                setSelectedPreset={setSelectedPreset}
                brandPdfFile={brandPdfFile}
                setBrandPdfFile={setBrandPdfFile}
                setError={setError}
                onBack={() => goToStep(2)}
                onNext={() => setStep(4)}
                onSkip={() => setStep(4)}
              />
            )}

            {step === 4 && (
              <AITrainingStep
                loading={loading}
                trainingDone={trainingDone}
                onTrain={handleTrain}
                onBack={() => goToStep(3)}
                onFinish={() => navigate("/admin")}
              />
            )}

            </ErrorBoundary>

          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#4b5563" }}>
          Already have an account?{" "}
          <a href="/login" className="font-medium" style={{ color: "var(--color-sidebar-text-active)" }}>
            Sign in
          </a>
        </p>

      </div>
    </div>
  );
}