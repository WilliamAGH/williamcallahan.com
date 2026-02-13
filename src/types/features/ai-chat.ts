import type { NextRequest } from "next/server";
import type { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { ParsedRequestBody, SearchToolResult } from "@/types/schemas/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatMessage,
  OpenAiCompatibleResponseFormat,
  ReasoningEffort,
} from "@/types/schemas/ai-openai-compatible";
import type { AiChatModelStreamUpdate } from "@/types/schemas/ai-openai-compatible-client";
import type { ScopeSearcher } from "@/types/rag";

export type RagContextStatus = "included" | "partial" | "failed" | "not_applicable";

/** Registration for a single search tool in the tool registry */
export type ToolRegistration = {
  name: string;
  description: string;
  searcher: ScopeSearcher;
  /** Regex that triggers forced tool invocation on turn 0 */
  forcePattern: RegExp;
  /** URL prefix for formatting result links (e.g. "/bookmarks/") */
  urlPrefix: string;
};
/** Server-side stream event — derived from the client-facing schema to prevent drift. */
export type AiChatModelStreamEvent = AiChatModelStreamUpdate;

/** Validated request context after all checks pass */
export type ValidatedRequestContext = {
  feature: string;
  clientIp: string;
  pagePath: string | null;
  originHost: string;
  userAgent: string;
  systemStatus?: "MEMORY_WARNING";
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

/** Internal result of executing a single tool call in a batch */
export type ExecutedToolCall = {
  callId: string;
  toolName: string;
  /** Whether the tool call failed (execution error or schema validation failure) */
  failed: boolean;
  parsed: SearchToolResult;
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
  forcedToolName: string | undefined;
  latestUserMessage?: string;
  modelParams: ResolvedModelParams;
  signal: AbortSignal;
};

/** Discriminated result of handleAnalysisValidation */
export type AnalysisHandleResult =
  | { action: "done"; text: string }
  | { action: "retry"; newModel?: string; newMessages: OpenAiCompatibleChatMessage[] }
  | { action: "error"; message: string };

/** Discriminated result of handleContentOutcome */
export type ContentOutcomeResult =
  | { done: true; text: string; retry?: false }
  | { done: false; retry: true; newAttempts: number; switchedModel?: string }
  | { done: false; retry: false };

/** Result of resolving model-authored content against tool-observed results */
export type ToolContentResolution =
  | { source: "model"; text: string }
  | {
      source: "deterministic_fallback";
      text: string;
      reason: "disallowed_links" | "no_model_links";
    };

/** Mutable state accumulated across the multi-turn tool loop */
export type ToolLoopState = {
  requestMessages: OpenAiCompatibleChatMessage[];
  toolObservedResults: Array<{ title: string; url: string }>;
  activeModel: string;
  analysisValidationAttempts: number;
};

/** Context bag for handleContentOutcome and resolveForcedToolFallback */
export type ContentOutcomeCtx = {
  args: UpstreamRunnerConfig;
  result: Extract<UpstreamTurnOutcome, { kind: "content" }>;
  turn: number;
  loopState: ToolLoopState;
  analysisFeature: AnalysisFeatureId | null;
  done: (message: string) => string;
};
