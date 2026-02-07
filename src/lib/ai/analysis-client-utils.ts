/**
 * AI Analysis Client Utilities
 * @module lib/ai/analysis-client-utils
 * @description
 * Shared utilities for AI analysis client components.
 * Includes JSON parsing for LLM responses and S3 persistence helpers.
 */

import * as Sentry from "@sentry/nextjs";
import type { AnalysisDomain } from "@/lib/ai-analysis/types";

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parsing Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips LLM control tokens and extracts JSON content.
 * Handles common LLM output artifacts like control tokens and markdown code blocks.
 */
export function stripLlmTokens(rawText: string): string {
  let text = rawText.trim();

  // Strip LLM control tokens (e.g., <|channel|>final <|constrain|>JSON<|message|>)
  text = text.replace(/<\|[^|]+\|>[^{"]*/g, "");

  // Strip markdown code blocks
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return text.trim();
}

/**
 * Parses JSON from LLM output after stripping wrapper tokens.
 *
 * @param rawText - Raw LLM response text
 * @returns Parsed JSON value
 * @throws Error if the response is not valid JSON
 */
export function parseLlmJson(rawText: string): unknown {
  const cleaned = stripLlmTokens(rawText);
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────────────────────────────────────────
// S3 Persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist analysis to S3 via API endpoint.
 * Fire-and-forget - tracks errors via Sentry but doesn't block the UI.
 *
 * @param domain - The analysis domain (bookmarks, books, projects)
 * @param id - The item ID
 * @param analysis - The analysis data to persist
 */
export async function persistAnalysisToS3(
  domain: AnalysisDomain,
  id: string,
  analysis: unknown,
): Promise<void> {
  const context = { id, domain };

  try {
    const response = await fetch(`/api/ai/analysis/${domain}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis }),
    });

    if (!response.ok) {
      Sentry.captureMessage(`${domain} AI analysis persist failed`, {
        level: "warning",
        extra: { ...context, status: response.status, statusText: response.statusText },
      });
    }
  } catch (error) {
    Sentry.captureException(error, {
      extra: context,
      tags: { feature: "ai-analysis-persist" },
    });
  }
}
