#!/usr/bin/env bun

/**
 * Debug script to check if fetch is mocked and returning test data
 */

console.log('=== Debug Test Bookmark Issue ===\n');

// Check if fetch is mocked
console.log('1. Checking global.fetch:');
console.log('   Type:', typeof global.fetch);
console.log('   Is Jest Mock?:', '_isMockFunction' in global.fetch && (global.fetch as { _isMockFunction?: boolean })._isMockFunction === true);
console.log('   Constructor name:', global.fetch?.constructor?.name);

// Check environment variables
console.log('\n2. Environment Variables:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   BOOKMARK_BEARER_TOKEN:', process.env.BOOKMARK_BEARER_TOKEN ? 'SET' : 'NOT SET');
console.log('   BOOKMARKS_LIST_ID:', process.env.BOOKMARKS_LIST_ID ? 'SET' : 'NOT SET');
console.log('   BOOKMARKS_API_URL:', process.env.BOOKMARKS_API_URL || 'DEFAULT');

// Try to make a simple fetch call to see what happens
console.log('\n3. Testing fetch behavior:');
try {
  // Make a simple test request
  const testUrl = 'https://httpbin.org/get';
  console.log(`   Fetching ${testUrl}...`);
  
  fetch(testUrl)
    .then(response => {
      console.log('   Response status:', response.status);
      console.log('   Response ok:', response.ok);
      return response.json();
    })
    .then((data: unknown) => {
      console.log('   Response data keys:', Object.keys(data as Record<string, unknown>));
      
      // Check if this looks like mocked data
      const mockData = data as { bookmarks?: unknown; title?: string };
      if (mockData.bookmarks || mockData.title === 'Test Bookmark') {
        console.log('\n   ⚠️  WARNING: Fetch appears to be mocked and returning test data!');
        console.log('   Response contains:', JSON.stringify(data, null, 2));
      } else {
        console.log('   ✓ Fetch appears to be working normally');
      }
    })
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('   Error during fetch:', errorMessage);
    });
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.log('   Error setting up fetch test:', errorMessage);
}

// Check for any global test artifacts
console.log('\n4. Checking for test artifacts:');
const globalWithJest = global as { jest?: unknown; __TEST__?: unknown };
console.log('   global.jest exists?:', typeof globalWithJest.jest !== 'undefined');
console.log('   global.__TEST__ exists?:', typeof globalWithJest.__TEST__ !== 'undefined');
console.log('   process.env.JEST_WORKER_ID:', process.env.JEST_WORKER_ID);

// Import and check bookmarks module
console.log('\n5. Checking bookmarks module:');
import('../lib/bookmarks').then(module => {
  console.log('   Module exports:', Object.keys(module));
  
  // Try calling fetchExternalBookmarks to see what it returns
  if (module.fetchExternalBookmarks) {
    console.log('   Calling fetchExternalBookmarks...');
    module.fetchExternalBookmarks()
      .then(bookmarks => {
        console.log(`   Returned ${bookmarks.length} bookmarks`);
        if (bookmarks.length > 0 && bookmarks[0].title === 'Test Bookmark') {
          console.log('\n   ⚠️  WARNING: fetchExternalBookmarks is returning test data!');
          console.log('   First bookmark:', JSON.stringify(bookmarks[0], null, 2));
        } else if (bookmarks.length > 0) {
          console.log('   First bookmark title:', bookmarks[0].title);
          console.log('   ✓ Bookmarks appear to be real data');
        }
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('   Error fetching bookmarks:', errorMessage);
      });
  }
}).catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.log('   Error importing bookmarks module:', errorMessage);
});

// Wait a bit for async operations to complete
setTimeout(() => {
  console.log('\n=== Debug Complete ===');
  process.exit(0);
}, 3000);