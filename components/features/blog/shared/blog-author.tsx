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

interface BlogAuthorProps {
  author: Author;
}

export function BlogAuthor({ author }: BlogAuthorProps) {
  return (
    <Link href="/" className="flex items-center gap-4 mb-6 hover:opacity-80 transition-opacity">
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
    </Link>
  );
}
