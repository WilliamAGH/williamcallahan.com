/**
 * Embedding field specifications for structured entity/metadata domains.
 *
 * Covers: investments, projects, AI analysis, OpenGraph — all discrete-field
 * records representing portfolio companies, software projects, or derived
 * metadata.
 *
 * Labels are chosen to be unambiguous (see embedding-input-contracts.ts header).
 *
 * Verified against actual type definitions:
 *   investment→ src/types/investment.ts (Investment interface)
 *   project   → src/types/project.ts (Project interface)
 *   ai_analysis → src/lib/db/schema/ai-analysis.ts (aiAnalysisLatest)
 *   opengraph → src/lib/db/schema/opengraph.ts (opengraphMetadata)
 *
 * @module lib/db/embedding-field-specs-entities
 */

import type { EmbeddingFieldSpec } from "@/types/db/embeddings";

/**
 * Source: `data/investments.ts` → `investments` table.
 * Entity ID: `investments.id` (slug-style string).
 * Verified against `src/types/investment.ts`.
 */
export const INVESTMENT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "name",
    label: "Company Name",
    meaning: "Legal or trade name of the portfolio company",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Company Description",
    meaning: "What the company does, its product, and target market",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "category",
    label: "Business Sector",
    meaning: "Industry vertical (e.g. 'AI / ML', 'Fintech'); NOT a product category",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "stage",
    label: "Funding Round at Entry",
    meaning: "VC funding round at time of investment (e.g. 'Seed+', 'Series A')",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "status",
    label: "Investment Outcome",
    meaning: "'Active' = currently held; 'Realized' = fully exited",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "operating_status",
    label: "Company Operating State",
    meaning: "'Operating', 'Shut Down', 'Acquired', or 'Inactive'",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "location",
    label: "Company Headquarters",
    meaning: "City and state of primary office (e.g. 'New York, NY')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "type",
    label: "Investment Vehicle",
    meaning: "'Direct' = equity purchase; may also be fund-of-fund or SPV",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "invested_year",
    label: "Year of Investment",
    meaning: "Calendar year the capital was deployed (e.g. '2022')",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "accelerator.program",
    label: "Startup Accelerator Program",
    meaning: "Accelerator name if applicable (e.g. 'techstars', 'ycombinator')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "accelerator.batch",
    label: "Accelerator Cohort",
    meaning: "Specific batch or cohort within the accelerator",
    required: false,
    verboseField: false,
  },
];

/**
 * Source: `data/projects.ts` → `projects` table.
 * Entity ID: `projects.id` (slug-style string).
 * Verified against `src/types/project.ts`.
 */
export const PROJECT_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "name",
    label: "Project Name",
    meaning: "Display name of the software project",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "shortSummary",
    label: "Project Summary",
    meaning: "One-line purpose statement for card/list display",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "description",
    label: "Project Description",
    meaning: "Multi-sentence explanation of the project's architecture and features",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "tags",
    label: "Topic Tags",
    meaning: "Domain classification labels (e.g. 'Analytics', 'AI', 'Web Application')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "techStack",
    label: "Technology Stack",
    meaning: "Frameworks, languages, and infrastructure (e.g. 'Next.js', 'PostgreSQL')",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "note",
    label: "Author Annotation",
    meaning: "Optional disclaimer or contextual note about the project",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Project Website URL",
    meaning: "Primary public URL for the project",
    required: true,
    verboseField: false,
  },
  {
    sourceKey: "githubUrl",
    label: "Source Code Repository URL",
    meaning: "GitHub or other host URL for source code, if public",
    required: false,
    verboseField: false,
  },
];

/** Source: `ai_analysis_latest` table. Entity ID: `"{source_domain}:{entity_id}"`. */
export const AI_ANALYSIS_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "payload.analysis.summary",
    label: "AI Analysis Summary",
    meaning: "Machine-generated analytical summary of the source entity",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.analysis.highlights",
    label: "AI Analysis Key Points",
    meaning: "Most important findings from the AI analysis",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.analysis.themes",
    label: "AI Analysis Themes",
    meaning: "High-level thematic categories identified by the analysis",
    required: false,
    verboseField: false,
  },
];

/** Source: `opengraph_metadata` table. Entity ID: `url_hash` (SHA-256 hex). */
export const OPENGRAPH_EMBEDDING_FIELDS: readonly EmbeddingFieldSpec[] = [
  {
    sourceKey: "payload.title",
    label: "OpenGraph Page Title",
    meaning: "og:title meta tag value from the web page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "payload.description",
    label: "OpenGraph Page Description",
    meaning: "og:description meta tag value from the web page",
    required: false,
    verboseField: false,
  },
  {
    sourceKey: "url",
    label: "Page URL",
    meaning: "Full URL whose OpenGraph metadata was fetched",
    required: true,
    verboseField: false,
  },
];
