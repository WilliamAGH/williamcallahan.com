import "server-only";

import type {
  AiChatModelStreamEvent,
  AnalysisFeatureId,
  AnalysisHandleResult,
  ContentOutcomeCtx,
  ContentOutcomeResult,
  ToolContentResolution,
  ToolLoopState,
  UpstreamRunnerConfig,
  UpstreamTurnOutcome,
  UpstreamTurnParams,
} from "@/types/features/ai-chat";
import type { OpenAiCompatibleChatMessage } from "@/types/schemas/ai-openai-compatible";
import {
  extractSearchQueryFromMessage,
  formatBookmarkResultsAsLinks,
  normalizeInternalPath,
  sanitizeBookmarkLinksAgainstAllowlist,
} from "./bookmark-tool";
import { getToolByName } from "./tool-registry";
import { searchToolResultSchema } from "@/types/schemas/ai-chat";
import logger from "@/lib/utils/logger";
import { isHarmonyFormatModel, resolveToolChoice } from "./feature-defaults";
import {
  isAnalysisFeature,
  buildAnalysisRepairPrompt,
  validateAnalysisOutput,
} from "./analysis-output-validation";
import { isModelLoadFailure } from "./upstream-error";
import { executeChatCompletionsTurn, executeResponsesTurn } from "./upstream-turn";

const MAX_TOOL_TURNS = 4;
const MAX_ANALYSIS_VALIDATION_ATTEMPTS = 3;

function buildTurnParams(args: {
  turn: number;
  activeModel: string;
  analysisValidationAttempts: number;
  toolObservedResultsCount: number;
  onStreamEvent?: (event: AiChatModelStreamEvent) => void;
  config: UpstreamRunnerConfig;
}): UpstreamTurnParams {
  const { config } = args;
  const stripResponseFormat =
    isHarmonyFormatModel(args.activeModel) || args.analysisValidationAttempts > 0;

  return {
    turnConfig: {
      model: args.activeModel,
      baseUrl: config.config.baseUrl,
      apiKey: config.config.apiKey,
    },
    signal: config.signal,
    toolChoice: resolveToolChoice({
      hasToolSupport: config.hasToolSupport,
      forcedToolName: config.forcedToolName,
      turn: args.turn,
      model: args.activeModel,
    }),
    hasToolSupport: config.hasToolSupport,
    temperature: config.modelParams.temperature,
    topP: config.modelParams.topP,
    reasoningEffort: config.modelParams.reasoningEffort,
    maxTokens: config.modelParams.maxTokens,
    responseFormat: stripResponseFormat ? undefined : config.parsedBody.response_format,
    onStreamEvent:
      config.forcedToolName || args.toolObservedResultsCount > 0 ? undefined : args.onStreamEvent,
  };
}

function resolveToolContent(
  outcomeText: string | undefined,
  toolObservedResults: Array<{ title: string; url: string }>,
): ToolContentResolution {
  if (outcomeText) {
    const sanitized = sanitizeBookmarkLinksAgainstAllowlist({
      text: outcomeText,
      observedResults: toolObservedResults,
    });
    if (!sanitized.hadDisallowedLink && sanitized.allowedLinkCount > 0) {
      return { source: "model", text: sanitized.sanitizedText };
    }
    if (sanitized.hadDisallowedLink) {
      return {
        source: "deterministic_fallback",
        text: formatBookmarkResultsAsLinks(toolObservedResults),
        reason: "disallowed_links",
      };
    }
  }
  return {
    source: "deterministic_fallback",
    text: formatBookmarkResultsAsLinks(toolObservedResults),
    reason: "no_model_links",
  };
}

