import type { NextRequest } from "next/server";
import type { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { ParsedRequestBody, SearchBookmarksToolResult } from "@/types/schemas/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatMessage,
  ReasoningEffort,
} from "@/types/schemas/ai-openai-compatible";

export type { ParsedRequestBody };

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

/** JSON response configuration */
export type JsonResponseConfig = {
  queue: UpstreamRequestQueue;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  ragContextStatus: RagContextStatus;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamEvent) => void) => Promise<string>;
  signal: AbortSignal;
};

/** SSE stream configuration */
export type SseStreamConfig = {
  request: NextRequest;
  queue: UpstreamRequestQueue;
  upstreamKey: string;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  ragContextStatus: RagContextStatus;
  runUpstream: (onStreamEvent?: (event: AiChatModelStreamEvent) => void) => Promise<string>;
};

/** Pipeline result containing everything needed to dispatch an AI chat request */
export type ChatPipeline = {
  queue: UpstreamRequestQueue;
  upstreamKey: string;
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
};

/** Fully resolved model params — every field has a concrete value */
export type ResolvedModelParams = Required<FeatureModelDefaults>;

/** Internal result of executing a single bookmark tool call in a batch */
export type ExecutedToolCall = {
  callId: string;
  parsed: SearchBookmarksToolResult;
  links: Array<{ title: string; url: string }>;
};

/** Return value from dispatchToolCalls — pure data, no mutations */
export type ToolDispatchResult = {
  responseMessages: OpenAiCompatibleChatMessage[];
  observedResults: Array<{ title: string; url: string }>;
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
