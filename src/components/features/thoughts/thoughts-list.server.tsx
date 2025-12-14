/**
 * Thoughts List Server Component
 * @module components/features/thoughts/thoughts-list.server
 * @description
 * Server component that pre-renders the list of thoughts.
 * Features an immersive editorial layout with animated header
 * and "captured thoughts" aesthetic.
 *
 * @serverComponent - This component renders on the server for optimal performance.
 */

import { Lightbulb } from "lucide-react";
import { ThoughtCard } from "./thought-card";
import { cn } from "@/lib/utils";
import type { ThoughtsListProps } from "@/types/features/thoughts";

/**
 * ThoughtsList Server Component
 *
 * Renders a list of thought cards with an immersive editorial layout.
 * Features warm amber accents, decorative elements, and
 * a personality-rich header section.
 */
export function ThoughtsListServer({ thoughts, title, description }: ThoughtsListProps): React.JSX.Element {
  const isEmpty = !thoughts || thoughts.length === 0;

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6">
      {/* Header Section - Immersive Introduction */}
      {(title || description) && (
        <header className="relative mb-6 sm:mb-8 pb-4 sm:pb-6">
          {/* Decorative floating elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <div className="absolute top-2 left-[8%] w-1.5 h-1.5 bg-amber-300/40 dark:bg-amber-500/20 rounded-full animate-gentle-pulse" />
            <div
              className="absolute top-8 right-[15%] w-2 h-2 bg-zinc-300/50 dark:bg-zinc-600/30 rounded-full animate-gentle-pulse"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute bottom-12 left-[25%] w-1 h-1 bg-amber-400/30 dark:bg-amber-400/15 rounded-full animate-gentle-pulse"
              style={{ animationDelay: "1s" }}
            />
          </div>

          {/* Title */}
          {title && (
            <div className="relative mb-4">
              <h1
                className={cn(
                  "text-3xl sm:text-4xl md:text-5xl",
                  "font-bold tracking-tight",
                  "text-zinc-900 dark:text-zinc-100",
                )}
              >
                {title}
              </h1>
            </div>
          )}

          {/* Description - plain text (no quotes) */}
          {description && (
            <p className={cn("text-base sm:text-lg", "text-zinc-600 dark:text-zinc-400", "max-w-2xl leading-relaxed")}>
              {description}
            </p>
          )}

          {/* Faulkner Quote - editorial pull-quote styling */}
          <figure className="mt-8 relative">
            {/* Large decorative opening quote mark */}
            <span
              className={cn(
                "absolute left-1 -top-4 sm:left-0 sm:-top-6",
                "text-5xl sm:text-7xl font-serif",
                "text-amber-200/60 dark:text-amber-700/30",
                "select-none pointer-events-none",
                "leading-none",
              )}
              aria-hidden="true"
            >
              &ldquo;
            </span>

            <blockquote className="relative pl-6 sm:pl-8">
              <p
                className={cn(
                  "text-base sm:text-lg",
                  "text-zinc-600 dark:text-zinc-400",
                  "italic leading-relaxed tracking-wide",
                  "font-light",
                )}
              >
                I never know what I think about something until I read what I&apos;ve written on it.
              </p>
            </blockquote>

            <figcaption className="mt-3 pl-6 sm:pl-8 flex items-center gap-2">
              <span className="w-6 h-px bg-amber-400/50 dark:bg-amber-500/30" aria-hidden="true" />
              <cite
                className={cn(
                  "text-xs sm:text-sm",
                  "text-amber-700/70 dark:text-amber-400/60",
                  "not-italic font-medium tracking-wide",
                )}
              >
                William Faulkner
              </cite>
            </figcaption>
          </figure>
        </header>
      )}

      {/* Empty State - Animated "thinking" illustration */}
      {isEmpty ? (
        <div className="text-center py-20 sm:py-24">
          {/* Animated thinking indicator */}
          <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
            {/* Ping animation layer */}
            <div
              className={cn(
                "absolute inset-0 rounded-full",
                "bg-amber-200/50 dark:bg-amber-700/20",
                "animate-ping opacity-30",
              )}
              style={{ animationDuration: "2s" }}
            />
            {/* Main icon container */}
            <div
              className={cn(
                "relative flex items-center justify-center",
                "w-20 h-20 rounded-full",
                "bg-gradient-to-br from-amber-50 to-amber-100/80",
                "dark:from-amber-950/50 dark:to-amber-900/30",
                "border border-amber-200/50 dark:border-amber-700/30",
              )}
            >
              <Lightbulb className="w-10 h-10 text-amber-500 dark:text-amber-400" />
            </div>
          </div>

          <h2 className={cn("text-xl sm:text-2xl font-semibold", "text-zinc-900 dark:text-zinc-100", "mb-3")}>
            The mind wanders...
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Thoughts are brewing. Check back soon for fleeting insights and captured observations.
          </p>
        </div>
      ) : (
        /* Thoughts List - Editorial Layout with dividers */
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {thoughts.map((thought, index) => (
            <div
              key={thought.id}
              className="animate-fade-in-left"
              style={{ animationDelay: `${Math.min(index * 80, 400)}ms` }}
            >
              <ThoughtCard thought={thought} preload={index < 3} />
            </div>
          ))}
        </div>
      )}

      {/* Count Footer - Subtle tally */}
      {!isEmpty && (
        <footer className="mt-10 pt-6 border-t border-zinc-200/80 dark:border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-amber-300/50 dark:bg-amber-600/30" />
            <p className="text-xs font-mono tracking-[0.15em] text-zinc-500 dark:text-zinc-500">
              {thoughts.length} {thoughts.length === 1 ? "thought" : "thoughts"} captured
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
