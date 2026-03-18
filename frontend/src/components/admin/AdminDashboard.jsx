/**
 * M11: Admin Dashboard
 * Owner: Frontend Dev 2
 * Dependencies: Shared Layout, adsAPI, usersAPI
 *
 * Admin's home view: stats overview, recent campaigns, quick actions.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, usersAPI } from "../../services/api";
import { Megaphone, Users, BarChart3, Clock, Plus } from "lucide-react";

export default function AdminDashboard() {
  const [ads, setAds] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adsAPI.list(), usersAPI.list()])
      .then(([a, u]) => { setAds(a); setUsers(u); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const published = ads.filter((a) => a.status === "published").length;
  const inReview  = ads.filter((a) => ["under_review", "ethics_review"].includes(a.status)).length;

  return (
    <PageWithSidebar>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Admin Dashboard</h1>
          <p className="page-header__subtitle">Manage campaigns, users, and company documents</p>
        </div>
        <Link to="/admin/create" className="btn--accent">
          <Plus size={16} /> New Campaign
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricSummaryCard label="Total Campaigns" value={ads.length}  icon={Megaphone} />
        <MetricSummaryCard label="Published"       value={published}   icon={BarChart3} trend={12} />
        <MetricSummaryCard label="In Review"       value={inReview}    icon={Clock} />
        <MetricSummaryCard label="Team Members"    value={users.length} icon={Users} />
      </div>

      {/* Recent campaigns */}
      <SectionCard
        title="Recent Campaigns"
        subtitle="Latest campaign activity"
        actions={
          <Link to="/admin/analytics" className="text-sm font-medium transition-colors"
            style={{ color: "var(--color-accent)" }}>
            View All
          </Link>
        }
      >
        {loading ? (
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>Loading…</p>
        ) : ads.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
            No campaigns yet. Create your first one!
          </p>
        ) : (
          <div className="space-y-1">
            {ads.slice(0, 5).map((ad) => (
              <div key={ad.id} className="table-row px-1">
                <div>
                  <p className="table-row__title">{ad.title}</p>
                  <p className="table-row__meta">
                    {ad.ad_type} · {new Date(ad.created_at).toLocaleDateString()}
                  </p>
                </div>
                <CampaignStatusBadge status={ad.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageWithSidebar>
  );
}