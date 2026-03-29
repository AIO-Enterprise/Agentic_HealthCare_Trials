/**
 * M12: Reviewer Dashboard
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI
 *
 * Review marketing strategies, edit plans, adjust budgets,
 * add protocol docs, and send suggestions back to AI.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge,
} from "../shared/Layout";
import { adsAPI } from "../../services/api";
import {
  Eye, CheckCircle, BarChart3, ClipboardList,
} from "lucide-react";

const QUESTIONNAIRE_CATEGORIES = new Set(["recruitment", "hiring", "survey", "clinical_trial", "research"]);
const QUESTIONNAIRE_KEYWORDS = ["hiring", "recruit", "survey", "clinical", "trial", "research study", "job posting", "job opening", "application", "vacancy", "vacancies", "applicant", "enroll", "enrolment", "participant", "respondent"];

// Dashboard list view — no per-row docs available, title-only fallback is fine here.
function needsQuestionnaire(ad) {
  if (!ad) return false;
  if (QUESTIONNAIRE_CATEGORIES.has(ad.campaign_category)) return true;
  const title = (ad.title ?? "").toLowerCase();
  return QUESTIONNAIRE_KEYWORDS.some((kw) => title.includes(kw));
}

// ─── Skeleton row — matches the 5-column queue table grid ────────────────────
function SkeletonRow() {
  const bar = (w, h = 12) => ({
    height: h, width: w, borderRadius: 4,
    backgroundColor: "var(--color-card-border)",
  });
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 180px 100px 110px",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid var(--color-border, #e5e7eb)",
    }}>
      {/* Title + date */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={bar("58%", 13)} />
        <div style={bar("30%", 11)} />
      </div>
      {/* Platforms */}
      <div style={{ display: "flex", gap: 4 }}>
        <div style={{ ...bar(56, 20), borderRadius: 10 }} />
        <div style={{ ...bar(48, 20), borderRadius: 10 }} />
      </div>
      {/* Budget */}
      <div style={bar(44, 13)} />
      {/* Button */}
      <div style={{ ...bar(80, 32), borderRadius: 8 }} />
    </div>
  );
}

// ─── Platform tag ─────────────────────────────────────────────────────────────
function Tag({ children }) {
  return (
    <span style={{
      display: "inline-block",
      backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
      color: "var(--color-accent)",
      border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.2)",
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 500,
      marginRight: 4, marginBottom: 4,
    }}>
      {children}
    </span>
  );
}

// ─── Main dashboard page ──────────────────────────────────────────────────────
function DashboardPage({ loading, ads, reviewable, reviewed, onReview }) {
  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Project Manager Dashboard</h1>
          <p className="page-header__subtitle">Review and approve marketing strategies</p>
        </div>
      </div>

      {/* KPI row — shows 0 while loading, real values once loaded */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricSummaryCard label="Pending Review"  value={loading ? "—" : reviewable.length} icon={Eye} />
        <MetricSummaryCard label="Approved"        value={loading ? "—" : reviewed.length}   icon={CheckCircle} />
        <MetricSummaryCard label="Total Campaigns" value={loading ? "—" : ads.length}        icon={BarChart3} />
      </div>

      {/* Review queue */}
      <SectionCard
        title="Review Queue"
        subtitle={loading ? "Loading campaigns…" : `${reviewable.length} campaign${reviewable.length !== 1 ? "s" : ""} awaiting review`}
      >
        {loading ? (
          // Skeleton rows while fetching
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 100px 110px",
              padding: "8px 16px",
              borderBottom: "1px solid var(--color-border, #e5e7eb)",
            }}>
              {["Campaign", "Platforms", "Budget", ""].map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  {h}
                </span>
              ))}
            </div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : reviewable.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} className="empty-state__icon" />
            <p className="empty-state__text">No campaigns pending review</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 100px 110px",
              padding: "8px 16px",
              borderBottom: "1px solid var(--color-border, #e5e7eb)",
            }}>
              {["Campaign", "Platforms", "Budget", ""].map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-sidebar-text)" }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {reviewable.map((ad) => (
              <div
                key={ad.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 180px 100px 110px",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--color-border, #e5e7eb)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-card-bg, #f9fafb)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: "var(--color-input-text)" }}>{ad.title}</p>
                    {needsQuestionnaire(ad) && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "3px",
                        fontSize: "0.65rem", fontWeight: 600, padding: "1px 6px",
                        borderRadius: "999px",
                        backgroundColor: "rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.1)",
                        color: "var(--color-accent)",
                        border: "1px solid rgba(var(--color-accent-r),var(--color-accent-g),var(--color-accent-b),0.25)",
                      }}
                        title="This campaign has a questionnaire"
                      >
                        <ClipboardList size={9} /> Questionnaire
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 2 }}>
                    {new Date(ad.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {needsQuestionnaire(ad) && (
                      <span style={{ marginLeft: "6px", textTransform: "capitalize" }}>
                        · {ad.campaign_category ? ad.campaign_category.replace("_", " ") : "hiring / recruitment"}
                      </span>
                    )}
                  </p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {ad.platforms?.map((p) => <Tag key={p}>{p}</Tag>)}
                </div>
                <p style={{ fontSize: 13, color: "var(--color-input-text)", fontWeight: 500 }}>
                  ${ad.budget?.toLocaleString() || "N/A"}
                </p>
                <button
                  onClick={() => onReview(ad)}
                  className="btn--accent"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
                >
                  <Eye size={14} /> Review
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Reviewed campaigns — only shown once loaded and non-empty */}
      {!loading && reviewed.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionCard title="Reviewed" subtitle={`${reviewed.length} completed`}>
            {reviewed.map((ad) => (
              <div
                key={ad.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border, #e5e7eb)",
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: "var(--color-input-text)" }}>{ad.title}</p>
                  <p style={{ fontSize: 12, color: "var(--color-sidebar-text)", marginTop: 2 }}>
                    {ad.platforms?.join(" · ")}
                  </p>
                </div>
                <CampaignStatusBadge status={ad.status} />
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </PageWithSidebar>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function ReviewerDashboard() {
  const navigate      = useNavigate();
  const [ads,     setAds]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error).finally(() => setLoading(false));
  }, []);

  const reviewable = ads.filter((a) => ["under_review", "strategy_created"].includes(a.status));
  const reviewed   = ads.filter((a) => ["approved", "published"].includes(a.status));

  return (
    <DashboardPage
      loading={loading}
      ads={ads}
      reviewable={reviewable}
      reviewed={reviewed}
      onReview={(ad) => navigate(`/project-manager/campaign/${ad.id}`)}
    />
  );
}
