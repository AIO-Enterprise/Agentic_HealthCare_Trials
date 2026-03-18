/**
 * M12: Reviewer Dashboard
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI, analyticsAPI
 *
 * Review marketing strategies, edit plans, adjust budgets,
 * add protocol docs, and send suggestions back to AI.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, analyticsAPI } from "../../services/api";
import { Eye, CheckCircle, XCircle, MessageSquare, BarChart3 } from "lucide-react";

export default function ReviewerDashboard() {
  const [ads,        setAds]        = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [reviewForm, setReviewForm] = useState({ comments: "", status: "approved" });
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error).finally(() => setLoading(false));
  }, []);

  const reviewable = ads.filter((a) => ["under_review", "strategy_created"].includes(a.status));
  const reviewed   = ads.filter((a) => ["approved", "published"].includes(a.status));

  const handleSubmitReview = async () => {
    if (!selected) return;
    try {
      await adsAPI.createReview(selected.id, {
        review_type: "strategy",
        status:      reviewForm.status,
        comments:    reviewForm.comments,
      });
      setAds((prev) => prev.map((a) =>
        a.id === selected.id
          ? { ...a, status: reviewForm.status === "approved" ? "approved" : "under_review" }
          : a
      ));
      setSelected(null);
      setReviewForm({ comments: "", status: "approved" });
    } catch (err) { alert(err.message); }
  };

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Reviewer Dashboard</h1>
          <p className="page-header__subtitle">Review and approve marketing strategies</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricSummaryCard label="Pending Review"   value={reviewable.length} icon={Eye} />
        <MetricSummaryCard label="Approved"         value={reviewed.length}   icon={CheckCircle} />
        <MetricSummaryCard label="Total Campaigns"  value={ads.length}        icon={BarChart3} />
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* Review Queue */}
        <SectionCard title="Review Queue" subtitle={`${reviewable.length} campaigns awaiting review`}>
          {reviewable.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              No campaigns pending review
            </p>
          ) : (
            <div className="space-y-3">
              {reviewable.map((ad) => (
                <button
                  key={ad.id}
                  onClick={() => setSelected(ad)}
                  className={selected?.id === ad.id ? "queue-item--selected" : "queue-item"}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium" style={{ color: "var(--color-input-text)" }}>{ad.title}</p>
                    <CampaignStatusBadge status={ad.status} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--color-sidebar-text)" }}>
                    {ad.ad_type} · Budget: ${ad.budget || "N/A"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Review Panel */}
        <div>
          {selected ? (
            <SectionCard title={`Reviewing: ${selected.title}`}>
              <div className="space-y-4">

                {/* Strategy preview */}
                <div className="code-preview">
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--color-sidebar-text)" }}>
                    AI Generated Strategy
                  </p>
                  <pre>{JSON.stringify(selected.strategy_json, null, 2) || "No strategy generated yet"}</pre>
                </div>

                {/* Budget & platforms */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="info-tile">
                    <p className="info-tile__label">Budget</p>
                    <p className="info-tile__value">${selected.budget || "Not set"}</p>
                  </div>
                  <div className="info-tile">
                    <p className="info-tile__label">Platforms</p>
                    <p className="info-tile__value">{selected.platforms?.join(", ") || "None"}</p>
                  </div>
                </div>

                {/* Review comment */}
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                    Your Review
                  </label>
                  <textarea
                    value={reviewForm.comments}
                    onChange={(e) => setReviewForm((p) => ({ ...p, comments: e.target.value }))}
                    rows={4}
                    placeholder="Comments, suggestions, budget adjustments…"
                    className="field-textarea"
                  />
                </div>

                {/* Verdict buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setReviewForm((p) => ({ ...p, status: "approved" }));  handleSubmitReview(); }}
                    className="btn--approve"
                  >
                    <CheckCircle size={16} /> Approve
                  </button>
                  <button
                    onClick={() => { setReviewForm((p) => ({ ...p, status: "revision" })); handleSubmitReview(); }}
                    className="btn--revise"
                  >
                    <MessageSquare size={16} /> Request Revision
                  </button>
                  <button
                    onClick={() => { setReviewForm((p) => ({ ...p, status: "rejected" })); handleSubmitReview(); }}
                    className="btn--reject"
                  >
                    <XCircle size={16} /> Reject
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard>
              <div className="empty-state">
                <Eye size={48} className="empty-state__icon" />
                <p className="empty-state__text">Select a campaign from the queue to review</p>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </PageWithSidebar>
  );
}