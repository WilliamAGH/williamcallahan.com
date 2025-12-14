"use client";

import type React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import type { PaginationControlUrlProps } from "@/types";

const LinkButton = ({
  page,
  children,
  className: btnClassName,
  ariaLabel,
  getPageUrl,
  disabled,
  isLoading,
  currentPage,
  totalPages,
}: {
  page: number;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  getPageUrl: (page: number) => string;
  disabled: boolean;
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
}) => {
  const isDisabled = disabled || isLoading || page < 1 || page > totalPages || page === currentPage;

  if (isDisabled) {
    return (
      <button
        type="button"
        disabled
        className={`${btnClassName} disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return (
    <Link href={getPageUrl(page)} className={btnClassName} aria-label={ariaLabel} prefetch={false}>
      {children}
    </Link>
  );
};

export const PaginationControlUrl: React.FC<PaginationControlUrlProps> = ({
  currentPage = 1,
  totalPages = 10,
  totalItems = 100,
  itemsPerPage = 10,
  isLoading = false,
  disabled = false,
  showFirstLast = true,
  showPageInfo = true,
  maxVisiblePages = 5,
  className = "",
  baseUrl = "/bookmarks",
}) => {
  const searchParams = useSearchParams();

  const getPageUrl = (page: number) => {
    // Preserve query parameters
    const params = new URLSearchParams(searchParams);

    // For page 1, use the base URL without page number
    if (page === 1) {
      return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    }

    // For other pages, append the page number with /page/ prefix
    return params.toString() ? `${baseUrl}/page/${page}?${params.toString()}` : `${baseUrl}/page/${page}`;
  };

  const getVisiblePages = () => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1 && !isLoading) {
    return null;
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {/* Page Info */}
      {showPageInfo && (
        <div className="text-sm text-gray-500 dark:text-gray-400 order-2 sm:order-1">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : totalItems > 0 ? (
            <span>
              Showing {startItem}-{endItem} of {totalItems} bookmarks
            </span>
          ) : (
            <span>No bookmarks found</span>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center gap-1 order-1 sm:order-2">
        {/* First Page Button */}
        {showFirstLast && (
          <LinkButton
            page={1}
            getPageUrl={getPageUrl}
            disabled={disabled}
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                     hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                     transition-all duration-200 flex items-center justify-center"
            ariaLabel="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </LinkButton>
        )}

        {/* Previous Page Button */}
        <LinkButton
          page={currentPage - 1}
          getPageUrl={getPageUrl}
          disabled={disabled}
          isLoading={isLoading}
          currentPage={currentPage}
          totalPages={totalPages}
          className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                   bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                   hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                   transition-all duration-200 flex items-center justify-center"
          ariaLabel="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </LinkButton>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1">
          {/* Show ellipsis if there are pages before visible range */}
          {visiblePages && visiblePages.length > 0 && visiblePages[0] && visiblePages[0] > 1 && (
            <>
              <LinkButton
                page={1}
                getPageUrl={getPageUrl}
                disabled={disabled}
                isLoading={isLoading}
                currentPage={currentPage}
                totalPages={totalPages}
                className="h-8 min-w-[2rem] px-2 rounded-md border border-gray-200 dark:border-gray-700 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                         transition-all duration-200 inline-flex items-center justify-center"
                ariaLabel="Go to page 1"
              >
                1
              </LinkButton>
              {visiblePages[0] > 2 && <span className="px-2 text-gray-500 dark:text-gray-400">...</span>}
            </>
          )}

          {/* Visible page numbers */}
          {visiblePages?.map(page =>
            page === currentPage ? (
              <button
                key={page}
                type="button"
                disabled
                className="h-8 min-w-[2rem] px-2 rounded-md border transition-all duration-200 
                         bg-blue-600 text-white border-blue-600 shadow-sm cursor-default"
                aria-label={`Current page ${page}`}
                aria-current="page"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : page}
              </button>
            ) : (
              <LinkButton
                key={page}
                page={page}
                getPageUrl={getPageUrl}
                disabled={disabled}
                isLoading={isLoading}
                currentPage={currentPage}
                totalPages={totalPages}
                className="h-8 min-w-[2rem] px-2 rounded-md border transition-all duration-200 
                         border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white
                         inline-flex items-center justify-center"
                ariaLabel={`Go to page ${page}`}
              >
                {page}
              </LinkButton>
            ),
          )}

          {/* Show ellipsis if there are pages after visible range */}
          {(() => {
            const lastVisiblePage =
              visiblePages && visiblePages.length > 0 ? visiblePages[visiblePages.length - 1] : undefined;
            return (
              lastVisiblePage &&
              lastVisiblePage < totalPages && (
                <>
                  {lastVisiblePage < totalPages - 1 && (
                    <span className="px-2 text-gray-500 dark:text-gray-400">...</span>
                  )}
                  <LinkButton
                    page={totalPages}
                    getPageUrl={getPageUrl}
                    disabled={disabled}
                    isLoading={isLoading}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    className="h-8 min-w-[2rem] px-2 rounded-md border border-gray-200 dark:border-gray-700 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                         transition-all duration-200 inline-flex items-center justify-center"
                    ariaLabel={`Go to page ${totalPages}`}
                  >
                    {totalPages}
                  </LinkButton>
                </>
              )
            );
          })()}
        </div>

        {/* Next Page Button */}
        <LinkButton
          page={currentPage + 1}
          getPageUrl={getPageUrl}
          disabled={disabled}
          isLoading={isLoading}
          currentPage={currentPage}
          totalPages={totalPages}
          className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                   bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                   hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                   transition-all duration-200 flex items-center justify-center"
          ariaLabel="Go to next page"
        >
          <ChevronRight className="h-4 w-4" />
        </LinkButton>

        {/* Last Page Button */}
        {showFirstLast && (
          <LinkButton
            page={totalPages}
            getPageUrl={getPageUrl}
            disabled={disabled}
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                     hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                     transition-all duration-200 flex items-center justify-center"
            ariaLabel="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </LinkButton>
        )}
      </div>
    </div>
  );
};
