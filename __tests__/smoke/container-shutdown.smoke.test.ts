/**
 * Smoke tests for container graceful shutdown.
 *
 * Both images run their long-running program as PID 1 so the kernel delivers
 * SIGTERM to a process that has a handler installed. Wrapping either in
 * `node --run <script>` reintroduces a fork whose parent registers no handler:
 * as PID 1 that signal is discarded and the container idles until SIGKILL.
 *
 * @fileoverview Guards the deploy-time shutdown path described in docs/ops/deployment.md.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

describe("Container graceful shutdown", () => {
  vi.setConfig({ testTimeout: 60000 });

  it("exits cleanly when the running scheduler receives SIGTERM", async () => {
    const scheduler = spawn("node", ["--import", "tsx", "scheduler/scheduler.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, SCHEDULER_HEARTBEAT_FILE: "/tmp/scheduler-shutdown-test-heartbeat" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    const ready = new Promise<void>((resolve, reject) => {
      scheduler.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes("Setup complete")) resolve();
      });
      scheduler.on("error", reject);
      scheduler.on("exit", (code) => reject(new Error(`Scheduler exited early (code ${code})`)));
    });

    const exited = new Promise<number | null>((resolve) => {
      scheduler.on("close", (code) => resolve(code));
    });

    try {
      await ready;
      scheduler.kill("SIGTERM");

      expect(await exited).toBe(0);
      expect(stdout).toContain("SIGTERM received");
      expect(stdout).toContain("In-flight work drained; exiting");
    } finally {
      // A failed assertion or an unmet `ready` would otherwise orphan a live
      // scheduler with cron timers and an hourly heartbeat for the runner's lifetime.
      scheduler.kill("SIGKILL");
    }
  });

  // The Dockerfile CMD is the governed surface here and cannot be exercised without
  // building the images, so assert it directly ([TST1h] generated-surface carve-out).
  it("keeps the real program as PID 1 in both images", async () => {
    const [web, scheduler] = await Promise.all([
      readFile("Dockerfile", "utf8"),
      readFile("scheduler/Dockerfile", "utf8"),
    ]);

    expect(web).toContain('CMD ["node", "./node_modules/next/dist/bin/next", "start"]');
    expect(scheduler).toContain('CMD ["node", "--import", "tsx", "scheduler/scheduler.ts"]');
    expect(web).not.toMatch(/^CMD .*--run/m);
    expect(scheduler).not.toMatch(/^CMD .*--run/m);
  });
});
