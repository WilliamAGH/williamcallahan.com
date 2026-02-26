/**
 * Pure text builder functions for domain embedding backfill.
 *
 * Labels align with canonical contracts in embedding-field-specs-{content,entities}.ts.
 * Each function takes a raw SQL row and returns a labeled text string
 * suitable for the embedding model, or null if the row has no usable content.
 *
 * @module scripts/domain-embedding-text-builders
 */

export function buildAiAnalysisText(row) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const sections = [];
  const analysis = payload.analysis ?? payload;
  if (typeof analysis.summary === "string" && analysis.summary.trim())
    sections.push(`AI Analysis Summary: ${analysis.summary.trim()}`);
  const highlights = analysis.highlights ?? analysis.keyHighlights;
  if (Array.isArray(highlights)) {
    const items = highlights.filter((h) => typeof h === "string" && h.trim()).map((h) => h.trim());
    if (items.length > 0) sections.push(`AI Analysis Key Points: ${items.join("; ")}`);
  }
  const themes = analysis.keyThemes ?? analysis.themes;
  if (Array.isArray(themes)) {
    const items = themes.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
    if (items.length > 0) sections.push(`AI Analysis Themes: ${items.join("; ")}`);
  }
  return sections.length > 0 ? sections.join("\n") : null;
}

export function buildOgText(row) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const sections = [];
  const title = payload.title ?? payload.ogTitle;
  if (typeof title === "string" && title.trim())
    sections.push(`OpenGraph Page Title: ${title.trim()}`);
  const desc = payload.description ?? payload.ogDescription;
  if (typeof desc === "string" && desc.trim())
    sections.push(`OpenGraph Page Description: ${desc.trim()}`);
  if (typeof row.url === "string" && row.url.trim()) sections.push(`Page URL: ${row.url.trim()}`);
  return sections.length > 0 ? sections.join("\n") : null;
}

export function buildThoughtText(row) {
  const sections = [`Thought Title: ${row.title}`];
  if (typeof row.content === "string" && row.content.trim())
    sections.push(`Thought Full Text: ${row.content.trim()}`);
  if (typeof row.category === "string" && row.category.trim())
    sections.push(`Topic Category: ${row.category.trim()}`);
  if (Array.isArray(row.tags) && row.tags.length > 0)
    sections.push(`Topic Tags: ${row.tags.filter(Boolean).join(", ")}`);
  return sections.join("\n");
}

export function buildInvestmentText(row) {
  const sections = [`Company Name: ${row.name}`];
  if (typeof row.description === "string" && row.description.trim())
    sections.push(`Company Description: ${row.description.trim()}`);
  if (typeof row.category === "string" && row.category.trim())
    sections.push(`Business Sector: ${row.category.trim()}`);
  sections.push(`Funding Round at Entry: ${row.stage}`);
  sections.push(`Investment Outcome: ${row.status}`);
  sections.push(`Company Operating State: ${row.operating_status}`);
  if (typeof row.location === "string" && row.location.trim())
    sections.push(`Company Headquarters: ${row.location.trim()}`);
  sections.push(`Investment Vehicle: ${row.type}`);
  sections.push(`Year of Investment: ${row.invested_year}`);
  if (row.accelerator && typeof row.accelerator === "object") {
    if (row.accelerator.program)
      sections.push(`Startup Accelerator Program: ${row.accelerator.program}`);
    if (row.accelerator.batch) sections.push(`Accelerator Cohort: ${row.accelerator.batch}`);
  }
  return sections.join("\n");
}

export function buildBookText(row) {
  const sections = [`Book Title: ${row.title}`];
  if (typeof row.subtitle === "string" && row.subtitle.trim())
    sections.push(`Book Subtitle: ${row.subtitle.trim()}`);
  if (Array.isArray(row.authors) && row.authors.length > 0)
    sections.push(`Authors: ${row.authors.filter(Boolean).join(", ")}`);
  if (Array.isArray(row.genres) && row.genres.length > 0)
    sections.push(`Literary Genres: ${row.genres.filter(Boolean).join(", ")}`);
  if (typeof row.publisher === "string" && row.publisher.trim())
    sections.push(`Publisher Name: ${row.publisher.trim()}`);
  if (typeof row.description === "string" && row.description.trim())
    sections.push(`Book Description: ${row.description.trim()}`);
  if (typeof row.ai_summary === "string" && row.ai_summary.trim())
    sections.push(`AI-Generated Summary: ${row.ai_summary.trim()}`);
  if (typeof row.thoughts === "string" && row.thoughts.trim())
    sections.push(`Personal Reading Notes: ${row.thoughts.trim()}`);
  return sections.join("\n");
}

export function buildBlogPostText(row) {
  const sections = [`Article Title: ${row.title}`];
  if (typeof row.excerpt === "string" && row.excerpt.trim())
    sections.push(`Article Summary: ${row.excerpt.trim()}`);
  if (Array.isArray(row.tags) && row.tags.length > 0)
    sections.push(`Topic Tags: ${row.tags.filter(Boolean).join(", ")}`);
  if (typeof row.author_name === "string" && row.author_name.trim())
    sections.push(`Article Author: ${row.author_name.trim()}`);
  if (typeof row.raw_content === "string" && row.raw_content.trim())
    sections.push(`Article Full Text: ${row.raw_content.trim()}`);
  return sections.join("\n");
}

export function buildProjectText(row) {
  const sections = [`Project Name: ${row.name}`];
  if (typeof row.short_summary === "string" && row.short_summary.trim())
    sections.push(`Project Summary: ${row.short_summary.trim()}`);
  if (typeof row.description === "string" && row.description.trim())
    sections.push(`Project Description: ${row.description.trim()}`);
  if (Array.isArray(row.tags) && row.tags.length > 0)
    sections.push(`Topic Tags: ${row.tags.filter(Boolean).join(", ")}`);
  if (Array.isArray(row.tech_stack) && row.tech_stack.length > 0)
    sections.push(`Technology Stack: ${row.tech_stack.filter(Boolean).join(", ")}`);
  if (typeof row.note === "string" && row.note.trim())
    sections.push(`Author Annotation: ${row.note.trim()}`);
  sections.push(`Project Website URL: ${row.url}`);
  if (typeof row.github_url === "string" && row.github_url.trim())
    sections.push(`Source Code Repository URL: ${row.github_url.trim()}`);
  return sections.join("\n");
}
