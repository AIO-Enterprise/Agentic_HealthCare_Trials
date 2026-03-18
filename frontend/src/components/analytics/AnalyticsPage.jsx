/**
 * M15: Analytics Component
 * Owner: Frontend Dev 4
 * Dependencies: analyticsAPI, recharts
 *
 * Reusable analytics view used by Admin, Reviewer, and Publisher dashboards.
 * Displays performance charts and optimizer history.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard, MetricSummaryCard } from "../shared/Layout";
import { adsAPI, analyticsAPI } from "../../services/api";
import { BarChart3, TrendingUp, Eye, MousePointer } from "lucide-react";

export default function AnalyticsPage() {
  const [ads,       setAds]       = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [analytics, setAnalytics] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    adsAPI.list("published").then((data) => {
      setAds(data);
      if (data.length > 0) selectAd(data[0]);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const selectAd = async (ad) => {
    setSelected(ad);
    try {
      const data = await analyticsAPI.get(ad.id);
      setAnalytics(data);
    } catch { setAnalytics([]); }
  };

  const avgMetric = (key) => {
    const vals = analytics.map((a) => a[key]).filter(Boolean);
    return vals.length > 0 ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : "—";
  };

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Campaign Analytics</h1>
          <p className="page-header__subtitle">Performance metrics for published campaigns</p>
        </div>
      </div>

      {/* Campaign selector tab row */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {ads.map((ad) => (
          <button
            key={ad.id}
            onClick={() => selectAd(ad)}
            className={selected?.id === ad.id ? "filter-tab--active whitespace-nowrap" : "filter-tab whitespace-nowrap"}
          >
            {ad.title}
          </button>
        ))}
      </div>

      {selected ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <MetricSummaryCard label="Click Rate"  value={`${avgMetric("click_rate")}%`}       icon={MousePointer} />
            <MetricSummaryCard label="Views"       value={avgMetric("views")}                   icon={Eye} />
            <MetricSummaryCard label="Conversions" value={avgMetric("conversions")}             icon={TrendingUp} />
            <MetricSummaryCard label="Retention"   value={`${avgMetric("user_retention")}%`}    icon={BarChart3} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Performance over time */}
            <SectionCard title="Performance Over Time">
              {analytics.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                  No analytics data recorded yet. Data will appear here once the campaign starts receiving traffic.
                </p>
              ) : (
                <div className="space-y-1">
                  {analytics.slice(0, 10).map((a) => (
                    <div key={a.id} className="table-row text-sm px-1">
                      <span style={{ color: "var(--color-sidebar-text)", fontSize: "0.75rem" }}>
                        {new Date(a.recorded_at).toLocaleDateString()}
                      </span>
                      <span style={{ color: "#374151" }}>CTR: {a.click_rate || "—"}%</span>
                      <span style={{ color: "#374151" }}>Views: {a.views || "—"}</span>
                      <span style={{ color: "#374151" }}>Conv: {a.conversions || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Demographics */}
            <SectionCard title="Demographics Breakdown">
              {analytics.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                  No demographics data yet
                </p>
              ) : (
                <div className="space-y-2">
                  {analytics.filter((a) => a.demographics).slice(0, 5).map((a, i) => (
                    <div key={i} className="code-preview">
                      <pre>{JSON.stringify(a.demographics, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      ) : (
        <SectionCard>
          <div className="empty-state">
            <BarChart3 size={48} className="empty-state__icon" />
            <p className="empty-state__text">
              {loading ? "Loading campaigns…" : "No published campaigns to analyze"}
            </p>
          </div>
        </SectionCard>
      )}
    </PageWithSidebar>
  );
}