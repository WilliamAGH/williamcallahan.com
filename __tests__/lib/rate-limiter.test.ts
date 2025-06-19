/**
 * Tests for Rate Limiter
 */
import {
  isOperationAllowed,
  waitForPermit,
  API_ENDPOINT_STORE_NAME,
  DEFAULT_API_ENDPOINT_LIMIT_CONFIG,
  OPENGRAPH_FETCH_STORE_NAME,
  DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
  OPENGRAPH_FETCH_CONTEXT_ID,
} from "@/lib/rate-limiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("isOperationAllowed", () => {
    it("should allow operations within the rate limit", () => {
      const clientId = "test-client-1";
      const config = { maxRequests: 3, windowMs: 60000 };

      expect(isOperationAllowed("test-store", clientId, config)).toBe(true);
      expect(isOperationAllowed("test-store", clientId, config)).toBe(true);
      expect(isOperationAllowed("test-store", clientId, config)).toBe(true);
    });

    it("should block operations exceeding the rate limit", () => {
      const clientId = "test-client-2";
      const config = { maxRequests: 2, windowMs: 60000 };

      expect(isOperationAllowed("test-store-2", clientId, config)).toBe(true);
      expect(isOperationAllowed("test-store-2", clientId, config)).toBe(true);
      expect(isOperationAllowed("test-store-2", clientId, config)).toBe(false);
    });

    it("should reset counts after the time window expires", () => {
      const clientId = "test-client-3";
      const config = { maxRequests: 1, windowMs: 60000 };

      expect(isOperationAllowed("test-store-3", clientId, config)).toBe(true);
      expect(isOperationAllowed("test-store-3", clientId, config)).toBe(false);

      // Advance time past the window
      jest.advanceTimersByTime(61000);

      expect(isOperationAllowed("test-store-3", clientId, config)).toBe(true);
    });

    it("should track different clients independently", () => {
      const config = { maxRequests: 1, windowMs: 60000 };

      expect(isOperationAllowed("test-store-4", "client-a", config)).toBe(true);
      expect(isOperationAllowed("test-store-4", "client-b", config)).toBe(true);
      expect(isOperationAllowed("test-store-4", "client-a", config)).toBe(false);
      expect(isOperationAllowed("test-store-4", "client-b", config)).toBe(false);
    });

    it("should track different stores independently", () => {
      const clientId = "test-client-4";
      const config = { maxRequests: 1, windowMs: 60000 };

      expect(isOperationAllowed("store-a", clientId, config)).toBe(true);
      expect(isOperationAllowed("store-b", clientId, config)).toBe(true);
      expect(isOperationAllowed("store-a", clientId, config)).toBe(false);
      expect(isOperationAllowed("store-b", clientId, config)).toBe(false);
    });

    it("should handle edge case of zero max requests", () => {
      const clientId = "test-client-5";
      const config = { maxRequests: 0, windowMs: 60000 };

      expect(() => isOperationAllowed("test-store-5", clientId, config)).toThrow(
        "Invalid maxRequests: 0. Must be greater than 0.",
      );
    });

    it("should handle invalid window time", () => {
      const clientId = "test-client-6";
      const config = { maxRequests: 1, windowMs: -1 };

      expect(() => isOperationAllowed("test-store-6", clientId, config)).toThrow(
        "Invalid windowMs: -1. Must be greater than 0.",
      );
    });

    it("should clean up expired entries", () => {
      const config = { maxRequests: 1, windowMs: 1000 };

      // Create multiple clients
      isOperationAllowed("test-store-7", "client-1", config);
      isOperationAllowed("test-store-7", "client-2", config);
      isOperationAllowed("test-store-7", "client-3", config);

      // Advance time past window
      jest.advanceTimersByTime(2000);

      // New operations should work (old entries cleaned up)
      expect(isOperationAllowed("test-store-7", "client-1", config)).toBe(true);
      expect(isOperationAllowed("test-store-7", "client-2", config)).toBe(true);
      expect(isOperationAllowed("test-store-7", "client-3", config)).toBe(true);
    });
  });

  describe("waitForPermit", () => {
    it("should immediately resolve if operation is allowed", async () => {
      const clientId = "wait-client-1";
      const config = { maxRequests: 1, windowMs: 60000 };

      const startTime = Date.now();
      await waitForPermit("wait-store-1", clientId, config);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it("should wait until permit is available", async () => {
      const clientId = "wait-client-2";
      const config = { maxRequests: 1, windowMs: 1000 };

      // Use up the limit
      isOperationAllowed("wait-store-2", clientId, config);

      // Start waiting for permit
      const waitPromise = waitForPermit("wait-store-2", clientId, config, 50);

      // Initially should not be resolved
      let resolved = false;
      waitPromise.then(() => {
        resolved = true;
      });

      // Advance time partially
      jest.advanceTimersByTime(500);
      await Promise.resolve(); // Allow promises to flush
      expect(resolved).toBe(false);

      // Advance time past window
      jest.advanceTimersByTime(600);
      await Promise.resolve();

      // Should now be resolved
      await waitPromise;
      expect(resolved).toBe(true);
    });

    it("should handle multiple waiters correctly", async () => {
      const config = { maxRequests: 2, windowMs: 1000 };

      // Use up the limit
      isOperationAllowed("wait-store-3", "client", config);
      isOperationAllowed("wait-store-3", "client", config);

      // Start multiple waiters
      const waiter1 = waitForPermit("wait-store-3", "client", config);
      const waiter2 = waitForPermit("wait-store-3", "client", config);

      // Advance time past window
      jest.advanceTimersByTime(1100);

      // Both should resolve
      await expect(Promise.race([waiter1, waiter2])).resolves.toBeUndefined();
    });

    it("should validate configuration", async () => {
      await expect(waitForPermit("test", "client", { maxRequests: 0, windowMs: 1000 })).rejects.toThrow(
        "Invalid maxRequests",
      );

      await expect(waitForPermit("test", "client", { maxRequests: 1, windowMs: 0 })).rejects.toThrow(
        "Invalid windowMs",
      );
    });

    it("should use intelligent wait times for long windows", async () => {
      const clientId = "wait-client-4";
      const config = { maxRequests: 1, windowMs: 5000 }; // 5 second window

      // Use up the limit
      isOperationAllowed("wait-store-4", clientId, config);

      // Mock setTimeout to track wait times
      const setTimeoutSpy = jest.spyOn(global, "setTimeout");

      // Start waiting
      const waitPromise = waitForPermit("wait-store-4", clientId, config);

      // Allow initial check
      await Promise.resolve();

      // Check that it's using a longer wait time for efficiency
      const calls = setTimeoutSpy.mock.calls;
      const lastCallWaitTime = calls[calls.length - 1][1];
      expect(lastCallWaitTime).toBeGreaterThan(1000); // Should wait more than 1 second

      // Clean up
      jest.advanceTimersByTime(5100);
      await waitPromise;
      setTimeoutSpy.mockRestore();
    });
  });

  describe("Default configurations", () => {
    it("should have reasonable default API endpoint limits", () => {
      expect(DEFAULT_API_ENDPOINT_LIMIT_CONFIG.maxRequests).toBe(5);
      expect(DEFAULT_API_ENDPOINT_LIMIT_CONFIG.windowMs).toBe(60000);
    });

    it("should have reasonable default OpenGraph fetch limits", () => {
      expect(DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG.maxRequests).toBe(10);
      expect(DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG.windowMs).toBe(1000);
    });

    it("should define proper store names and context IDs", () => {
      expect(API_ENDPOINT_STORE_NAME).toBe("apiEndpoints");
      expect(OPENGRAPH_FETCH_STORE_NAME).toBe("outgoingOpenGraph");
      expect(OPENGRAPH_FETCH_CONTEXT_ID).toBe("global");
    });
  });

  describe("Real-world usage patterns", () => {
    it("should handle API endpoint rate limiting correctly", () => {
      const ipAddress = "192.168.1.100";

      // Simulate 5 requests from same IP
      for (let i = 0; i < 5; i++) {
        expect(isOperationAllowed(API_ENDPOINT_STORE_NAME, ipAddress, DEFAULT_API_ENDPOINT_LIMIT_CONFIG)).toBe(true);
      }

      // 6th request should be blocked
      expect(isOperationAllowed(API_ENDPOINT_STORE_NAME, ipAddress, DEFAULT_API_ENDPOINT_LIMIT_CONFIG)).toBe(false);
    });

    it("should handle OpenGraph fetch rate limiting correctly", () => {
      // Global rate limit for OpenGraph fetches
      for (let i = 0; i < 10; i++) {
        expect(
          isOperationAllowed(
            OPENGRAPH_FETCH_STORE_NAME,
            OPENGRAPH_FETCH_CONTEXT_ID,
            DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
          ),
        ).toBe(true);
      }

      // 11th request within 1 second should be blocked
      expect(
        isOperationAllowed(
          OPENGRAPH_FETCH_STORE_NAME,
          OPENGRAPH_FETCH_CONTEXT_ID,
          DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
        ),
      ).toBe(false);

      // After 1 second, should be allowed again
      jest.advanceTimersByTime(1100);
      expect(
        isOperationAllowed(
          OPENGRAPH_FETCH_STORE_NAME,
          OPENGRAPH_FETCH_CONTEXT_ID,
          DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
        ),
      ).toBe(true);
    });
  });

  describe("Concurrent access", () => {
    it("should handle concurrent requests atomically", () => {
      const clientId = "concurrent-client";
      const config = { maxRequests: 5, windowMs: 60000 };

      // Simulate concurrent requests
      const results = Array(10)
        .fill(null)
        .map(() => isOperationAllowed("concurrent-store", clientId, config));

      const allowedCount = results.filter((result) => result === true).length;
      const blockedCount = results.filter((result) => result === false).length;

      expect(allowedCount).toBe(5);
      expect(blockedCount).toBe(5);
    });
  });
});
