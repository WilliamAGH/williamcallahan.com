/**
 * ExpandableText Component
 * @module components/ui/expandable-text.client
 * @description
 * A client component that renders text content with height-based collapse/expand.
 * Shows a gradient fade and "Show more" button when content exceeds the threshold.
 * Uses CSS transitions for smooth animation (not Framer Motion for performance).
 */

"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { type JSX, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExpandableTextCollapsedHeight, ExpandableTextProps } from "@/types/ui/interactive";

/** Height presets mapping to Tailwind max-height classes */
const HEIGHT_PRESETS: Record<ExpandableTextCollapsedHeight, { class: string; rem: number }> = {
  sm: { class: "max-h-24", rem: 6 }, // 6rem = 96px ≈ 4 lines
  md: { class: "max-h-36", rem: 9 }, // 9rem = 144px ≈ 6 lines
  lg: { class: "max-h-48", rem: 12 }, // 12rem = 192px ≈ 8 lines
};

/**
 * Renders text content with height-based collapse/expand functionality.
 * Shows a gradient fade and toggle button when content exceeds the threshold.
 */
export function ExpandableText({
  children,
  className,
  collapsedHeight = "md",
}: ExpandableTextProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const preset = HEIGHT_PRESETS[collapsedHeight];

  const measureHeight = useCallback(() => {
    if (!contentRef.current) return;

    const rootFontSize =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const collapsedHeightPx = preset.rem * rootFontSize;
    const lh = Number.parseFloat(getComputedStyle(contentRef.current).lineHeight);
    const buffer = Number.isFinite(lh) ? lh : rootFontSize;
    const isContentTaller = contentRef.current.scrollHeight > collapsedHeightPx + buffer;

    setNeedsExpansion(isContentTaller);
    setHasMeasured(true);
  }, [preset.rem]);

  // useLayoutEffect runs synchronously after DOM mutations, before paint
  // This ensures height measurement happens at the right time without setTimeout hacks
  useLayoutEffect(() => {
    measureHeight();
    window.addEventListener("resize", measureHeight);
    return () => window.removeEventListener("resize", measureHeight);
  }, [measureHeight]);

  // Server and initial client render: no height constraints (content fully visible)
  // After measurement: apply appropriate height class based on state
  const heightClasses = hasMeasured
    ? cn(
        "overflow-hidden transition-[max-height] duration-300 ease-in-out",
        isExpanded ? "max-h-[2000px]" : preset.class,
      )
    : "";

  return (
    <div className="relative">
      {/* Content container - no suppressHydrationWarning needed since initial render is consistent */}
      <div id={contentId} ref={contentRef} className={cn(heightClasses, className)}>
        {children}
      </div>

      {/* Gradient fade - only when collapsed and content exceeds threshold */}
      {hasMeasured && needsExpansion && !isExpanded && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0",
            "h-16",
            "bg-gradient-to-t from-white/95 dark:from-gray-900/95 to-transparent",
          )}
        />
      )}

      {/* Toggle button - only shown when content exceeds threshold */}
      {hasMeasured && needsExpansion && (
        <div className={cn("flex justify-center", isExpanded ? "pt-3" : "pt-1")}>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-1.5",
              "text-xs font-medium",
              "text-gray-600 dark:text-gray-400",
              "bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm",
              "rounded-full",
              "ring-1 ring-black/5 dark:ring-white/10",
              "hover:bg-gray-200/80 dark:hover:bg-gray-700/60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
              "transition-colors",
            )}
          >
            {isExpanded ? (
              <>
                Show less
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Show more
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
