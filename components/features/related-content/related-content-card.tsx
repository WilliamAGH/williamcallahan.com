/**
 * RelatedContentCard Component
 * 
 * Unified card component for displaying different types of related content
 */

import Link from "next/link";
import Image from "next/image";
import type { RelatedContentCardProps } from "@/types/related-content";

/**
 * Get icon for content type
 */
function getTypeIcon(type: string): string {
  switch (type) {
    case "bookmark":
      return "🔖";
    case "blog":
      return "📝";
    case "investment":
      return "💼";
    case "project":
      return "🚀";
    default:
      return "📄";
  }
}

/**
 * Format date for display
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

export function RelatedContentCard({
  item,
  className = "",
  showScore = false,
}: RelatedContentCardProps) {
  const { type, title, description, url, metadata } = item;
  
  // Build tag display (max 3 tags)
  const displayTags = metadata.tags?.slice(0, 3) || [];
  
  return (
    <Link
      href={url}
      className={`
        related-content-card block p-4 rounded-lg border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow duration-200
        hover:border-blue-500 dark:hover:border-blue-400 ${className}
      `}
    >
      <article className="h-full flex flex-col">
        {/* Header with type icon and metadata */}
        <header className="flex items-start justify-between mb-2">
          <span className="text-2xl" role="img" aria-label={type}>
            {getTypeIcon(type)}
          </span>
          <div className="flex flex-col items-end text-xs text-gray-500 dark:text-gray-400">
            {metadata.date && (
              <time dateTime={metadata.date}>{formatDate(metadata.date)}</time>
            )}
            {showScore && (
              <span className="mt-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                {Math.round(item.score * 100)}% match
              </span>
            )}
          </div>
        </header>
        
        {/* Image if available */}
        {metadata.imageUrl && (
          <div className="relative w-full h-32 mb-3 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
            <Image
              src={metadata.imageUrl}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        )}
        
        {/* Title */}
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
          {title}
        </h3>
        
        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 flex-grow line-clamp-3">
          {truncateText(description)}
        </p>
        
        {/* Footer with tags and metadata */}
        <footer className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* Tags */}
          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                >
                  {tag}
                </span>
              ))}
              {metadata.tags && metadata.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500">
                  +{metadata.tags.length - 3} more
                </span>
              )}
            </div>
          )}
          
          {/* Type-specific metadata */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            {/* Domain for bookmarks */}
            {type === "bookmark" && metadata.domain && (
              <span className="truncate">{metadata.domain}</span>
            )}
            
            {/* Author for blog posts */}
            {type === "blog" && metadata.author && (
              <span className="flex items-center gap-1">
                {metadata.author.avatar && (
                  <Image
                    src={metadata.author.avatar}
                    alt={metadata.author.name}
                    width={16}
                    height={16}
                    className="rounded-full"
                  />
                )}
                <span>{metadata.author.name}</span>
              </span>
            )}
            
            {/* Reading time for blog posts */}
            {type === "blog" && metadata.readingTime && (
              <span>{metadata.readingTime} min read</span>
            )}
            
            {/* Stage for investments */}
            {type === "investment" && metadata.stage && (
              <span>{metadata.stage}</span>
            )}
            
            {/* Category for investments and projects */}
            {(type === "investment" || type === "project") && metadata.category && (
              <span>{metadata.category}</span>
            )}
          </div>
        </footer>
      </article>
    </Link>
  );
}