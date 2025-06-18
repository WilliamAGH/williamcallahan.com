"use client";

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

interface PaginationControlProps {
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  disabled?: boolean;
  showFirstLast?: boolean;
  showPageInfo?: boolean;
  maxVisiblePages?: number;
  className?: string;
}

export const PaginationControl: React.FC<PaginationControlProps> = ({
  currentPage = 1,
  totalPages = 10,
  totalItems = 100,
  itemsPerPage = 10,
  onPageChange = () => {},
  isLoading = false,
  disabled = false,
  showFirstLast = true,
  showPageInfo = true,
  maxVisiblePages = 5,
  className = ''
}) => {
  const [internalCurrentPage, setInternalCurrentPage] = useState(currentPage);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setInternalCurrentPage(currentPage);
  }, [currentPage]);

  const handlePageChange = useCallback((page: number) => {
    if (page === internalCurrentPage || page < 1 || page > totalPages || disabled || isLoading) {
      return;
    }

    setIsTransitioning(true);
    setInternalCurrentPage(page);
    
    try {
      onPageChange(page);
    } catch (error) {
      console.error('Page navigation failed:', error);
      setInternalCurrentPage(currentPage);
    } finally {
      setTimeout(() => setIsTransitioning(false), 150);
    }
  }, [internalCurrentPage, totalPages, disabled, isLoading, onPageChange, currentPage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, page: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePageChange(page);
    } else if (event.key === 'ArrowLeft' && internalCurrentPage > 1) {
      event.preventDefault();
      handlePageChange(internalCurrentPage - 1);
    } else if (event.key === 'ArrowRight' && internalCurrentPage < totalPages) {
      event.preventDefault();
      handlePageChange(internalCurrentPage + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      handlePageChange(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      handlePageChange(totalPages);
    }
  }, [internalCurrentPage, totalPages, handlePageChange]);

  const getVisiblePages = useCallback(() => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, internalCurrentPage - half);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }, [totalPages, maxVisiblePages, internalCurrentPage]);

  const visiblePages = getVisiblePages();
  const startItem = (internalCurrentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(internalCurrentPage * itemsPerPage, totalItems);

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
          <button
            type="button"
            onClick={() => handlePageChange(1)}
            onKeyDown={(e) => handleKeyDown(e, 1)}
            disabled={internalCurrentPage === 1 || disabled || isLoading}
            className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                     hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 flex items-center justify-center"
            aria-label="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}

        {/* Previous Page Button */}
        <button
          type="button"
          onClick={() => handlePageChange(internalCurrentPage - 1)}
          onKeyDown={(e) => handleKeyDown(e, internalCurrentPage - 1)}
          disabled={internalCurrentPage === 1 || disabled || isLoading}
          className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                   bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                   hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 flex items-center justify-center"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1">
          {/* Show ellipsis if there are pages before visible range */}
          {visiblePages[0] > 1 && (
            <>
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                onKeyDown={(e) => handleKeyDown(e, 1)}
                disabled={disabled || isLoading}
                className="h-8 min-w-[2rem] px-2 rounded-md border border-gray-200 dark:border-gray-700 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                         transition-all duration-200"
                aria-label="Go to page 1"
              >
                1
              </button>
              {visiblePages[0] > 2 && (
                <span className="px-2 text-gray-500 dark:text-gray-400">...</span>
              )}
            </>
          )}

          {/* Visible page numbers */}
          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => handlePageChange(page)}
              onKeyDown={(e) => handleKeyDown(e, page)}
              disabled={disabled || isLoading}
              className={`h-8 min-w-[2rem] px-2 rounded-md border transition-all duration-200 ${
                page === internalCurrentPage
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              } ${isTransitioning && page === internalCurrentPage ? 'scale-95' : ''}`}
              aria-label={`Go to page ${page}`}
              aria-current={page === internalCurrentPage ? 'page' : undefined}
            >
              {isLoading && page === internalCurrentPage ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                page
              )}
            </button>
          ))}

          {/* Show ellipsis if there are pages after visible range */}
          {visiblePages[visiblePages.length - 1] < totalPages && (
            <>
              {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                <span className="px-2 text-gray-500 dark:text-gray-400">...</span>
              )}
              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                onKeyDown={(e) => handleKeyDown(e, totalPages)}
                disabled={disabled || isLoading}
                className="h-8 min-w-[2rem] px-2 rounded-md border border-gray-200 dark:border-gray-700 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                         transition-all duration-200"
                aria-label={`Go to page ${totalPages}`}
              >
                {totalPages}
              </button>
            </>
          )}
        </div>

        {/* Next Page Button */}
        <button
          type="button"
          onClick={() => handlePageChange(internalCurrentPage + 1)}
          onKeyDown={(e) => handleKeyDown(e, internalCurrentPage + 1)}
          disabled={internalCurrentPage === totalPages || disabled || isLoading}
          className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                   bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                   hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 flex items-center justify-center"
          aria-label="Go to next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last Page Button */}
        {showFirstLast && (
          <button
            type="button"
            onClick={() => handlePageChange(totalPages)}
            onKeyDown={(e) => handleKeyDown(e, totalPages)}
            disabled={internalCurrentPage === totalPages || disabled || isLoading}
            className="h-8 w-8 p-0 rounded-md border border-gray-200 dark:border-gray-700 
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                     hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 flex items-center justify-center"
            aria-label="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};