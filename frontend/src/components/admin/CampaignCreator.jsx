/**
 * M11: Campaign Creator
 * Owner: Frontend Dev 2
 * Dependencies: adsAPI
 *
 * Create new campaigns with type selection (Website, Ads, Voicebot*, Chatbot*),
 * budget, platforms, and target audience configuration.
 * Then trigger AI strategy generation.
 * Styles: use classes from index.css only — no raw Tailwind color utilities.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageWithSidebar, SectionCard } from "../shared/Layout";
import { adsAPI } from "../../services/api";
import { Globe, Image, Bot, MessageSquare, Sparkles } from "lucide-react";

const AD_TYPES = [
  { value: "website",  label: "Website",        icon: Globe,          desc: "AI-generated marketing website" },
  { value: "ads",      label: "Advertisements",  icon: Image,          desc: "Display, social, and search ads" },
  { value: "voicebot", label: "Voicebot *",       icon: Bot,            desc: "Voice-based conversational agent" },
  { value: "chatbot",  label: "Chatbot *",        icon: MessageSquare,  desc: "Text-based conversational agent" },
];

const PLATFORMS = ["Google Ads", "Meta/Instagram", "LinkedIn", "Twitter/X", "YouTube", "TikTok", "Email"];

export default function CampaignCreator() {
  const navigate  = useNavigate();
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [createdAd,  setCreatedAd]  = useState(null);

  const [form, setForm] = useState({
    title: "",
    ad_type: "website",
    budget: "",
    platforms: [],
    target_audience: { age_range: "", gender: "", interests: "" },
  });

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const togglePlatform = (p) => setForm((prev) => ({
    ...prev,
    platforms: prev.platforms.includes(p)
      ? prev.platforms.filter((x) => x !== p)
      : [...prev.platforms, p],
  }));

  const handleCreate = async () => {
    setLoading(true);
    try {
      const ad = await adsAPI.create({
        title:           form.title,
        ad_type:         form.ad_type,
        budget:          form.budget ? parseFloat(form.budget) : null,
        platforms:       form.platforms,
        target_audience: form.target_audience,
      });
      setCreatedAd(ad);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await adsAPI.generateStrategy(createdAd.id);
      await adsAPI.submitForReview(createdAd.id);
      navigate("/admin");
    } catch (err) { alert(err.message); }
    finally { setGenerating(false); }
  };

  return (
    <PageWithSidebar>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Create Campaign</h1>
          <p className="page-header__subtitle">
            Define your campaign type, budget, and audience. Then let AI generate the strategy.
          </p>
        </div>
      </div>

      {!createdAd ? (
        <div className="space-y-6 max-w-3xl">

          {/* Campaign Type */}
          <SectionCard title="Campaign Type">
            <div className="grid grid-cols-2 gap-3">
              {AD_TYPES.map((t) => {
                const Icon = t.icon;
                const active = form.ad_type === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => update("ad_type", t.value)}
                    className={active ? "type-option--active" : "type-option"}
                  >
                    <Icon size={24} style={{ color: active ? "var(--color-accent)" : "var(--color-sidebar-text)" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-input-text)" }}>{t.label}</p>
                      <p className="text-xs" style={{ color: "var(--color-sidebar-text)" }}>{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* Campaign Details */}
          <SectionCard title="Campaign Details">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                  Campaign Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="e.g. Q2 Product Launch"
                  className="field-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-input-text)" }}>
                  Budget ($)
                </label>
                <input
                  type="number"
                  value={form.budget}
                  onChange={(e) => update("budget", e.target.value)}
                  placeholder="10000"
                  className="field-input"
                />
              </div>
            </div>
          </SectionCard>

          {/* Target Platforms */}
          <SectionCard title="Target Platforms">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={form.platforms.includes(p) ? "platform-pill--active" : "platform-pill"}
                >
                  {p}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Target Audience */}
          <SectionCard title="Target Audience">
            <div className="grid grid-cols-3 gap-4">
              <input
                placeholder="Age Range (e.g. 25-45)"
                value={form.target_audience.age_range}
                onChange={(e) => update("target_audience", { ...form.target_audience, age_range: e.target.value })}
                className="field-input"
              />
              <input
                placeholder="Gender"
                value={form.target_audience.gender}
                onChange={(e) => update("target_audience", { ...form.target_audience, gender: e.target.value })}
                className="field-input"
              />
              <input
                placeholder="Interests"
                value={form.target_audience.interests}
                onChange={(e) => update("target_audience", { ...form.target_audience, interests: e.target.value })}
                className="field-input"
              />
            </div>
          </SectionCard>

          <button
            onClick={handleCreate}
            disabled={loading || !form.title}
            className="btn--primary-full"
          >
            {loading ? (
              <><span className="spinner" /> Creating…</>
            ) : "Create Campaign"}
          </button>
        </div>

      ) : (
        /* Post-creation: generate strategy */
        <SectionCard title={`Campaign Created: ${createdAd.title}`}>
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ backgroundColor: "var(--color-accent-subtle)" }}>
              <Sparkles size={28} style={{ color: "var(--color-accent)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--color-sidebar-text)" }}>
              Campaign created. Generate an AI marketing strategy and submit for review?
            </p>
            <button onClick={handleGenerate} disabled={generating} className="btn--accent px-8 py-2.5">
              {generating ? (
                <><span className="spinner" /> AI is generating strategy…</>
              ) : "Generate Strategy & Submit for Review"}
            </button>
          </div>
        </SectionCard>
      )}
    </PageWithSidebar>
  );
}