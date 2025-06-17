#!/usr/bin/env bun

/**
 * Script to detect and fix fetch mock leaking issues
 */

console.log("=== Fetch Mock Debug & Fix Script ===\n");

// Check current NODE_ENV
console.log(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

// Store the current fetch in case restoration is needed later (not currently used but kept for debugging reference)
// const originalFetch = globalThis.fetch;

// Check if fetch is mocked
console.log("\nChecking fetch status:");
console.log(`- typeof fetch: ${typeof globalThis.fetch}`);
console.log(`- fetch.name: ${globalThis.fetch?.name}`);
console.log(
  `- fetch.toString().includes('mock'): ${globalThis.fetch?.toString().includes("mock") || false}`,
);

// Test fetch functionality with async IIFE
void (async () => {
  console.log("\nTesting fetch functionality:");
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    // Try to make a simple request to check if fetch works
    console.log("Attempting to fetch a test URL...");
    const testUrl = "https://api.github.com/";

    // Use a timeout to prevent hanging
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(testUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    console.log(`✓ Fetch successful! Status: ${response.status}`);
    console.log("✓ Fetch is working normally");
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorObj = error instanceof Error ? error : new Error(String(error));
    if (errorObj.name === "AbortError") {
      console.log("✗ Fetch timed out - might be mocked");
    } else {
      console.log(`✗ Fetch failed with error: ${errorObj.message}`);
    }
    console.log("✗ Fetch appears to be mocked or broken");
  }

  // Check for Jest environment indicators
  console.log("\nChecking for Jest environment:");
  const globalTyped = global as { jest?: unknown };
  console.log(`- global.jest: ${typeof globalTyped.jest}`);
  console.log(`- process.env.JEST_WORKER_ID: ${process.env.JEST_WORKER_ID || "not set"}`);
  console.log(`- __dirname includes __tests__: ${__dirname.includes("__tests__")}`);

  // Check if fetch is mocked and try to restore
  if (
    globalThis.fetch?.toString().includes("mock") ||
    globalThis.fetch?.name === "fetch" ||
    ("_isMockFunction" in (globalThis.fetch as unknown as { [key: string]: unknown }))
  ) {
    console.log("\n⚠️  Detected potential mock - attempting restoration...");
    
    // Try to import native fetch
    try {
      const { fetch: undiciFetch } = await import("undici");
      globalThis.fetch = undiciFetch as unknown as typeof globalThis.fetch;
      console.log("✓ Native fetch restored from undici");
    } catch (error) {
      console.log("✗ Failed to restore fetch:", error);
    }
  }

  // Recommendations
  console.log("\n=== Recommendations ===");
  console.log("1. Kill any running Jest processes: pkill -f jest");
  console.log("2. Clear node_modules: rm -rf node_modules && bun install");
  console.log("3. Clear Next.js cache: rm -rf .next");
  console.log("4. Restart your development server");
  console.log("5. Ensure NODE_ENV is set correctly for development");
  console.log("\nIf the issue persists, check for:");
  console.log("- Any test files being imported in non-test code");
  console.log("- Global mocks in jest.setup.ts that might be leaking");
  console.log("- Environment detection logic that might be faulty");
})();
