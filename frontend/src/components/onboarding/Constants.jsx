import { Building2, UserPlus, FileUp, Palette, Cpu } from "lucide-react";

// ── Wizard step definitions ────────────────────────────────────────────────
export const STEPS = [
  { label: "Company Info",     icon: Building2 },
  { label: "Admin Account",    icon: UserPlus },
  { label: "Upload Documents", icon: FileUp },
  { label: "Brand Kit",        icon: Palette },
  { label: "AI Training",      icon: Cpu },
];

// ── Document type options (Step 2) ────────────────────────────────────────
export const DOC_TYPES = [
  { value: "usp",               label: "Unique Selling Proposition", icon: "🎯" },
  { value: "compliance",        label: "Compliance Documents",       icon: "⚖️"  },
  { value: "policy",            label: "Company Policies",           icon: "📋" },
  { value: "marketing_goal",    label: "Marketing Goals",            icon: "📈" },
  { value: "ethical_guideline", label: "Ethical Guidelines",         icon: "🤝" },
  { value: "input",             label: "Input Documents / Briefs",   icon: "📥" },
  { value: "other",             label: "Others",                     icon: "➕" },
];

export const ACCEPTED_DOC_FORMATS = ".pdf,.doc,.docx,.txt";
export const ACCEPTED_DOC_MIME    = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// ── Brand kit presets by industry (Step 3) ────────────────────────────────
export const BRAND_PRESETS = {
  Technology: [
    {
      name: "Tech Clarity",
      primaryColor: "#2563eb", secondaryColor: "#0f172a", accentColor: "#38bdf8",
      primaryFont: "Inter", secondaryFont: "IBM Plex Mono",
      adjectives: "precise, innovative, trustworthy",
      dos: "Use data-driven language, keep it crisp", donts: "Avoid buzzwords, no hype",
    },
    {
      name: "Startup Bold",
      primaryColor: "#7c3aed", secondaryColor: "#18181b", accentColor: "#f59e0b",
      primaryFont: "Space Grotesk", secondaryFont: "Inter",
      adjectives: "bold, disruptive, energetic",
      dos: "Lead with impact, use active voice", donts: "No corporate speak, avoid passive voice",
    },
    {
      name: "Enterprise Pro",
      primaryColor: "#1e40af", secondaryColor: "#1e293b", accentColor: "#10b981",
      primaryFont: "DM Sans", secondaryFont: "Source Serif 4",
      adjectives: "reliable, professional, authoritative",
      dos: "Formal tone, cite numbers", donts: "No slang, avoid ambiguity",
    },
  ],
  Finance: [
    {
      name: "Trust & Wealth",
      primaryColor: "#15803d", secondaryColor: "#1c1917", accentColor: "#d97706",
      primaryFont: "Playfair Display", secondaryFont: "Lato",
      adjectives: "trustworthy, established, growth-focused",
      dos: "Reassure, use clear figures", donts: "No vague promises, avoid risk downplaying",
    },
    {
      name: "Modern Finance",
      primaryColor: "#0284c7", secondaryColor: "#0f172a", accentColor: "#6366f1",
      primaryFont: "Sora", secondaryFont: "Mulish",
      adjectives: "smart, accessible, forward-thinking",
      dos: "Simplify jargon, be transparent", donts: "No fear-mongering, avoid complexity",
    },
    {
      name: "Premium Banking",
      primaryColor: "#92400e", secondaryColor: "#111827", accentColor: "#e2c27d",
      primaryFont: "Cormorant Garamond", secondaryFont: "Nunito Sans",
      adjectives: "exclusive, refined, discreet",
      dos: "Understated elegance, high quality feel", donts: "No aggressive sales, avoid loud claims",
    },
  ],
  Retail: [
    {
      name: "Pop & Energy",
      primaryColor: "#dc2626", secondaryColor: "#18181b", accentColor: "#fbbf24",
      primaryFont: "Nunito", secondaryFont: "Open Sans",
      adjectives: "fun, vibrant, accessible",
      dos: "Use excitement, urgency, deals", donts: "No technical terms, avoid dull language",
    },
    {
      name: "Minimal Shop",
      primaryColor: "#1f2937", secondaryColor: "#f9fafb", accentColor: "#d1d5db",
      primaryFont: "Helvetica Neue", secondaryFont: "Georgia",
      adjectives: "clean, curated, quality-first",
      dos: "Let products speak, be concise", donts: "No clutter, avoid over-promising",
    },
    {
      name: "Luxury Retail",
      primaryColor: "#111827", secondaryColor: "#fafaf9", accentColor: "#b8860b",
      primaryFont: "Didact Gothic", secondaryFont: "EB Garamond",
      adjectives: "exclusive, aspirational, timeless",
      dos: "Evoke desire, use sensory language", donts: "No discounts in copy, avoid casualness",
    },
  ],
  Healthcare: [
    {
      name: "Care & Trust",
      primaryColor: "#0369a1", secondaryColor: "#f0f9ff", accentColor: "#10b981",
      primaryFont: "Source Sans Pro", secondaryFont: "Merriweather",
      adjectives: "compassionate, reliable, clear",
      dos: "Empathize, use plain language", donts: "No fear language, avoid complex medical jargon",
    },
    {
      name: "Modern Wellness",
      primaryColor: "#059669", secondaryColor: "#1a1a2e", accentColor: "#a3e635",
      primaryFont: "Quicksand", secondaryFont: "Roboto",
      adjectives: "fresh, holistic, optimistic",
      dos: "Inspire action, be positive", donts: "Avoid clinical coldness, no scare tactics",
    },
  ],
  Education: [
    {
      name: "Academic",
      primaryColor: "#1d4ed8", secondaryColor: "#1e293b", accentColor: "#f59e0b",
      primaryFont: "Libre Baskerville", secondaryFont: "Noto Sans",
      adjectives: "authoritative, inspiring, credible",
      dos: "Back with evidence, inspire curiosity", donts: "No dumbing down, avoid being preachy",
    },
    {
      name: "EdTech Fun",
      primaryColor: "#7c3aed", secondaryColor: "#fdf4ff", accentColor: "#f43f5e",
      primaryFont: "Fredoka One", secondaryFont: "Nunito",
      adjectives: "playful, encouraging, accessible",
      dos: "Celebrate progress, use relatable language", donts: "No gatekeeping, avoid elitism",
    },
  ],
};

export const DEFAULT_PRESETS = BRAND_PRESETS.Technology;