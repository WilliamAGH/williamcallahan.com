/**
 * Bookmarks Server Component
 * @module components/features/bookmarks/bookmarks.server
 * @description
 * Server component that fetches bookmarks data and passes it to the client component.
 */
import "server-only"; // Ensure this component remains server-only

import { BookmarksClientWithWindow } from './bookmarks-client-with-window';
import type { UnifiedBookmark } from '@/types';
import { getBookmarks } from '@/lib/data-access/bookmarks';

interface BookmarksServerProps {
  title: string;
  description: string;
  bookmarks?: UnifiedBookmark[];
  showFilterBar?: boolean;
  titleSlug?: string;
}

export async function BookmarksServer({
  title,
  description,
  bookmarks: propsBookmarks,
  showFilterBar,
  titleSlug
}: BookmarksServerProps): Promise<JSX.Element> {
  // If bookmarks are provided via props, use those; otherwise fetch from API
  let bookmarks: UnifiedBookmark[] = [];

  // Helper function to sort bookmarks by date (newest first)
  const sortByDateDesc = (list: UnifiedBookmark[]) =>
    [...list].sort((a, b) => {
      const safeTs = (d?: string) => {
        const ts = d ? Date.parse(d) : NaN;
        return Number.isFinite(ts) ? ts : 0;
      };
      return safeTs(b.dateBookmarked) - safeTs(a.dateBookmarked);
    });

  if (propsBookmarks) {
    // Apply the same consistent sorting even when bookmarks are provided externally
    bookmarks = sortByDateDesc(propsBookmarks);
    console.log('[BookmarksServer] Using provided bookmarks, count:', bookmarks.length);
  } else {
    // Fetch bookmarks with error handling
    try {
      bookmarks = await getBookmarks(false);
      console.log('[BookmarksServer] Fetched via getBookmarks, count:', bookmarks.length);
      if (bookmarks.length > 0) {
        console.log('[BookmarksServer] First bookmark title:', bookmarks[0]?.title);
      } else {
        console.warn('[BookmarksServer] No bookmarks found via getBookmarks');
      }
    } catch (error) {
      console.error('[BookmarksServer] Error fetching bookmarks via getBookmarks:', error);
      // Continue with empty bookmarks array
    }

    // Sort bookmarks by date (newest first) if we have any
    bookmarks = bookmarks.length ? sortByDateDesc(bookmarks) : [];

    // If no bookmarks were fetched in production, trigger error to show boundary
    if (!propsBookmarks && bookmarks.length === 0 && process.env.NODE_ENV === 'production') {
      throw new Error('BookmarksUnavailable');
    }
  }

  // Pass the processed data to the client component
  return (
    <BookmarksClientWithWindow
      bookmarks={bookmarks}
      title={title}
      description={description}
      forceClientFetch={!propsBookmarks}
      showFilterBar={showFilterBar}
      titleSlug={titleSlug}
    />
  );
}
