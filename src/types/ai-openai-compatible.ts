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

export type AiGateTokenPayloadV1 = {
  v: 1;
  exp: number;
  n: string;
  ip: string;
  ua: string;
};

export type AiGateTokenVerificationResult =
  | { ok: true; payload: AiGateTokenPayloadV1 }
  | { ok: false; reason: "invalid_format" | "invalid_signature" | "expired" | "mismatch" };

export interface ThinkTagCallbacks {
  onContent: (text: string) => void;
  onThinking: (text: string) => void;
}
