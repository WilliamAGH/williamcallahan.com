'use client';

import Link from 'next/link';
import { Tag } from 'lucide-react';

/**
 * Props for the BlogTags component
 */
interface BlogTagsProps {
  /** Array of tag names to display */
  tags: string[];
}

/**
 * BlogTags Component
 *
 * Displays a list of tags for a blog post as clickable links.
 * Each tag is styled as a pill/badge with a tag icon.
 *
 * @param {BlogTagsProps} props - Component props
 * @param {string[]} props.tags - Array of tag names to display
 * @returns {JSX.Element} The rendered tags list
 */
export const BlogTags: React.FC<BlogTagsProps> = ({ tags }) => {
  return (
    <div className="flex flex-wrap gap-2 mb-8">
      {tags.map(tag => (
        <Link
          key={tag}
          href={`/blog/tags/${tag}`}
          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Tag className="w-3 h-3 mr-1" />
          {tag}
        </Link>
      ))}
    </div>
  );
}
