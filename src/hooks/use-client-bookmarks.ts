/**
 * Client-Side Bookmarks Fetcher Hook
 *
 * Fetches all bookmarks from the API on the client side, with type-safe
 * response validation and explicit error surfacing. Extracted from
 * bookmarks-with-options.client.tsx to satisfy SRP.
 *
 * @module hooks/use-client-bookmarks
 */

"use client";

import type { UnifiedBookmark } from "@/types";
import { bookmarksRefreshResponseSchema } from "@/types/schemas/bookmark";
import { useCallback, useEffect, useState } from "react";

/**
 * Fetches bookmarks from the client-side API when `enabled` is true.
 * Falls back to `serverBookmarks` on mount, surfacing fetch errors
 * explicitly rather than silently degrading.
 */
export function useClientBookmarks(params: {
  serverBookmarks: UnifiedBookmark[];
  serverInternalHrefs: Record<string, string>;
  enabled: boolean;
  mounted: boolean;
}): {
  bookmarks: UnifiedBookmark[];
  internalHrefs: Record<string, string>;
  dataSource: "server" | "client";
  fetchError: string | null;
  refetch: () => Promise<void>;
} {
  const { serverBookmarks, serverInternalHrefs, enabled, mounted } = params;

  const [bookmarks, setBookmarks] = useState(serverBookmarks);
  const [internalHrefs, setInternalHrefs] = useState(serverInternalHrefs);
  const [dataSource, setDataSource] = useState<"server" | "client">("server");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/bookmarks?t=${Date.now()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal,
        });

        if (!response.ok) {
          throw new Error(`Bookmarks API returned ${response.status}`);
        }

        const parseResult = bookmarksRefreshResponseSchema.safeParse(await response.json());
        if (!parseResult.success) {
          throw new Error("Bookmarks API returned an unexpected response shape");
        }

        const parsed = parseResult.data.data;
        if (parsed.length === 0) {
          throw new Error("Bookmarks API returned empty data");
        }

        setBookmarks(parsed);
        setInternalHrefs(parseResult.data.internalHrefs ?? serverInternalHrefs);
        setDataSource("client");
        setFetchError(null);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to load bookmarks";
        console.error("[useClientBookmarks]", message);
        setFetchError(message);
      }
    },
    [serverInternalHrefs],
  );

  useEffect(() => {
    if (!enabled || !mounted) return;
    const controller = new AbortController();
    void fetchBookmarks(controller.signal);
    return () => controller.abort();
  }, [enabled, mounted, serverBookmarks, fetchBookmarks]);

  const refetch = useCallback(async () => {
    await fetchBookmarks();
  }, [fetchBookmarks]);

  return { bookmarks, internalHrefs, dataSource, fetchError, refetch };
}
