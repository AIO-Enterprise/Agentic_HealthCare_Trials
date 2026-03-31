import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { adsAPI } from "../services/api";

export const GEN_STEPS = [
  { label: "Reading Protocol",           desc: "Extracting details, eligibility criteria, endpoints", threshold: 10 },
  { label: "Competitor Analysis",        desc: "Comparing against campaigns and market data",          threshold: 25 },
  { label: "Building Campaign Strategy", desc: "Generating TOFU/MOFU/BOFU funnel concepts",           threshold: 45 },
  { label: "Writing Ad Copy & Scripts",  desc: "Creating video scripts and image ad briefs",          threshold: 60 },
  { label: "Generating Ad Creatives",    desc: "Building visual assets and ad copy for each format",  threshold: 78 },
  { label: "Building Landing Page",      desc: "Generating branded website from campaign strategy",   threshold: 92 },
  { label: "Finalising Campaign",        desc: "Submitting for review and calculating budget",        threshold: 100 },
];

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress]         = useState(0);
  const [done, setDone]                 = useState(false);
  const [error, setError]               = useState(null);
  const [adTitle, setAdTitle]           = useState(null);

  const timerRef   = useRef(null);
  const startedAt  = useRef(null);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startedAt.current;
    const pct = Math.min(92, 92 * (1 - Math.exp(-(elapsed / 40000) * 2)));
    setProgress(Math.round(pct));
  }, []);

  const startGeneration = useCallback(async (adId, title, adTypes = []) => {
    if (timerRef.current) clearInterval(timerRef.current);
    startedAt.current = Date.now();
    setAdTitle(title || "Campaign");
    setIsGenerating(true);
    setProgress(2);
    setDone(false);
    setError(null);
    timerRef.current = setInterval(tick, 250);

    const types = Array.isArray(adTypes) ? adTypes : [adTypes];
    const hasAds     = types.includes("advertisements") || types.includes("ads");
    const hasWebsite = types.includes("website");

    try {
      await adsAPI.generateStrategy(adId);
      await adsAPI.submitForReview(adId);
      if (hasAds)     await adsAPI.generateCreatives(adId);
      if (hasWebsite) await adsAPI.generateWebsite(adId);
      clearInterval(timerRef.current);
      setProgress(100);
      setDone(true);
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
        setDone(false);
        setAdTitle(null);
      }, 5000);
    } catch (err) {
      clearInterval(timerRef.current);
      setError(err?.message || "Strategy generation failed");
      setIsGenerating(false);
      setProgress(0);
    }
  }, [tick]);

  const dismiss = useCallback(() => {
    clearInterval(timerRef.current);
    setIsGenerating(false);
    setProgress(0);
    setDone(false);
    setError(null);
    setAdTitle(null);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <GenerationContext.Provider value={{ isGenerating, progress, done, error, adTitle, startGeneration, dismiss }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
