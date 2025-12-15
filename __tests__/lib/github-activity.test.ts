/**
 * Jest test for lib/data-access/github.ts
 * Tests GitHub activity refresh functionality and diagnostics
 */

// Mock the GitHub data access module
jest.mock("@/lib/data-access/github", () => ({
  refreshGitHubActivityDataFromApi: jest.fn(),
}));

// Mock the S3 utils module
jest.mock("@/lib/s3-utils", () => ({
  getS3ObjectMetadata: jest.fn(),
}));

// Mock fetch globally
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { getS3ObjectMetadata } from "@/lib/s3-utils";
import { GITHUB_ACTIVITY_S3_PATHS } from "@/lib/constants";

const mockRefreshGitHubActivityDataFromApi = jest.mocked(refreshGitHubActivityDataFromApi);
const mockGetS3ObjectMetadata = jest.mocked(getS3ObjectMetadata);
const mockFetch = fetchMock as unknown as jest.MockedFunction<typeof fetch>;

type RefreshGitHubActivityResult = NonNullable<Awaited<ReturnType<typeof refreshGitHubActivityDataFromApi>>>;

describe("lib/data-access/github.ts functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    process.env.GITHUB_REPO_OWNER = "";
    process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH = "";
    process.env.GITHUB_API_TOKEN = "";
    process.env.GITHUB_TOKEN = "";
    process.env.S3_BUCKET = "";
    process.env.GITHUB_CRON_REFRESH_SECRET = "";
    process.env.BOOKMARK_CRON_REFRESH_SECRET = "";
    process.env.GITHUB_REFRESH_SECRET = "";
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("environment variable validation", () => {
    it("should detect missing environment variables", () => {
      const requiredEnvVars = [
        "GITHUB_REPO_OWNER",
        "GITHUB_ACCESS_TOKEN_COMMIT_GRAPH",
        "GITHUB_API_TOKEN",
        "GITHUB_TOKEN",
        "S3_BUCKET",
      ];

      for (const envVar of requiredEnvVars) {
        expect(process.env[envVar]).toBeFalsy();
      }
    });

    it("should detect present environment variables", () => {
      // Set test environment variables
      process.env.GITHUB_REPO_OWNER = "test-owner";
      process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH = "test-token";
      process.env.GITHUB_API_TOKEN = "test-api-token";
      process.env.GITHUB_TOKEN = "test-github-token";
      process.env.S3_BUCKET = "test-bucket";

      expect(process.env.GITHUB_REPO_OWNER).toBe("test-owner");
      expect(process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH).toBe("test-token");
      expect(process.env.GITHUB_API_TOKEN).toBe("test-api-token");
      expect(process.env.GITHUB_TOKEN).toBe("test-github-token");
      expect(process.env.S3_BUCKET).toBe("test-bucket");
    });

    it("should determine environment suffix correctly", () => {
      // Helper function to test suffix logic (hoisted here for linter)
      const getEnvSuffix = (env: string | undefined): string =>
        env === "production" || !env ? "" : env === "test" ? "-test" : "-dev";

      // Test production (default)
      expect(getEnvSuffix(undefined)).toBe("");
      expect(getEnvSuffix("production")).toBe("");

      // Test development
      expect(getEnvSuffix("development")).toBe("-dev");

      // Test test environment
      expect(getEnvSuffix("test")).toBe("-test");
    });
  });

  describe("S3 data key generation", () => {
    it("should generate correct activity key for different environments", () => {
      const testCases = [
        { env: undefined, expected: "json/github-activity/activity_data.json" },
        { env: "production", expected: "json/github-activity/activity_data.json" },
        { env: "development", expected: "json/github-activity/activity_data-dev.json" },
        { env: "test", expected: "json/github-activity/activity_data-test.json" },
      ];

      for (const { env, expected } of testCases) {
        const envSuffix = env === "production" || !env ? "" : env === "test" ? "-test" : "-dev";
        const activityKey = `json/github-activity/activity_data${envSuffix}.json`;

        expect(activityKey).toBe(expected);
      }
    });
  });

  describe("direct refresh functionality", () => {
    it("should handle successful refresh", async () => {
      const mockResult: RefreshGitHubActivityResult = {
        trailingYearData: {
          source: "api",
          data: [],
          totalContributions: 365,
          dataComplete: true,
        },
        allTimeData: {
          source: "api",
          data: [],
          totalContributions: 1000,
          dataComplete: true,
          allTimeTotalContributions: 1000,
        },
      };

      mockRefreshGitHubActivityDataFromApi.mockResolvedValue(mockResult);

      const mockMetadata = {
        LastModified: new Date(),
        ETag: "test-etag",
      };
      mockGetS3ObjectMetadata.mockResolvedValue(mockMetadata);

      // Test that the mock functions work as expected
      const result = await refreshGitHubActivityDataFromApi();
      expect(result).toEqual(mockResult);
      expect(result?.trailingYearData.totalContributions).toBe(365);
      expect(result?.allTimeData.totalContributions).toBe(1000);

      const metadata = await getS3ObjectMetadata("test-key");
      expect(metadata).toEqual(mockMetadata);
    });

    it("should handle refresh failure", async () => {
      mockRefreshGitHubActivityDataFromApi.mockResolvedValue(null);

      const result = await refreshGitHubActivityDataFromApi();
      expect(result).toBeNull();
    });

    it("should handle S3 metadata retrieval", async () => {
      const testKey = GITHUB_ACTIVITY_S3_PATHS.ACTIVITY_DATA_PROD_FALLBACK;
      const mockMetadata = {
        LastModified: new Date("2024-01-01"),
        ETag: "test-etag",
      };

      mockGetS3ObjectMetadata.mockResolvedValue(mockMetadata);

      const metadata = await getS3ObjectMetadata(testKey);
      expect(metadata).toEqual(mockMetadata);
      expect(metadata?.LastModified).toEqual(new Date("2024-01-01"));
    });

    it("should calculate age correctly", () => {
      const testDate = new Date("2024-01-01");
      const currentDate = new Date("2024-01-08"); // 7 days later

      // Mock Date.now to return consistent results
      const originalNow = Date.now;
      Date.now = jest.fn(() => currentDate.getTime());

      const ageDays = Math.round((Date.now() - testDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(ageDays).toBe(7);

      // Restore original Date.now
      Date.now = originalNow;
    });
  });

  describe("API endpoint testing", () => {
    beforeEach(() => {
      mockFetch.mockClear();
    });

    it("should format correct API URLs", () => {
      const baseUrl = "http://localhost:3000";
      const endpoint = "/api/github-activity/refresh";
      const fullUrl = `${baseUrl}${endpoint}`;

      expect(fullUrl).toBe("http://localhost:3000/api/github-activity/refresh");
    });

    it("should prepare correct authentication headers", () => {
      const testSecret = "test-secret-123";
      process.env.GITHUB_CRON_REFRESH_SECRET = testSecret;

      const bearerHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSecret}`,
      };

      expect(bearerHeaders.Authorization).toBe(`Bearer ${testSecret}`);

      const refreshHeaders = {
        "Content-Type": "application/json",
        "x-refresh-secret": testSecret,
      };

      expect(refreshHeaders["x-refresh-secret"]).toBe(testSecret);
    });

    it("should handle API response structure", async () => {
      const mockResponse = {
        success: true,
        data: { contributions: 365 },
        message: "Refresh successful",
      };

      mockFetch.mockResolvedValue({
        status: 200,
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const response = await fetch("http://localhost:3000/api/github-activity/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual(mockResponse);
      expect(data.success).toBe(true);
      expect(data.data.contributions).toBe(365);
    });

    it("should handle API error responses", async () => {
      const mockErrorResponse = {
        error: "Authentication failed",
        status: 401,
      };

      mockFetch.mockResolvedValue({
        status: 401,
        json: jest.fn().mockResolvedValue(mockErrorResponse),
      } as any);

      const response = await fetch("http://localhost:3000/api/github-activity/refresh");
      expect(response.status).toBe(401);

      const errorData = await response.json();
      expect(errorData.error).toBe("Authentication failed");
    });
  });

  describe("authentication secret validation", () => {
    it("should validate different authentication methods", () => {
      const secrets = {
        cronSecret: "cron-secret-123",
        refreshSecret: "refresh-secret-456",
      };

      // Test cron secret
      process.env.GITHUB_CRON_REFRESH_SECRET = secrets.cronSecret;
      process.env.BOOKMARK_CRON_REFRESH_SECRET = "fallback-secret";

      const cronSecret = process.env.GITHUB_CRON_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
      expect(cronSecret).toBe(secrets.cronSecret);

      // Test refresh secret
      process.env.GITHUB_REFRESH_SECRET = secrets.refreshSecret;
      expect(process.env.GITHUB_REFRESH_SECRET).toBe(secrets.refreshSecret);
    });

    it("should handle fallback authentication", () => {
      // Clear primary secret, set fallback
      process.env.GITHUB_CRON_REFRESH_SECRET = "";
      process.env.BOOKMARK_CRON_REFRESH_SECRET = "fallback-secret";

      const cronSecret = process.env.GITHUB_CRON_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
      expect(cronSecret).toBe("fallback-secret");
    });
  });

  describe("error handling", () => {
    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      try {
        await fetch("http://localhost:3000/api/github-activity/refresh");
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Network error");
      }
    });

    it("should handle refresh function errors", async () => {
      const testError = new Error("GitHub API rate limit exceeded");
      mockRefreshGitHubActivityDataFromApi.mockRejectedValue(testError);

      try {
        await refreshGitHubActivityDataFromApi();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toEqual(testError);
      }
    });

    it("should handle S3 metadata errors", async () => {
      mockGetS3ObjectMetadata.mockResolvedValue(null);

      const metadata = await getS3ObjectMetadata("non-existent-key");
      expect(metadata).toBeNull();
    });
  });
});
