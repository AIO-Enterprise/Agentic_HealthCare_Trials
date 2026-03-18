/**
 * M14: Publisher Dashboard
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI, analyticsAPI
 *
 * Publish reviewed strategies, create ads/websites,
 * configure voice/chatbot params, view analytics,
 * and implement optimizer suggestions.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState, useEffect } from "react";
import { PageWithSidebar, SectionCard, MetricSummaryCard, CampaignStatusBadge } from "../shared/Layout";
import { adsAPI, analyticsAPI } from "../../services/api";
import { Send, Globe, Image, Bot, BarChart3, Play, Sparkles, CheckCircle } from "lucide-react";

export default function PublisherDashboard() {
  const [ads,     setAds]     = useState([]);
  const [tab,     setTab]     = useState("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adsAPI.list().then(setAds).catch(console.error).finally(() => setLoading(false));
  }, []);

  const approved  = ads.filter((a) => a.status === "approved");
  const published = ads.filter((a) => a.status === "published");

  const handlePublish = async (adId) => {
    try {
      const updated = await adsAPI.publish(adId);
      setAds((p) => p.map((a) => (a.id === adId ? updated : a)));
    } catch (err) { alert(err.message); }
  };

  const TABS = [
    { key: "overview", label: "Overview",         icon: Send },
    { key: "ads",      label: "Ad Creator",        icon: Image },
    { key: "website",  label: "Website Creator",   icon: Globe },
    { key: "bots",     label: "Bot Config",         icon: Bot },
    { key: "analytics",label: "Analytics",          icon: BarChart3 },
  ];

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Publisher Dashboard</h1>
          <p className="page-header__subtitle">Publish campaigns, create outputs, and manage deployments</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricSummaryCard label="Ready to Publish" value={approved.length}                              icon={Send} />
        <MetricSummaryCard label="Published"        value={published.length}                             icon={Globe} />
        <MetricSummaryCard label="Total Campaigns"  value={ads.length}                                   icon={BarChart3} />
        <MetricSummaryCard label="Active"           value={published.filter((a) => a.status !== "paused").length} icon={Play} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`${tab === t.key ? "filter-tab--active" : "filter-tab"} flex items-center gap-1.5`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {approved.length > 0 && (
            <SectionCard title="Ready to Publish" subtitle="Approved campaigns waiting for deployment">
              {approved.map((ad) => (
                <div key={ad.id} className="table-row px-1">
                  <div>
                    <p className="table-row__title">{ad.title}</p>
                    <p className="table-row__meta">{ad.ad_type} · Budget: ${ad.budget || "N/A"}</p>
                  </div>
                  <button onClick={() => handlePublish(ad.id)} className="btn--publish">
                    <Send size={14} /> Publish
                  </button>
                </div>
              ))}
            </SectionCard>
          )}

          <SectionCard title="Published Campaigns">
            {published.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>No published campaigns yet</p>
            ) : (
              published.map((ad) => (
                <div key={ad.id} className="table-row px-1">
                  <div>
                    <p className="table-row__title">{ad.title}</p>
                    <p className="table-row__meta">{ad.ad_type} · {ad.output_url || "Deployed"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CampaignStatusBadge status={ad.status} />
                  </div>
                </div>
              ))
            )}
          </SectionCard>
        </div>
      )}

      {/* ── Ad Creator ── */}
      {tab === "ads" && (
        <SectionCard title="Advertisement Creator" subtitle="Preview, regenerate, and manage ad platform API keys">
          <div className="space-y-4">
            {ads.filter((a) => a.ad_type === "ads" && a.ad_details).map((ad) => (
              <div key={ad.id} className="rounded-lg border p-4" style={{ borderColor: "var(--color-card-border)" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-input-text)" }}>{ad.title}</p>
                <div className="code-preview">
                  <pre>{JSON.stringify(ad.ad_details, null, 2)}</pre>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn--inline-action--accent">Preview Ad</button>
                  <button className="btn--inline-action--ghost">Regenerate</button>
                  <button className="btn--inline-action--ghost">API Keys</button>
                </div>
              </div>
            ))}
            {ads.filter((a) => a.ad_type === "ads" && a.ad_details).length === 0 && (
              <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                No ad campaigns with generated details yet
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Website Creator ── */}
      {tab === "website" && (
        <SectionCard title="Website Creator" subtitle="Preview, deploy, and redesign marketing websites">
          <div className="space-y-4">
            {ads.filter((a) => a.ad_type === "website" && a.website_reqs).map((ad) => (
              <div key={ad.id} className="rounded-lg border p-4" style={{ borderColor: "var(--color-card-border)" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-input-text)" }}>{ad.title}</p>
                <div className="code-preview">
                  <pre>{JSON.stringify(ad.website_reqs, null, 2)}</pre>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn--inline-action--success">Preview Website</button>
                  <button className="btn--inline-action--ghost">Hosting Settings</button>
                  <button className="btn--inline-action--accent">Deploy</button>
                  <button className="btn--inline-action--ghost">Redesign UI</button>
                </div>
              </div>
            ))}
            {ads.filter((a) => a.ad_type === "website" && a.website_reqs).length === 0 && (
              <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
                No website campaigns with requirements yet
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Bot Config ── */}
      {tab === "bots" && (
        <BotConfig ads={ads.filter((a) => ["voicebot", "chatbot"].includes(a.ad_type))} />
      )}

      {/* ── Analytics ── */}
      {tab === "analytics" && <PublisherAnalytics ads={published} />}
    </PageWithSidebar>
  );
}

// ─── Bot Configuration Sub-component ─────────────────────────────────────────

function BotConfig({ ads }) {
  const [form, setForm] = useState({
    conversation_style: "professional",
    voice:    "neutral",
    language: "en",
  });

  const handleSave = async (adId) => {
    try {
      await adsAPI.updateBotConfig(adId, form);
      alert("Bot configuration saved!");
    } catch (err) { alert(err.message); }
  };

  return (
    <SectionCard title="VoiceBot / ChatBot Configuration" subtitle="Set conversation styles, voices, and language">
      {ads.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
          No voicebot/chatbot campaigns created yet
        </p>
      ) : (
        ads.map((ad) => (
          <div key={ad.id} className="rounded-lg border p-4 mb-4" style={{ borderColor: "var(--color-card-border)" }}>
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-input-text)" }}>
              {ad.title} ({ad.ad_type})
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-sidebar-text)" }}>
                  Conversation Style
                </label>
                <select value={form.conversation_style}
                  onChange={(e) => setForm((p) => ({ ...p, conversation_style: e.target.value }))}
                  className="field-select">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-sidebar-text)" }}>Voice</label>
                <select value={form.voice}
                  onChange={(e) => setForm((p) => ({ ...p, voice: e.target.value }))}
                  className="field-select">
                  <option value="neutral">Neutral</option>
                  <option value="warm">Warm</option>
                  <option value="energetic">Energetic</option>
                  <option value="calm">Calm</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-sidebar-text)" }}>Language</label>
                <select value={form.language}
                  onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
                  className="field-select">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="hi">Hindi</option>
                </select>
              </div>
            </div>
            <button onClick={() => handleSave(ad.id)} className="btn--primary mt-3">
              Save Config
            </button>
          </div>
        ))
      )}
    </SectionCard>
  );
}

// ─── Publisher Analytics Sub-component ───────────────────────────────────────

function PublisherAnalytics({ ads }) {
  const [selected,   setSelected]   = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [optimizing,  setOptimizing]  = useState(false);

  const handleOptimize = async (adId) => {
    setOptimizing(true);
    try {
      const result = await analyticsAPI.triggerOptimize(adId);
      setSuggestions(result);
    } catch (err) { alert(err.message); }
    finally { setOptimizing(false); }
  };

  const handleDecision = async (adId, decision) => {
    try {
      await analyticsAPI.submitDecision(adId, { decision });
      setSuggestions(null);
      alert(`Decision "${decision}" recorded. Reinforcement learning updated.`);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Published Campaign Analytics" subtitle="View performance and apply optimizer suggestions">
        {ads.map((ad) => (
          <div key={ad.id} className="table-row px-1">
            <div>
              <p className="table-row__title">{ad.title}</p>
              <p className="table-row__meta">{ad.ad_type}</p>
            </div>
            <button
              onClick={() => { setSelected(ad); handleOptimize(ad.id); }}
              className="btn--optimize"
            >
              <Sparkles size={12} /> {optimizing && selected?.id === ad.id ? "Optimizing…" : "Optimize"}
            </button>
          </div>
        ))}
      </SectionCard>

      {suggestions && selected && (
        <SectionCard title={`Optimizer Suggestions: ${selected.title}`}>
          <div className="code-preview--highlight mb-4">
            <pre>{JSON.stringify(suggestions.suggestions, null, 2)}</pre>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleDecision(selected.id, "accepted")}  className="btn--approve">
              <CheckCircle size={16} /> Accept & Redeploy
            </button>
            <button onClick={() => handleDecision(selected.id, "partial")}   className="btn--revise">
              Partial Accept
            </button>
            <button onClick={() => handleDecision(selected.id, "rejected")}  className="btn--ghost flex-1 py-2.5">
              Reject
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}