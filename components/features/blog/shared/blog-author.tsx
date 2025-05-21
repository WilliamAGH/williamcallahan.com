/**
 * Blog Author Component
 *
 * Displays author information with avatar and optional bio.
 * Links to the homepage when clicked.
 *
 * @component
 * @param {Object} props
 * @param {Author} props.author - Author information including name, avatar, and bio
 */

import Image from 'next/image';
import Link from 'next/link';
import type { Author } from 'types/blog';
import { useState, useEffect } from 'react';

interface BlogAuthorProps {
  author: Author;
}

export function BlogAuthor({ author }: BlogAuthorProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <Link
      href="/"
      className="flex items-center gap-4 mb-6 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/10 dark:to-indigo-950/10 border border-blue-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all shadow-sm hover:shadow-md"
    >
      {author.avatar && isMounted && (
        <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-blue-200 dark:ring-blue-900/50 shadow-inner">
          <Image
            src={author.avatar}
            alt={author.name}
            fill
            sizes="56px"
            className="rounded-full object-cover"
            priority
          />
        </div>
      )}
      {!isMounted && author.avatar && (
        <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-blue-200 dark:ring-blue-900/50 shadow-inner bg-gray-200 dark:bg-gray-700">
          {/* You can put a placeholder SVG or leave it blank */}
        </div>
      )}
      <div>
        <div className="font-semibold text-gray-900 dark:text-white text-lg">{author.name}</div>
        {author.bio && (
          <p className="text-sm text-gray-700 dark:text-gray-400 mt-1">
            {author.bio}
          </p>
        )}
      </div>
    </Link>
  );
}
