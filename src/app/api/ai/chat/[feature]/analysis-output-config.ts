import "server-only";

import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { bookmarkAiAnalysisResponseSchema } from "@/types/schemas/bookmark-ai-analysis";
import { projectAiAnalysisResponseSchema } from "@/types/schemas/project-ai-analysis";

export const ANALYSIS_SCHEMA_BY_FEATURE = {
  "bookmark-analysis": bookmarkAiAnalysisResponseSchema,
  "book-analysis": bookAiAnalysisResponseSchema,
  "project-analysis": projectAiAnalysisResponseSchema,
} as const;

export const ANALYSIS_FIELD_CONFIG: Record<
  keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
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

export const ANALYSIS_LENGTH_LIMITS = {
  stringField: 320,
  listItem: 180,
  detailField: 140,
} as const;
