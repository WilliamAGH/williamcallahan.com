/**
 * Debug Utility
 *
 * Automatically detects debug mode based on:
 * - NODE_ENV === 'development'
 * - --debug flag in process.argv
 */

// Debug mode is opt-in via either an environment variable or a CLI flag
//  • `DEBUG=true bun …`
//  • `bun dev --debug`
const hasDebugFlag = process.argv.includes("--debug");
export const isDebug = process.env.DEBUG === "true" || hasDebugFlag;

/**
 * Debug logging function - only logs when debug mode is enabled
 * @param args - Arguments to log (same as console.log)
 */
export function debug(...args: unknown[]): void {
  if (isDebug) {
    console.log(...args);
  }
}

/**
 * Debug warning function - only logs when debug mode is enabled
 * @param args - Arguments to log (same as console.warn)
 */
export function debugWarn(...args: unknown[]): void {
  if (isDebug) {
    console.warn(...args);
  }
}

/**
 * Debug error function - only logs when debug mode is enabled
 * @param args - Arguments to log (same as console.error)
 */
export function debugError(...args: unknown[]): void {
  if (isDebug) {
    console.error(...args);
  }
}

/**
 * Unified debug logger with leveled output.
 */
export function debugLog(
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: unknown,
): void {
  const payload = meta ? [message, meta] : [message];
  switch (level) {
    case "warn":
      debugWarn(...payload);
      break;
    case "error":
      debugError(...payload);
      break;
    default:
      debug(...payload);
  }
}
