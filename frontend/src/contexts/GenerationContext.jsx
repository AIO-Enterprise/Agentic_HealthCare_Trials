import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { adsAPI } from "../services/api";

export const GEN_STEPS = [
  { label: "Reading Protocol",          desc: "Extracting details, eligibility criteria, endpoints", threshold: 12 },
  { label: "Competitor Analysis",       desc: "Comparing against campaigns and market data",          threshold: 32 },
  { label: "Building Campaign Strategy", desc: "Generating TOFU/MOFU/BOFU funnel concepts",          threshold: 58 },
  { label: "Writing Ad Copy & Scripts", desc: "Creating video scripts and image ad briefs",           threshold: 78 },
  { label: "Designing Questionnaire",   desc: "Building eligibility pre-screener questions",          threshold: 92 },
  { label: "Calculating Budget",        desc: "Phase-based budget with projected ROI",                threshold: 100 },
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

  const startGeneration = useCallback(async (adId, title) => {
    if (timerRef.current) clearInterval(timerRef.current);
    startedAt.current = Date.now();
    setAdTitle(title || "Campaign");
    setIsGenerating(true);
    setProgress(2);
    setDone(false);
    setError(null);
    timerRef.current = setInterval(tick, 250);

    try {
      await adsAPI.generateStrategy(adId);
      await adsAPI.submitForReview(adId);
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
