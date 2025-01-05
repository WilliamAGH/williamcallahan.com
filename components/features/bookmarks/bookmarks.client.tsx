'use client';

import { useState } from 'react';
import { BookmarkCardClient } from './bookmark-card.client';
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
    <div className="max-w-4xl mx-auto px-4">
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
  );
};
