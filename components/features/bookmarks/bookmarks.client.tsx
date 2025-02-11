'use client';

import { useState } from 'react';
import { BookmarkCardClient } from './bookmark-card.client';
import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Bookmark } from '../../../types/bookmark';

interface BookmarksClientProps {
  bookmarks: Bookmark[];
}

export const BookmarksClient: React.FC<BookmarksClientProps> = ({ bookmarks }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBookmarks = bookmarks.filter(bookmark => {
    const searchTerms = searchQuery.toLowerCase().split(' ');
    const bookmarkText = `${bookmark.title} ${bookmark.description} ${bookmark.tags.join(' ')}`.toLowerCase();
    return searchTerms.every(term => bookmarkText.includes(term));
  });

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-base sm:text-lg md:text-xl font-mono ml-4 truncate min-w-0">~/bookmarks</h1>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-8">
            <input
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredBookmarks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">
                {searchQuery ? (
                  <>
                    No bookmarks found for &ldquo;{searchQuery}&rdquo;
                    <br />
                    Try adjusting your search terms
                  </>
                ) : (
                  "No bookmarks yet. Let&apos;s add some!"
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredBookmarks.map((bookmark) => (
                <BookmarkCardClient key={bookmark.url} {...bookmark} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
