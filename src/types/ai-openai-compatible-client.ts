import type { AiChatQueueUpdate } from "@/types/schemas/ai-openai-compatible-client";

export interface AiChatRequest {
  userText?: string;
  system?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
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
}

export interface AiBrowserTokenCache {
  token: string;
  expiresAtMs: number;
}
