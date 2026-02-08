/**
 * Bookmark Refresh Hook
 *
 * Shared refresh logic for bookmark list components. Handles local refresh
 * via the /api/bookmarks/refresh endpoint and cross-environment production
 * refresh via /api/bookmarks/refresh-production.
 *
 * @module hooks/use-bookmark-refresh
 */

"use client";

import { getErrorMessage, type BookmarkRefreshActions, type BookmarkRefreshState } from "@/types";
import { bookmarkRefreshResponseSchema } from "@/types/schemas/bookmark";
import { useCallback, useState } from "react";

/** Abort timeout for refresh requests */
const REFRESH_TIMEOUT_MS = 15_000;
/** Duration to show error messages before auto-clearing */
const ERROR_DISPLAY_MS = 5_000;

export function useBookmarkRefresh(params: {
  showRefreshButton: boolean;
  onRefreshSuccess?: () => void | Promise<void>;
}): BookmarkRefreshState & BookmarkRefreshActions {
  const { showRefreshButton, onRefreshSuccess } = params;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [showCrossEnvRefresh, setShowCrossEnvRefresh] = useState(false);
  const [isRefreshingProduction, setIsRefreshingProduction] = useState(false);

  const clearErrorAfterDelay = useCallback(() => {
    setTimeout(() => setRefreshError(null), ERROR_DISPLAY_MS);
  }, []);

  const refreshBookmarks = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort();
    }, REFRESH_TIMEOUT_MS);

    try {
      const response = await fetch("/api/bookmarks/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parsedResult = bookmarkRefreshResponseSchema.safeParse(await response.json());
      if (!parsedResult.success) {
        throw new Error("Invalid refresh response payload");
      }
      if (parsedResult.data.status === "success") {
        setLastRefreshed(new Date());
        if (showRefreshButton && !isRefreshingProduction) {
          setShowCrossEnvRefresh(true);
        }
        await onRefreshSuccess?.();
      } else {
        const errorMessage =
          parsedResult.data.error ?? parsedResult.data.message ?? "Failed to refresh bookmarks";
        throw new Error(errorMessage);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setRefreshError("Request timed out. Please try again.");
        } else {
          console.error("Error refreshing bookmarks:", err);
          setRefreshError(err.message || "Failed to refresh bookmarks");
        }
        clearErrorAfterDelay();
      } else {
        console.error("An unknown error occurred during refresh:", err);
        setRefreshError("An unexpected error occurred.");
        clearErrorAfterDelay();
      }
    } finally {
      setIsRefreshing(false);
      clearTimeout(timeoutId);
    }
  }, [showRefreshButton, isRefreshingProduction, onRefreshSuccess, clearErrorAfterDelay]);

  const handleProductionRefresh = useCallback(async () => {
    setIsRefreshingProduction(true);
    setShowCrossEnvRefresh(false);

    try {
      const response = await fetch("/api/bookmarks/refresh-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        let errorData: unknown = null;
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error(
            "[Bookmarks] Failed to parse production refresh error payload:",
            parseError,
          );
        }
        const errorMessage = getErrorMessage(errorData) || response.statusText;
        throw new Error(`Production refresh failed: ${errorMessage}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to trigger production refresh";
      console.error("[Bookmarks] Production refresh failed:", error);
      setRefreshError(message);
      clearErrorAfterDelay();
    } finally {
      setIsRefreshingProduction(false);
    }
  }, [clearErrorAfterDelay]);

  const dismissCrossEnvRefresh = useCallback(() => {
    setShowCrossEnvRefresh(false);
  }, []);

  return {
    isRefreshing,
    refreshError,
    lastRefreshed,
    showCrossEnvRefresh,
    isRefreshingProduction,
    refreshBookmarks,
    handleProductionRefresh,
    dismissCrossEnvRefresh,
  };
}
