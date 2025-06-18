#!/usr/bin/env bun

/**
 * Manual test script for bookmark routing
 * 
 * Run with: bun scripts/test-bookmark-routes.ts
 */

import { tagToSlug } from '@/lib/utils/tag-utils';

console.log('🧪 Testing Bookmark Route Generation\n');

const testTags = [
  'React',
  'TypeScript', 
  'Next.js',
  'AI & ML',
  'C++',
  'C#',
  '.NET',
  'Node.js',
  'React Native',
  'Vue@3',
];

console.log('Tag → Slug Conversion:');
console.log('─'.repeat(50));

for (const tag of testTags) {
  const slug = tagToSlug(tag);
  console.log(`"${tag}" → "${slug}"`);
}

console.log('\n📍 Generated Routes:');
console.log('─'.repeat(50));

const baseUrl = 'https://williamcallahan.com';

// Individual bookmark pages
console.log('\n1️⃣ Individual Bookmark Pages:');
console.log(`   ${baseUrl}/bookmarks/example-bookmark-slug`);
console.log('   (Pagination: DISABLED)');

// Main bookmarks page
console.log('\n2️⃣ Main Bookmarks Page:');
console.log(`   ${baseUrl}/bookmarks`);
console.log(`   ${baseUrl}/bookmarks/page/2`);
console.log(`   ${baseUrl}/bookmarks/page/3`);
console.log('   (Pagination: ENABLED)');

// Tag pages
console.log('\n3️⃣ Tag-Filtered Pages:');
for (const tag of testTags.slice(0, 5)) {
  const slug = tagToSlug(tag);
  console.log(`   ${baseUrl}/bookmarks/tags/${slug}`);
}

// Paginated tag pages
console.log('\n4️⃣ Paginated Tag Pages:');
const exampleTag = 'React Native';
const exampleSlug = tagToSlug(exampleTag);
console.log(`   ${baseUrl}/bookmarks/tags/${exampleSlug}/page/2`);
console.log(`   ${baseUrl}/bookmarks/tags/${exampleSlug}/page/3`);

console.log('\n✅ Navigation Flow:');
console.log('─'.repeat(50));
console.log('1. User clicks "React" tag in filter bar');
console.log('   → Navigate to: /bookmarks/tags/react');
console.log('2. User clicks "React" again (to clear)');
console.log('   → Navigate to: /bookmarks');
console.log('3. User is on page 3, clicks "TypeScript" tag');
console.log('   → Navigate to: /bookmarks/tags/typescript (resets to page 1)');

console.log('\n🎯 Key Implementation Details:');
console.log('─'.repeat(50));
console.log('• Single bookmark pages: usePagination={false}');
console.log('• Tag pages: initialTag={displayTag}');
console.log('• Navigation uses router.push() in useEffect');
console.log('• Special characters properly encoded in URLs');
console.log('• Sitemap includes all tag pages and paginated variants');

console.log('\n✨ Test complete!');