import "server-only";

import type {
  AiChatModelStreamEvent,
  AnalysisFeatureId,
  AnalysisHandleResult,
  ContentOutcomeCtx,
  ContentOutcomeResult,
  UpstreamRunnerConfig,
  UpstreamTurnOutcome,
  UpstreamTurnParams,
} from "@/types/features/ai-chat";
import type { OpenAiCompatibleChatMessage } from "@/types/schemas/ai-openai-compatible";
import {
  formatBookmarkResultsAsLinks,
  runDeterministicBookmarkFallback,
  sanitizeBookmarkLinksAgainstAllowlist,
} from "./bookmark-tool";
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
  forceBookmarkTool: boolean;
  hasToolSupport: boolean;
  toolObservedResultsCount: number;
  onStreamEvent?: (event: AiChatModelStreamEvent) => void;
  requestConfig: UpstreamRunnerConfig;
}): UpstreamTurnParams {
  const stripResponseFormat =
    isHarmonyFormatModel(args.activeModel) || args.analysisValidationAttempts > 0;

  return {
    turnConfig: {
      model: args.activeModel,
      baseUrl: args.requestConfig.config.baseUrl,
      apiKey: args.requestConfig.config.apiKey,
    },
    signal: args.requestConfig.signal,
    toolChoice: resolveToolChoice({
      hasToolSupport: args.hasToolSupport,
      forceBookmarkTool: args.forceBookmarkTool,
      turn: args.turn,
      model: args.activeModel,
    }),
    hasToolSupport: args.hasToolSupport,
    temperature: args.requestConfig.modelParams.temperature,
    topP: args.requestConfig.modelParams.topP,
    reasoningEffort: args.requestConfig.modelParams.reasoningEffort,
    maxTokens: args.requestConfig.modelParams.maxTokens,
    responseFormat: stripResponseFormat ? undefined : args.requestConfig.parsedBody.response_format,
    onStreamEvent:
      args.forceBookmarkTool || args.toolObservedResultsCount > 0 ? undefined : args.onStreamEvent,
  };
}