function handleAnalysisValidation(params: {
  analysisFeature: AnalysisFeatureId;
  outcomeText: string | undefined;
  attemptsSoFar: number;
  fallbackModel: string | undefined;
  activeModel: string;
}): AnalysisHandleResult {
  const { analysisFeature, outcomeText, attemptsSoFar, fallbackModel, activeModel } = params;
  const text = typeof outcomeText === "string" ? outcomeText.trim() : "";
  if (text.length === 0) {
    console.warn("[upstream-pipeline] Analysis output missing content; validating empty response", {
      feature: analysisFeature,
      attempt: attemptsSoFar,
      model: activeModel,
    });
  }
  const validation = validateAnalysisOutput(analysisFeature, text);
  if (validation.ok) return { action: "done", text: validation.normalizedText };

  const nextAttempt = attemptsSoFar + 1;
  if (nextAttempt < MAX_ANALYSIS_VALIDATION_ATTEMPTS) {
    console.warn(
      "[upstream-pipeline] Analysis output failed schema validation, retrying with stricter repair prompt",
      { feature: analysisFeature, attempt: nextAttempt, reason: validation.reason },
    );

    const newMessages: OpenAiCompatibleChatMessage[] = [];
    if (text.length > 0) newMessages.push({ role: "assistant", content: text });
    newMessages.push({
      role: "user",
      content: buildAnalysisRepairPrompt(analysisFeature, validation.reason),
    });

    const newModel = fallbackModel && activeModel !== fallbackModel ? fallbackModel : undefined;
    return { action: "retry", newModel, newMessages };
  }

  return {
    action: "error",
    message: `[upstream-pipeline] Analysis response validation failed for ${analysisFeature}: ${validation.reason}`,
  };
}

function resolveExhaustedTurnsMessage(
  args: UpstreamRunnerConfig,
  toolObservedResults: Array<{ title: string; url: string }>,
): string {
  if (toolObservedResults.length > 0 || args.forcedToolName) {
    return formatBookmarkResultsAsLinks(toolObservedResults);
  }
  console.warn("[upstream-pipeline] All turns exhausted without content", {
    feature: args.feature,
    apiMode: args.apiMode,
    turns: MAX_TOOL_TURNS,
  });
  return "I wasn't able to generate a response. Please try rephrasing your question.";
}

export function createUpstreamRunner(args: UpstreamRunnerConfig) {
  return async function runUpstream(
    onStreamEvent?: (event: AiChatModelStreamEvent) => void,
  ): Promise<string> {
    const loopState: ToolLoopState = {
      requestMessages: [...args.messages],
      toolObservedResults: [],
      activeModel: args.primaryModel,
      analysisValidationAttempts: 0,
    };
    const analysisFeature = isAnalysisFeature(args.feature) ? args.feature : null;
    const done = (msg: string): string => {
      onStreamEvent?.({ event: "message_done", data: { message: msg } });
      return msg;
    };

    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      const outcome = await executeTurnWithFallback({
        args,
        requestMessages: loopState.requestMessages,
        turn,
        activeModel: loopState.activeModel,
        analysisValidationAttempts: loopState.analysisValidationAttempts,
        onStreamEvent,
        toolObservedResults: loopState.toolObservedResults,
      });
      if (outcome.switchedModel) {
        loopState.activeModel = outcome.switchedModel;
        continue;
      }
      if (!outcome.result || outcome.result.kind === "empty") break;
      const result = outcome.result;

      if (result.kind === "content") {
        const contentResult = await handleContentOutcome({
          args,
          result,
          turn,
          loopState,
          analysisFeature,
          done,
        });
        if (contentResult.done) return contentResult.text;
        if (contentResult.retry) {
          loopState.analysisValidationAttempts = contentResult.newAttempts;
          if (contentResult.switchedModel) loopState.activeModel = contentResult.switchedModel;
          turn += 1;
          continue;
        }
        break;
      }

      loopState.requestMessages.push(...result.newMessages);
      loopState.toolObservedResults.push(...result.observedResults);
      turn += 1;
    }

    return done(resolveExhaustedTurnsMessage(args, loopState.toolObservedResults));
  };
}

