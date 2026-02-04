import type { NextRequest } from "next/server";
import type { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import type { ParsedRequestBody } from "@/types/schemas/ai-chat";
import type { OpenAiCompatibleChatMessage } from "@/types/schemas/ai-openai-compatible";

export type RagContextStatus = "included" | "partial" | "failed" | "not_applicable";

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
  messages: OpenAiCompatibleChatMessage[];
  model: string;
  priority: number;
};

/** JSON response configuration */
export type JsonResponseConfig = {
  queue: UpstreamRequestQueue;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  ragContextStatus: RagContextStatus;
  runUpstream: () => Promise<string>;
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
  runUpstream: () => Promise<string>;
};

/** Pipeline result containing everything needed to dispatch an AI chat request */
export type ChatPipeline = {
  queue: UpstreamRequestQueue;
  upstreamKey: string;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  runUpstream: () => Promise<string>;
};
