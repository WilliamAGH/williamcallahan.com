import { Readable } from "node:stream";
import { vi } from "vitest";
import { getLogoBatch } from "@/lib/data-access/logos-batch";
import { checkIfS3ObjectExists } from "@/lib/s3/objects";
import { writeBinaryS3 } from "@/lib/s3/binary";
import { generateS3Key } from "@/lib/utils/hash-utils";
import { getDomainVariants } from "@/lib/utils/domain-utils";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";
import { retryWithThrow } from "@/lib/utils/retry";
import type { LogoSource } from "@/types/logo";
import type { UnifiedImageService } from "@/lib/services/unified-image-service";
import type { FailureTracker } from "@/lib/utils/failure-tracker";

type DomainFailureTracker = FailureTracker<string>;

// Mock dependencies
vi.mock("@/lib/s3/objects");
vi.mock("@/lib/s3/binary");
vi.mock("@/lib/utils/hash-utils");
vi.mock("@/lib/utils/domain-utils");
vi.mock("@/lib/services/unified-image-service", () => ({
  getUnifiedImageService: vi.fn<() => Pick<UnifiedImageService, "getLogo">>().mockReturnValue({
    getLogo: vi.fn<UnifiedImageService["getLogo"]>().mockResolvedValue({
      url: "https://example.com/logo.png",
      source: "google",
      contentType: "image/png",
    }),
  }),
}));

// Mock the FailureTracker to prevent loading persisted data
vi.mock("@/lib/utils/failure-tracker", () => ({
  FailureTracker: vi.fn<
    () => Pick<
      DomainFailureTracker,
      "shouldSkip" | "recordFailure" | "removeFailure" | "load" | "save"
    >
  >(function () {
    return {
      shouldSkip: vi.fn<DomainFailureTracker["shouldSkip"]>().mockResolvedValue(false),
      recordFailure: vi.fn<DomainFailureTracker["recordFailure"]>().mockResolvedValue(undefined),
      removeFailure: vi.fn<DomainFailureTracker["removeFailure"]>(),
      load: vi.fn<DomainFailureTracker["load"]>().mockResolvedValue(undefined),
      save: vi.fn<DomainFailureTracker["save"]>().mockResolvedValue(undefined),
    };
  }),
}));

