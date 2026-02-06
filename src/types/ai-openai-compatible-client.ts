import type {
  AiChatModelStreamUpdate,
  AiChatQueueUpdate,
} from "@/types/schemas/ai-openai-compatible-client";
import type { AiUpstreamApiMode } from "@/types/schemas/ai-openai-compatible";

export interface AiChatRequest {
  userText?: string;
  system?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  top_p?: number;
  reasoning_effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
  apiMode?: AiUpstreamApiMode;
  conversationId?: string;
  /**
   * Higher numbers run sooner when multiple requests are queued for the same upstream model.
   * Range is enforced server-side (currently -100..100).
   */
  priority?: number;
}

export interface AiChatClientOptions {
  signal?: AbortSignal;
  forceNewToken?: boolean;
  onQueueUpdate?: (update: AiChatQueueUpdate) => void;
  onStreamEvent?: (update: AiChatModelStreamUpdate) => void;
}

export interface AiBrowserTokenCache {
  token: string;
  expiresAtMs: number;
}
