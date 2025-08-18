"use client";

import { usePagination } from "@/hooks/use-pagination";
import { PaginationControl } from "@/components/ui/pagination-control.client";
import { RelatedContentCard } from "./related-content-card.client";
import type { RelatedContentItem, RelatedContentWithPaginationProps } from "@/types/related-content";

export function RelatedContentWithPagination({ sourceType, sourceId, sourceSlug, limit = 10 }: RelatedContentWithPaginationProps) {
  // For bookmarks, use slug instead of ID to maintain idempotency
  const queryParams: Record<string, string> = { type: sourceType };
  if (sourceType === "bookmark" && sourceSlug) {
    queryParams.slug = sourceSlug;
  } else {
    queryParams.id = sourceId;
  }
  
  const { items, currentPage, totalPages, totalItems, isLoading, goToPage } = usePagination<RelatedContentItem>({
    apiUrl: "/api/related-content",
    limit,
    queryParams,
  });

  if (isLoading && !items.length) {
    return <div>Loading related content...</div>;
  }

  if (!items.length) {
    return <div>No related content found.</div>;
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <RelatedContentCard key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
      <div className="mt-6">
        <PaginationControl
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={limit}
          onPageChange={goToPage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
