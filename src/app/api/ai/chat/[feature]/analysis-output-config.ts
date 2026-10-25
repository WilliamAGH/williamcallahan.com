import "server-only";

import type { AnalysisDomain } from "@/types/ai-analysis";
import type { AnalysisFeatureId } from "@/types/features/ai-chat";
import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { bookmarkAiAnalysisResponseSchema } from "@/types/schemas/bookmark-ai-analysis";
import { projectAiAnalysisResponseSchema } from "@/types/schemas/project-ai-analysis";

export const ANALYSIS_SCHEMA_BY_FEATURE = {
  "bookmark-analysis": bookmarkAiAnalysisResponseSchema,
  "book-analysis": bookAiAnalysisResponseSchema,
  "project-analysis": projectAiAnalysisResponseSchema,
} satisfies Record<
  AnalysisFeatureId,
  | typeof bookmarkAiAnalysisResponseSchema
  | typeof bookAiAnalysisResponseSchema
  | typeof projectAiAnalysisResponseSchema
>;

export const ANALYSIS_DOMAIN_BY_FEATURE = {
  "bookmark-analysis": "bookmarks",
  "book-analysis": "books",
  "project-analysis": "projects",
} satisfies Record<AnalysisFeatureId, AnalysisDomain>;

export const ANALYSIS_FIELD_CONFIG: Record<
  AnalysisFeatureId,
  {
    requiredFields: readonly string[];
    requiredStringFields: readonly string[];
    requiredListFields: readonly string[];
    detailKey: "contextualDetails" | "technicalDetails";
    nullableDetailFields: readonly string[];
    audienceField: "targetAudience" | "idealReader" | "targetUsers";
  }
> = {
  "bookmark-analysis": {
    requiredFields: [
      "summary",
      "category",
      "highlights",
      "contextualDetails",
      "relatedResources",
      "targetAudience",
    ],
    requiredStringFields: ["summary", "category", "targetAudience"],
    requiredListFields: ["highlights", "relatedResources"],
    detailKey: "contextualDetails",
    nullableDetailFields: ["primaryDomain", "format", "accessMethod"],
    audienceField: "targetAudience",
  },
  "book-analysis": {
    requiredFields: [
      "summary",
      "category",
      "keyThemes",
      "idealReader",
      "contextualDetails",
      "relatedReading",
      "whyItMatters",
    ],
    requiredStringFields: ["summary", "category", "idealReader", "whyItMatters"],
    requiredListFields: ["keyThemes", "relatedReading"],
    detailKey: "contextualDetails",
    nullableDetailFields: ["writingStyle", "readingLevel", "commitment"],
    audienceField: "idealReader",
  },
  "project-analysis": {
    requiredFields: [
      "summary",
      "category",
      "keyFeatures",
      "targetUsers",
      "technicalDetails",
      "relatedProjects",
      "uniqueValue",
    ],
    requiredStringFields: ["summary", "category", "targetUsers", "uniqueValue"],
    requiredListFields: ["keyFeatures", "relatedProjects"],
    detailKey: "technicalDetails",
    nullableDetailFields: ["architecture", "complexity", "maturity"],
    audienceField: "targetUsers",
  },
};

export const PROMPT_LEAKAGE_PATTERNS = [
  "the user wants",
  "provide strict json",
  "placeholder for the final answer",
  "```",
  "jsonc",
  "json5",
  String.raw`<\/`,
] as const;
