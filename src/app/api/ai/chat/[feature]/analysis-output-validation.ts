import "server-only";

import { jsonrepair } from "jsonrepair";
import {
  ANALYSIS_FIELD_CONFIG,
  ANALYSIS_LENGTH_LIMITS,
  ANALYSIS_SCHEMA_BY_FEATURE,
  PROMPT_LEAKAGE_PATTERNS,
} from "./analysis-output-config";

export function isAnalysisFeature(
  feature: string,
): feature is keyof typeof ANALYSIS_SCHEMA_BY_FEATURE {
  return Object.hasOwn(ANALYSIS_SCHEMA_BY_FEATURE, feature);
}

function containsLettersOrNumbers(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function stripLlmControlTokens(rawText: string): string {
  let text = rawText.trim();
  text = text.replaceAll(/<\|[^|]+\|>/g, "");
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return text.trim();
}

function findJsonStartIndex(text: string): number {
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const hasObject = firstObject !== -1;
  const hasArray = firstArray !== -1;
  if (!hasObject && !hasArray) return -1;
  if (hasObject && hasArray) return Math.min(firstObject, firstArray);
  return hasObject ? firstObject : firstArray;
}

function scanBalancedBrackets(text: string, start: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let idx = start; idx < text.length; idx += 1) {
    const char = text[idx];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
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
      if (stack.length === 0) return text.slice(start, idx + 1).trim();
    }
  }

  return null;
}

function extractBalancedJsonPayload(text: string): string | null {
  const start = findJsonStartIndex(text);
  if (start < 0) return null;
  return scanBalancedBrackets(text, start);
}

function parseAnalysisJson(rawText: string): unknown {
  const cleaned = stripLlmControlTokens(rawText);
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(cleaned)?.[1]?.trim();
  const extractedFromFenced = extractBalancedJsonPayload(fenced ?? "");
  const extractedFromCleaned = extractBalancedJsonPayload(cleaned);
  const candidates = [extractedFromFenced, fenced, extractedFromCleaned, cleaned];
  const errors: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      errors.push(`direct: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      return JSON.parse(jsonrepair(trimmed));
    } catch (error) {
      errors.push(`repair: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `All JSON parse strategies exhausted (${rawText.length} chars). ` +
      `Errors: [${errors.join("; ")}]. Preview: ${rawText.slice(0, 120)}`,
  );
}

function normalizeStringFields(root: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    const fieldValue = root[field];
    if (typeof fieldValue === "string") {
      root[field] = stripLlmControlTokens(fieldValue);
      continue;
    }
    if (!Array.isArray(fieldValue)) continue;

    const candidate = fieldValue
      .map((item) => (typeof item === "string" ? stripLlmControlTokens(item) : ""))
      .find((item) => item.length > 0 && containsLettersOrNumbers(item));
    if (candidate) root[field] = candidate;
  }
}

function normalizeAudienceField(
  root: Record<string, unknown>,
  feature: string,
  audienceField: string,
): void {
  const audienceValue = root[audienceField];
  if (typeof audienceValue === "string" && containsLettersOrNumbers(audienceValue)) return;

  const category = root.category;
  const categoryLabel =
    typeof category === "string" && containsLettersOrNumbers(category)
      ? category.trim()
      : "this content";
  root[audienceField] = `People interested in ${categoryLabel}.`;
  console.warn("[upstream-pipeline] Derived audience fallback from normalized category", {
    feature,
    audienceField,
    originalType: typeof audienceValue,
  });
}

function normalizeListFields(root: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    const fieldValue = root[field];
    const rawItems = Array.isArray(fieldValue)
      ? fieldValue
      : typeof fieldValue === "string"
        ? [fieldValue]
        : [];
    if (rawItems.length === 0) continue;

    const normalizedItems = rawItems
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item): item is string => typeof item === "string" && containsLettersOrNumbers(item));
    if (normalizedItems.length > 0) {
      root[field] = normalizedItems.slice(0, 6);
      continue;
    }

    const fallbackItems = rawItems
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0)
      .slice(0, 6);
    if (fallbackItems.length > 0) root[field] = fallbackItems;
  }
}

function normalizeDetailFields(
  root: Record<string, unknown>,
  detailKey: string,
  fields: readonly string[],
): void {
  const detailValue = root[detailKey];
  const normalizedDetails =
    typeof detailValue === "object" && detailValue !== null
      ? { ...(detailValue as Record<string, unknown>) }
      : {};
  for (const field of fields) {
    const entryValue = normalizedDetails[field];
    if (entryValue === null || entryValue === undefined) {
      normalizedDetails[field] = null;
      continue;
    }
    if (typeof entryValue !== "string") {
      normalizedDetails[field] = null;
      continue;
    }
    const cleaned = stripLlmControlTokens(entryValue);
    normalizedDetails[field] =
      cleaned.length > 0 && containsLettersOrNumbers(cleaned) ? cleaned : null;
  }
  root[detailKey] = normalizedDetails;
}

