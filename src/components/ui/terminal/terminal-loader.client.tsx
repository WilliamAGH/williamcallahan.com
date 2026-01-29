"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// Terminal loading skeleton
export function TerminalSkeleton() {
  return (
    // This skeleton now perfectly mirrors the structure and classes of the real Terminal component
    // to ensure a zero-shift loading experience. It uses the same layout classes but replaces
    // dynamic content with static, pulsing placeholders.
    <div
      className="relative z-10 mx-auto mt-4 mb-4 w-full max-w-[calc(100vw-2rem)] rounded-lg border border-gray-700 bg-[#1a1b26] p-4 font-mono text-sm shadow-xl sm:mt-8 sm:mb-8 sm:max-w-3xl sm:p-6"
      role="status"
      aria-label="Loading terminal"
    >
      <div className="animate-pulse">
        {/* Header Skeleton */}
        <div className="mb-3 flex items-center gap-2">
          <div className="mr-3.5 flex flex-shrink-0 items-center space-x-2">
            <div className="h-3.5 w-3.5 rounded-full bg-gray-600"></div>
            <div className="h-3.5 w-3.5 rounded-full bg-gray-600"></div>
            <div className="h-3.5 w-3.5 rounded-full bg-gray-600"></div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="max-h-[300px] overflow-y-auto text-gray-300 sm:max-h-[400px]">
          <div className="break-words select-text whitespace-pre-wrap">
            {/* History skeleton - includes welcome message to match initial state */}
            <div className="space-y-1 mb-4">
              {/* Welcome message that always appears on load */}
              <div className="flex items-start">
                <span className="text-gray-400 opacity-60">
                  Welcome! Type &quot;help&quot; for available commands.
                </span>
              </div>
            </div>

            {/* CommandInput skeleton - exact structure from CommandInput component */}
            <div className="w-full table">
              <div className="flex items-center w-full">
                <span className="text-[#7aa2f7] select-none mr-2">$</span>
                <div className="relative flex-1 transform-gpu">
                  <input
                    type="text"
                    disabled
                    aria-label="terminal command input placeholder"
                    placeholder="Enter a command"
                    className="bg-transparent w-full focus:outline-none text-gray-300 caret-gray-300 text-[16px] transform-gpu scale-[0.875] origin-left disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ margin: "-0.125rem 0" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading terminal interface...</span>
    </div>
  );
}

// Lazy load the Terminal implementation directly to avoid circular imports
const TerminalImpl = dynamic(
  () => import("./terminal-implementation.client").then((mod) => mod.Terminal),
  {
    loading: () => <TerminalSkeleton />,
    ssr: false, // Now allowed in Client Component
  },
);

// Export the loader component
export function TerminalLoader() {
  const pathname = usePathname();

  if (pathname === "/cv") {
    return null;
  }

  return (
    <Suspense fallback={<TerminalSkeleton />}>
      <TerminalImpl />
    </Suspense>
  );
}
