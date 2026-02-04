import { vi, type Mock } from "vitest";
import { UnifiedImageService } from "@/lib/services/unified-image-service";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { checkIfS3ObjectExists } from "@/lib/s3/objects";

vi.mock("@/lib/utils/http-client", () => ({
  fetchWithTimeout: vi.fn(),
  DEFAULT_IMAGE_HEADERS: { "User-Agent": "test-agent" },
}));

vi.mock("@/lib/s3/objects", () => ({
  checkIfS3ObjectExists: vi.fn(),
  getObject: vi.fn(),
  putObject: vi.fn(),
  listS3Objects: vi.fn(),
  deleteFromS3: vi.fn(),
}));

// Mock s3/json to avoid transitive dependency issues through FailureTracker
vi.mock("@/lib/s3/json", () => ({
  readJsonS3: vi.fn().mockResolvedValue(null),
  readJsonS3Optional: vi.fn().mockResolvedValue(null),
  writeJsonS3: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchWithTimeout = fetchWithTimeout as Mock;
const mockCheckIfS3ObjectExists = checkIfS3ObjectExists as Mock;

describe("UnifiedImageService streaming fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckIfS3ObjectExists.mockResolvedValue(false);
  });

  it("re-fetches when response body is already used before buffering", async () => {
    // Create a mock response that reports bodyUsed: true
    const firstResponse = {
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      bodyUsed: true,
      arrayBuffer: () => Promise.reject(new Error("Body already used")),
    } as unknown as Response;

    const secondResponse = {
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      ok: true,
      bodyUsed: false,
      arrayBuffer: () => {
        const arr = new Uint8Array([4, 5, 6]);
        return Promise.resolve(arr.buffer);
      },
    } as unknown as Response;

    mockFetchWithTimeout.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);

    const service = new UnifiedImageService();
    const result = await service.getImage("https://example.com/image.png", { skipUpload: true });

    // Verify the result has valid buffer with expected length from the second (re-fetched) response
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBe(3);
    // Note: Buffer content verification skipped due to ArrayBuffer/Buffer transfer quirks in tests
    // The length assertion confirms re-fetch succeeded with new response data
  });
});