function resolveBookmarkContent(
  feature: string,
  outcomeText: string | undefined,
  toolObservedResults: Array<{ title: string; url: string }>,
): string {
  if (outcomeText) {
    const sanitized = sanitizeBookmarkLinksAgainstAllowlist({
      text: outcomeText,
      observedResults: toolObservedResults,
    });
    if (!sanitized.hadDisallowedLink && sanitized.allowedLinkCount > 0) {
      return sanitized.sanitizedText;
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
    { feature, observedResults: toolObservedResults.length },
  );
  return formatBookmarkResultsAsLinks(toolObservedResults);
}

function handleAnalysisValidation(
  analysisFeature: AnalysisFeatureId,
  outcomeText: string | undefined,
  attemptsSoFar: number,
  requestMessages: OpenAiCompatibleChatMessage[],
  fallbackModel: string | undefined,
  activeModel: string,
): AnalysisHandleResult {
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

    if (text.length > 0) requestMessages.push({ role: "assistant", content: text });
    requestMessages.push({
      role: "user",
      content: buildAnalysisRepairPrompt(analysisFeature, validation.reason),
    });

    const newModel = fallbackModel && activeModel !== fallbackModel ? fallbackModel : undefined;
    return { action: "retry", newModel };
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
  if (toolObservedResults.length > 0 || args.forceBookmarkTool) {
    return formatBookmarkResultsAsLinks(toolObservedResults);
  }
  console.warn("[upstream-pipeline] All turns exhausted without content", {
    feature: args.feature,
    apiMode: args.apiMode,
    turns: MAX_TOOL_TURNS,
  });
  return "I wasn't able to generate a response. Please try rephrasing your question.";
}

function emitDone(
  onStreamEvent: ((event: AiChatModelStreamEvent) => void) | undefined,
  message: string,
): string {
  onStreamEvent?.({ event: "message_done", data: { message } });
  return message;
}

export function createUpstreamRunner(args: UpstreamRunnerConfig) {
  return async function runUpstream(
    onStreamEvent?: (event: AiChatModelStreamEvent) => void,
  ): Promise<string> {
    const requestMessages: OpenAiCompatibleChatMessage[] = [...args.messages];
    const toolObservedResults: Array<{ title: string; url: string }> = [];
    const analysisFeature = isAnalysisFeature(args.feature) ? args.feature : null;
    let analysisValidationAttempts = 0;
    let activeModel = args.primaryModel;
    const done = (msg: string) => emitDone(onStreamEvent, msg);

    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      const outcome = await executeTurnWithFallback({
        args,
        requestMessages,
        turn,
        activeModel,
        analysisValidationAttempts,
        onStreamEvent,
        toolObservedResults,
      });
      if (outcome.switchedModel) {
        activeModel = outcome.switchedModel;
        continue;
      }
      if (!outcome.result || outcome.result.kind === "empty") break;
      const result = outcome.result;

      if (result.kind === "content") {
        const contentResult = await handleContentOutcome({
          args,
          result,
          turn,
          toolObservedResults,
          analysisFeature,
          analysisValidationAttempts,
          requestMessages,
          activeModel,
          done,
        });
        if (contentResult.done) return contentResult.text;
        if (contentResult.retry) {
          analysisValidationAttempts = contentResult.newAttempts;
          if (contentResult.switchedModel) activeModel = contentResult.switchedModel;
          turn += 1;
          continue;
        }
        break;
      }

      requestMessages.push(...result.newMessages);
      toolObservedResults.push(...result.observedResults);
      turn += 1;
    }

    return done(resolveExhaustedTurnsMessage(args, toolObservedResults));
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
    forceBookmarkTool: ctx.args.forceBookmarkTool,
    hasToolSupport: ctx.args.hasToolSupport,
    toolObservedResultsCount: ctx.toolObservedResults.length,
    onStreamEvent: ctx.onStreamEvent,
    requestConfig: ctx.args,
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

async function resolveBookmarkFallback(
  ctx: ContentOutcomeCtx,
): Promise<ContentOutcomeResult | null> {
  if (
    !ctx.args.forceBookmarkTool ||
    ctx.result.text ||
    ctx.toolObservedResults.length > 0 ||
    !ctx.args.latestUserMessage
  ) {
    return null;
  }
  console.warn("[upstream-pipeline] No observed bookmark results; using deterministic fallback", {
    feature: ctx.args.feature,
    turn: ctx.turn,
  });
  const fallback = await runDeterministicBookmarkFallback(
    ctx.args.feature,
    ctx.args.latestUserMessage,
  );
  return { done: true, text: ctx.done(fallback) };
}

async function handleContentOutcome(ctx: ContentOutcomeCtx): Promise<ContentOutcomeResult> {
  const bookmarkFallback = await resolveBookmarkFallback(ctx);
  if (bookmarkFallback) return bookmarkFallback;

  if (ctx.toolObservedResults.length > 0) {
    const text = resolveBookmarkContent(ctx.args.feature, ctx.result.text, ctx.toolObservedResults);
    return { done: true, text: ctx.done(text) };
  }

  if (ctx.analysisFeature) {
    const result = handleAnalysisValidation(
      ctx.analysisFeature,
      ctx.result.text,
      ctx.analysisValidationAttempts,
      ctx.requestMessages,
      ctx.args.fallbackModel,
      ctx.activeModel,
    );
    if (result.action === "done") return { done: true, text: ctx.done(result.text) };
    if (result.action === "retry") {
      return {
        done: false,
        retry: true,
        newAttempts: ctx.analysisValidationAttempts + 1,
        switchedModel: result.newModel,
      };
    }
    throw new Error(result.message);
  }

  if (ctx.result.text) return { done: true, text: ctx.done(ctx.result.text) };
  return { done: false, retry: false };
}
