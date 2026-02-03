/**
 * Project AI Analysis Schemas
 * @module types/schemas/project-ai-analysis
 * @description
 * Zod v4 schemas for AI-generated project analysis.
 * Tailored for technical content: features, architecture, use cases.
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Technical Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Technical details about the project's implementation and maturity.
 */
export const projectAiAnalysisTechnicalDetailsSchema = z.object({
  /** Architecture pattern (e.g., "serverless", "monolith", "microservices") */
  architecture: z.string().nullable(),
  /** Complexity level (e.g., "simple utility", "moderate", "enterprise-grade") */
  complexity: z.string().nullable(),
  /** Maturity (e.g., "experimental", "production-ready", "mature") */
  maturity: z.string().nullable(),
});

export type ProjectAiAnalysisTechnicalDetails = z.infer<
  typeof projectAiAnalysisTechnicalDetailsSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Response Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Complete AI analysis response for a project */
export const projectAiAnalysisResponseSchema = z.object({
  /** 2-3 sentence overview of what the project does and its purpose */
  summary: z.string().min(1),
  /** Primary category (e.g., "Developer Tool", "Web Application", "Library") */
  category: z.string().min(1),
  /** 3-5 key features, capabilities, or notable aspects */
  keyFeatures: z.array(z.string()).min(1).max(6),
  /** Who would benefit from using this project */
  targetUsers: z.string().min(1),
  /** Technical details about the project's implementation */
  technicalDetails: projectAiAnalysisTechnicalDetailsSchema,
  /** Similar projects, alternatives, or complementary tools */
  relatedProjects: z.array(z.string()),
  /** What makes this project interesting or innovative */
  uniqueValue: z.string().min(1),
});

export type ProjectAiAnalysisResponse = z.infer<typeof projectAiAnalysisResponseSchema>;
