#!/usr/bin/env bun

/**
 * Script to detect and fix fetch mock leaking issues
 */

console.log('=== Fetch Mock Debug & Fix Script ===\n');

// Check current NODE_ENV
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

// Check if fetch is mocked
const originalFetch = globalThis.fetch;
console.log('\nChecking fetch status:');
console.log(`- typeof fetch: ${typeof globalThis.fetch}`);
console.log(`- fetch.name: ${globalThis.fetch?.name}`);
console.log(`- fetch.toString().includes('mock'): ${globalThis.fetch?.toString().includes('mock') || false}`);

// Test fetch functionality
console.log('\nTesting fetch functionality:');
try {
  // Try to make a simple request to check if fetch works
  console.log('Attempting to fetch a test URL...');
  const testUrl = 'https://api.github.com/';
  
  // Use a timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  fetch(testUrl, { signal: controller.signal })
    .then(response => {
      clearTimeout(timeoutId);
      console.log(`✓ Fetch successful! Status: ${response.status}`);
      console.log('✓ Fetch is working normally');
    })
    .catch((error: unknown) => {
      clearTimeout(timeoutId);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      if (errorObj.name === 'AbortError') {
        console.log('✗ Fetch timed out - might be mocked');
      } else {
        console.log(`✗ Fetch failed with error: ${errorObj.message}`);
      }
      console.log('✗ Fetch appears to be mocked or broken');
    });
} catch (error) {
  console.log(`✗ Error testing fetch: ${String(error)}`);
}

// Check for Jest environment indicators
console.log('\nChecking for Jest environment:');
const globalTyped = global as { jest?: unknown };
console.log(`- global.jest: ${typeof globalTyped.jest}`);
console.log(`- process.env.JEST_WORKER_ID: ${process.env.JEST_WORKER_ID || 'not set'}`);
console.log(`- __dirname includes __tests__: ${__dirname.includes('__tests__')}`);

// Force restore original fetch if available
if (typeof originalFetch === 'function' && originalFetch !== globalThis.fetch) {
  console.log('\n⚠️  Detected potential mock - attempting to restore original fetch...');
  globalThis.fetch = originalFetch;
  console.log('✓ Original fetch restored');
}

// Recommendations
console.log('\n=== Recommendations ===');
console.log('1. Kill any running Jest processes: pkill -f jest');
console.log('2. Clear node_modules: rm -rf node_modules && bun install');
console.log('3. Clear Next.js cache: rm -rf .next');
console.log('4. Restart your development server');
console.log('5. Ensure NODE_ENV is set correctly for development');
console.log('\nIf the issue persists, check for:');
console.log('- Any test files being imported in non-test code');
console.log('- Global mocks in jest.setup.ts that might be leaking');
console.log('- Environment detection logic that might be faulty');