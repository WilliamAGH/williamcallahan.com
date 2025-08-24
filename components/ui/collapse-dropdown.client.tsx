/**
 * CollapseDropdown Component
 *
 * @module components/ui/collapse-dropdown.client
 * @description Provides the CollapseDropdown component that integrates with
 *              the CollapseDropdownContext for proper React-based state management.
 */

"use client";

import { useEffect, useRef, type JSX } from "react";
import type { CollapseDropdownExtendedProps as CollapseDropdownProps } from "@/types/ui";
import { useCollapseDropdownContext } from "../../lib/context/collapse-dropdown-context.client";
import { cn } from "../../lib/utils";

export function CollapseDropdown({
  summary,
  children,
  className = "",
  summaryClassName = "",
  contentClassName = "",
  defaultOpen = false,
  id: providedId,
  isNested = false,
}: CollapseDropdownProps): JSX.Element {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const context = useCollapseDropdownContext();

  // Try to use context, but don't fail if not available (backward compatibility)
  const registerDropdown = context?.registerDropdown;
  const unregisterDropdown = context?.unregisterDropdown;

  // Warn about missing ID in development mode
  // This is a warning, not an error, since we have fallback logic to generate IDs
  if (process.env.NODE_ENV === "development" && !providedId) {
    console.warn("CollapseDropdown: id prop is recommended for proper anchor scroll functionality");
  }

  // Effect handles registration/unregistration with context if available
  useEffect(() => {
    if (!registerDropdown || !unregisterDropdown || !providedId) {
      return;
    }

    // TypeScript needs explicit type assertion here
    registerDropdown(providedId, detailsRef as React.RefObject<HTMLDetailsElement>);
    return () => {
      unregisterDropdown(providedId);
    };
  }, [providedId, registerDropdown, unregisterDropdown]);

  // Use provided ID or generate one from summary (for backward compatibility)
  const elementId =
    providedId ||
    (typeof summary === "string"
      ? summary
          .toLowerCase()
          .replace(/^\d+\.\d+:\s+/, "")
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-_]/g, "")
      : undefined);

  return (
    <details
      ref={detailsRef}
      className={cn("my-6 group", className)}
      open={defaultOpen}
      id={elementId} // Assign ID here
    >
      <summary
        style={{ listStyle: "none" }}
        className={cn(
          "text-lg font-semibold cursor-pointer list-none",
          "flex items-center gap-2",
          "p-3 rounded-md border",
          "bg-slate-50 dark:bg-slate-800/50",
          "border-slate-200 dark:border-slate-700",
          "transition-colors duration-150",
          "hover:bg-slate-100 dark:hover:bg-slate-700/50",
          summaryClassName,
        )}
      >
        <span className="transition-transform duration-200 group-open:rotate-90 flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-chevron-right"
          >
            <title>Toggle dropdown</title>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
        <span className="flex-grow">{summary}</span>
      </summary>
      <div
        className={cn(
          "ml-6 mt-4 mb-4 px-4 pb-2", // Added px-4 padding horizontally and pb-2 at bottom
          "prose prose-sm dark:prose-invert max-w-none",
          "overflow-visible",
          "[&_code]:text-base [&_code]:break-words [&_code]:whitespace-normal", // Updated text-sm to text-base
          "[&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:underline [&_a]:font-medium", // Fixed link styling
          "[&_a:hover]:text-blue-500 [&_a:hover]:dark:text-blue-300 [&_a:hover]:no-underline", // Fixed hover state
          "[&_a>code]:text-blue-600 dark:[&_a>code]:text-blue-400",
          "[&_a>code]:bg-transparent dark:[&_a>code]:bg-transparent",
          "[&_a>code]:px-0 [&_a>code]:py-0",
          "[&_a:hover>code]:text-blue-500 dark:[&_a:hover>code]:text-blue-300",
          "[&_pre]:overflow-x-auto [&_pre]:my-2",
          "[&_ul]:pl-5 [&_li]:ml-0 [&_li]:my-1",
          "[&_p]:text-base [&_div]:text-base", // Added consistent 16px text size
          // Apply extra styling for nested dropdowns
          isNested && "!ml-2 !mt-2",
          contentClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
