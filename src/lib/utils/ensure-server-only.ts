/**
 * Utility function to ensure a module is only loaded on the server.
 * Throws an error if called in a client-side (browser) environment.
 *
 * Lightweight guard without React dependencies — safe to import from
 * server-only modules like server-cache.ts. For React-aware guards
 * (useIsClient, assertClientOnly), see runtime-guards.ts.
 *
 * Vitest's jsdom environment defines `window`, so `process.env.VITEST`
 * is checked to distinguish a test runner from a real browser.
 */
export function assertServerOnly(): void {
  if (typeof window === "undefined") return;
  if (typeof process !== "undefined" && process.env["VITEST"]) return;
  throw new TypeError(
    "This module cannot be imported from a Client Component module. " +
      "It should only be used from a Server Component or other server-side code.",
  );
}
