"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { InfiniteScrollSentinelProps } from "@/types/ui/async";

export const InfiniteScrollSentinel: React.FC<InfiniteScrollSentinelProps> = ({
  onIntersect,
  loading = false,
  hasMore = true,
  threshold = 0.1,
  rootMargin = "100px",
  children,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      entries => {
        const firstEntry = entries[0];
        if (firstEntry?.isIntersecting) {
          onIntersect();
        }
      },
      {
        root: null,
        rootMargin,
        threshold,
      },
    );

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [onIntersect, loading, hasMore, threshold, rootMargin]);

  return (
    <div ref={sentinelRef} className="flex justify-center items-center py-8">
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading more bookmarks...</span>
        </div>
      ) : hasMore ? (
        children || <div className="h-1" />
      ) : (
        <div className="text-gray-500 text-sm">No more bookmarks to load</div>
      )}
    </div>
  );
};
