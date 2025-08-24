/**
 * RelatedContentSection Component
 *
 * Displays a section of related content items organized by type
 */

import React from "react";
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
  const grouped = React.useMemo(() => groupItemsByType(items), [items]);
  const hasMultipleTypes = React.useMemo(() => Object.keys(grouped).length > 1, [grouped]);

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
