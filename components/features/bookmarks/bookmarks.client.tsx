
/**
 * Bookmarks Client Component
 *
 * Displays a list of bookmarks with search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks.client
 */
'use client';

import { useState } from 'react';
import { BookmarkCardClient } from './bookmark-card.client';
import { Search } from 'lucide-react';
import type { UnifiedBookmark, BookmarkTag } from '@/types';

interface BookmarksClientProps {
  bookmarks: UnifiedBookmark[];
}

// Helper function to get tags as a string array for filtering
const getTagsAsStringArray = (tags: UnifiedBookmark['tags']): string[] => {
  if (tags.every(tag => typeof tag === 'string')) {
    return tags as string[];
  }
  if (tags.every(tag => typeof tag === 'object' && tag !== null && 'name' in tag)) {
    return (tags as BookmarkTag[]).map(tag => tag.name);
  }
  return [];
};

export const BookmarksClient: React.FC<BookmarksClientProps> = ({ bookmarks }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Format tag for display: Title Case unless mixed-case proper nouns
  const formatTagDisplay = (tag: string): string => {
    // Preserve if mixed-case beyond first char (e.g. iPhone, aVenture)
    if (/[A-Z]/.test(tag.slice(1))) {
      return tag;
    }
    // Otherwise convert to title case
    return tag
      .split(/[\s-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Extract all unique tags from bookmarks
  const allTags = bookmarks.flatMap(bookmark => {
    return getTagsAsStringArray(bookmark.tags);
  }).filter((tag, index, self) => tag && self.indexOf(tag) === index).sort();

  const filteredBookmarks = bookmarks.filter(bookmark => {
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

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search and filtering */}
      <div className="mb-8 space-y-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search bookmarks by title, description, URL, author..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="block w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        {/* Tags filter */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Filter by:</span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedTag === tag
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {formatTagDisplay(tag)}
              </button>
            ))}
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="mb-6">
        <p className="text-gray-500 dark:text-gray-400">
          {filteredBookmarks.length === 0
            ? 'No bookmarks found'
            : `Showing ${filteredBookmarks.length} bookmark${filteredBookmarks.length === 1 ? '' : 's'}`}
          {searchQuery && ` for "${searchQuery}"`}
          {selectedTag && ` tagged with "${selectedTag}"`}
        </p>
      </div>

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
    </div>
  );
};
