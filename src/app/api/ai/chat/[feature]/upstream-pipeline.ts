/**
 * Chat Pipeline Builder
 *
 * Assembles validated request context, configuration, and a run closure into a
 * {@link ChatPipeline} that the route handler dispatches through the upstream
 * request queue.
 *
 * @module api/ai/chat/upstream-pipeline
 */

import "server-only";

import { jsonrepair } from "jsonrepair";
import {
  buildUpstreamQueueKey,
  resolveOpenAiCompatibleFeatureConfig,
  resolvePreferredUpstreamModel,
} from "@/lib/ai/openai-compatible/feature-config";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import type {
  AiChatModelStreamEvent,
  ChatLogContext,
  ChatPipeline,
  RagContextStatus,
  UpstreamTurnOutcome,
  UpstreamTurnParams,
  ValidatedRequestContext,
} from "@/types/features/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import { bookAiAnalysisResponseSchema } from "@/types/schemas/book-ai-analysis";
import { bookmarkAiAnalysisResponseSchema } from "@/types/schemas/bookmark-ai-analysis";
import { projectAiAnalysisResponseSchema } from "@/types/schemas/project-ai-analysis";
import {
  formatBookmarkResultsAsLinks,
  matchesBookmarkSearchPattern,
  runDeterministicBookmarkFallback,
  sanitizeBookmarkLinksAgainstAllowlist,
} from "./bookmark-tool";
import {
  isHarmonyFormatModel,
  resolveFeatureSystemPrompt,
  resolveModelParams,
  resolveToolChoice,
} from "./feature-defaults";
import { isModelLoadFailure } from "./upstream-error";
import { executeChatCompletionsTurn, executeResponsesTurn } from "./upstream-turn";

// We intentionally keep explicit tool-turn orchestration because terminal bookmark search
// requires deterministic URL allowlisting and identical behavior across chat/responses modes.
const MAX_TOOL_TURNS = 4;
// Allow up to 2 repair attempts for analysis features (initial + 2 repairs = 3 total attempts).
// GPT-OSS models with Harmony format sometimes need an extra repair cycle to produce
// schema-conformant JSON when self-hosted via LM Studio / llama.cpp.
const MAX_ANALYSIS_VALIDATION_ATTEMPTS = 3;

const ANALYSIS_SCHEMA_BY_FEATURE = {
  "bookmark-analysis": bookmarkAiAnalysisResponseSchema,
  "book-analysis": bookAiAnalysisResponseSchema,
  "project-analysis": projectAiAnalysisResponseSchema,
} as const;

const ANALYSIS_REQUIRED_FIELDS: Record<keyof typeof ANALYSIS_SCHEMA_BY_FEATURE, readonly string[]> =
  {
    "bookmark-analysis": [
      "summary",
      "category",
      "highlights",
      "contextualDetails",
      "relatedResources",
      "targetAudience",
    ],
    "book-analysis": [
      "summary",
      "category",
      "keyThemes",
      "idealReader",
      "contextualDetails",
      "relatedReading",
      "whyItMatters",
    ],
    "project-analysis": [
      "summary",
      "category",
      "keyFeatures",
      "targetUsers",
      "technicalDetails",
      "relatedProjects",
      "uniqueValue",
    ],
  };

const ANALYSIS_REQUIRED_STRING_FIELDS: Record<
  keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  readonly string[]
> = {
  "bookmark-analysis": ["summary", "category", "targetAudience"],
  "book-analysis": ["summary", "category", "idealReader", "whyItMatters"],
  "project-analysis": ["summary", "category", "targetUsers", "uniqueValue"],
};

const ANALYSIS_REQUIRED_LIST_FIELDS: Record<
  keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  readonly string[]
> = {
  "bookmark-analysis": ["highlights", "relatedResources"],
  "book-analysis": ["keyThemes", "relatedReading"],
  "project-analysis": ["keyFeatures", "relatedProjects"],
};

const ANALYSIS_NULLABLE_DETAIL_FIELDS: Record<
  keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  readonly string[]
> = {
  "bookmark-analysis": ["primaryDomain", "format", "accessMethod"],
  "book-analysis": ["writingStyle", "readingLevel", "commitment"],
  "project-analysis": ["architecture", "complexity", "maturity"],
};

const ANALYSIS_AUDIENCE_FIELD_BY_FEATURE: Record<
  keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  "targetAudience" | "idealReader" | "targetUsers"
> = {
  "bookmark-analysis": "targetAudience",
  "book-analysis": "idealReader",
  "project-analysis": "targetUsers",
};

