"use client";

/**
 * Bookmark AI Analysis Component
 * @module components/features/bookmarks/bookmark-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for bookmark-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import { motion } from "framer-motion";
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

const BOOKMARK_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "bookmark_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        category: { type: "string" },
        highlights: { type: "array", items: { type: "string" } },
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
        relatedResources: { type: "array", items: { type: "string" } },
        targetAudience: { type: "string" },
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
  { AnalysisSection, TerminalListItem, TechDetail, skipAnimation }: AnalysisRenderHelpers,
) {
  return (
    <>
      {/* Summary */}
      <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
        {analysis.summary}
      </AnalysisSection>

      {/* Highlights */}
      {analysis.highlights.length > 0 && (
        <AnalysisSection
          label="Highlights"
          index={1}
          accentColor="#9ece6a"
          skipAnimation={skipAnimation}
        >
          <ul className="space-y-1.5 mt-1">
            {analysis.highlights.map((highlight, idx) => (
              <TerminalListItem key={idx} index={idx} skipAnimation={skipAnimation}>
                {highlight}
              </TerminalListItem>
            ))}
          </ul>
        </AnalysisSection>
      )}

      {/* Contextual Details */}
      {(analysis.contextualDetails.primaryDomain ||
        analysis.contextualDetails.format ||
        analysis.contextualDetails.accessMethod) && (
        <AnalysisSection
          label="Details"
          index={2}
          accentColor="#bb9af7"
          skipAnimation={skipAnimation}
        >
          <div className="space-y-1 mt-1 bg-black/20 rounded p-3 border border-[#3d4f70]/50">
            {analysis.contextualDetails.primaryDomain && (
              <TechDetail label="domain" value={analysis.contextualDetails.primaryDomain} />
            )}
            {analysis.contextualDetails.format && (
              <TechDetail label="format" value={analysis.contextualDetails.format} />
            )}
            {analysis.contextualDetails.accessMethod && (
              <TechDetail label="access" value={analysis.contextualDetails.accessMethod} />
            )}
          </div>
        </AnalysisSection>
      )}

      {/* Related Resources - compact chips */}
      {analysis.relatedResources.length > 0 && (
        <AnalysisSection
          label="Related"
          index={3}
          accentColor="#73daca"
          skipAnimation={skipAnimation}
        >
          <div className="flex flex-wrap gap-1.5 mt-1">
            {analysis.relatedResources.map((resource, idx) => (
              <motion.span
                key={idx}
                initial={skipAnimation ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="px-2 py-0.5 text-xs font-mono bg-[#73daca]/10 text-[#73daca] rounded border border-[#73daca]/20"
              >
                {resource}
              </motion.span>
            ))}
          </div>
        </AnalysisSection>
      )}
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
}: BookmarkAiAnalysisProps) {
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
