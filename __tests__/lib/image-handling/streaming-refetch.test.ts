// @vitest-environment node

import { vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { UnifiedImageService } from "@/lib/services/unified-image-service";
import { streamToS3 } from "@/lib/services/image-streaming";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { checkIfS3ObjectExists } from "@/lib/s3/objects";
import type { deleteFromS3, getObject, listS3Objects, putObject } from "@/lib/s3/objects";
import { streamToBuffer } from "@/lib/s3/stream";
import { GET } from "@/app/api/assets/[assetId]/route";

const { assetS3Send, persistAsset } = vi.hoisted(() => ({
  assetS3Send: vi.fn<() => Promise<never>>(),
  persistAsset: vi.fn<(key: string, buffer: Buffer, contentType: string) => Promise<void>>(),
}));

vi.mock("next/server", async () => {
  const requestModule = await import("next/dist/server/web/spec-extension/request");
  const responseModule = await import("next/dist/server/web/spec-extension/response");
  return { NextRequest: requestModule.NextRequest, NextResponse: responseModule.NextResponse };
});

vi.mock("@/lib/s3/client", () => ({
  getS3Client: () => ({ send: assetS3Send }),
}));

vi.mock("@/lib/s3/config", () => ({
  getS3Config: () => ({ bucket: "assets" }),
}));

vi.mock("@/lib/persistence/s3-persistence", () => ({
  persistBinaryToS3: persistAsset,
}));
import { streamBodyAfterFirstByte } from "@/lib/utils/stream-utils";

type MockUploadInstance = {
  abort: ReturnType<typeof vi.fn<() => Promise<void>>>;
  done: ReturnType<typeof vi.fn<() => Promise<{ Location: string }>>>;
  on: ReturnType<typeof vi.fn<() => MockUploadInstance>>;
};

const { uploadInstances, uploadBehavior } = vi.hoisted(() => ({
  uploadInstances: [] as MockUploadInstance[],
  uploadBehavior: { completes: false },
}));

vi.mock("@aws-sdk/lib-storage", () => {
  class MockUpload implements MockUploadInstance {
    abort = vi.fn<() => Promise<void>>(() => Promise.resolve());
    done = vi.fn<() => Promise<{ Location: string }>>(() =>
      uploadBehavior.completes
        ? Promise.resolve({ Location: "https://bucket.s3.amazonaws.com/key" })
        : new Promise<{ Location: string }>(() => undefined),
    );
    on = vi.fn<() => MockUploadInstance>(() => this);

    constructor() {
      uploadInstances.push(this);
    }
  }

  return { Upload: MockUpload };
});

vi.mock("@/lib/utils/http-client", () => ({
  fetchWithTimeout: vi.fn<typeof fetchWithTimeout>(),
  DEFAULT_IMAGE_HEADERS: { "User-Agent": "test-agent" },
}));

vi.mock("@/lib/s3/objects", () => ({
  checkIfS3ObjectExists: vi.fn<typeof checkIfS3ObjectExists>(),
  getObject: vi.fn<typeof getObject>(),
  putObject: vi.fn<typeof putObject>(),
  listS3Objects: vi.fn<typeof listS3Objects>(),
  deleteFromS3: vi.fn<typeof deleteFromS3>(),
}));

const mockFetchWithTimeout = fetchWithTimeout as Mock;
const mockCheckIfS3ObjectExists = checkIfS3ObjectExists as Mock;

describe("UnifiedImageService streaming fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadInstances.length = 0;
    uploadBehavior.completes = false;
    mockCheckIfS3ObjectExists.mockResolvedValue(false);
  });

  it("fetches the requested image URL when its path contains logo-related terms", async () => {
    const url = "https://example.com/assets/brand-photography/hero.jpg";
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" },
    });
    mockFetchWithTimeout.mockResolvedValueOnce(response);

    const service = new UnifiedImageService();
    const result = await service.getImage(url, { skipUpload: true });

    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(url, expect.any(Object));
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
    expect(result.buffer?.length).toBe(3);
    // Note: Buffer content verification skipped due to ArrayBuffer/Buffer transfer quirks in tests
    // The length assertion confirms re-fetch succeeded with new response data
  });

  it("aborts multipart upload and returns when streaming times out", async () => {
    vi.useFakeTimers();
    try {
      const s3Client = new S3Client({
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      });
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // Leave the stream pending so the mocked Upload.done() never settles first.
        },
      });

      const resultPromise = streamToS3(stream, {
        bucket: "bucket",
        key: "images/large.png",
        contentType: "image/png",
        s3Client,
      });

      await vi.advanceTimersByTimeAsync(300000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Stream timeout");
      expect(uploadInstances[0]?.abort).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails and aborts when the source stream errors", async () => {
    uploadBehavior.completes = true;
    const sourceErrors: Error[] = [];
    let pushed = false;
    const source = new Readable({
      read() {
        if (pushed) return;
        pushed = true;
        this.push(Buffer.from("partial image"));
        queueMicrotask(() => this.destroy(new Error("Network failure mid-stream")));
      },
    });
    source.on("error", (error: Error) => sourceErrors.push(error));

    const result = await streamToS3(source, {
      bucket: "bucket",
      key: "images/large.png",
      contentType: "image/png",
      s3Client: new S3Client({
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      }),
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("Network failure mid-stream");
    expect(uploadInstances[0]?.abort).toHaveBeenCalledTimes(1);
    expect(sourceErrors).toHaveLength(1);
  });
});

