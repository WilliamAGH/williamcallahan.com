/**
 * Bookmarks Server Component
 * @module components/features/bookmarks/bookmarks.server
 * @description
 * Server component that fetches bookmarks data and passes it to the client component.
 */
import "server-only"; // Ensure this component remains server-only

import { BookmarksClientWithWindow } from './bookmarks-client-with-window';
import type { UnifiedBookmark } from '@/types';
import { fetchExternalBookmarks } from '@/lib/bookmarks';

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
  
  if (propsBookmarks) {
    bookmarks = propsBookmarks;
    console.log('Using provided bookmarks, count:', bookmarks.length);
  } else {
    // Fetch bookmarks with error handling
    try {
      bookmarks = await fetchExternalBookmarks();
      console.log('Server-side bookmarks count:', bookmarks.length);
      if (bookmarks.length > 0) {
        console.log('First bookmark title:', bookmarks[0]?.title);
      } else {
        console.warn('No bookmarks found in server-side rendering');
      }
    } catch (error) {
      console.error('Error fetching bookmarks in server-side rendering:', error);
      // Continue with empty bookmarks array
    }

    // Sort bookmarks by date (newest first) if we have any
    bookmarks = bookmarks.length ? 
      [...bookmarks].sort((a, b) => {
        const toTs = (d?: string) => {
          const ts = d ? Date.parse(d) : NaN;
          return Number.isFinite(ts) ? ts : 0;
        };
        const dateA = toTs(a.dateBookmarked);
        const dateB = toTs(b.dateBookmarked);
        return dateB - dateA;
      }) : [];
  }

  // Pass the processed data to the client component
  return (
    <BookmarksClientWithWindow 
      bookmarks={bookmarks} 
      title={title}
      description={description}
      forceClientFetch={!propsBookmarks} // Only force client fetch if we didn't get bookmarks from props
      showFilterBar={showFilterBar}
      titleSlug={titleSlug}
    />
  );
}