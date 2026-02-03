"use client";

/**
 * Expandable Blog Tags Component
 *
 * Displays a list of tags with a "see more" button when tags overflow.
 * Can be used in both article and card views.
 */

import { kebabCase } from "@/lib/utils/formatters";
import { Tag, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { BlogTagsPropsExtended, TagWrapperProps } from "@/types/features";

function TagWrapper({ children, className, href, prefetch }: TagWrapperProps) {
  if (href) {
    return (
      <Link href={href} className={className} prefetch={prefetch}>
        {children}
      </Link>
    );
  }
  return <span className={className}>{children}</span>;
}

export function BlogTagsExpandable({ tags, interactive = false }: BlogTagsPropsExtended) {
  const [isExpanded, setIsExpanded] = useState(false);

  const baseTagClass = `
    inline-flex items-center px-3 py-1 rounded-full text-sm
    bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300
    transition-colors
  `;

  const interactiveClass = interactive
    ? "hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
    : "";

  // Simple approach: show first 5 tags, then allow expansion
  // But if there's only 1 extra tag (6 total), just show all 6 instead of a button
  const maxVisibleTags = 5;
  const hasMore = tags.length > maxVisibleTags + 1; // Only show button if 2+ tags are hidden
  const displayTags = isExpanded ? tags : hasMore ? tags.slice(0, maxVisibleTags) : tags;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {displayTags.map((tag) => (
          <TagWrapper
            key={tag}
            href={interactive ? `/blog/tags/${kebabCase(tag)}` : undefined}
            className={`${baseTagClass} ${interactiveClass}`}
            prefetch={interactive ? false : undefined}
          >
            <Tag className="w-3 h-3 mr-1" />
            {tag}
          </TagWrapper>
        ))}

        {/* See More/Less Button */}
        {hasMore && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={`
              inline-flex items-center px-3 py-1 rounded-full text-sm
              bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
              hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer
              transition-colors
            `}
            aria-label={isExpanded ? "Show less tags" : "Show more tags"}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                See less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />+{tags.length - maxVisibleTags} more
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
