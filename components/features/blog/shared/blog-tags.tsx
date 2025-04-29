/**
 * Blog Tags Component
 *
 * Displays a list of tags with consistent styling.
 * Can be used in both article and card views.
 */

import Link from 'next/link';
import { Tag } from 'lucide-react';
import { kebabCase } from '@/lib/utils/formatters';

interface BlogTagsProps {
  tags: string[];
  interactive?: boolean;
}

interface TagWrapperProps {
  children: React.ReactNode;
  className: string;
  href?: string;
}

function TagWrapper({ children, className, href }: TagWrapperProps) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return <span className={className}>{children}</span>;
}

export function BlogTags({ tags, interactive = false }: BlogTagsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tags.map(tag => (
        <TagWrapper
          key={tag}
          href={interactive ? `/blog/tags/${kebabCase(tag)}` : undefined}
          className={`
            inline-flex items-center px-3 py-1 rounded-full text-sm
            bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
            ${interactive ? 'hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer' : ''}
            transition-colors
          `}
        >
          <Tag className="w-3 h-3 mr-1" />
          {tag}
        </TagWrapper>
      ))}
    </div>
  );
}