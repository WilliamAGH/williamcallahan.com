/**
 * Bookmark Refresh Alerts
 *
 * Dev-environment alerts for bookmark refresh status: error banners
 * and cross-environment production refresh prompts.
 *
 * @module components/features/bookmarks/bookmark-refresh-alerts.client
 */

"use client";

import { Loader2 } from "lucide-react";
import React from "react";

export const BookmarkRefreshAlerts: React.FC<{
  refreshError: string | null;
  isRefreshing: boolean;
  showCrossEnvRefresh: boolean;
  isRefreshingProduction: boolean;
  onProductionRefresh: () => void;
}> = ({
  refreshError,
  isRefreshing,
  showCrossEnvRefresh,
  isRefreshingProduction,
  onProductionRefresh,
}) => {
  if (!refreshError && !showCrossEnvRefresh) return null;
  if (isRefreshing) return null;

  return (
    <div className="mb-4 space-y-3">
      {refreshError && (
        <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
          {refreshError}
        </div>
      )}

      {showCrossEnvRefresh && (
        <div className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 sm:p-3 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-sm">
          {isRefreshingProduction ? (
            <span className="flex items-center justify-center sm:justify-start">
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin mr-2 flex-shrink-0" />
              <span className="leading-relaxed">Triggering production refresh...</span>
            </span>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0">
              <span className="block sm:inline leading-relaxed">Local refresh completed.</span>
              <span className="block sm:inline sm:ml-1.5">
                Would you like to{" "}
                <button
                  type="button"
                  onClick={onProductionRefresh}
                  className="inline-flex items-center gap-1 underline decoration-1 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200 font-semibold transition-colors touch-manipulation"
                  disabled={isRefreshingProduction}
                >
                  refresh production <span className="hidden sm:inline">environment</span>
                  <span className="inline sm:hidden">too</span>
                </button>
                {"?"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