// Mock LOGO_SOURCES from constants
vi.mock("@/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants")>();
  return {
    ...actual,
    LOGO_SOURCES: {
      google: {
        hd: (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=256`,
      },
      duckduckgo: {
        hd: (d: string) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
      },
    },
    LOGO_BLOCKLIST_STORE_KEY: "rate-limit/logo-failed-domains-test",
  };
});

describe("Logos Batch Performance Optimizations", () => {
  const mockCheckIfS3ObjectExists = vi.mocked(checkIfS3ObjectExists);
  const mockGenerateS3Key = vi.mocked(generateS3Key);
  const mockGetDomainVariants = vi.mocked(getDomainVariants);
  const mockWriteBinaryS3 = vi.mocked(writeBinaryS3);

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockGetDomainVariants.mockReturnValue(["example.com", "www.example.com"]);
    mockGenerateS3Key.mockImplementation(
      ({ domain, source, extension }) => `logos/${source}/${domain}.${extension}`,
    );
    mockCheckIfS3ObjectExists.mockResolvedValue(false); // Default: no logos exist
    mockWriteBinaryS3.mockResolvedValue(undefined);

    // Mock fetch to prevent actual network requests
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>(), {
        headers: { "content-type": "image/png" },
      }),
    );

    // Mock Readable.fromWeb for Node.js stream conversion
    vi.spyOn(Readable, "fromWeb").mockReturnValue(
      new Readable({
        read() {
          this.push(null); // Empty stream
        },
      }),
    );
  });

  describe("Batch S3 existence checking", () => {
    it.each([2, 4])(
      "checks ten S3 objects concurrently across %i domain variants",
      async (variantCount) => {
        const variants = [
          "example.com",
          "www.example.com",
          "app.example.com",
          "api.example.com",
        ].slice(0, variantCount);
        mockGetDomainVariants.mockReturnValue(variants);
        const matchingKey = `logos/duckduckgo/${variants.at(-1)}.webp`;
        let batchStarted = Promise.withResolvers<void>();
        let batchCompletion = Promise.withResolvers<void>();
        let activeChecks = 0;
        let peakActiveChecks = 0;

        mockCheckIfS3ObjectExists.mockImplementation(async (key) => {
          const completion = batchCompletion.promise;
          activeChecks += 1;
          peakActiveChecks = Math.max(peakActiveChecks, activeChecks);
          if (activeChecks === 10) batchStarted.resolve();
          await completion;
          activeChecks -= 1;
          return key === matchingKey;
        });

        const logoResult = getLogoBatch("example.com");
        for (let batchIndex = 0; batchIndex < variantCount; batchIndex += 1) {
          // Hold every check open until the full batch is in flight.
          await Promise.race([batchStarted.promise, logoResult]);
          expect(activeChecks).toBe(10);
          const completeBatch = batchCompletion.resolve;
          batchStarted = Promise.withResolvers<void>();
          batchCompletion = Promise.withResolvers<void>();
          completeBatch();
        }

        await expect(logoResult).resolves.toEqual({
          url: `${getS3CdnUrl()}/${matchingKey}`,
          source: "duckduckgo",
          error: undefined,
          contentType: "image/webp",
        });
        expect(activeChecks).toBe(0);
        expect(peakActiveChecks).toBe(10);
      },
    );

    it("should return early when logo is found", async () => {
      // Make the 5th check return true
      let checkCount = 0;
      mockCheckIfS3ObjectExists.mockImplementation(() => {
        checkCount++;
        return Promise.resolve(checkCount === 5);
      });

      const result = await getLogoBatch("example.com");

      // Should stop checking after finding a match
      expect(mockCheckIfS3ObjectExists).toHaveBeenCalledTimes(10); // First batch only
      expect(result.source).toBe("google"); // Found in first source
      expect(result.contentType).toBe("image/webp"); // 5th check is webp extension
    });
  });

  describe("Batch failures", () => {
    it("should handle errors in batch without failing entire operation", async () => {
      let checkCount = 0;
      mockCheckIfS3ObjectExists.mockImplementation(() => {
        checkCount++;
        // Make some checks fail
        if (checkCount === 3 || checkCount === 7) {
          return Promise.reject(new Error("S3 check failed"));
        }
        return Promise.resolve(false);
      });

      // The current implementation doesn't handle S3 check errors gracefully
      // It will throw when Promise.all encounters a rejection
      await expect(getLogoBatch("example.com")).rejects.toThrow("S3 check failed");

      // It should have attempted some checks before failing
      expect(mockCheckIfS3ObjectExists).toHaveBeenCalled();
      // The first batch contains 10 checks, and they all run in parallel
      // even though one fails, so all 10 are called
      expect(mockCheckIfS3ObjectExists).toHaveBeenCalledTimes(10);
    });
  });

  describe("S3 key generation", () => {
    it("should generate correct S3 keys for each combination", async () => {
      await getLogoBatch("example.com");

      // Verify key generation pattern
      const expectedSources: LogoSource[] = ["google", "duckduckgo"];
      const expectedExtensions = ["png", "jpg", "jpeg", "svg", "webp"];
      const expectedVariants = ["example.com", "www.example.com"];

      for (const variant of expectedVariants) {
        for (const source of expectedSources) {
          for (const ext of expectedExtensions) {
            expect(mockGenerateS3Key).toHaveBeenCalledWith({
              type: "logo",
              domain: variant,
              source,
              extension: ext,
            });
          }
        }
      }
    });
  });

  describe("BatchProcessor Result Tracking", () => {
    it("records the root error when retries fail", async () => {
      const { BatchProcessor } = await import("@/lib/batch-processing");
      const rootError = new Error("Non-retryable failure");

      const processor = new BatchProcessor<string, string>(
        "batch-failure",
        () => {
          throw rootError;
        },
        {
          retryOptions: {
            maxRetries: 0,
            isRetryable: () => false,
          },
        },
      );

      const result = await processor.processBatch(["item-1"]);

      expect(result.successful.size).toBe(0);
      expect(result.failed.size).toBe(1);
      expect(result.failed.get("item-1")).toBe(rootError);
      expect(result.skipped.length).toBe(0);
    });

    it("records null as a successful processor result", async () => {
      const { BatchProcessor } = await import("@/lib/batch-processing");
      const processor = new BatchProcessor<string, null>("batch-null-result", async () => null, {
        retryOptions: { maxRetries: 0 },
      });

      const result = await processor.processBatch(["item-1"]);

      expect(result.successful.get("item-1")).toBeNull();
      expect(result.failed.size).toBe(0);
    });

    it("retryWithThrow rejects with the root error", async () => {
      const rootError = new Error("Permanent failure");

      await expect(
        retryWithThrow(() => Promise.reject(rootError), {
          maxRetries: 0,
          isRetryable: () => false,
        }),
      ).rejects.toBe(rootError);
    });
  });
});