const PROMPT_LEAKAGE_PATTERNS = [
  "the user wants",
  "provide strict json",
  "placeholder for the final answer",
  "```",
  "jsonc",
  "json5",
  String.raw`<\/`,
] as const;

const MAX_ANALYSIS_STRING_LENGTH = 320;
const MAX_ANALYSIS_LIST_ITEM_LENGTH = 180;
const MAX_ANALYSIS_DETAIL_FIELD_LENGTH = 140;

function isAnalysisFeature(feature: string): feature is keyof typeof ANALYSIS_SCHEMA_BY_FEATURE {
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

function extractBalancedJsonPayload(text: string): string | null {
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const hasObject = firstObject !== -1;
  const hasArray = firstArray !== -1;
  if (!hasObject && !hasArray) return null;

  let start: number;
  if (hasObject && hasArray) start = Math.min(firstObject, firstArray);
  else if (hasObject) start = firstObject;
  else start = firstArray;
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
      if (char === '"') inString = false;
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
    } catch (e) {
      errors.push(`direct: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      return JSON.parse(jsonrepair(trimmed));
    } catch (e) {
      errors.push(`repair: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(
    `All JSON parse strategies exhausted (${rawText.length} chars). ` +
      `Errors: [${errors.join("; ")}]. Preview: ${rawText.slice(0, 120)}`,
  );
}

function normalizeAnalysisPayload(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  value: unknown,
): unknown {
  if (typeof value !== "object" || value === null) return value;

  const root = { ...(value as Record<string, unknown>) };
  const audienceField = ANALYSIS_AUDIENCE_FIELD_BY_FEATURE[feature];

  for (const field of ANALYSIS_REQUIRED_STRING_FIELDS[feature]) {
    const fieldValue = root[field];
    if (typeof fieldValue === "string") {
      // Strip Harmony control tokens that may leak into field values
      root[field] = stripLlmControlTokens(fieldValue);
      continue;
    }
    if (!Array.isArray(fieldValue)) continue;

    const candidate = fieldValue
      .map((item) => (typeof item === "string" ? stripLlmControlTokens(item) : ""))
      .find((item) => item.length > 0 && containsLettersOrNumbers(item));
    if (candidate) root[field] = candidate;
  }

  const audienceValue = root[audienceField];
  if (typeof audienceValue === "string" && !containsLettersOrNumbers(audienceValue)) {
    const category = root.category;
    const categoryLabel =
      typeof category === "string" && containsLettersOrNumbers(category)
        ? category.trim()
        : "this content";
    root[audienceField] = `People interested in ${categoryLabel}.`;
    console.warn("[upstream-pipeline] Derived audience fallback from normalized category", {
      feature,
      audienceField,
    });
  }

  for (const field of ANALYSIS_REQUIRED_LIST_FIELDS[feature]) {
    const fieldValue = root[field];
    let rawItems: unknown[];
    if (Array.isArray(fieldValue)) {
      rawItems = fieldValue;
    } else if (typeof fieldValue === "string") {
      rawItems = [fieldValue];
    } else {
      rawItems = [];
    }
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

  const detailKey = feature === "project-analysis" ? "technicalDetails" : "contextualDetails";
  const detailValue = root[detailKey];
  const normalizedDetails =
    typeof detailValue === "object" && detailValue !== null
      ? { ...(detailValue as Record<string, unknown>) }
      : {};
  for (const field of ANALYSIS_NULLABLE_DETAIL_FIELDS[feature]) {
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
  const root = value as Record<string, unknown>;

  for (const field of ANALYSIS_REQUIRED_STRING_FIELDS[feature]) {
    const fieldValue = root[field];
    if (typeof fieldValue !== "string") continue;
    if (fieldValue.length > MAX_ANALYSIS_STRING_LENGTH) {
      return `${field} exceeds maximum length ${MAX_ANALYSIS_STRING_LENGTH}.`;
    }
    if (hasPromptLeakage(fieldValue)) return `${field} appears to contain prompt leakage text.`;
  }

  for (const field of ANALYSIS_REQUIRED_LIST_FIELDS[feature]) {
    const listValue = root[field];
    if (!Array.isArray(listValue)) continue;
    for (const [index, item] of listValue.entries()) {
      if (typeof item !== "string") continue;
      if (item.length > MAX_ANALYSIS_LIST_ITEM_LENGTH) {
        return `${field}[${index}] exceeds maximum length ${MAX_ANALYSIS_LIST_ITEM_LENGTH}.`;
      }
      if (hasPromptLeakage(item))
        return `${field}[${index}] appears to contain prompt leakage text.`;
    }
  }

  const detailKey = feature === "project-analysis" ? "technicalDetails" : "contextualDetails";
  const detailValue = root[detailKey];
  if (typeof detailValue !== "object" || detailValue === null) return null;
  const detailRecord = detailValue as Record<string, unknown>;

  for (const field of ANALYSIS_NULLABLE_DETAIL_FIELDS[feature]) {
    const item = detailRecord[field];
    if (typeof item !== "string") continue;
    if (item.length > MAX_ANALYSIS_DETAIL_FIELD_LENGTH) {
      return `${detailKey}.${field} exceeds maximum length ${MAX_ANALYSIS_DETAIL_FIELD_LENGTH}.`;
    }
    if (hasPromptLeakage(item))
      return `${detailKey}.${field} appears to contain prompt leakage text.`;
  }

  return null;
}

function buildAnalysisRepairPrompt(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  validationReason: string,
): string {
  const requiredFields = ANALYSIS_REQUIRED_FIELDS[feature].join(", ");
  return `Rewrite your previous answer as valid JSON only.
Required top-level fields: ${requiredFields}.
Validation error: ${validationReason}
Do not include markdown fences, commentary, placeholders, or trailing text.
Do not use ellipses like "..." or empty strings for required fields.
Every required string field must contain real, descriptive text with letters or numbers.
Return a single JSON object and nothing else.`;
}

function validateAnalysisOutput(
  feature: keyof typeof ANALYSIS_SCHEMA_BY_FEATURE,
  text: string,
): { ok: true; normalizedText: string } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = parseAnalysisJson(text);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const normalized = normalizeAnalysisPayload(feature, parsed);
  const suspiciousContentReason = findSuspiciousAnalysisContent(feature, normalized);
  if (suspiciousContentReason) {
    return { ok: false, reason: suspiciousContentReason };
  }
  const validation = ANALYSIS_SCHEMA_BY_FEATURE[feature].safeParse(normalized);
  if (!validation.success) {
    const issuePreview = validation.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      reason: issuePreview || "Schema validation failed for analysis output.",
    };
  }

  return { ok: true, normalizedText: JSON.stringify(validation.data) };
}

export function buildChatPipeline(params: {
  feature: string;
  ctx: ValidatedRequestContext;
  ragResult: { augmentedPrompt: string | undefined; status: RagContextStatus };
  signal: AbortSignal;
}): ChatPipeline {
  const { feature, ctx, ragResult, signal } = params;
  const messages = buildChatMessages({
    featureSystemPrompt: resolveFeatureSystemPrompt(feature, ragResult.augmentedPrompt),
    system: ctx.parsedBody.system,
    messages: ctx.parsedBody.messages,
    userText: ctx.parsedBody.userText,
  });

  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const { primaryModel, fallbackModel } = resolvePreferredUpstreamModel(config.model);
  const apiMode: AiUpstreamApiMode =
    ctx.parsedBody.apiMode === "responses" ? "responses" : "chat_completions";
  const upstreamKey = buildUpstreamQueueKey({
    baseUrl: config.baseUrl,
    model: config.model,
    apiMode,
  });
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;
  const modelParams = resolveModelParams(feature, ctx.parsedBody);
  const latestUserMessage =
    ctx.parsedBody.userText?.trim() ||
    ctx.parsedBody.messages
      ?.filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .slice(-1)[0];
  const hasToolSupport = feature === "terminal_chat";
  const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);
  const logContext: ChatLogContext = {
    feature,
    conversationId: ctx.parsedBody.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath,
    messages: messages
      .filter(
        (message): message is typeof message & { content: string } =>
          typeof message.content === "string",
      )
      .map((message) => ({ role: message.role, content: message.content })),
    model: primaryModel,
    apiMode,
    priority,
    temperature: modelParams.temperature,
    reasoningEffort: modelParams.reasoningEffort,
  };
  const runUpstream = async (
    onStreamEvent?: (event: AiChatModelStreamEvent) => void,
  ): Promise<string> => {
    const requestMessages: OpenAiCompatibleChatMessage[] = [...messages];
    const toolObservedResults: Array<{ title: string; url: string }> = [];
    const analysisFeature = isAnalysisFeature(feature) ? feature : null;
    let analysisValidationAttempts = 0;
    let activeModel = primaryModel;
    const emitMessageDone = (message: string): string => {
      onStreamEvent?.({ event: "message_done", data: { message } });
      return message;
    };

    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      // Strip json_schema response_format for Harmony-format models (GPT-OSS) and
      // analysis repair turns. Harmony's internal control tokens conflict with
      // llama.cpp grammar constraints, causing broken structured output.
      // On repair turns the repair prompt already instructs JSON-only output.
      const stripResponseFormat =
        isHarmonyFormatModel(activeModel) || analysisValidationAttempts > 0;
      const turnParams: UpstreamTurnParams = {
        turnConfig: { model: activeModel, baseUrl: config.baseUrl, apiKey: config.apiKey },
        signal,
        toolChoice: resolveToolChoice({ hasToolSupport, forceBookmarkTool, turn }),
        hasToolSupport,
        temperature: modelParams.temperature,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
        maxTokens: modelParams.maxTokens,
        responseFormat: stripResponseFormat ? undefined : ctx.parsedBody.response_format,
        onStreamEvent:
          forceBookmarkTool || toolObservedResults.length > 0 ? undefined : onStreamEvent,
      };
      let outcome: UpstreamTurnOutcome;
      try {
        outcome =
          apiMode === "chat_completions"
            ? await executeChatCompletionsTurn(requestMessages, turnParams)
            : await executeResponsesTurn(requestMessages, turnParams);
      } catch (error) {
        if (
          turn === 0 &&
          fallbackModel &&
          activeModel !== fallbackModel &&
          isModelLoadFailure(error)
        ) {
          console.warn("[upstream-pipeline] Primary model unavailable, retrying with fallback", {
            feature,
            failed: activeModel,
            fallback: fallbackModel,
          });
          activeModel = fallbackModel;
          continue; // retry same turn — while loop does not auto-increment
        }
        throw error;
      }

      if (outcome.kind === "empty") break;
      if (outcome.kind === "content") {
        if (
          forceBookmarkTool &&
          turn === 0 &&
          toolObservedResults.length === 0 &&
          latestUserMessage
        ) {
          console.warn(
            "[upstream-pipeline] Model ignored forced tool, using deterministic fallback",
            {
              feature,
            },
          );
          const fallback = await runDeterministicBookmarkFallback(feature, latestUserMessage);
          return emitMessageDone(fallback);
        }

        if (toolObservedResults.length > 0) {
          if (outcome.text) {
            const sanitized = sanitizeBookmarkLinksAgainstAllowlist({
              text: outcome.text,
              observedResults: toolObservedResults,
            });
            if (!sanitized.hadDisallowedLink && sanitized.allowedLinkCount > 0) {
              return emitMessageDone(sanitized.sanitizedText);
            }
            if (sanitized.hadDisallowedLink) {
              console.warn(
                "[upstream-pipeline] Model produced non-allowlisted bookmark URL; using deterministic tool results",
                {
                  feature,
                  observedResults: toolObservedResults.length,
                  allowedLinkCount: sanitized.allowedLinkCount,
                },
              );
            }
          }

          console.warn(
            "[upstream-pipeline] Ignoring model-authored bookmark links; using deterministic tool results",
            {
              feature,
              observedResults: toolObservedResults.length,
            },
          );
          return emitMessageDone(formatBookmarkResultsAsLinks(toolObservedResults));
        }

        if (analysisFeature) {
          const text = outcome.text?.trim() ?? "";
          const validation = validateAnalysisOutput(analysisFeature, text);
          if (validation.ok) {
            return emitMessageDone(validation.normalizedText);
          }

          analysisValidationAttempts += 1;
          if (analysisValidationAttempts < MAX_ANALYSIS_VALIDATION_ATTEMPTS) {
            console.warn(
              "[upstream-pipeline] Analysis output failed schema validation, retrying with stricter repair prompt",
              {
                feature: analysisFeature,
                attempt: analysisValidationAttempts,
                reason: validation.reason,
              },
            );

            if (text.length > 0) {
              requestMessages.push({ role: "assistant", content: text });
            }
            requestMessages.push({
              role: "user",
              content: buildAnalysisRepairPrompt(analysisFeature, validation.reason),
            });

            if (fallbackModel && activeModel !== fallbackModel) {
              activeModel = fallbackModel;
            }

            turn += 1;
            continue;
          }

          throw new Error(
            `[upstream-pipeline] Analysis response validation failed for ${analysisFeature}: ${validation.reason}`,
          );
        }

        if (outcome.text) return emitMessageDone(outcome.text);
        break;
      }
      requestMessages.push(...outcome.newMessages);
      toolObservedResults.push(...outcome.observedResults);
      turn += 1;
    }

    if (toolObservedResults.length > 0 || forceBookmarkTool) {
      return emitMessageDone(formatBookmarkResultsAsLinks(toolObservedResults));
    }

    console.warn("[upstream-pipeline] All turns exhausted without content", {
      feature,
      apiMode,
      turns: MAX_TOOL_TURNS,
    });
    return emitMessageDone("");
  };

  return { queue, priority, startTime: Date.now(), logContext, runUpstream };
}
