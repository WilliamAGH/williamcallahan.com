"use client";

/**
 * Bookmark AI Analysis Component
 * @module components/features/bookmarks/bookmark-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for bookmark-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import type {
  BookmarkAiAnalysisProps,
  BookmarkAnalysisContext,
} from "@/types/bookmark-ai-analysis";
import {
  bookmarkAiAnalysisResponseSchema,
  type BookmarkAiAnalysisResponse,
} from "@/types/schemas/bookmark-ai-analysis";
import { extractBookmarkAnalysisContext } from "@/lib/bookmarks/analysis/extract-context";
import {
  buildBookmarkAnalysisSystemPrompt,
  buildBookmarkAnalysisUserPrompt,
} from "@/lib/bookmarks/analysis/build-prompt";
import { AiAnalysisTerminal } from "@/components/features/ai-analysis/ai-analysis-terminal.client";
import {
  BulletListSection,
  ChipListSection,
  TechDetailsSection,
} from "@/components/features/ai-analysis/analysis-render-sections";
import type { AnalysisRenderHelpers } from "@/types/ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "bookmark-analysis";
const PERSISTENCE_KEY = "bookmarks";

const LOADING_MESSAGES = [
  "Fetching context vectors...",
  "Analyzing semantic structure...",
  "Extracting key patterns...",
  "Synthesizing insights...",
];

export const BOOKMARK_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "bookmark_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", minLength: 1 },
        category: { type: "string", minLength: 1 },
        highlights: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        contextualDetails: {
          type: "object",
          additionalProperties: false,
          properties: {
            primaryDomain: { type: ["string", "null"] },
            format: { type: ["string", "null"] },
            accessMethod: { type: ["string", "null"] },
          },
          required: ["primaryDomain", "format", "accessMethod"],
        },
        relatedResources: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        targetAudience: { type: "string", minLength: 1 },
      },
      required: [
        "summary",
        "category",
        "highlights",
        "contextualDetails",
        "relatedResources",
        "targetAudience",
      ],
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderBookmarkAnalysis(
  analysis: BookmarkAiAnalysisResponse,
  helpers: AnalysisRenderHelpers,
) {
  const { AnalysisSection, skipAnimation } = helpers;
  return (
    <>
      {analysis.summary && (
        <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
          {analysis.summary}
        </AnalysisSection>
      )}

      <BulletListSection
        items={analysis.highlights}
        label="Highlights"
        index={1}
        accentColor="#9ece6a"
        helpers={helpers}
      />

      <TechDetailsSection
        details={[
          { label: "domain", value: analysis.contextualDetails?.primaryDomain },
          { label: "format", value: analysis.contextualDetails?.format },
          { label: "access", value: analysis.contextualDetails?.accessMethod },
        ]}
        label="Details"
        index={2}
        accentColor="#bb9af7"
        helpers={helpers}
      />

      <ChipListSection
        items={analysis.relatedResources}
        label="Related"
        index={3}
        accentColor="#73daca"
        chipClassName="px-2 py-0.5 text-xs font-mono bg-[#73daca]/10 text-[#73daca] rounded border border-[#73daca]/20"
        helpers={helpers}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function BookmarkAiAnalysis({
  bookmark,
  className = "",
  autoTrigger = true,
  initialAnalysis,
}: Readonly<BookmarkAiAnalysisProps>) {
  return (
    <AiAnalysisTerminal
      entity={bookmark}
      entityId={bookmark.id}
      featureName={AI_FEATURE_NAME}
      persistenceKey={PERSISTENCE_KEY}
      loadingMessages={LOADING_MESSAGES}
      extractContext={extractBookmarkAnalysisContext}
      buildSystemPrompt={buildBookmarkAnalysisSystemPrompt}
      buildUserPrompt={(ctx) => buildBookmarkAnalysisUserPrompt(ctx as BookmarkAnalysisContext)}
      responseFormat={BOOKMARK_ANALYSIS_RESPONSE_FORMAT}
      responseSchema={bookmarkAiAnalysisResponseSchema}
      renderAnalysis={renderBookmarkAnalysis}
      getCategory={(a) => a.category}
      footerText="Powered by AI"
      autoTrigger={autoTrigger}
      initialAnalysis={initialAnalysis}
      className={className}
    />
  );
}