async function executeTurnWithFallback(ctx: {
  args: UpstreamRunnerConfig;
  requestMessages: OpenAiCompatibleChatMessage[];
  turn: number;
  activeModel: string;
  analysisValidationAttempts: number;
  onStreamEvent?: (event: AiChatModelStreamEvent) => void;
  toolObservedResults: Array<{ title: string; url: string }>;
}): Promise<{ result?: UpstreamTurnOutcome; switchedModel?: string }> {
  const turnParams = buildTurnParams({
    turn: ctx.turn,
    activeModel: ctx.activeModel,
    analysisValidationAttempts: ctx.analysisValidationAttempts,
    toolObservedResultsCount: ctx.toolObservedResults.length,
    onStreamEvent: ctx.onStreamEvent,
    config: ctx.args,
  });

  try {
    const result =
      ctx.args.apiMode === "chat_completions"
        ? await executeChatCompletionsTurn(ctx.requestMessages, turnParams)
        : await executeResponsesTurn(ctx.requestMessages, turnParams);
    return { result };
  } catch (error) {
    if (
      ctx.turn === 0 &&
      ctx.args.fallbackModel &&
      ctx.activeModel !== ctx.args.fallbackModel &&
      isModelLoadFailure(error)
    ) {
      console.warn("[upstream-pipeline] Primary model unavailable, retrying with fallback", {
        feature: ctx.args.feature,
        failed: ctx.activeModel,
        fallback: ctx.args.fallbackModel,
      });
      return { switchedModel: ctx.args.fallbackModel };
    }
    throw error;
  }
}

/** Run the forced tool's searcher directly when the model skipped the tool call */
async function resolveForcedToolFallback(
  ctx: ContentOutcomeCtx,
): Promise<ContentOutcomeResult | null> {
  if (
    !ctx.args.forcedToolName ||
    ctx.result.text ||
    ctx.loopState.toolObservedResults.length > 0 ||
    !ctx.args.latestUserMessage
  ) {
    return null;
  }

  const registration = getToolByName(ctx.args.forcedToolName);
  if (!registration) return null;

  logger.warn("[upstream-pipeline] No observed tool results; using deterministic fallback", {
    feature: ctx.args.feature,
    tool: ctx.args.forcedToolName,
    turn: ctx.turn,
  });

  const searchQuery = extractSearchQueryFromMessage(ctx.args.latestUserMessage);
  const rawResults = await registration.searcher(searchQuery);
  const limitedResults = rawResults.slice(0, 5).flatMap((r) => {
    const normalized = normalizeInternalPath(r.url);
    return normalized ? [{ title: r.title, url: normalized }] : [];
  });
  const validated = searchToolResultSchema.safeParse({
    query: searchQuery,
    results: limitedResults,
    totalResults: rawResults.length,
  });
  if (!validated.success) {
    logger.error("[upstream-pipeline] Deterministic fallback: result failed schema validation", {
      feature: ctx.args.feature,
      tool: ctx.args.forcedToolName,
      error: validated.error.message,
    });
    return {
      done: true,
      text: ctx.done(
        "Sorry, I encountered an error while searching. Please try a different query.",
      ),
    };
  }
  return { done: true, text: ctx.done(formatBookmarkResultsAsLinks(limitedResults)) };
}

async function handleContentOutcome(ctx: ContentOutcomeCtx): Promise<ContentOutcomeResult> {
  const forcedFallback = await resolveForcedToolFallback(ctx);
  if (forcedFallback) return forcedFallback;

  if (ctx.loopState.toolObservedResults.length > 0) {
    const resolution = resolveToolContent(ctx.result.text, ctx.loopState.toolObservedResults);
    if (resolution.source === "deterministic_fallback") {
      logger.warn("[upstream-pipeline] Tool content degraded to deterministic fallback", {
        feature: ctx.args.feature,
        reason: resolution.reason,
        observedResults: ctx.loopState.toolObservedResults.length,
      });
    }
    return { done: true, text: ctx.done(resolution.text) };
  }

  if (ctx.analysisFeature) {
    const result = handleAnalysisValidation({
      analysisFeature: ctx.analysisFeature,
      outcomeText: ctx.result.text,
      attemptsSoFar: ctx.loopState.analysisValidationAttempts,
      fallbackModel: ctx.args.fallbackModel,
      activeModel: ctx.loopState.activeModel,
    });
    if (result.action === "done") return { done: true, text: ctx.done(result.text) };
    if (result.action === "retry") {
      ctx.loopState.requestMessages.push(...result.newMessages);
      return {
        done: false,
        retry: true,
        newAttempts: ctx.loopState.analysisValidationAttempts + 1,
        switchedModel: result.newModel,
      };
    }
    throw new Error(result.message);
  }

  if (ctx.result.text) return { done: true, text: ctx.done(ctx.result.text) };
  return { done: false, retry: false };
}
