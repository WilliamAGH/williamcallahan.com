"use client";

/**
 * Bookmark AI Analysis Component
 * @module components/features/bookmarks/bookmark-ai-analysis.client
 * @description
 * Thin wrapper around the ModernAiAnalysis for bookmark-specific analysis.
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
  ModernAnalysisCard,
  modernHelpers,
} from "@/components/features/ai-analysis/modern-ai-analysis.client";
import {
  BulletListSection,
  ChipListSection,
} from "@/components/features/ai-analysis/analysis-render-sections";
import { ExpandableText } from "@/components/ui/expandable-text.client";
import { Layers } from "lucide-react";
import type { AnalysisRenderHelpers } from "@/types/ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AI_FEATURE_NAME = "bookmark-analysis";
const PERSISTENCE_KEY = "bookmarks";

const LOADING_MESSAGES = [
  "Reading content...",
  "Identifying key points...",
  "Summarizing insights...",
  "Finalizing analysis...",
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
        accentColor="" // Not used by ModernAiAnalysis helpers
        helpers={helpers}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Split Details: Left column (context + audience) and Right column (related)
// ─────────────────────────────────────────────────────────────────────────────

/** Left column: context metadata + audience */
export function BookmarkAiContext({
  analysis,
  className = "",
}: Readonly<{
  analysis: BookmarkAiAnalysisResponse;
  className?: string;
}>) {
  const { TechDetail } = modernHelpers;

  const details = [
    { label: "Domain", value: analysis.contextualDetails?.primaryDomain },
    { label: "Format", value: analysis.contextualDetails?.format },
    { label: "Access", value: analysis.contextualDetails?.accessMethod },
  ].filter(
    (d): d is { label: string; value: string } => typeof d.value === "string" && d.value.length > 0,
  );

  const audience = analysis.targetAudience;
  if (details.length === 0 && !audience) return null;

  return (
    <ModernAnalysisCard className={`p-5 ${className}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-blue-500" />
        Context
      </h3>
      <ExpandableText collapsedHeight="md">
        {audience && (
          <div
            className={
              details.length > 0 ? "mb-3 pb-3 border-b border-gray-100 dark:border-gray-800" : ""
            }
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Audience
            </span>
            <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {audience}
            </p>
          </div>
        )}
        <div className="space-y-0">
          {details.map((d) => (
            <TechDetail key={d.label} label={d.label} value={d.value} />
          ))}
        </div>
      </ExpandableText>
    </ModernAnalysisCard>
  );
}

/** Right column: related resources */
export function BookmarkAiRelated({
  analysis,
  className = "",
}: Readonly<{
  analysis: BookmarkAiAnalysisResponse;
  className?: string;
}>) {
  const helpers: AnalysisRenderHelpers = { ...modernHelpers, skipAnimation: true };

  if (!analysis.relatedResources || analysis.relatedResources.length === 0) return null;

  return (
    <ModernAnalysisCard className={`p-5 ${className}`}>
      <ChipListSection
        items={analysis.relatedResources}
        label="Related"
        index={0}
        accentColor=""
        chipClassName="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-default"
        helpers={helpers}
      />
    </ModernAnalysisCard>
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
  onAnalysisComplete,
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
      autoTrigger={autoTrigger}
      initialAnalysis={initialAnalysis}
      onAnalysisComplete={onAnalysisComplete}
      className={className}
    />
  );
}
