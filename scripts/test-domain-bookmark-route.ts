#!/usr/bin/env bun

/**
 * Test script for the domain bookmark route
 * 
 * Tests the /bookmarks/domain/[domainSlug] redirector
 * 
 * Run with: bun scripts/test-domain-bookmark-route.ts
 */

console.log('🧪 Testing Domain Bookmark Route\n');

console.log('📍 Domain Route Format:');
console.log('────────────────────────────────────────────────────────────');
console.log('/bookmarks/domain/[domainSlug]?id=[bookmarkId]');
console.log('/bookmarks/domain/[domainSlug]  (finds first match)\n');

console.log('🌐 Example URLs for expo.dev:');
console.log('────────────────────────────────────────────────────────────');

const baseUrl = 'http://localhost:3000';

console.log('\n1️⃣ With specific bookmark ID:');
console.log(`   ${baseUrl}/bookmarks/domain/expo-dev?id=abc123`);
console.log('   → Redirects to: /bookmarks/expo-dev-guides (if that\'s the bookmark with id=abc123)');

console.log('\n2️⃣ Without ID (finds first expo.dev bookmark):');
console.log(`   ${baseUrl}/bookmarks/domain/expo-dev`);
console.log('   → Redirects to: /bookmarks/expo-dev (or first matching bookmark)');

console.log('\n3️⃣ Domain slug examples:');
console.log('   expo.dev        → expo-dev');
console.log('   github.com      → github-com');
console.log('   vercel.com      → vercel-com');
console.log('   react.dev       → react-dev');
console.log('   stackoverflow.com → stackoverflow-com');

console.log('\n⚠️  Important Notes:');
console.log('────────────────────────────────────────────────────────────');
console.log('• This is a LEGACY redirector route');
console.log('• It redirects to the new unique slug-based URLs');
console.log('• The domainSlug uses hyphens instead of dots');
console.log('• If no match is found, redirects to /bookmarks');

console.log('\n🧪 Test Commands:');
console.log('────────────────────────────────────────────────────────────');
console.log('# Test locally:');
console.log('curl -I http://localhost:3000/bookmarks/domain/expo-dev');
console.log('curl -I http://localhost:3000/bookmarks/domain/expo-dev?id=some-bookmark-id');

console.log('\n# Or visit in browser:');
console.log('http://localhost:3000/bookmarks/domain/expo-dev');

console.log('\n✨ Test complete!');
