"use client";

import { useEffect, useState, type JSX } from "react";

const isChunkSyntaxError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return error.name === "SyntaxError" && message.includes("unexpected token");
};

const reloadWindow = (): void => {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
};

export default function BookmarkPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  const [retryAttempted, setRetryAttempted] = useState(false);

  useEffect(() => {
    console.error("Bookmark detail error", error);

    if (retryAttempted || !isChunkSyntaxError(error)) {
      return;
    }

    setRetryAttempted(true);

    import("./page")
      .then(() => {
        reset();
      })
      .catch(() => {
        reloadWindow();
      });
  }, [error, reset, retryAttempted]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Something went wrong</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Please try reloading this bookmark. If the problem persists, open it in a new tab.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={reloadWindow}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
