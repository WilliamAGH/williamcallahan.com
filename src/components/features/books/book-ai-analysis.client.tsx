"use client";

/**
 * Book AI Analysis Component
 * @module components/features/books/book-ai-analysis.client
 * @description
 * Thin wrapper around the generic AiAnalysisTerminal for book-specific analysis.
 * Provides domain-specific configuration: context extraction, prompts, schema, and rendering.
 */

import type { BookAiAnalysisProps, BookAnalysisContext } from "@/types/book-ai-analysis";
import {
  bookAiAnalysisResponseSchema,
  type BookAiAnalysisResponse,
} from "@/types/schemas/book-ai-analysis";
import { extractBookAnalysisContext } from "@/lib/books/analysis/extract-context";
import {
  buildBookAnalysisSystemPrompt,
  buildBookAnalysisUserPrompt,
} from "@/lib/books/analysis/build-prompt";
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

const AI_FEATURE_NAME = "book-analysis";
const PERSISTENCE_KEY = "books";

const LOADING_MESSAGES = [
  "Analyzing literary context...",
  "Extracting key themes...",
  "Identifying ideal readers...",
  "Synthesizing insights...",
];

export const BOOK_ANALYSIS_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "book_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string", minLength: 1 },
        category: { type: "string", minLength: 1 },
        keyThemes: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        idealReader: { type: "string", minLength: 1 },
        contextualDetails: {
          type: "object",
          additionalProperties: false,
          properties: {
            writingStyle: { type: ["string", "null"] },
            readingLevel: { type: ["string", "null"] },
            commitment: { type: ["string", "null"] },
          },
          required: ["writingStyle", "readingLevel", "commitment"],
        },
        relatedReading: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 6,
        },
        whyItMatters: { type: "string", minLength: 1 },
      },
      required: [
        "summary",
        "category",
        "keyThemes",
        "idealReader",
        "contextualDetails",
        "relatedReading",
        "whyItMatters",
      ],
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderBookAnalysis(analysis: BookAiAnalysisResponse, helpers: AnalysisRenderHelpers) {
  const { AnalysisSection, skipAnimation } = helpers;
  return (
    <>
      {analysis.summary && (
        <AnalysisSection label="Summary" index={0} skipAnimation={skipAnimation}>
          {analysis.summary}
        </AnalysisSection>
      )}

      <BulletListSection
        items={analysis.keyThemes}
        label="Key Themes"
        index={1}
        accentColor="#9ece6a"
        helpers={helpers}
      />

      {analysis.idealReader && (
        <AnalysisSection
          label="Ideal Reader"
          index={2}
          accentColor="#e0af68"
          skipAnimation={skipAnimation}
        >
          {analysis.idealReader}
        </AnalysisSection>
      )}

      <TechDetailsSection
        details={[
          { label: "style", value: analysis.contextualDetails?.writingStyle },
          { label: "level", value: analysis.contextualDetails?.readingLevel },
          { label: "commitment", value: analysis.contextualDetails?.commitment },
        ]}
        label="Details"
        index={3}
        accentColor="#bb9af7"
        helpers={helpers}
      />

      {analysis.whyItMatters && (
        <AnalysisSection
          label="Why It Matters"
          index={4}
          accentColor="#73daca"
          skipAnimation={skipAnimation}
        >
          {analysis.whyItMatters}
        </AnalysisSection>
      )}

      <ChipListSection
        items={analysis.relatedReading}
        label="Related Reading"
        index={5}
        accentColor="#ff9e64"
        chipClassName="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md"
        helpers={helpers}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function BookAiAnalysis({
  book,
  className = "",
  autoTrigger = true,
  initialAnalysis,
}: Readonly<BookAiAnalysisProps>) {
  return (
    <AiAnalysisTerminal
      entity={book}
      entityId={book.id}
      featureName={AI_FEATURE_NAME}
      persistenceKey={PERSISTENCE_KEY}
      loadingMessages={LOADING_MESSAGES}
      extractContext={extractBookAnalysisContext}
      buildSystemPrompt={buildBookAnalysisSystemPrompt}
      buildUserPrompt={(ctx) => buildBookAnalysisUserPrompt(ctx as BookAnalysisContext)}
      responseFormat={BOOK_ANALYSIS_RESPONSE_FORMAT}
      responseSchema={bookAiAnalysisResponseSchema}
      renderAnalysis={renderBookAnalysis}
      getCategory={(a) => a.category}
      autoTrigger={autoTrigger}
      initialAnalysis={initialAnalysis}
      className={className}
    />
  );
}
