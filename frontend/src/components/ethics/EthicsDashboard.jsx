/**
 * M13: Ethics Reviewer Dashboard
 * Owner: Frontend Dev 3
 * Dependencies: adsAPI, documentsAPI
 *
 * Ethical analysis of strategies, request strategy redesign,
 * update ethical reference documents and compliance docs.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, documentsAPI } from "../../services/api";
import { Shield, FileText, AlertTriangle, CheckCircle, RotateCcw } from "lucide-react";

export default function EthicsDashboard() {
  const [ads,      setAds]      = useState([]);
  const [docs,     setDocs]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab,      setTab]      = useState("review"); // "review" | "documents"
  const [reviewForm, setReviewForm] = useState({ comments: "" });

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error);
    documentsAPI.list("ethical_guideline").then(setDocs).catch(console.error);
  }, []);

  const pendingEthics = ads.filter((a) =>
    ["under_review", "ethics_review", "approved"].includes(a.status)
  );

  const handleEthicsReview = async (status) => {
    if (!selected) return;
    try {
      await adsAPI.createReview(selected.id, {
        review_type: "ethics",
        status,
        comments: reviewForm.comments,
      });
      setSelected(null);
      setReviewForm({ comments: "" });
      adsAPI.list().then(setAds);
    } catch (err) { alert(err.message); }
  };

  const [docForm, setDocForm] = useState({ title: "", content: "" });
  const handleAddDoc = async () => {
    try {
      const doc = await documentsAPI.create({
        doc_type: "ethical_guideline",
        title:    docForm.title,
        content:  docForm.content,
      });
      setDocs((p) => [...p, doc]);
      setDocForm({ title: "", content: "" });
    } catch (err) { alert(err.message); }
  };

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Ethics Manager Dashboard</h1>
          <p className="page-header__subtitle">Ensure marketing strategies meet ethical and compliance standards</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricSummaryCard label="Campaigns to Review" value={pendingEthics.length}                                  icon={Shield} />
        <MetricSummaryCard label="Ethical Guidelines"  value={docs.length}                                           icon={FileText} />
        <MetricSummaryCard label="Flags Raised"        value={ads.filter((a) => a.status === "ethics_review").length} icon={AlertTriangle} />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("review")}    className={tab === "review"    ? "filter-tab--active" : "filter-tab"}>
          Ethics Review
        </button>
        <button onClick={() => setTab("documents")} className={tab === "documents" ? "filter-tab--active" : "filter-tab"}>
          Document Updation
        </button>
      </div>

      {/* ── Ethics Review tab ── */}
      {tab === "review" && (
        <div className="grid grid-cols-2 gap-6">

          {/* Campaign queue */}
          <SectionCard title="Campaigns" subtitle="Select a campaign for ethical review">
            <div className="space-y-3">
              {pendingEthics.map((ad) => (
                <button
                  key={ad.id}
                  onClick={() => setSelected(ad)}
                  className={selected?.id === ad.id ? "queue-item--selected" : "queue-item"}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium" style={{ color: "var(--color-input-text)" }}>{ad.title}</p>
                    <CampaignStatusBadge status={ad.status} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--color-sidebar-text)" }}>{ad.ad_type}</p>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Analysis panel */}
          {selected ? (
            <SectionCard title={`Ethics Analysis: ${selected.title}`}>
              <div className="space-y-4">

                <div className="code-preview">
                  <pre>{JSON.stringify(selected.strategy_json, null, 2) || "No strategy"}</pre>
                </div>

                <textarea
                  value={reviewForm.comments}
                  onChange={(e) => setReviewForm({ comments: e.target.value })}
                  rows={4}
                  placeholder="Ethical considerations, compliance issues, concerns…"
                  className="field-textarea"
                />

                <div className="flex gap-3">
                  <button onClick={() => handleEthicsReview("approved")} className="btn--approve">
                    <CheckCircle size={16} /> Approve
                  </button>
                  <button onClick={() => handleEthicsReview("rejected")} className="btn--reject">
                    <RotateCcw size={16} /> Redesign Strategy
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard>
              <div className="empty-state">
                <Shield size={48} className="empty-state__icon" />
                <p className="empty-state__text">Select a campaign for ethical analysis</p>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Documents tab ── */}
      {tab === "documents" && (
        <div className="space-y-6">
          <SectionCard title="Add Ethical Guideline">
            <div className="space-y-4">
              <input
                placeholder="Document Title"
                value={docForm.title}
                onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                className="field-input"
              />
              <textarea
                placeholder="Content — compliance notes, ethical review info, internal goals…"
                rows={4}
                value={docForm.content}
                onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                className="field-textarea"
              />
              <button onClick={handleAddDoc} disabled={!docForm.title} className="btn--accent">
                Save Document
              </button>
            </div>
          </SectionCard>

          <SectionCard title={`Existing Guidelines (${docs.length})`}>
            {docs.map((doc) => (
              <div key={doc.id} className="table-row px-1">
                <div>
                  <p className="table-row__title">{doc.title}</p>
                  <p className="table-row__meta mt-1 line-clamp-2">{doc.content}</p>
                </div>
              </div>
            ))}
          </SectionCard>
        </div>
      )}
    </PageWithSidebar>
  );
}