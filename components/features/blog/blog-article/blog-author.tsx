'use client';

import Image from 'next/image';
import type { Author } from '../../../../types/blog';

/**
 * Props for the BlogAuthor component
 */
interface BlogAuthorProps {
  /** The author information to display */
  author: Author;
}

/**
 * BlogAuthor Component
 *
 * Displays author information for a blog post, including:
 * - Author's avatar (if available)
 * - Author's name
 * - Author's bio (if available)
 *
 * @param {BlogAuthorProps} props - Component props
 * @param {Author} props.author - The author information to display
 * @returns {JSX.Element} The rendered author information
 */
export const BlogAuthor: React.FC<BlogAuthorProps> = ({ author }) => {
  return (
    <div className="flex items-center gap-4 mb-6">
      {author.avatar && (
        <div className="relative w-12 h-12">
          <Image
            src={author.avatar}
            alt={author.name}
            fill
            sizes="48px"
            className="rounded-full object-cover"
          />
        </div>
      )}
      <div>
        <div className="font-medium">{author.name}</div>
        {author.bio && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {author.bio}
          </p>
        )}
      </div>
    </div>
  );
}
