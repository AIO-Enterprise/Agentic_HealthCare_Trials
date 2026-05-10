/**
 * Shared: PreviewPanel
 * Used by: EthicsDashboard, ReviewerDashboard
 *
 * Shows generated ad creatives and website preview for a selected campaign.
 * Allows regeneration with optional improvement instructions.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect, useRef } from "react";
import { SectionCard, CampaignStatusBadge } from "./Layout";
import { adsAPI } from "../../services/api";
import {
  Image, Globe, Download, Eye, Loader2,
  Sparkles, ImageOff, MonitorSmartphone, Clapperboard,
  Volume2, VolumeX,
} from "lucide-react";


// ─── Creative card grid ───────────────────────────────────────────────────────

function CreativesGrid({ creatives }) {
  const [lightbox, setLightbox] = useState(null);

  if (!creatives?.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-sidebar-text)" }}>
        <ImageOff size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
        <p style={{ fontSize: 13, fontWeight: 500 }}>No ad creatives generated yet.</p>
        <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Use the Regenerate panel below to generate them.</p>
      </div>
    );
  }

  return (
    <>
      {/* Lightbox — centred in viewport */}
      {lightbox && (
        <>
          <div
            onClick={() => setLightbox(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "fixed", zIndex: 1000,
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.endsWith(".mp4") ? (
              <video
                src={lightbox}
                autoPlay loop muted playsInline
                style={{ maxHeight: "80vh", maxWidth: "80vw", display: "block" }}
              />
            ) : (
              <img
                src={lightbox}
                alt="Ad creative"
                style={{ maxHeight: "80vh", maxWidth: "80vw", display: "block", objectFit: "contain" }}
              />
            )}
            <button
              onClick={() => setLightbox(null)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6,
                padding: "3px 6px", cursor: "pointer", color: "#fff",
                display: "flex", alignItems: "center", fontSize: 16,
              }}
            >✕</button>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
        {creatives.map((c, i) => (
          <div
            key={i}
            style={{
              borderRadius: 16,
              border: "2px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)",
              boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
              overflow: "visible",
              padding: "10px 10px 0 10px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Image area */}
            <div style={{
              position: "relative",
              backgroundColor: "var(--color-page-bg)",
              overflow: "hidden",
              maxHeight: 220,
              maxWidth: "100%",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}>
              {c.image_url ? (
                c.image_url.endsWith(".mp4") ? (
                  <video
                    src={c.image_url}
                    autoPlay loop muted playsInline
                    style={{ maxHeight: 220, maxWidth: "100%", width: "auto", height: "auto", display: "block" }}
                  />
                ) : (
                  <img
                    src={c.image_url}
                    alt={c.headline}
                    style={{ maxHeight: 220, maxWidth: "100%", width: "auto", height: "auto", display: "block" }}
                  />
                )
              ) : (
                <div style={{
                  width: "100%", height: "100%", minHeight: 140,
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 8, color: "var(--color-sidebar-text)",
                }}>
                  <Image size={24} style={{ opacity: 0.3 }} />
                  <p style={{ fontSize: "0.72rem", opacity: 0.5 }}>Image not generated</p>
                </div>
              )}

              {/* Format badge */}
              <span style={{
                position: "absolute", top: 8, left: 8,
                fontSize: "0.65rem", fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)",
              }}>
                {c.format}
              </span>

              {/* View full size */}
              {c.image_url && (
                <button
                  onClick={() => setLightbox(c.image_url)}
                  title="View full size"
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6,
                    padding: "4px 6px", cursor: "pointer",
                    display: "flex", alignItems: "center", color: "#fff",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <Eye size={12} />
                </button>
              )}
            </div>

            {/* Copy */}
            <div style={{ padding: 16, textAlign: "center", width: "100%" }}>
              <p style={{
                fontSize: "0.98rem", fontWeight: 700,
                color: "var(--color-input-text)", marginBottom: 6, lineHeight: 1.3,
              }}>
                {c.headline}
              </p>
              <p style={{
                fontSize: "0.82rem", color: "var(--color-sidebar-text)",
                lineHeight: 1.6, marginBottom: 12,
              }}>
                {c.body}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <span style={{
                  fontSize: "0.75rem", fontWeight: 600,
                  padding: "4px 12px", borderRadius: 999,
                  backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
                  color: "var(--color-accent)",
                  border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                }}>
                  {c.cta}
                </span>
                {c.image_url && (
                  <a
                    href={c.image_url}
                    download
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: "0.72rem", color: "var(--color-sidebar-text)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={11} /> Download
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Shorts grid ─────────────────────────────────────────────────────────────

function ShortVideoCard({ short, onExpand }) {
  const videoRef     = useRef(null);
  const [muted, setMuted] = useState(true);

  const toggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    if (!next && v.paused) v.play().catch(() => {});
    setMuted(next);
  };

  return (
    <div style={{
      position: "relative",
      aspectRatio: "9/16",
      backgroundColor: "#000",
      overflow: "hidden",
    }}>
      <video
        ref={videoRef}
        src={short.image_url}
        autoPlay loop muted playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {/* Format badge */}
      <span style={{
        position: "absolute", top: 8, left: 8,
        fontSize: "0.6rem", fontWeight: 700, padding: "2px 7px", borderRadius: 4,
        backgroundColor: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)",
      }}>
        {short.format}
      </span>
      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        style={{
          position: "absolute", bottom: 8, left: 8,
          background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 999,
          width: 28, height: 28, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", backdropFilter: "blur(4px)",
        }}
      >
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
      {/* Expand */}
      <button
        onClick={onExpand}
        title="View full size"
        style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6,
          padding: "4px 6px", cursor: "pointer",
          display: "flex", alignItems: "center", color: "#fff",
          backdropFilter: "blur(4px)",
        }}
      >
        <Eye size={12} />
      </button>
    </div>
  );
}

function ShortsGrid({ shorts }) {
  const [lightbox, setLightbox] = useState(null);

  if (!shorts?.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-sidebar-text)" }}>
        <Clapperboard size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
        <p style={{ fontSize: 13, fontWeight: 500 }}>No shorts generated yet.</p>
        <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Use the Generate Shorts button below.</p>
      </div>
    );
  }

  return (
    <>
      {lightbox && (
        <>
          <div
            onClick={() => setLightbox(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(3px)" }}
          />
          <div
            style={{
              position: "fixed", zIndex: 1000,
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={lightbox}
              autoPlay loop muted playsInline
              style={{ maxHeight: "80vh", maxWidth: "80vw", display: "block" }}
            />
            <button
              onClick={() => setLightbox(null)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6,
                padding: "3px 6px", cursor: "pointer", color: "#fff",
                display: "flex", alignItems: "center", fontSize: 16,
              }}
            >✕</button>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 18 }}>
        {shorts.map((s, i) => (
          <div
            key={i}
            style={{
              borderRadius: 16,
              border: "2px solid var(--color-card-border)",
              backgroundColor: "var(--color-card-bg)",
              boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Video — 9:16 portrait with mute toggle */}
            <ShortVideoCard short={s} onExpand={() => setLightbox(s.image_url)} />

            {/* Copy */}
            <div style={{ padding: "12px 14px", textAlign: "center" }}>
              <p style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--color-input-text)", marginBottom: 4, lineHeight: 1.3 }}>
                {s.headline}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }}>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 600,
                  padding: "3px 10px", borderRadius: 999,
                  backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.12)",
                  color: "var(--color-accent)",
                  border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                }}>
                  {s.cta}
                </span>
                <a
                  href={s.image_url}
                  download
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: "0.68rem", color: "var(--color-sidebar-text)", textDecoration: "none",
                  }}
                >
                  <Download size={10} /> Save
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Website preview pane ─────────────────────────────────────────────────────

function WebsitePane({ ad }) {
  if (!ad.output_url) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-sidebar-text)" }}>
        <Globe size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
        <p style={{ fontSize: 13, fontWeight: 500 }}>No website generated yet.</p>
        <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Use the Regenerate panel below to generate it.</p>
      </div>
    );
  }

  // Use src (not srcDoc) so the iframe has a real origin (localhost:5173).
  // srcDoc always gives a null origin, breaking fetch('/api/chat').
  // The backend exempts /website endpoints from X-Frame-Options: DENY.
  const previewUrl = adsAPI.websitePreviewUrl(ad.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <a
          href={adsAPI.websiteDownloadUrl(ad.id)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 500, color: "var(--color-accent)",
            textDecoration: "none",
          }}
        >
          <Download size={13} /> Download HTML
        </a>
      </div>

      <iframe
        key={previewUrl}
        src={previewUrl}
        title="Website Preview"
        style={{
          width: "100%", height: 560,
          border: "1px solid var(--color-card-border)",
          borderRadius: 10,
        }}
      />
    </div>
  );
}

