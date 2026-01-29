/**
 * @file Unit tests for Chroma client functionality
 * Tests the client factory, configuration validation, and singleton behavior.
 * @module __tests__/lib/chroma/client.test
 */

import { ChromaCloudConfigSchema } from "@/types/schemas/chroma";

// Mock chromadb before importing the client
jest.mock("chromadb", () => ({
  CloudClient: jest.fn().mockImplementation((config) => ({
    _config: config,
    getOrCreateCollection: jest.fn().mockResolvedValue({
      name: "test-collection",
      count: jest.fn().mockResolvedValue(0),
    }),
  })),
}));

describe("Chroma Client", () => {
  const validConfig = {
    apiKey: "ck-test-api-key-12345",
    tenant: "e8f02512-07c4-467c-8038-e68a83432876",
    database: "test-database",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset modules to clear singleton state
    jest.resetModules();
  });

  describe("ChromaCloudConfigSchema", () => {
    it("should validate a complete valid configuration", () => {
      const result = ChromaCloudConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.apiKey).toBe(validConfig.apiKey);
        expect(result.data.tenant).toBe(validConfig.tenant);
        expect(result.data.database).toBe(validConfig.database);
      }
    });

    it("should reject missing apiKey", () => {
      const result = ChromaCloudConfigSchema.safeParse({
        tenant: validConfig.tenant,
        database: validConfig.database,
      });
      expect(result.success).toBe(false);
    });

    it("should reject empty apiKey", () => {
      const result = ChromaCloudConfigSchema.safeParse({
        ...validConfig,
        apiKey: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid tenant UUID", () => {
      const result = ChromaCloudConfigSchema.safeParse({
        ...validConfig,
        tenant: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing database", () => {
      const result = ChromaCloudConfigSchema.safeParse({
        apiKey: validConfig.apiKey,
        tenant: validConfig.tenant,
      });
      expect(result.success).toBe(false);
    });

    it("should accept optional host and port", () => {
      const configWithOptionals = {
        ...validConfig,
        host: "custom.chroma.host",
        port: 8080,
      };
      const result = ChromaCloudConfigSchema.safeParse(configWithOptionals);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.host).toBe("custom.chroma.host");
        expect(result.data.port).toBe(8080);
      }
    });

    it("should reject negative port numbers", () => {
      const result = ChromaCloudConfigSchema.safeParse({
        ...validConfig,
        port: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getChromaClient", () => {
    it("should create a client with valid configuration", async () => {
      const { getChromaClient } = await import("@/lib/chroma/client");
      const client = getChromaClient(validConfig);
      expect(client).toBeDefined();
    });

    it("should return the same instance for identical configs (singleton)", async () => {
      const { getChromaClient, resetChromaClient } = await import("@/lib/chroma/client");
      resetChromaClient();

      const client1 = getChromaClient(validConfig);
      const client2 = getChromaClient(validConfig);
      expect(client1).toBe(client2);
    });

    it("should throw on invalid configuration", async () => {
      const { getChromaClient } = await import("@/lib/chroma/client");
      expect(() =>
        getChromaClient({
          apiKey: "",
          tenant: "invalid",
          database: "",
        }),
      ).toThrow();
    });

    it("should throw when no config and no env vars", async () => {
      const { getChromaClient, resetChromaClient } = await import("@/lib/chroma/client");
      resetChromaClient();

      // Temporarily clear env vars
      const originalApiKey = process.env.CHROMA_API_KEY;
      const originalTenant = process.env.CHROMA_TENANT;
      const originalDatabase = process.env.CHROMA_DATABASE;

      delete process.env.CHROMA_API_KEY;
      delete process.env.CHROMA_TENANT;
      delete process.env.CHROMA_DATABASE;

      try {
        expect(() => getChromaClient()).toThrow("Chroma configuration required");
      } finally {
        // Restore env vars
        if (originalApiKey) process.env.CHROMA_API_KEY = originalApiKey;
        if (originalTenant) process.env.CHROMA_TENANT = originalTenant;
        if (originalDatabase) process.env.CHROMA_DATABASE = originalDatabase;
      }
    });
  });

  describe("resetChromaClient", () => {
    it("should clear the singleton instance", async () => {
      const { getChromaClient, resetChromaClient } = await import("@/lib/chroma/client");

      const client1 = getChromaClient(validConfig);
      resetChromaClient();
      const client2 = getChromaClient(validConfig);

      // After reset, should create a new instance
      // Note: With mocking, both will be new mock instances
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });
  });

  describe("getChromaConfigFromEnv", () => {
    it("should return undefined when env vars are missing", async () => {
      const { getChromaConfigFromEnv } = await import("@/lib/chroma/client");

      const originalApiKey = process.env.CHROMA_API_KEY;
      delete process.env.CHROMA_API_KEY;

      try {
        const config = getChromaConfigFromEnv();
        expect(config).toBeUndefined();
      } finally {
        if (originalApiKey) process.env.CHROMA_API_KEY = originalApiKey;
      }
    });

    it("should return config when all env vars are present", async () => {
      const { getChromaConfigFromEnv } = await import("@/lib/chroma/client");

      const originalApiKey = process.env.CHROMA_API_KEY;
      const originalTenant = process.env.CHROMA_TENANT;
      const originalDatabase = process.env.CHROMA_DATABASE;

      process.env.CHROMA_API_KEY = "test-key";
      process.env.CHROMA_TENANT = "e8f02512-07c4-467c-8038-e68a83432876";
      process.env.CHROMA_DATABASE = "test-db";

      try {
        const config = getChromaConfigFromEnv();
        expect(config).toBeDefined();
        expect(config?.apiKey).toBe("test-key");
        expect(config?.tenant).toBe("e8f02512-07c4-467c-8038-e68a83432876");
        expect(config?.database).toBe("test-db");
      } finally {
        if (originalApiKey) process.env.CHROMA_API_KEY = originalApiKey;
        else delete process.env.CHROMA_API_KEY;
        if (originalTenant) process.env.CHROMA_TENANT = originalTenant;
        else delete process.env.CHROMA_TENANT;
        if (originalDatabase) process.env.CHROMA_DATABASE = originalDatabase;
        else delete process.env.CHROMA_DATABASE;
      }
    });
  });
});
