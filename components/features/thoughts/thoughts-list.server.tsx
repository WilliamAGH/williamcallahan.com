/**
 * Thoughts List Server Component
 * @module components/features/thoughts/thoughts-list.server
 * @description
 * Server component that pre-renders the list of thoughts.
 * Uses an editorial single-column layout optimized for readability.
 *
 * @serverComponent - This component renders on the server for optimal performance.
 */

import { ThoughtCard } from "./thought-card";
import type { ThoughtsListProps } from "@/types/features/thoughts";

/**
 * ThoughtsList Server Component
 *
 * Renders a list of thought cards with an editorial layout.
 * The single-column design prioritizes readability for short-form content.
 */
export function ThoughtsListServer({ thoughts, title, description }: ThoughtsListProps): React.JSX.Element {
  const isEmpty = !thoughts || thoughts.length === 0;

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6">
      {/* Header Section */}
      {(title || description) && (
        <header className="mb-8 sm:mb-10">
          {title && (
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </header>
      )}

      {/* Empty State */}
      {isEmpty ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
            <svg
              className="w-8 h-8 text-zinc-400 dark:text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">No thoughts yet</h2>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Short-form ideas and insights will appear here. Check back soon!
          </p>
        </div>
      ) : (
        /* Thoughts List - Single Column Editorial Layout */
        <div className="space-y-1 divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {thoughts.map((thought, index) => (
            <ThoughtCard key={thought.id} thought={thought} preload={index < 3} />
          ))}
        </div>
      )}

      {/* Count Footer */}
      {!isEmpty && (
        <footer className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-500">
            {thoughts.length} {thoughts.length === 1 ? "thought" : "thoughts"}
          </p>
        </footer>
      )}
    </div>
  );
}
