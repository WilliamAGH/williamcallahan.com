import {
  createAiGateToken,
  hashUserAgent,
  verifyAiGateToken,
} from "@/lib/ai/openai-compatible/gate-token";
import {
  buildChatCompletionsUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";

describe("OpenAI-Compatible AI Utilities", () => {
  describe("chat-messages", () => {
    it("respects `system` even when `messages` is provided", () => {
      const messages = buildChatMessages({
        system: "client-system",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(messages).toEqual([
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("prepends feature system prompt before client system prompt", () => {
      const messages = buildChatMessages({
        featureSystemPrompt: "feature-system",
        system: "client-system",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(messages).toEqual([
        { role: "system", content: "feature-system" },
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("does not duplicate client `system` when identical system message already exists in `messages`", () => {
      const messages = buildChatMessages({
        system: "client-system",
        messages: [
          { role: "system", content: "client-system" },
          { role: "user", content: "hi" },
        ],
      });

      expect(messages).toEqual([
        { role: "system", content: "client-system" },
        { role: "user", content: "hi" },
      ]);
    });

    it("falls back to userText when messages is absent (and still includes system prompts)", () => {
      const messages = buildChatMessages({
        featureSystemPrompt: "feature-system",
        system: "client-system",
        userText: "hello",
      });

      expect(messages).toEqual([
        { role: "system", content: "feature-system" },
        { role: "system", content: "client-system" },
        { role: "user", content: "hello" },
      ]);
    });
  });

  describe("gate-token", () => {
    it("creates and verifies a valid token", () => {
      const secret = "test-secret";
      const now = Date.now();
      const payload = {
        v: 1 as const,
        exp: now + 60_000,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      };

      const token = createAiGateToken(secret, payload);
      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "1.2.3.4", ua: payload.ua, nonce: "nonce" },
        now,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.v).toBe(1);
        expect(result.payload.ip).toBe("1.2.3.4");
      }
    });

    it("rejects expired tokens", () => {
      const secret = "test-secret";
      const now = Date.now();
      const token = createAiGateToken(secret, {
        v: 1,
        exp: now - 1,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      });

      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "1.2.3.4", ua: hashUserAgent("ua"), nonce: "nonce" },
        now,
      );
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, reason: "expired" });
    });

    it("rejects tokens when bindings do not match", () => {
      const secret = "test-secret";
      const now = Date.now();
      const token = createAiGateToken(secret, {
        v: 1,
        exp: now + 60_000,
        n: "nonce",
        ip: "1.2.3.4",
        ua: hashUserAgent("ua"),
      });

      const result = verifyAiGateToken(
        secret,
        token,
        { ip: "9.9.9.9", ua: hashUserAgent("ua"), nonce: "nonce" },
        now,
      );
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, reason: "mismatch" });
    });
  });

  describe("upstream-request-queue", () => {
    it("updates maxParallel when re-requested for the same key", () => {
      jest.isolateModules(() => {
        const { getUpstreamRequestQueue } =
          require("@/lib/ai/openai-compatible/upstream-request-queue") as typeof import("@/lib/ai/openai-compatible/upstream-request-queue");

        const first = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 1 });
        expect(first.snapshot.maxParallel).toBe(1);

        const increased = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 5 });
        expect(increased).toBe(first);
        expect(increased.snapshot.maxParallel).toBe(5);

        const decreased = getUpstreamRequestQueue({ key: "test-upstream", maxParallel: 2 });
        expect(decreased.snapshot.maxParallel).toBe(2);
      });
    });
  });

  describe("feature-config", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("builds chat completions URL with /v1 appended", () => {
      expect(buildChatCompletionsUrl("https://example.com")).toBe(
        "https://example.com/v1/chat/completions",
      );
    });

    it("builds chat completions URL when baseUrl already ends with /v1", () => {
      expect(buildChatCompletionsUrl("https://example.com/v1")).toBe(
        "https://example.com/v1/chat/completions",
      );
      expect(buildChatCompletionsUrl("https://example.com/v1/")).toBe(
        "https://example.com/v1/chat/completions",
      );
    });

    it("resolves feature-specific variables, then default, then built-in fallback", () => {
      process.env.AI_DEFAULT_OPENAI_BASE_URL = "https://default.example.com";
      process.env.AI_DEFAULT_LLM_MODEL = "default-model";

      process.env.AI_SEARCH_OPENAI_BASE_URL = "https://feature.example.com";
      process.env.AI_SEARCH_LLM_MODEL = "feature-model";
      process.env.AI_SEARCH_OPENAI_API_KEY = "feature-key";

      const feature = resolveOpenAiCompatibleFeatureConfig("search");
      expect(feature.baseUrl).toBe("https://feature.example.com");
      expect(feature.model).toBe("feature-model");
      expect(feature.apiKey).toBe("feature-key");

      const other = resolveOpenAiCompatibleFeatureConfig("other");
      expect(other.baseUrl).toBe("https://default.example.com");
      expect(other.model).toBe("default-model");
    });
  });
});
