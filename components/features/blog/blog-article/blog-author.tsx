import Image from 'next/image';
import type { Author } from '@/types/blog';

interface BlogAuthorProps {
  author: Author;
}

export function BlogAuthor({ author }: BlogAuthorProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      {author.avatar && (
        <Image
          src={author.avatar}
          alt={author.name}
          width={48}
          height={48}
          className="rounded-full"
        />
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