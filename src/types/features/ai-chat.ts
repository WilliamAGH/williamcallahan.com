import type { NextRequest } from "next/server";
import type { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { ParsedRequestBody, SearchBookmarksToolResult } from "@/types/schemas/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatMessage,
  OpenAiCompatibleResponseFormat,
  ReasoningEffort,
} from "@/types/schemas/ai-openai-compatible";

export type RagContextStatus = "included" | "partial" | "failed" | "not_applicable";
export type AiChatModelStreamEvent =
  | {
      event: "message_start";
      data: { id: string; model: string; apiMode: AiUpstreamApiMode };
    }
  | {
      event: "message_delta";
      data: { delta: string };
    }
  | {
      event: "message_done";
      data: { message: string };
    }
  | {
      event: "thinking_delta";
      data: { delta: string };
    }
  | {
      event: "thinking_done";
      data: { text: string; tokenCount: number };
    };

/** Validated request context after all checks pass */
export type ValidatedRequestContext = {
  feature: string;
  clientIp: string;
  pagePath: string | null;
  originHost: string;
  userAgent: string;
  parsedBody: ParsedRequestBody;
};

/** Log context for chat message logging */
export type ChatLogContext = {
  feature: string;
  conversationId?: string;
  clientIp: string;
  userAgent: string;
  originHost: string;
  pagePath: string | null;
  messages: Array<{ role: string; content: string }>;
  model: string;
  apiMode: AiUpstreamApiMode;
  priority: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort | null;
};

/** SSE stream configuration */
export type SseStreamConfig = {
  request: NextRequest;
  queue: UpstreamRequestQueue;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  ragContextStatus: RagContextStatus;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamEvent) => void) => Promise<string>;
};

/** Pipeline result containing everything needed to dispatch an AI chat request */
export type ChatPipeline = {
  queue: UpstreamRequestQueue;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamEvent) => void) => Promise<string>;
};

/** Per-feature model parameter overrides (e.g. temperature, reasoning effort) */
export type FeatureModelDefaults = {
  temperature?: number;
  topP?: number;
  reasoningEffort?: ReasoningEffort | null;
  maxTokens?: number;
  toolConfig?: {
    enabled: boolean;
  };
};

/** Fully resolved model params — every field has a concrete value */
export type ResolvedModelParams = Required<Omit<FeatureModelDefaults, "toolConfig">>;

/** Internal result of executing a single bookmark tool call in a batch */
export type ExecutedToolCall = {
  callId: string;
  /** Whether the tool call failed (execution error or schema validation failure) */
  failed: boolean;
  parsed: SearchBookmarksToolResult;
  links: Array<{ title: string; url: string }>;
};

/** Return value from dispatchToolCalls — pure data, no mutations */
export type ToolDispatchResult = {
  responseMessages: OpenAiCompatibleChatMessage[];
  observedResults: Array<{ title: string; url: string }>;
  /** IDs of tool calls that failed execution or validation */
  failedCallIds: string[];
};

/** Parameters shared by both Chat Completions and Responses turn executors.
 *  Model params (temperature, topP, maxTokens, reasoningEffort) are always
 *  resolved by `resolveModelParams()` so they are non-optional here. */
export type UpstreamTurnParams = {
  turnConfig: { model: string; baseUrl: string; apiKey: string | undefined };
  signal: AbortSignal;
  toolChoice: "required" | "auto" | undefined;
  hasToolSupport: boolean;
  temperature: number;
  topP: number;
  reasoningEffort: ReasoningEffort | null;
  maxTokens: number;
  responseFormat?: OpenAiCompatibleResponseFormat;
  onStreamEvent?: (event: AiChatModelStreamEvent) => void;
};

/** Metadata captured from the streaming transport's onStart callback.
 *  Used by emitDeferredContentEvents to synthesize a message_start event. */
export type StreamStartMeta = { id: string; model: string };

/** Result of a single upstream API turn (Chat Completions or Responses) */
export type UpstreamTurnOutcome =
  | { kind: "empty" }
  | { kind: "content"; text: string | undefined }
  | {
      kind: "tool_calls";
      newMessages: OpenAiCompatibleChatMessage[];
      observedResults: Array<{ title: string; url: string }>;
    };

/** Feature identifiers that have structured analysis output schemas */
export type AnalysisFeatureId = "bookmark-analysis" | "book-analysis" | "project-analysis";

/** Configuration bag passed to createUpstreamRunner */
export type UpstreamRunnerConfig = {
  feature: string;
  apiMode: AiUpstreamApiMode;
  messages: OpenAiCompatibleChatMessage[];
  parsedBody: ValidatedRequestContext["parsedBody"];
  config: { baseUrl: string; apiKey?: string };
  primaryModel: string;
  fallbackModel?: string;
  hasToolSupport: boolean;
  forceBookmarkTool: boolean;
  latestUserMessage?: string;
  modelParams: ResolvedModelParams;
  signal: AbortSignal;
};

/** Discriminated result of handleAnalysisValidation */
export type AnalysisHandleResult =
  | { action: "done"; text: string }
  | { action: "retry"; newModel?: string }
  | { action: "error"; message: string };

/** Discriminated result of handleContentOutcome */
export type ContentOutcomeResult =
  | { done: true; text: string; retry?: false }
  | { done: false; retry: true; newAttempts: number; switchedModel?: string }
  | { done: false; retry: false };

/** Context bag for handleContentOutcome and resolveBookmarkFallback */
export type ContentOutcomeCtx = {
  args: UpstreamRunnerConfig;
  result: Extract<UpstreamTurnOutcome, { kind: "content" }>;
  turn: number;
  toolObservedResults: Array<{ title: string; url: string }>;
  analysisFeature: AnalysisFeatureId | null;
  analysisValidationAttempts: number;
  requestMessages: OpenAiCompatibleChatMessage[];
  activeModel: string;
  done: (message: string) => string;
};
