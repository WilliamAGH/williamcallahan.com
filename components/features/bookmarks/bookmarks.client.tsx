
/**
 * Bookmarks Client Component
 *
 * Displays a list of bookmarks with search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks.client
 */
'use client';

import { BookmarksWithOptions } from './bookmarks-with-options.client';
import type { UnifiedBookmark } from '@/types';

interface BookmarksClientProps {
  bookmarks: UnifiedBookmark[];
}

export const BookmarksClient: React.FC<BookmarksClientProps> = ({ bookmarks }) => {
  // Debug log to check if bookmarks are passed correctly to client component
  console.log('BookmarksClient receiving bookmarks:', bookmarks?.length || 0);
  
  // Use our configurable component with default settings
  return <BookmarksWithOptions 
    bookmarks={bookmarks} 
    showFilterBar={true} 
    // TEMPORARY: Disable searchAllBookmarks to isolate the issue
    searchAllBookmarks={false} 
  />;
};
