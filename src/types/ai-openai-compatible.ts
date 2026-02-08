export type OpenAiCompatibleFeatureConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxParallel: number;
};

export type AiUpstreamQueueSnapshot = {
  running: number;
  pending: number;
  maxParallel: number;
};

export type AiUpstreamQueuePosition = AiUpstreamQueueSnapshot & {
  inQueue: boolean;
  position: number | null;
};

import type { AiGateTokenPayloadV1 } from "@/types/schemas/ai-chat";

export { aiGateTokenPayloadV1Schema, type AiGateTokenPayloadV1 } from "@/types/schemas/ai-chat";

export type AiGateTokenVerificationResult =
  | { ok: true; payload: AiGateTokenPayloadV1 }
  | { ok: false; reason: "invalid_format" | "invalid_signature" | "expired" | "mismatch" };

export interface ThinkTagCallbacks {
  onContent: (text: string) => void;
  onThinking: (text: string) => void;
}
