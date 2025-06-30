"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Terminal loading skeleton
function TerminalSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading terminal">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
      <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded"></div>
      <span className="sr-only">Loading terminal interface...</span>
    </div>
  );
}

// Lazy load the Terminal component with SSR disabled
const Terminal = dynamic(
  () => import("./terminal.client").then(mod => mod.ClientTerminal),
  { 
    loading: () => <TerminalSkeleton />,
    ssr: false // Now allowed in Client Component
  }
);

// Export the loader component
export function TerminalLoader() {
  return (
    <Suspense fallback={<TerminalSkeleton />}>
      <Terminal />
    </Suspense>
  );
}