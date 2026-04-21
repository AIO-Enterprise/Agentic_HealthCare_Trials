import { Building2, UserPlus, FileUp, MapPin, Palette, Cpu } from "lucide-react";

// ── Wizard step definitions ────────────────────────────────────────────────
export const STEPS = [
  { label: "Company Info",     icon: Building2 },
  { label: "Study Coordinator Account", icon: UserPlus },
  { label: "Upload Documents", icon: FileUp },
  { label: "Locations",        icon: MapPin },
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

// ── Brand kit presets — Healthcare (Step 3) ──────────────────────────────────
//
// Color rules for every preset:
//   primaryColor  — deep, dark, saturated. Becomes sidebar + primary buttons.
//                   Must look good as a large background (not too bright).
//   accentColor   — vivid, contrasting hue. Used on white backgrounds for
//                   buttons, links, badges, focus rings. Must pass 3:1 contrast
//                   on white at minimum. No light or desaturated values.
//   secondaryColor — used by AI for ad/campaign generation only, not UI theming.
//
export const BRAND_PRESETS = {
  Healthcare: [
    {
      // Clinical Pro — formerly "Enterprise Pro", widely loved.
      // Deep navy + emerald. Mayo Clinic / Cleveland Clinic authority feel.
      // Inter is the de-facto clinical software font (Epic, Veeva, Medidata).
      name: "Clinical Pro",
      primaryColor: "#1e3a8a", secondaryColor: "#1e293b", accentColor: "#10b981",
      primaryFont: "Inter", secondaryFont: "Source Serif 4",
      adjectives: "reliable, professional, authoritative",
      dos: "Formal tone, cite clinical evidence, use precise language",
      donts: "No slang, avoid ambiguity, no unverified claims",
    },
    {
      // Care & Trust — deep teal + warm orange.
      // Inspired by NHS / Kaiser Permanente: calm authority with human warmth.
      // Source Sans Pro is widely adopted across patient-facing health platforms.
      name: "Care & Trust",
      primaryColor: "#134e4a", secondaryColor: "#0f172a", accentColor: "#ea580c",
      primaryFont: "Source Sans Pro", secondaryFont: "Merriweather",
      adjectives: "compassionate, reliable, clear",
      dos: "Empathize, use plain language, center patient outcomes",
      donts: "No fear language, avoid complex medical jargon",
    },
    {
      // Precision Research — deep navy + sky blue.
      // Inspired by Pfizer / Roche / IQVIA: rigorous, data-driven, scientific.
      // IBM Plex Sans signals technical credibility without coldness.
      name: "Precision Research",
      primaryColor: "#0c1f3f", secondaryColor: "#1e293b", accentColor: "#0ea5e9",
      primaryFont: "Inter", secondaryFont: "IBM Plex Sans",
      adjectives: "precise, evidence-based, rigorous",
      dos: "Lead with data, cite studies, be specific and measurable",
      donts: "No vague claims, avoid subjective language, no unsubstantiated outcomes",
    },
    {
      // Patient First — dark emerald + vivid amber.
      // Inspired by Optum / Novartis: innovation meets human-centered design.
      // DM Sans is approachable yet professional — ideal for mixed audiences.
      name: "Patient First",
      primaryColor: "#064e3b", secondaryColor: "#0f172a", accentColor: "#f59e0b",
      primaryFont: "DM Sans", secondaryFont: "Lato",
      adjectives: "warm, innovative, patient-centered",
      dos: "Center patient stories, be inspiring yet evidence-backed",
      donts: "Avoid clinical coldness, no jargon-heavy copy, no passive voice",
    },
  ],
};

export const DEFAULT_PRESETS = BRAND_PRESETS.Healthcare;
