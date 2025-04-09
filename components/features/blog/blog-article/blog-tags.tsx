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
      {tags.map((tag, index) => {
        // Apply varying gradient backgrounds based on index
        const gradients = [
          'from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-blue-100 dark:border-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800/30 text-blue-700 dark:text-blue-400',
          'from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-green-100 dark:border-green-900/20 hover:border-green-200 dark:hover:border-green-800/30 text-green-700 dark:text-green-400',
          'from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10 border-amber-100 dark:border-amber-900/20 hover:border-amber-200 dark:hover:border-amber-800/30 text-amber-700 dark:text-amber-400',
          'from-purple-50 to-violet-50 dark:from-purple-900/10 dark:to-violet-900/10 border-purple-100 dark:border-purple-900/20 hover:border-purple-200 dark:hover:border-purple-800/30 text-purple-700 dark:text-purple-400',
          'from-rose-50 to-pink-50 dark:from-rose-900/10 dark:to-pink-900/10 border-rose-100 dark:border-rose-900/20 hover:border-rose-200 dark:hover:border-rose-800/30 text-rose-700 dark:text-rose-400',
        ];
        const gradient = gradients[index % gradients.length];

        // Get icon color based on gradient type
        const iconColor = gradient.includes('blue') ? 'text-blue-500 dark:text-blue-400' :
                          gradient.includes('green') ? 'text-green-500 dark:text-green-400' :
                          gradient.includes('amber') ? 'text-amber-500 dark:text-amber-400' :
                          gradient.includes('purple') ? 'text-purple-500 dark:text-purple-400' :
                          'text-rose-500 dark:text-rose-400';

        return (
          <Link
            key={tag}
            href={`/blog/tags/${tag}`}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-gradient-to-r ${gradient} shadow-sm hover:shadow transition-all border`}
          >
            <Tag className={`w-3 h-3 mr-1.5 ${iconColor}`} />
            {tag}
          </Link>
        );
      })}
    </div>
  );
}
