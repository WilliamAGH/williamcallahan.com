// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMonitoredStream,
  streamBodyAfterFirstByte,
  streamToBufferWithLimits,
} from "@/lib/utils/stream-utils";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tee consumer lifecycle", () => {
  it("replays complete bytes to both monitored and persistence consumers", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4, 5]));
        controller.close();
      },
    });
    const opened = await streamBodyAfterFirstByte(new Response(source), {
      refetch: () => Promise.reject(new Error("Unexpected retry")),
      assetId: "complete",
      deadlineAt: Date.now() + 30_000,
      log: vi.fn<(message: string) => void>(),
    });
    if (!opened.ok) throw new Error(opened.error);

    const [client, persistence] = opened.body.tee();
    const buffers = await Promise.all([
      streamToBufferWithLimits(createMonitoredStream(client, "complete"), "complete"),
      streamToBufferWithLimits(persistence, "complete"),
    ]);

    expect(buffers).toEqual([Buffer.from([1, 2, 3, 4, 5]), Buffer.from([1, 2, 3, 4, 5])]);
  });

  it("returns 504 after a repeated first-byte stall without a second retry", async () => {
    let cancellations = 0;
    let refetches = 0;
    const stalledResponse = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancellations++;
          },
        }),
      );
    const opening = streamBodyAfterFirstByte(stalledResponse(), {
      refetch: () => {
        refetches++;
        return Promise.resolve(stalledResponse());
      },
      assetId: "repeated",
      deadlineAt: Date.now() + 40_000,
      log: vi.fn<(message: string) => void>(),
    });

    await vi.advanceTimersByTimeAsync(40_000);

    await expect(opening).resolves.toEqual({
      ok: false,
      status: 504,
      error: "Asset fetch timed out",
    });
    expect(refetches).toBe(1);
    expect(cancellations).toBe(2);
  });

  it("errors a monitored read timeout without waiting for its tee sibling", async () => {
    const [client, sibling] = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([7]));
      },
    }).tee();
    const reader = createMonitoredStream(client, "independent").getReader();
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: new Uint8Array([7]),
    });
    let settled = false;
    const result = reader.read().then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );

    try {
      await vi.advanceTimersByTimeAsync(21_000);
      expect(settled).toBe(true);
      await expect(result).resolves.toBeInstanceOf(Error);
    } finally {
      await sibling.cancel();
      reader.releaseLock();
    }
  });

  it("rejects both tee consumers and cancels upstream after a post-first-byte stall", async () => {
    let upstreamCancelled = false;
    let refetches = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([8]));
      },
      cancel() {
        upstreamCancelled = true;
      },
    });
    const opened = await streamBodyAfterFirstByte(new Response(source), {
      refetch: () => {
        refetches++;
        return Promise.reject(new Error("Unexpected retry after the first byte"));
      },
      assetId: "stalled",
      deadlineAt: Date.now() + 30_000,
      log: vi.fn<(message: string) => void>(),
    });
    if (!opened.ok) throw new Error(opened.error);

    const [client, persistence] = opened.body.tee();
    const reader = createMonitoredStream(client, "stalled").getReader();
    const persisted = streamToBufferWithLimits(persistence, "stalled").then(
      () => null,
      (error: unknown) => error,
    );
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: new Uint8Array([8]),
    });
    let settled = false;
    const result = reader.read().then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );

    try {
      await vi.advanceTimersByTimeAsync(21_000);
      expect(settled).toBe(true);
      await expect(result).resolves.toBeInstanceOf(Error);
      await expect(persisted).resolves.toBeInstanceOf(Error);
      expect(upstreamCancelled).toBe(true);
      expect(refetches).toBe(0);
    } finally {
      await persistence.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  });
});
