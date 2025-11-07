/**
 * CV Data Source
 * @module data/cv
 * @description
 * Static curriculum vitae content shared across the web route and PDF renderer.
 * This file intentionally contains no logic—only immutable data structures
 * that can be consumed elsewhere in the application.
 */

import type { CvContactLinks, CvQualification, CvTechnicalFocusSection } from "@/types/cv";

export const CV_PROFESSIONAL_SUMMARY =
  "Software engineer and leader experienced in data, search, finance, and AI-powered web applications. Deep background in product development and quantitative research.";

export const CV_QUALIFICATIONS = [
  {
    id: "cfa",
    title: "Chartered Financial Analyst (CFA)",
    meta: ["CFA Institute"],
  },
  {
    id: "cfp",
    title: "Certified Financial Planner (CFP®)",
    meta: ["CFP Board"],
  },
  {
    id: "dual",
    title: "Dual Master's Degrees",
    meta: ["Creighton University", "MIMFA & MBA", "Quantitative finance focus"],
  },
] as const satisfies ReadonlyArray<CvQualification>;

export const CV_TECHNICAL_FOCUS = [
  {
    id: "languages-platforms",
    title: "Languages & platforms",
    bullets: ["TypeScript (JavaScript)", "Java", "Python", "SQL", "PostgreSQL", "Qdrant"],
  },
  {
    id: "frameworks",
    title: "Frameworks & runtimes",
    bullets: ["Next.js", "Node.js", "React", "Svelte", "Spring Boot", "Vite", "Docker"],
  },
  {
    id: "ai-systems",
    title: "AI systems & data",
    bullets: [
      "Hybrid search (BM25/BM42 + embeddings)",
      "Retrieval-augmented generation",
      "LLM tool chaining",
      "Vector indexing",
      "Self-hosted LLM inference",
      "Semantic meaning extraction",
    ],
  },
  {
    id: "finance-analytics",
    title: "Investment, finance, & risk analytics",
    bullets: [
      "Asset-liability management",
      "Quantitative research",
      "Factor modeling",
      "Portfolio optimization",
      "Performance attribution",
    ],
  },
] as const satisfies ReadonlyArray<CvTechnicalFocusSection>;

export const CV_CONTACT_LINKS = {
  aventureUrl: "https://aventure.vc",
  twitterUrl: "https://twitter.com/williamcallahan",
  twitterHandle: "@williamcallahan",
  linkedInUrl: "https://linkedin.com/in/williamacallahan",
} as const satisfies CvContactLinks;
