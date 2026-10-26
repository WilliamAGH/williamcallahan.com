import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { DataFetchOperationSummary } from "@/types/lib";

/** Preserve the tag producer's diagnostic stream and carry its terminal cause into the job result. */
export function runBookmarkTagTask(
  operation: "bookmark-tags" | "bookmark-tags-retrofit",
  scriptArgs: readonly string[],
): Promise<DataFetchOperationSummary> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/ingest-bookmark-tag-aliases.node.mjs", ...scriptArgs], {
      env: process.env,
      stdio: ["inherit", "inherit", "pipe"],
      detached: false,
    });
    let terminalCause: string | undefined;
    child.stderr.pipe(process.stderr, { end: false });
    const lines = createInterface({ input: child.stderr });
    lines.on("line", (line) => {
      const prefix = "[BookmarkTagIngestion] Failed: ";
      if (line.startsWith(prefix)) terminalCause = line.slice(prefix.length);
    });
    child.once("error", (error) => {
      resolve({
        success: false,
        operation,
        error: error.message,
        duration: (Date.now() - startedAt) / 1000,
      });
    });
    child.once("close", (code, signal) => {
      resolve({
        success: code === 0,
        operation,
        error:
          code === 0
            ? undefined
            : [
                signal
                  ? `Tag ingestion terminated by ${signal}`
                  : `Tag ingestion exited with code ${code ?? -1}`,
                terminalCause,
              ]
                .filter(Boolean)
                .join(": "),
        duration: (Date.now() - startedAt) / 1000,
      });
    });
  });
}
