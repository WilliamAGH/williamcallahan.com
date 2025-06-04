/**
 * Bookmarks Server API
 *
 * Server-side only bookmark operations
 * Handles file system access and build-time operations
 *
 * @module lib/bookmarks.server
 */

import type { UnifiedBookmark } from '@/types';
import fs from 'node:fs';
import path from 'node:path';
import { fetchExternalBookmarksCached } from './bookmarks.client';

/**
 * Read bookmarks directly from the file system during build time
 * 
 * Used for static site generation to avoid API calls during build
 * This function should only be called server-side
 */
export async function getBookmarksForStaticBuild(): Promise<UnifiedBookmark[]> {
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  
  if (isBuildPhase) {
    try {
      const bookmarksPath = path.join(process.cwd(), 'data', 'bookmarks', 'bookmarks.json');
      const fileContents = fs.readFileSync(bookmarksPath, 'utf-8');
      const bookmarks = JSON.parse(fileContents) as UnifiedBookmark[];
      console.log(`[Static Build] Read ${bookmarks.length} bookmarks from file system`);
      return bookmarks;
    } catch (error) {
      console.error('[Static Build] Error reading bookmarks from file system:', error);
      return [];
    }
  }

  // Fall back to API for non-build environments
  return fetchExternalBookmarksCached();
} 