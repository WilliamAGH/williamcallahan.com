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

export interface StaticContext {
  biography: string;
  qualifications: string[];
  technicalFocus: Array<{ area: string; skills: string[] }>;
  currentProjects: Array<{ name: string; description: string; url: string }>;
  socialLinks: Array<{ platform: string; url: string }>;
}

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

  return lines.join("\n");
}
