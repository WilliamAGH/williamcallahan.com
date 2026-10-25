/**
 * AI Analysis Client Utilities
 * @module lib/ai/analysis-client-utils
 * @description
 * Shared utilities for AI analysis client components.
 * JSON parsing for LLM responses.
 */

import { jsonrepair } from "jsonrepair";

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
  text = text.replaceAll(/<\|[^|]+\|>/g, "");

  // Strip markdown code blocks
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  return text.trim();
}

function extractBalancedJsonPayload(text: string): string | null {
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const hasObject = firstObject !== -1;
  const hasArray = firstArray !== -1;
  if (!hasObject && !hasArray) return null;

  let start: number;
  if (hasObject && hasArray) {
    start = Math.min(firstObject, firstArray);
  } else if (hasObject) {
    start = firstObject;
  } else {
    start = firstArray;
  }
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let idx = start; idx < text.length; idx += 1) {
    const char = text[idx];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (!expected || expected !== char) return null;
      if (stack.length === 0) {
        return text.slice(start, idx + 1).trim();
      }
    }
  }

  return null;
}

function extractFencedBlock(text: string): string | null {
  const match = new RegExp(/```(?:json)?\s*([\s\S]*?)\s*```/i).exec(text);
  return match?.[1]?.trim() ?? null;
}

function buildParseCandidates(rawText: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: string | null | undefined) => {
    if (!candidate) return;
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const cleaned = stripLlmTokens(rawText);
  const fenced = extractFencedBlock(cleaned);
  const extractedFromFenced = extractBalancedJsonPayload(fenced ?? "");
  const extractedFromCleaned = extractBalancedJsonPayload(cleaned);

  // Prioritize precise payload candidates before broader text candidates.
  addCandidate(extractedFromFenced);
  addCandidate(fenced);
  addCandidate(extractedFromCleaned);
  addCandidate(cleaned);

  return candidates;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses JSON from LLM output after stripping wrapper tokens.
 *
 * @param rawText - Raw LLM response text
 * @returns Parsed JSON value
 * @throws Error if the response is not valid JSON
 */
export function parseLlmJson(rawText: string): unknown {
  const candidates = buildParseCandidates(rawText);
  const parseErrors: string[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isJsonObject(parsed)) return parsed;
      parseErrors.push("JSON.parse produced a non-object value.");
    } catch (parseError) {
      parseErrors.push(
        parseError instanceof Error ? parseError.message : "Unknown JSON.parse error",
      );
    }

    try {
      const repaired = jsonrepair(candidate);
      const parsedRepaired = JSON.parse(repaired);
      if (isJsonObject(parsedRepaired)) return parsedRepaired;
      parseErrors.push("jsonrepair produced a non-object value.");
    } catch (repairError) {
      parseErrors.push(
        repairError instanceof Error ? repairError.message : "Unknown jsonrepair parse error",
      );
    }
  }

  const firstError = parseErrors[0] ?? "No parse candidates were produced from model output.";
  throw new Error(`Unable to parse LLM JSON response: ${firstError}`);
}
