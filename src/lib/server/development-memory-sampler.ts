import { readFileSync } from "node:fs";
import { constants, performance, PerformanceObserver } from "node:perf_hooks";

const SAMPLE_INTERVAL_MS = 60_000;
const OBSERVATION_WINDOW_MS = 24 * 60 * SAMPLE_INTERVAL_MS;

function readSwapBytes(): number | null {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const swapKiB = /^VmSwap:\s+(\d+)\s+kB$/m.exec(status)?.[1];
    return swapKiB === undefined ? null : Number(swapKiB) * 1024;
  } catch (error) {
    // Missing swap telemetry is not zero and must not interrupt the web process.
    console.warn("[Memory sampler] Could not read process swap:", error);
    return null;
  }
}

export function startDevelopmentMemorySampler(): void {
  if (process.platform !== "linux") return;
  const stopAt = performance.now() + OBSERVATION_WINDOW_MS;

  function sample(majorGcEndedAt: number | null): void {
    const sampledAt = performance.now();
    if (sampledAt >= stopAt) return;
    console.log(
      JSON.stringify({
        type: "server_memory_sample",
        timestamp: new Date(performance.timeOrigin + sampledAt).toISOString(),
        pid: process.pid,
        ...process.memoryUsage(),
        swapBytes: readSwapBytes(),
        // Node delivers GC events asynchronously; heapUsed is measured in this callback.
        majorGcDelayMs: majorGcEndedAt === null ? null : sampledAt - majorGcEndedAt,
      }),
    );
  }

  let lastMajorSampleAt = -Infinity;
  const observer = new PerformanceObserver((list) => {
    const now = performance.now();
    if (now - lastMajorSampleAt < SAMPLE_INTERVAL_MS) return;

    const majorGc = list
      .getEntries()
      .findLast(
        ({ detail }) =>
          typeof detail === "object" &&
          detail !== null &&
          "kind" in detail &&
          detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR,
      );
    if (!majorGc) return;

    lastMajorSampleAt = now;
    sample(majorGc.startTime + majorGc.duration);
  });
  observer.observe({ type: "gc" });

  sample(null);
  const interval = setInterval(() => sample(null), SAMPLE_INTERVAL_MS).unref();
  setTimeout(() => {
    observer.disconnect();
    clearInterval(interval);
  }, OBSERVATION_WINDOW_MS).unref();
}
