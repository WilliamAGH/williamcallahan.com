/**
 * Debug Utility
 *
 * Automatically detects debug mode based on:
 * - NODE_ENV === 'development'
 * - --debug flag in process.argv
 */

// Check if debug mode is enabled
const isNodeEnvDevelopment = process.env.NODE_ENV === "development";
const hasDebugFlag = process.argv.includes("--debug");

export const isDebug = isNodeEnvDevelopment || hasDebugFlag;

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
