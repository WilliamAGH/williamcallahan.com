/**
 * Static Context Builder for RAG
 *
 * Extracts pre-computed site information from CV data, metadata, and featured projects.
 * This context is always injected into the system prompt to ground responses in real facts.
 *
 * @module lib/ai/rag/static-context
 */

import { CV_PROFESSIONAL_SUMMARY, CV_QUALIFICATIONS, CV_TECHNICAL_FOCUS } from "@/data/cv";
import { SITE_DESCRIPTION_SHORT, metadata } from "@/data/metadata";
import { projects } from "@/data/projects";
import type { StaticContext } from "@/types/rag";

export type { StaticContext };

const HOME_PAGE_HIGHLIGHTS = [
  "Hello there -- I'm William. I'm a lifelong builder and aspiring polymath who finds meaning in making things better, and in helping others.",
  "My background is in finance and technology. Today I live and work in San Francisco / Silicon Valley. I grew up in the small midwestern US town of Carter Lake - a one-square-mile Iowa exclave, famed for two cases on its location reaching the US Supreme Court.",
  "(The neighboring sister town of Council Bluffs, Iowa, where I went to school, is now more famously known globally as us-central1 for its Google Cloud data centers.)",
  "I'm currently building aVenture, a platform designed to bring greater transparency to private markets investing by using AI to analyze millions of data points about companies, their people, and investors.",
  "If you're curious about what I'm tinkering with these days, my projects page serves as a public sandbox for my latest experiments and passion projects. I also regularly bookmark what I'm reading, which you can find on my bookmarks page.",
  "Feel free to connect with me on Discord, X, or LinkedIn to chat.",
] as const;

const CONTACT_PAGE_SUMMARY =
  "Here are some of the places I can be found online. I share content about technology, startups, investing, AI, LLMs, and software engineering.";

const CONTACT_PAGE_LINKS = [
  { label: "Discord", url: "https://discord.com/users/WilliamDscord" },
  { label: "X", url: "https://x.com/williamcallahan" },
  { label: "LinkedIn", url: "https://linkedin.com/in/williamacallahan" },
] as const;

/**
 * Builds the static context from site data sources.
 * This is computed once at module load and cached.
 */
function buildStaticContext(): StaticContext {
  // Featured projects for CV (cvFeatured: true)
  const featuredProjects = projects
    .filter((p) => p.cvFeatured)
    .map((p) => ({
      name: p.name,
      description: p.shortSummary ?? p.description,
      url: p.url ?? "/projects",
    }));

  // Social links from metadata
  const socialLinks = metadata.social.profiles.map((url) => {
    const urlObj = new URL(url);
    const platform = urlObj.hostname.replace("www.", "").split(".")[0] ?? "link";
    return { platform: platform.charAt(0).toUpperCase() + platform.slice(1), url };
  });

  // Technical focus areas
  const technicalFocus = CV_TECHNICAL_FOCUS.map((section) => ({
    area: section.title,
    skills: [...section.bullets],
  }));

  // Qualifications
  const qualifications = CV_QUALIFICATIONS.map((q) => {
    const meta = q.meta.join(", ");
    return `${q.title} (${meta})`;
  });

  return {
    biography: `${CV_PROFESSIONAL_SUMMARY} ${SITE_DESCRIPTION_SHORT}`,
    qualifications,
    technicalFocus,
    currentProjects: featuredProjects,
    socialLinks,
    homePageHighlights: [...HOME_PAGE_HIGHLIGHTS],
    contactSummary: CONTACT_PAGE_SUMMARY,
    contactLinks: [...CONTACT_PAGE_LINKS],
  };
}

// Module-level cache - computed once on first import
let cachedContext: StaticContext | null = null;

/**
 * Returns the static context, computing it on first call.
 */
export function getStaticContext(): StaticContext {
  if (!cachedContext) {
    cachedContext = buildStaticContext();
  }
  return cachedContext;
}

/**
 * Formats static context as a string for system prompt injection.
 */
export function formatStaticContext(ctx: StaticContext): string {
  const lines: string[] = ["=== ABOUT WILLIAM CALLAHAN ===", "", ctx.biography, ""];

  lines.push("Qualifications:");
  for (const q of ctx.qualifications) {
    lines.push(`- ${q}`);
  }
  lines.push("");

  lines.push("Technical Focus:");
  for (const focus of ctx.technicalFocus) {
    lines.push(`- ${focus.area}: ${focus.skills.join(", ")}`);
  }
  lines.push("");

  lines.push("Current Projects:");
  for (const project of ctx.currentProjects) {
    lines.push(`- ${project.name}: ${project.description}`);
    lines.push(`  URL: ${project.url}`);
  }
  lines.push("");

  lines.push("Home Page Highlights:");
  for (const highlight of ctx.homePageHighlights) {
    lines.push(`- ${highlight}`);
  }
  lines.push("");

  lines.push("Contact Summary:");
  lines.push(ctx.contactSummary);
  lines.push("");

  lines.push("Contact Links:");
  for (const link of ctx.contactLinks) {
    lines.push(`- ${link.label}: ${link.url}`);
  }
  lines.push("");

  lines.push("Social Profiles:");
  for (const link of ctx.socialLinks) {
    lines.push(`- ${link.platform}: ${link.url}`);
  }

  return lines.join("\n");
}