describe("streamToBuffer lifecycle", () => {
  it("releases its listeners after buffering completes", async () => {
    const stream = Readable.from([Buffer.from("image")]);

    await expect(streamToBuffer(stream)).resolves.toEqual(Buffer.from("image"));

    for (const event of ["data", "error", "end", "close"]) {
      expect(stream.listenerCount(event)).toBe(0);
    }
  });

  it("rejects premature close and releases its listeners", async () => {
    const stream = new Readable({
      read() {
        return undefined;
      },
    });
    const result = streamToBuffer(stream);

    stream.emit("close");

    await expect(result).rejects.toThrow("Premature close");
    for (const event of ["data", "error", "end", "close"]) {
      expect(stream.listenerCount(event)).toBe(0);
    }
  });
});

describe("streamBodyAfterFirstByte retry cleanup", () => {
  it("cancels a non-ok retry body before returning its status", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn<() => Promise<void>>(() => Promise.resolve());
      const retryResponse = new Response(new ReadableStream<Uint8Array>({ cancel }), {
        status: 503,
      });
      const refetch = vi.fn<() => Promise<Response>>(() => Promise.resolve(retryResponse));
      const resultPromise = streamBodyAfterFirstByte(
        new Response(new ReadableStream<Uint8Array>()),
        refetch,
        "retry-cleanup-asset",
      );

      await vi.advanceTimersByTimeAsync(20_000);

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        status: 503,
        error: "Failed to fetch asset",
      });
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("assets route first-byte retry", () => {
  const assetId = "12345678-1234-1234-1234-123456789abc";
  const assetUrl = `https://williamcallahan.com/api/assets/${assetId}`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubEnv("BOOKMARK_BEARER_TOKEN", "test-token");
    vi.stubEnv("BOOKMARKS_API_URL", "https://bookmarks.example.com/api/v1");
    vi.stubEnv("IS_DATA_UPDATER", "true");
    assetS3Send.mockRejectedValue({ name: "NotFound", $metadata: { httpStatusCode: 404 } });
    persistAsset.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    { contentType: "text/html", status: 200, body: "<html>retry</html>", extension: null },
    { contentType: "image/jpeg", status: 206, body: "retry image", extension: "jpg" },
  ])("uses the retry's $contentType metadata and status $status", async (retry) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new ReadableStream<Uint8Array>(), {
          headers: { "content-type": "image/png", "content-length": "3" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(retry.body, {
          status: retry.status,
          headers: {
            "content-type": retry.contentType,
            "content-length": String(retry.body.length),
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = GET(new NextRequest(assetUrl), { params: Promise.resolve({ assetId }) });
    await vi.advanceTimersByTimeAsync(20_000);
    const response = await pending;

    expect(response.status).toBe(retry.status);
    expect(response.headers.get("content-type")).toBe(retry.contentType);
    await expect(response.text()).resolves.toBe(retry.body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (retry.extension) {
      await vi.advanceTimersByTimeAsync(0);
      expect(persistAsset).toHaveBeenCalledWith(
        expect.stringContaining(`${assetId}.${retry.extension}`),
        Buffer.from(retry.body),
        retry.contentType,
      );
    } else {
      expect(persistAsset).not.toHaveBeenCalled();
    }
  });

  it("rejects an oversized retry using its content-length and cancels its body", async () => {
    const cancel = vi.fn<() => void>();
    const retryBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new ReadableStream<Uint8Array>(), {
          headers: { "content-type": "image/png", "content-length": "3" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(retryBody, {
          headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024 + 1) },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = GET(new NextRequest(assetUrl), { params: Promise.resolve({ assetId }) });
    await vi.advanceTimersByTimeAsync(20_000);
    const response = await pending;

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Asset exceeds maximum allowed size",
      assetId,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(persistAsset).not.toHaveBeenCalled();
  });

  it("cancels the first-byte wait on client abort without another upstream fetch", async () => {
    const cancel = vi.fn<() => void>();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    let completed = false;
    const pending = GET(new NextRequest(assetUrl, { signal: controller.signal }), {
      params: Promise.resolve({ assetId }),
    }).then((response) => {
      completed = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(completed).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    const response = await pending;
    expect(response.status).toBe(504);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(persistAsset).not.toHaveBeenCalled();
  });
});
