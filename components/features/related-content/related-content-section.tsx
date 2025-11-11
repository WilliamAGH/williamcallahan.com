/**
 * RelatedContentSection Component
 *
 * Displays a section of related content items organized by type
 */

import { RelatedContentCard } from "./related-content-card";
import type { RelatedContentItem, RelatedContentType, RelatedContentSectionProps } from "@/types/related-content";

/**
 * Group items by type for better organization
 */
function groupItemsByType(items: RelatedContentItem[]): Record<RelatedContentType, RelatedContentItem[]> {
  const grouped = {} as Record<RelatedContentType, RelatedContentItem[]>;

  for (const item of items) {
    if (!grouped[item.type]) {
      grouped[item.type] = [];
    }
    grouped[item.type].push(item);
  }

  return grouped;
}

/**
 * Get a user-friendly label for content type
 */
function getTypeLabel(type: RelatedContentType): string {
  switch (type) {
    case "bookmark":
      return "Related Bookmarks";
    case "blog":
      return "Related Articles";
    case "investment":
      return "Related Investments";
    case "project":
      return "Related Projects";
    default:
      return "Related Content";
  }
}

export function RelatedContentSection({
  title,
  items,
  className = "",
  showScores = false,
}: RelatedContentSectionProps) {
  const grouped = groupItemsByType(items);
  const hasMultipleTypes = Object.keys(grouped).length > 1;

  if (items.length === 0) {
    return null;
  }

  return (
    <section className={`related-content-section ${className}`}>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{title}</h2>

      {hasMultipleTypes ? (
        // Show grouped by type
        <div className="space-y-8">
          {Object.entries(grouped).map(([type, typeItems]) => (
            <div key={type}>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">
                {getTypeLabel(type as RelatedContentType)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeItems.map(item => (
                  <RelatedContentCard key={`${item.type}-${item.id}`} item={item} showScore={showScores} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Show as single grid if all same type
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <RelatedContentCard key={`${item.type}-${item.id}`} item={item} showScore={showScores} />
          ))}
        </div>
      )}
    </section>
  );
}

export function RelatedContentFallback({
  title = "Similar Content",
  className = "",
  cardCount = 3,
}: {
  title?: string;
  className?: string;
  cardCount?: number;
}) {
  const skeletons = Array.from({ length: cardCount }, (_, index) => index);
  return (
    <section className={`related-content-section ${className}`} aria-live="polite" aria-busy="true" role="status">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skeletons.map(key => (
          <div
            key={key}
            className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 animate-pulse"
          >
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