function normalizeAnalysisPayload(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  value: unknown,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  const config = ANALYSIS_FIELD_CONFIG[feature];
  const root = { ...(value as Record<string, unknown>) };

  normalizeStringFields(root, config.requiredStringFields);
  normalizeAudienceField(root, feature, config.audienceField);
  normalizeListFields(root, config.requiredListFields);
  normalizeDetailFields(root, config.detailKey, config.nullableDetailFields);

  return root;
}

function hasPromptLeakage(value: string): boolean {
  const lowered = value.toLowerCase();
  return PROMPT_LEAKAGE_PATTERNS.some((pattern) =>
    pattern === String.raw`<\/` ? lowered.includes("</") : lowered.includes(pattern),
  );
}

function findSuspiciousAnalysisContent(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  value: unknown,
): string | null {
  if (typeof value !== "object" || value === null) return "Response is not a JSON object.";
  const config = ANALYSIS_FIELD_CONFIG[feature];
  const root = value as Record<string, unknown>;

  for (const field of config.requiredStringFields) {
    const fieldValue = root[field];
    if (typeof fieldValue !== "string") continue;
    if (fieldValue.length > ANALYSIS_LENGTH_LIMITS.stringField) {
      return `${field} exceeds maximum length ${ANALYSIS_LENGTH_LIMITS.stringField}.`;
    }
    if (hasPromptLeakage(fieldValue)) return `${field} appears to contain prompt leakage text.`;
  }

  for (const field of config.requiredListFields) {
    const listValue = root[field];
    if (!Array.isArray(listValue)) continue;
    for (const [index, item] of listValue.entries()) {
      if (typeof item !== "string") continue;
      if (item.length > ANALYSIS_LENGTH_LIMITS.listItem) {
        return `${field}[${index}] exceeds maximum length ${ANALYSIS_LENGTH_LIMITS.listItem}.`;
      }
      if (hasPromptLeakage(item))
        return `${field}[${index}] appears to contain prompt leakage text.`;
    }
  }

  const detailValue = root[config.detailKey];
  if (typeof detailValue !== "object" || detailValue === null) return null;
  const detailRecord = detailValue as Record<string, unknown>;
  for (const field of config.nullableDetailFields) {
    const item = detailRecord[field];
    if (typeof item !== "string") continue;
    if (item.length > ANALYSIS_LENGTH_LIMITS.detailField) {
      return `${config.detailKey}.${field} exceeds maximum length ${ANALYSIS_LENGTH_LIMITS.detailField}.`;
    }
    if (hasPromptLeakage(item))
      return `${config.detailKey}.${field} appears to contain prompt leakage text.`;
  }

  return null;
}

export function buildAnalysisRepairPrompt(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  validationReason: string,
): string {
  const requiredFields = ANALYSIS_FIELD_CONFIG[feature].requiredFields.join(", ");
  return `Rewrite your previous answer as valid JSON only.
Required top-level fields: ${requiredFields}.
Validation error: ${validationReason}
Do not include markdown fences, commentary, placeholders, or trailing text.
Do not use ellipses like "..." or empty strings for required fields.
Every required string field must contain real, descriptive text with letters or numbers.
Return a single JSON object and nothing else.`;
}

export function validateAnalysisOutput(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  text: string,
): { ok: true; normalizedText: string } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = parseAnalysisJson(text);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const normalized = normalizeAnalysisPayload(feature, parsed);
  const suspiciousContentReason = findSuspiciousAnalysisContent(feature, normalized);
  if (suspiciousContentReason) {
    return { ok: false, reason: suspiciousContentReason };
  }

  const validation = ANALYSIS_SCHEMA_BY_FEATURE[feature].safeParse(normalized);
  if (validation.success) {
    return { ok: true, normalizedText: JSON.stringify(validation.data) };
  }

  const issuePreview = validation.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  console.warn("[upstream-pipeline] Schema validation failed after normalization", {
    feature,
    issuePreview,
    failingFields: validation.error.issues.slice(0, 3).map((issue) => ({
      path: issue.path.join("."),
      value: issue.path.reduce<unknown>((obj, key) => {
        if (typeof obj !== "object" || obj === null || typeof key === "symbol") return undefined;
        return (obj as Record<string, unknown>)[String(key)];
      }, normalized),
    })),
  });
  return {
    ok: false,
    reason: issuePreview || "Schema validation failed for analysis output.",
  };
}
