/**
 * Project AI Analysis Schemas
 * @module types/schemas/project-ai-analysis
 * @description
 * Zod v4 schemas for AI-generated project analysis.
 * Tailored for technical content: features, architecture, use cases.
 */

import { z } from "zod/v4";
import {
  meaningfulStringSchema,
  nullableMeaningfulStringSchema,
  meaningfulStringListSchema,
} from "@/types/schemas/ai-analysis-common";

// ─────────────────────────────────────────────────────────────────────────────
// Technical Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Technical details about the project's implementation and maturity.
 */
export const projectAiAnalysisTechnicalDetailsSchema = z.object({
  /** Architecture pattern (e.g., "serverless", "monolith", "microservices") */
  architecture: nullableMeaningfulStringSchema,
  /** Complexity level (e.g., "simple utility", "moderate", "enterprise-grade") */
  complexity: nullableMeaningfulStringSchema,
  /** Maturity (e.g., "experimental", "production-ready", "mature") */
  maturity: nullableMeaningfulStringSchema,
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
  summary: meaningfulStringSchema,
  /** Primary category (e.g., "Developer Tool", "Web Application", "Library") */
  category: meaningfulStringSchema,
  /** 3-5 key features, capabilities, or notable aspects */
  keyFeatures: meaningfulStringListSchema,
  /** Who would benefit from using this project */
  targetUsers: meaningfulStringSchema,
  /** Technical details about the project's implementation */
  technicalDetails: projectAiAnalysisTechnicalDetailsSchema,
  /** Similar projects, alternatives, or complementary tools */
  relatedProjects: meaningfulStringListSchema,
  /** What makes this project interesting or innovative */
  uniqueValue: meaningfulStringSchema,
});

export type ProjectAiAnalysisResponse = z.infer<typeof projectAiAnalysisResponseSchema>;
