
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
  forceClientFetch?: boolean;
  showFilterBar?: boolean;
}

export const BookmarksClient: React.FC<BookmarksClientProps> = ({ 
  bookmarks, 
  forceClientFetch = false,
  showFilterBar = true
}) => {
  // Debug log to check if bookmarks are passed correctly to client component
  if (process.env.NODE_ENV === 'development') {
    console.log('BookmarksClient receiving bookmarks:', bookmarks?.length || 0, 'forceClientFetch:', forceClientFetch);
  }
  
  // Force client-side indicators in development
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (process.env.NODE_ENV === 'development') {
    console.log('BookmarksClient running in development mode:', isDevelopment);
  }
  
  // Use our configurable component with passed settings
  return <BookmarksWithOptions 
    bookmarks={bookmarks} 
    showFilterBar={showFilterBar} 
    // If forcing client fetch, bypass the passed bookmarks
    searchAllBookmarks={forceClientFetch} 
  />;
};
