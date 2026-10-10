// This is the error boundary for the 'bookmarks' route
"use client";

import { formatDate as utilFormatDate } from "@/lib/utils";
import { getProperty } from "@/lib/utils/error-utils";
import type { ErrorPageProps } from "@/types/api";
import { useEffect, useState } from "react";

const RELOAD_KEY = "chunk-error-reload-attempts";
const MAX_RELOAD_ATTEMPTS = 3;
const RELOAD_WINDOW_MS = 60000; // 1 minute window
const RELOAD_DELAY_MS = 3000;

interface ChunkReloadAttempts {
  attempts: number[];
  lastReset: number;
}

/** Reads reload attempts from session storage, resetting them outside the time window. Throws when storage is unavailable. */
function readChunkReloadAttempts(): ChunkReloadAttempts {
  const storedData = sessionStorage.getItem(RELOAD_KEY);
  let reloadData: ChunkReloadAttempts = { attempts: [], lastReset: Date.now() };
  if (storedData) {
    const parsed: unknown = JSON.parse(storedData);
    // Validate the structure
    if (
      parsed &&
      typeof parsed === "object" &&
      "attempts" in parsed &&
      "lastReset" in parsed &&
      Array.isArray(parsed.attempts) &&
      typeof parsed.lastReset === "number"
    ) {
      reloadData = parsed as ChunkReloadAttempts;
    }
  }

  // Reset attempts if outside the time window
  const now = Date.now();
  if (now - reloadData.lastReset > RELOAD_WINDOW_MS) {
    reloadData.attempts = [];
    reloadData.lastReset = now;
  }
  return reloadData;
}

function isChunkReloadBudgetExhausted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return readChunkReloadAttempts().attempts.length >= MAX_RELOAD_ATTEMPTS;
  } catch {
    // Storage failure: the effect logs it and reloads once
    return false;
  }
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  // Log the error for debugging
  useEffect(() => console.error("Error in /bookmarks page:", error), [error]);

  // Handle ChunkLoadError specifically
  const isChunkLoadError =
    error.name === "ChunkLoadError" || error.message.includes("Loading chunk");
  // Chunk load errors only occur in the browser, so this read never diverges from SSR output
  const [maxReloadReached] = useState(() => isChunkLoadError && isChunkReloadBudgetExhausted());

  // Auto-reload for chunk load errors with session-based protection
  useEffect(() => {
    if (!isChunkLoadError) {
      return undefined;
    }
    if (maxReloadReached) {
      console.warn(
        `ChunkLoadError: Exceeded maximum reload attempts (${MAX_RELOAD_ATTEMPTS}) within ${RELOAD_WINDOW_MS}ms window`,
      );
      return undefined;
    }

    try {
      const reloadData = readChunkReloadAttempts();
      // Add current attempt and save
      reloadData.attempts.push(Date.now());
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify(reloadData));
    } catch (storageError) {
      // If session storage fails, reload once but log the error
      console.error("Failed to access session storage for reload protection:", storageError);
    }

    // Schedule reload
    const timer = setTimeout(() => {
      globalThis.location.reload();
    }, RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isChunkLoadError, maxReloadReached]);

  let lastFetched = 0;
  try {
    const match = /^BookmarksUnavailable\|(\d+)/.exec(error.message);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      lastFetched = Number.isFinite(parsed) ? parsed : 0;
    }
  } catch (parseError) {
    console.warn("Failed to parse lastFetched from error message:", parseError);
  }

  // Attempt to get the last fetched timestamp if it was attached to the error
  // (the property name was changed to 'lastFetched' in bookmarks.server.tsx)
  const lastFetchedTimestamp = getProperty(error, "lastFetchedTimestamp");

  return (
    <main className="max-w-5xl mx-auto py-16 px-4 sm:px-6 lg:px-8 text-center">
      <div className="bg-red-50 dark:bg-gray-800 border border-red-200 dark:border-red-700 p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-4">
          {isChunkLoadError ? "🔄 Loading Resources..." : "😵‍💫 Bookmarks Unavailable"}
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          {isChunkLoadError
            ? maxReloadReached
              ? "Unable to load page resources. Please try manually refreshing the page or clearing your browser cache."
              : "The page resources are being refreshed. Reloading automatically in a moment..."
            : "Hmm, my bookmarks service is taking a break."}
        </p>
        {!isChunkLoadError && lastFetched > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Last successful fetch: {utilFormatDate(lastFetched)}
          </p>
        )}
        {!isChunkLoadError && (
          <>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
              Feel free to browse the rest of the site while this gets fixed!
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              We couldn&apos;t load the bookmarks at this time.
              {lastFetchedTimestamp
                ? ` Last attempt to fetch was at: ${utilFormatDate(lastFetchedTimestamp)}.`
                : " It might be a temporary issue, or the data source could be unavailable."}
            </p>
          </>
        )}
        {isChunkLoadError ? (
          maxReloadReached ? (
            <button
              type="button"
              onClick={() => globalThis.location.reload()}
              className="mt-6 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition"
            >
              Refresh Page
            </button>
          ) : (
            <div className="mt-6">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        )}
      </div>
    </main>
  );
}
