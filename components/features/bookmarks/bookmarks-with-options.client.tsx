/**
 * Bookmarks Client Component with Optional Features
 *
 * Displays a list of bookmarks with configurable search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks-with-options.client
 */
'use client';

import React, { useState, useEffect } from 'react';
import { BookmarkCardClient } from './bookmark-card.client';
import { Search, ArrowRight } from 'lucide-react';
import type { UnifiedBookmark, BookmarkTag } from '@/types';
import { fetchExternalBookmarks } from '@/lib/bookmarks.client';
import { TagsList } from './tags-list.client';
import { normalizeTagsToStrings } from '@/lib/utils/tag-utils';

interface BookmarksWithOptionsProps {
  bookmarks: UnifiedBookmark[];
  showFilterBar?: boolean;
  searchAllBookmarks?: boolean;
}

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === 'development';

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark['tags']): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithOptions: React.FC<BookmarksWithOptionsProps> = ({
  bookmarks,
  showFilterBar = true,
  searchAllBookmarks = false
}) => {
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  // Tag expansion is now handled in the TagsList component
  const [allBookmarks, setAllBookmarks] = useState<UnifiedBookmark[]>(bookmarks);
  const [isSearching, setIsSearching] = useState(false);
  const [dataSource, setDataSource] = useState<'server' | 'client'>('server');

  // Set mounted state once after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Separate effect for fetching bookmarks
  useEffect(() => {
    if (searchAllBookmarks && mounted) {
      (async () => {
        try {
          console.log('Client-side: Attempting to fetch bookmarks from API');
          // Add a random query parameter to bust cache
          const timestamp = new Date().getTime();
          const response = await fetch(`/api/bookmarks?t=${timestamp}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            cache: 'no-store',
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const allBookmarksData = await response.json();
          console.log('Client-side direct fetch bookmarks count:', allBookmarksData.length);
          
          if (Array.isArray(allBookmarksData) && allBookmarksData.length > 0) {
            setAllBookmarks(allBookmarksData);
            setDataSource('client');
          } else {
            console.error('Client-side: API returned empty or invalid data');
            // Fallback to provided bookmarks 
            setAllBookmarks(bookmarks);
          }
        } catch (error) {
          console.error('Failed to load all bookmarks:', error);
          // Fallback to provided bookmarks
          console.log('Client-side: Falling back to provided bookmarks. Count:', bookmarks.length);
          setAllBookmarks(bookmarks);
        }
      })();
    } else {
      console.log('Client-side: Using provided bookmarks directly. Count:', bookmarks.length);
    }
  }, [searchAllBookmarks, bookmarks, mounted]);

  // Tag formatting is now handled in the TagsList component

  // Extract all unique tags from all available bookmarks
  const allTags = (searchAllBookmarks ? allBookmarks : bookmarks).flatMap(bookmark => {
    return getTagsAsStringArray(bookmark.tags);
  }).filter((tag, index, self) => tag && self.indexOf(tag) === index).sort();

  // Determine which set of bookmarks to filter
  const bookmarksToFilter = searchAllBookmarks && searchQuery ? allBookmarks : bookmarks;

  const filteredBookmarks = bookmarksToFilter.filter(bookmark => {
    const tagsAsString = getTagsAsStringArray(bookmark.tags);

    // Filter by selected tag if any
    if (selectedTag && !tagsAsString.includes(selectedTag)) {
      return false;
    }

    // If no search query, just return tag-filtered results
    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.length > 0);
    if (searchTerms.length === 0) return true;

    // Combine relevant text fields for searching
    const bookmarkText = [
      bookmark.title,
      bookmark.description,
      tagsAsString.join(' '),
      bookmark.url,
      bookmark.content?.author,
      bookmark.content?.publisher,
    ].filter(Boolean).join(' ').toLowerCase();

    // Check if all search terms are included in the bookmark text
    return searchTerms.every(term => bookmarkText.includes(term));
  });

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setIsSearching(true);
    // The search happens automatically as the query is typed
  };

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search and filtering */}
      <div className="mb-8 space-y-6">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          {mounted ? (
            <>
              <input
                type="text"
                placeholder="Search bookmarks by title, description, URL, author..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="block w-full pl-10 pr-12 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              <button
                type="submit"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Submit search"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </>
          ) : (
            <div
              className="block w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 h-12"
              suppressHydrationWarning
            />
          )}
        </form>

        {/* Tags filter - only show if showFilterBar is true */}
        {showFilterBar && allTags.length > 0 && (
          <TagsList
            tags={allTags}
            selectedTag={selectedTag}
            onTagSelect={handleTagClick}
          />
        )}
      </div>

      {/* Results count */}
      <div className="mb-6">
        {mounted ? (
          <div>
            <p className="text-gray-500 dark:text-gray-400">
              {filteredBookmarks.length === 0
                ? 'No bookmarks found'
                : `Showing ${filteredBookmarks.length} bookmark${filteredBookmarks.length === 1 ? '' : 's'}`}
              {searchQuery && ` for "${searchQuery}"`}
              {selectedTag && ` tagged with "${selectedTag}"`}
              {searchQuery && searchAllBookmarks && ' across all bookmarks'}
            </p>
            
            {/* Debug indicator for development mode only */}
            {isDevelopment && (
              <div className="mt-2 text-xs inline-flex items-center">
                <span className={`px-2 py-1 rounded-lg font-mono ${
                  dataSource === 'server' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  Data source: {dataSource === 'server' ? 'Server-side' : 'Client-side API'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" suppressHydrationWarning />
        )}
      </div>

      {/* Client-side only rendering of bookmark results */}
      {mounted ? (
        <>
          {filteredBookmarks.length === 0 && searchQuery ? (
            <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
                No bookmarks found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Try adjusting your search terms or filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
              {filteredBookmarks.map((bookmark) => (
                <BookmarkCardClient key={bookmark.id} {...bookmark} />
              ))}
            </div>
          )}
        </>
      ) : (
        /* Server-side placeholder with hydration suppression */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {bookmarks.slice(0, 6).map((bookmark) => (
            <div
              key={bookmark.id}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg h-96"
              suppressHydrationWarning
            />
          ))}
        </div>
      )}
    </div>
  );
};