// ─── Main PreviewPanel ────────────────────────────────────────────────────────

export default function PreviewPanel({ ads }) {
  // currentAd is the live copy — updated after regeneration
  const [currentAd,    setCurrentAd]    = useState(null);
  const [previewTab,   setPreviewTab]   = useState("creatives"); // "creatives" | "website"
  const [instructions, setInstructions] = useState("");
  const [regenState,   setRegenState]   = useState(null); // null | "creatives" | "website"
  const [error,        setError]        = useState(null);

  // All non-draft ads are previewable
  const previewable = ads.filter((a) => a.status !== "draft");

  const handleSelectAd = (ad) => {
    setCurrentAd(ad);
    setPreviewTab("creatives");
    setError(null);
  };


  const handleRegen = async (type) => {
    if (!currentAd) return;
    setError(null);
    setRegenState(type);
    try {
      if (type !== "shorts" && instructions.trim()) {
        await adsAPI.rewriteStrategy(currentAd.id, { instructions: instructions.trim() });
      }
      const beforeUpdatedAt  = currentAd.updated_at;
      const beforeShortsLen  = currentAd.shorts_files?.length ?? -1;
      if (type === "creatives") {
        await adsAPI.generateCreatives(currentAd.id);
        setPreviewTab("creatives");
      } else if (type === "shorts") {
        await adsAPI.generateShorts(currentAd.id);
        setPreviewTab("shorts");
      } else {
        await adsAPI.generateWebsite(currentAd.id);
        setPreviewTab("website");
      }
      const timeoutMs = type === "website" ? 600_000 : 300_000;
      // For shorts: also treat a shorts_files change as "done" (handles fast completion)
      const isDone = type === "shorts"
        ? (latest) => latest.updated_at !== beforeUpdatedAt || (latest.shorts_files?.length ?? -1) !== beforeShortsLen
        : (latest) => latest.updated_at !== beforeUpdatedAt;
      const deadline = Date.now() + timeoutMs;
      let fresh;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          fresh = await adsAPI.get(currentAd.id);
          if (isDone(fresh)) break;
          fresh = null;
        } catch (err) {
          const msg = String(err?.message || "");
          if (!/HTTP 5\d\d|503|502|504|Failed to fetch|NetworkError/i.test(msg)) throw err;
        }
      }
      if (!fresh) throw new Error("Timed out waiting for generation. Please refresh.");
      setCurrentAd(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenState(null);
    }
  };

  const adTypeList = Array.isArray(currentAd?.ad_type)
    ? currentAd.ad_type
    : currentAd?.ad_type
    ? [currentAd.ad_type]
    : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

      {/* ── Campaign selector ── */}
      <SectionCard title="Campaigns" subtitle="Select to preview">
        <div style={{ maxHeight: 560, overflowY: "auto" }}>
          {previewable.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-sidebar-text)", padding: "12px 0" }}>
              No campaigns available yet.
            </p>
          ) : (
            previewable.map((ad) => {
              const isActive = currentAd?.id === ad.id;
              const creativeCount = ad.output_files?.length ?? 0;
              const hasWebsite = !!ad.output_url;
              return (
                <button
                  key={ad.id}
                  onClick={() => handleSelectAd(ad)}
                  style={{
                    width: "100%", textAlign: "left", background: "none", border: "none",
                    cursor: "pointer", padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                    backgroundColor: isActive
                      ? "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.08)"
                      : "transparent",
                    outline: isActive ? "2px solid var(--color-accent)" : "none",
                    outlineOffset: -2, transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-card-bg)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-input-text)", lineHeight: 1.3, flex: 1 }}>
                      {ad.title}
                    </p>
                    <CampaignStatusBadge status={ad.status} />
                  </div>
                  <p style={{ fontSize: 11, color: "var(--color-sidebar-text)", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {creativeCount > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Image size={10} /> {creativeCount} creative{creativeCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {hasWebsite && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Globe size={10} /> website
                      </span>
                    )}
                    {!creativeCount && !hasWebsite && (
                      <span style={{ opacity: 0.6 }}>nothing generated yet</span>
                    )}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </SectionCard>

      {/* ── Preview area ── */}
      {currentAd ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Campaign header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10,
            padding: "14px 18px",
            border: "1px solid var(--color-card-border)",
            borderRadius: 12,
            backgroundColor: "var(--color-card-bg)",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <MonitorSmartphone size={16} style={{ color: "var(--color-accent)" }} />
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-input-text)", margin: 0 }}>
                  {currentAd.title}
                </h2>
              </div>
              <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 4, marginLeft: 26 }}>
                {adTypeList.join(", ")}
                {currentAd.platforms?.length ? ` · ${currentAd.platforms.join(", ")}` : ""}
                {currentAd.budget ? ` · $${currentAd.budget.toLocaleString()}` : ""}
              </p>
            </div>
            <CampaignStatusBadge status={currentAd.status} />
          </div>

          {/* Content tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewTab("creatives")}
              className={previewTab === "creatives" ? "filter-tab--active" : "filter-tab"}
            >
              Ad Creatives
              {currentAd.output_files?.length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 99,
                  backgroundColor: previewTab === "creatives"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)",
                  color: previewTab === "creatives" ? "inherit" : "var(--color-accent)",
                }}>
                  {currentAd.output_files.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setPreviewTab("shorts")}
              className={previewTab === "shorts" ? "filter-tab--active" : "filter-tab"}
            >
              <Clapperboard size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Shorts
              {currentAd.shorts_files?.length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 99,
                  backgroundColor: previewTab === "shorts"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)",
                  color: previewTab === "shorts" ? "inherit" : "var(--color-accent)",
                }}>
                  {currentAd.shorts_files.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setPreviewTab("website")}
              className={previewTab === "website" ? "filter-tab--active" : "filter-tab"}
            >
              Website
              {currentAd.output_url && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  padding: "1px 6px", borderRadius: 99,
                  backgroundColor: previewTab === "website"
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.15)",
                  color: previewTab === "website" ? "inherit" : "var(--color-accent)",
                }}>
                  ✓
                </span>
              )}
            </button>
          </div>

          {/* Preview content */}
          <SectionCard>
            {previewTab === "creatives" && <CreativesGrid creatives={currentAd.output_files} />}
            {previewTab === "shorts"    && <ShortsGrid shorts={currentAd.shorts_files} />}
            {previewTab === "website"   && <WebsitePane ad={currentAd} />}
          </SectionCard>

          {/* ── Regenerate controls ── */}
          <SectionCard
            title="Regenerate"
            subtitle="Optionally describe improvements before regenerating"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Error banner */}
              {error && (
                <div className="alert--error">{error}</div>
              )}

              {/* Instructions */}
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder={
                  "Optional: describe what to improve — e.g.\n" +
                  "\"Make the tone more empathetic and focused on patient outcomes\"\n" +
                  "\"Add urgency to the CTA, target participants aged 40–60\""
                }
                className="field-textarea"
                disabled={!!regenState}
              />

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => handleRegen("creatives")}
                  disabled={!!regenState}
                  className={previewTab === "creatives" ? "btn--accent" : "btn--ghost"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {regenState === "creatives"
                    ? <Loader2 size={14} style={{ animation: "spin 0.75s linear infinite" }} />
                    : <Sparkles size={14} />
                  }
                  {regenState === "creatives"
                    ? "Generating ads…"
                    : currentAd.output_files?.length ? "Regenerate Ads" : "Generate Ads"
                  }
                </button>

                <button
                  onClick={() => handleRegen("shorts")}
                  disabled={!!regenState || !currentAd.output_files?.length}
                  className={previewTab === "shorts" ? "btn--accent" : "btn--ghost"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                  title={!currentAd.output_files?.length ? "Generate ad creatives first" : undefined}
                >
                  {regenState === "shorts"
                    ? <Loader2 size={14} style={{ animation: "spin 0.75s linear infinite" }} />
                    : <Clapperboard size={14} />
                  }
                  {regenState === "shorts"
                    ? "Generating shorts…"
                    : currentAd.shorts_files?.length ? "Regenerate Shorts" : "Generate Shorts"
                  }
                </button>

                <button
                  onClick={() => handleRegen("website")}
                  disabled={!!regenState}
                  className={previewTab === "website" ? "btn--accent" : "btn--ghost"}
                >
                  {regenState === "website"
                    ? <Loader2 size={14} style={{ animation: "spin 0.75s linear infinite" }} />
                    : <Globe size={14} />
                  }
                  {regenState === "website"
                    ? "Generating website…"
                    : currentAd.output_url ? "Regenerate Website" : "Generate Website"
                  }
                </button>
              </div>

              {/* Progress hint */}
              {regenState && (
                <p style={{ fontSize: 12, color: "var(--color-sidebar-text)" }}>
                  {regenState === "shorts"
                    ? "Rendering 4-second loops for each creative — this may take 20–40 seconds…"
                    : instructions.trim()
                    ? "Rewriting strategy with your instructions, then regenerating — this may take 30–60 seconds…"
                    : "Regenerating — this may take 30–60 seconds…"
                  }
                </p>
              )}
            </div>
          </SectionCard>
        </div>
      ) : (
        <SectionCard>
          <div className="empty-state">
            <MonitorSmartphone size={40} className="empty-state__icon" />
            <p className="empty-state__text">Select a campaign to preview</p>
            <p className="empty-state__hint">Ad creatives and website will appear here</p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
