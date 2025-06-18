#!/usr/bin/env bun

/**
 * Test script for domain URL routing
 * 
 * Run with: bun scripts/test-domain-route.ts
 */

import { generateUniqueSlug, getDomainSlug, getDisplayDomain } from '@/lib/utils/domain-utils';

console.log('🧪 Testing Domain URL Routes\n');

// Test domains
const testUrls = [
  'https://expo.dev',
  'https://expo.dev/guides/getting-started',
  'https://docs.expo.dev/versions/latest/',
  'https://www.expo.dev',
  'expo.dev',
  'https://react.dev',
  'https://nextjs.org/docs',
  'https://vercel.com/dashboard',
  'https://github.com/facebook/react',
  'https://stackoverflow.com/questions/123456/some-question',
];

console.log('URL → Slug Generation:');
console.log('─'.repeat(60));

// Mock bookmarks array for uniqueness testing
const mockBookmarks = [
  { id: '1', url: 'https://expo.dev' },
  { id: '2', url: 'https://expo.dev/guides' },
  { id: '3', url: 'https://expo.dev/learn' },
];

for (const url of testUrls) {
  const domainSlug = getDomainSlug(url);
  const displayDomain = getDisplayDomain(url);
  const uniqueSlug = generateUniqueSlug(url, mockBookmarks, 'test-id');
  
  console.log(`\nURL: ${url}`);
  console.log(`  Domain Slug: ${domainSlug}`);
  console.log(`  Display Domain: ${displayDomain}`);
  console.log(`  Unique Slug: ${uniqueSlug}`);
}

console.log('\n📍 Expected Routes for expo.dev:');
console.log('─'.repeat(60));

const expoUrls = [
  { url: 'https://expo.dev', expectedSlug: 'expo-dev' },
  { url: 'https://expo.dev/guides/getting-started', expectedSlug: 'expo-dev-guides-getting-started' },
  { url: 'https://expo.dev/learn', expectedSlug: 'expo-dev-learn' },
];

const baseUrl = 'https://williamcallahan.com';

for (const { url, expectedSlug } of expoUrls) {
  console.log(`\n${url}`);
  console.log(`  → ${baseUrl}/bookmarks/${expectedSlug}`);
}

console.log('\n🔍 Testing with Duplicate Domains:');
console.log('─'.repeat(60));

// Simulate multiple bookmarks from same domain
const duplicateTest = [
  { id: '1', url: 'https://expo.dev' },
  { id: '2', url: 'https://expo.dev/guides' },
  { id: '3', url: 'https://expo.dev/learn' },
  { id: '4', url: 'https://expo.dev' }, // Duplicate!
];

for (const bookmark of duplicateTest) {
  const slug = generateUniqueSlug(bookmark.url, duplicateTest, bookmark.id);
  console.log(`${bookmark.url} → ${slug}`);
}

console.log('\n✅ Key Points:');
console.log('─'.repeat(60));
console.log('• Dots in domains are replaced with hyphens (expo.dev → expo-dev)');
console.log('• Paths are included in the slug (expo.dev/guides → expo-dev-guides)');
console.log('• Duplicate domains get numbered suffixes (expo-dev-2, expo-dev-3)');
console.log('• www prefix is stripped (www.expo.dev → expo-dev)');
console.log('• Special characters in paths are converted to hyphens');

console.log('\n🌐 How to Access a Specific Bookmark:');
console.log('─'.repeat(60));
console.log('1. Find the bookmark in /bookmarks page');
console.log('2. Click on it to navigate to its unique URL');
console.log('3. The URL will be like: /bookmarks/expo-dev-guides-getting-started');
console.log('\n✨ Test complete!');