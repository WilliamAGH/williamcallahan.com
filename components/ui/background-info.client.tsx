/**
 * Background Info Component
 * @module components/ui/background-info.client
 * @description
 * Displays a stylized, collapsible background information box, typically used in blog posts
 * to highlight supplementary contextual information.
 */

"use client";

import { ChevronDown, ChevronUp, InfoIcon } from "lucide-react";
import { type JSX, useEffect, useId, useRef, useState } from "react";
import type { LocalBackgroundInfoProps } from "@/types/ui";
import { cn } from "../../lib/utils";

/**
 * A client component that renders a collapsible box for supplementary background information.
 * It measures its content height to determine if a "Read more/less" toggle is needed on mobile.
 *
 * @param {BackgroundInfoProps} props - The properties for the component.
 * @returns {JSX.Element | null} The rendered background information box.
 */
export function BackgroundInfo({
  children,
  title = "Background Info",
  className = "",
  icon = <InfoIcon className="w-4 h-4" />,
}: LocalBackgroundInfoProps): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false); // Whether the content is expanded on mobile
  const [showToggleButton, setShowToggleButton] = useState(false); // Whether to show the "Read more/less" button
  const [isMounted, setIsMounted] = useState(false); // Tracks if the component has mounted on the client
  const contentRef = useRef<HTMLDivElement>(null); // Ref to the content div for height measurement
  const contentId = useId(); // Generate a unique, stable ID for ARIA attributes

  // Effect 1: Set mounted status on client-side to enable dynamic calculations and rendering.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effect 2: Check content height after mounting to determine if the toggle button is needed.
  // This effect runs when `isMounted` changes.
  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const checkHeight = () => {
      setTimeout(() => {
        // Ensures layout is stable
        if (contentRef.current) {
          const buffer = 16; // Buffer to prevent toggle for slightly taller content
          const collapsedHeightThreshold = 144; // Corresponds to max-h-36 (1rem = 16px, 9rem = 144px)
          const isContentSignificantlyTaller = contentRef.current.scrollHeight > collapsedHeightThreshold + buffer;

          // Only update if the value actually changes to prevent unnecessary re-renders
          setShowToggleButton((prev) => (prev !== isContentSignificantlyTaller ? isContentSignificantlyTaller : prev));
        }
      }, 0);
    };

    checkHeight(); // Initial check
    window.addEventListener("resize", checkHeight); // Re-check on resize
    return () => window.removeEventListener("resize", checkHeight);
  }, [isMounted]); // Dependency: isMounted

  const containerClasses = cn(
    "py-4 px-4 md:px-6 rounded-lg border",
    "bg-blue-100 dark:bg-blue-900/20",
    "border-blue-200 dark:border-blue-800",
    "max-md:-mx-4",
    "my-6",
    className,
  );
  const titleContainerClasses = cn("flex items-baseline gap-1 mb-2");
  const toggleButtonClasses = cn(
    "flex items-center justify-center w-full px-4 py-2 text-sm font-medium",
    "text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/30",
    "border-t border-blue-200 dark:border-blue-800",
    "transition-colors",
  );

  // --- Dynamic Content Styles --- (Applied only AFTER mount)
  const dynamicContentClasses = isMounted
    ? cn(
        "max-md:overflow-hidden transition-[max-height] duration-300 ease-in-out",
        isExpanded ? "max-md:max-h-[1000px]" : "max-md:max-h-36",
      )
    : ""; // No dynamic styles before mount

  // --- Final Content Classes ---
  const contentClasses = cn(
    "prose-sm dark:prose-invert text-blue-800 dark:text-blue-200", // Base prose styles
    dynamicContentClasses, // Dynamic height classes post-mount
  );

  return (
    <div className={containerClasses}>
      <div className={titleContainerClasses}>
        <div className="text-blue-600 dark:text-blue-400 flex-shrink-0 w-4 h-4">
          {" "}
          {/* Ensure space for icon */}
          {isMounted && icon}
        </div>
        <h4 className="font-medium text-lg text-blue-700 dark:text-blue-300">{title}</h4>
      </div>

      {/* Content: suppressHydrationWarning might still be helpful as a fallback */}
      <div id={contentId} ref={contentRef} className={contentClasses} suppressHydrationWarning={true}>
        {children}
      </div>

      {/* Button: Render only AFTER mount AND if needed. Hidden on medium screens and up. */}
      {isMounted && showToggleButton && (
        <div className="md:hidden">
          {" "}
          {/* This div wrapper is for layout (md:hidden) */}
          <button
            type="button" // Explicitly set button type for accessibility
            onClick={() => setIsExpanded(!isExpanded)}
            className={toggleButtonClasses}
            aria-expanded={isExpanded}
            aria-controls={contentId}
          >
            {isExpanded ? "Read less" : "Read more"}
            {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
