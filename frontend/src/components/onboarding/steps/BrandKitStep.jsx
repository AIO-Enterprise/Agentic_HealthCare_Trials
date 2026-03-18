import React, { useRef } from "react";
import { Check, Upload, X, FileText } from "lucide-react";
import {DEFAULT_PRESETS, BRAND_PRESETS } from "../Constants";
/**
 * Step 3 — Brand Kit (optional)
 * Two mutually exclusive choices:
 *   A) Pick an industry-matched preset
 *   B) Upload a brand guidelines PDF (AI extracts colors/fonts/tone during training)
 *
 * Props:
 *   industry        {string}   — from form.industry, used to match presets
 *   brand           {object}   — current brand state
 *   setBrand        {function} — update brand state
 *   selectedPreset  {string|null}
 *   setSelectedPreset {function}
 *   brandPdfFile    {File|null}
 *   setBrandPdfFile {function}
 *   setError        {function}
 *   onBack          {function}
 *   onNext          {function}
 *   onSkip          {function}
 */
export default function BrandKitStep({
  industry,
  brand, setBrand,
  selectedPreset, setSelectedPreset,
  brandPdfFile, setBrandPdfFile,
  setError,
  onBack, onNext, onSkip,
}) {
  const brandPdfRef = useRef(null);

  // Match industry string to a preset group, fallback to Technology
  const industryPresets = (() => {
    const key = Object.keys(BRAND_PRESETS).find(
      (k) => industry?.toLowerCase().includes(k.toLowerCase())
    );
    return key ? BRAND_PRESETS[key] : DEFAULT_PRESETS;
  })();

  const applyPreset = (preset) => {
    const { name, ...brandFields } = preset;
    setBrand(brandFields);
    setSelectedPreset(preset.name);
    // Clear PDF when a preset is chosen
    setBrandPdfFile(null);
    if (brandPdfRef.current) brandPdfRef.current.value = "";
  };

  const handleBrandPdfChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setBrandPdfFile(file);
    // Clear preset when a PDF is chosen
    setSelectedPreset(null);
    setError("");
  };

  const clearBrandPdf = () => {
    setBrandPdfFile(null);
    if (brandPdfRef.current) brandPdfRef.current.value = "";
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--color-input-text)" }}>Brand Kit</h2>
          <span style={{
            fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.05em",
            padding: "2px 8px", borderRadius: "999px",
            backgroundColor: "rgba(16,185,129,0.12)", color: "var(--color-accent)",
            border: "1px solid rgba(16,185,129,0.25)",
          }}>OPTIONAL</span>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--color-sidebar-text)" }}>
          Pick a starter preset, or upload your brand guidelines PDF — we'll do the rest.
        </p>
      </div>

      {/* ── Industry Presets ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-sidebar-text)" }}>
          Starter Presets
        </p>
        <div className="space-y-2">
          {industryPresets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: "10px", cursor: "pointer",
                border: `1px solid ${selectedPreset === preset.name ? "var(--color-accent)" : "var(--color-input-border)"}`,
                backgroundColor: selectedPreset === preset.name ? "rgba(16,185,129,0.08)" : "var(--color-input-bg)",
                display: "flex", alignItems: "center", gap: "12px", textAlign: "left",
                transition: "all 0.15s",
                opacity: brandPdfFile ? 0.4 : 1,
              }}
            >
              {/* Color swatch trio */}
              <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                {[preset.primaryColor, preset.secondaryColor, preset.accentColor].map((c, ci) => (
                  <div
                    key={ci}
                    style={{ width: "18px", height: "18px", borderRadius: "4px", backgroundColor: c, border: "1px solid rgba(0,0,0,0.15)" }}
                  />
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", marginBottom: "1px" }}>
                  {preset.name}
                </p>
                <p style={{ fontSize: "0.7rem", color: "var(--color-sidebar-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {preset.primaryFont} · {preset.adjectives}
                </p>
              </div>
              {selectedPreset === preset.name && (
                <Check size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── OR divider ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-input-border)" }} />
        <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", fontWeight: 500 }}>OR</span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-input-border)" }} />
      </div>

      {/* ── PDF Upload ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-sidebar-text)" }}>
          Upload Brand Guidelines PDF
        </p>

        {!brandPdfFile ? (
          <button
            type="button"
            onClick={() => brandPdfRef.current?.click()}
            className="w-full border-2 border-dashed rounded-lg py-7 flex flex-col items-center gap-2 transition-colors"
            style={{
              borderColor: "var(--color-input-border)",
              backgroundColor: "transparent",
              cursor: "pointer",
              opacity: selectedPreset ? 0.4 : 1,
            }}
          >
            <Upload size={22} style={{ color: "var(--color-sidebar-text)" }} />
            <span style={{ fontSize: "0.85rem", color: "var(--color-sidebar-text)" }}>
              Click to upload your brand guidelines
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)", opacity: 0.6 }}>
              PDF · AI will extract colors, fonts &amp; tone automatically
            </span>
          </button>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "12px 14px", borderRadius: "10px",
            border: "1px solid var(--color-accent)",
            backgroundColor: "rgba(16,185,129,0.08)",
          }}>
            <FileText size={18} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-input-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {brandPdfFile.name}
              </p>
              <p style={{ fontSize: "0.72rem", color: "var(--color-sidebar-text)" }}>
                {(brandPdfFile.size / 1024).toFixed(0)} KB · AI will parse this during training
              </p>
            </div>
            <Check size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
            <button
              type="button"
              onClick={clearBrandPdf}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}
            >
              <X size={14} style={{ color: "var(--color-sidebar-text)" }} />
            </button>
          </div>
        )}

        <input
          ref={brandPdfRef}
          type="file"
          accept="application/pdf"
          onChange={handleBrandPdfChange}
          className="hidden"
        />
      </div>

      {/* Navigation */}
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className="btn--ghost px-4 py-2 text-sm">← Back</button>
        <button
          onClick={onSkip}
          className="btn--ghost px-4 py-2 text-sm"
          style={{ color: "var(--color-sidebar-text)", marginLeft: "auto" }}
        >
          Skip
        </button>
        <button onClick={onNext} className="btn--primary px-5 py-2 text-sm">
          Save & Continue →
        </button>
      </div>
    </div>
  );
}