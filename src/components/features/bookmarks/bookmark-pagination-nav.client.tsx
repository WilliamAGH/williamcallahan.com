/**
 * Bookmark Pagination Navigation
 *
 * Renders either URL-based or callback-based pagination controls
 * depending on whether the client is browser-mounted.
 *
 * @module components/features/bookmarks/bookmark-pagination-nav.client
 */

"use client";

import { PaginationControl } from "@/components/ui/pagination-control.client";
import { PaginationControlUrl } from "@/components/ui/pagination-control-url.client";
import React from "react";

export const BookmarkPaginationNav: React.FC<{
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  isLoading: boolean;
  baseUrl: string;
  useUrlPagination: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  isLoading,
  baseUrl,
  useUrlPagination,
  onPageChange,
  className,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex justify-end ${className ?? ""}`}>
      {useUrlPagination ? (
        <PaginationControlUrl
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          isLoading={isLoading}
          baseUrl={baseUrl}
        />
      ) : (
        <PaginationControl
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
          isLoading={isLoading}
          showPageInfo={false}
        />
      )}
    </div>
  );
};
