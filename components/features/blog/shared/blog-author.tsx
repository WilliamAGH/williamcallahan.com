/**
 * Blog Author Component
 *
 * Displays author information with avatar and optional bio.
 *
 * @component
 * @param {Object} props
 * @param {Author} props.author - Author information including name, avatar, and bio
 */

import Image from 'next/image';
import type { Author } from '@/types/blog';

interface BlogAuthorProps {
  author: Author;
}

export function BlogAuthor({ author }: BlogAuthorProps) {
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
