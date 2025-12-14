/**
 * CodeBlock Component - The main client-side code block renderer
 *
 * This is the core component that renders interactive code blocks with:
 * - Syntax highlighting (via rehype-prism classes)
 * - Copy-to-clipboard functionality
 * - macOS-style window controls (minimize/maximize/close)
 * - Two rendering modes:
 *   1. Standalone: Full window chrome with controls
 *   2. Embedded: Minimal styling for use inside tabs
 *
 * Used by MDXCodeBlock wrapper which handles MDX integration.
 *
 * @module components/ui/code-block/code-block.client
 */

"use client";

import { type JSX, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"; // Import useEffect, useRef, useCallback, isValidElement, useId
import { useWindowSize } from "../../../lib/hooks/use-window-size.client";
import { cn } from "../../../lib/utils";
import { WindowControls } from "../navigation/window-controls";
import { CopyButton } from "./copy-button.client";

// Note: Prism CSS is loaded globally in layout.tsx
// We rely on rehype-prism for build-time syntax highlighting

import type { CodeBlockProps } from "@/types";

/**
 * Extract language from className (e.g., "language-typescript" -> "typescript")
 * @param className - The CSS class string to parse
 * @returns The extracted language identifier or empty string
 */
const extractLanguage = (className?: string): string => {
  const match = className?.match(/language-(\w+)/);
  return match?.[1] || "";
};

/**
 * Filters out comment lines from text content
 * @param text - The text to filter
 * @returns Text with comments removed
 */
const filterComments = (text: string): string => {
  if (typeof text !== "string") return "";
  return text
    .split("\n")
    .filter(line => !line.trim().startsWith("#"))
    .join("\n")
    .trim();
};

/**
 * Recursively extracts text content from React nodes
 * @param node - The React node to extract text from
 * @returns The extracted text content as a string
 */
const getTextContent = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return ""; // Handles null, undefined, false

  // If 'node' is an array of ReactNodes
  if (Array.isArray(node)) {
    return node.map(getTextContent).join("");
  }

  // Check if it's a valid React element that might have children
  if (isValidElement(node)) {
    const props: unknown = node.props;
    if (typeof props === "object" && props !== null && "children" in (props as Record<string, unknown>)) {
      return getTextContent((props as { children?: ReactNode }).children);
    }
    return "";
  }

  return "";
};

/**
 * A component that renders a code block with syntax highlighting and a copy button.
 * Features window controls for minimize/maximize functionality and responsive design.
 * @component
 * @param props - The component props
 * @returns JSX element representing the code block with interactive features
 */
export const CodeBlock = ({
  children,
  className,
  embeddedInTabFrame = false,
  ...props
}: CodeBlockProps): JSX.Element => {
  // Threshold for when to auto-collapse long code blocks
  const COLLAPSE_LINE_THRESHOLD = 12;
  // Approx. max height that corresponds to ~12 lines at text-[13px] leading-relaxed
  // Tuned for mobile/tablet/desktop for a consistent preview before expanding
  // Max-heights use Tailwind preset sizes to ensure classes are statically discoverable by the compiler
  // 64 => 16rem (256px), 72 => 18rem (288px), 80 => 20rem (320px)

  const language = extractLanguage(className);
  const codeElementRef = useRef<HTMLElement | null>(null);
  const collapsibleRegionId = useId();

  // Add state for interactive behavior
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Ref for the main window element to check clicks against
  const windowRef = useRef<HTMLDivElement>(null);

  // Get window size to determine control size
  const windowSize = useWindowSize();

  // Determine the appropriate control size based on screen width
  const controlSize =
    windowSize.width && windowSize.width < 640 ? "sm" : windowSize.width && windowSize.width > 1280 ? "lg" : "md";

  /**
   * Handler function for close button - toggles visibility
   */
  const handleClose = () => {
    setIsVisible(prev => !prev); // Toggle visibility
  };

  /**
   * Handler function for minimize button - toggles minimized state
   */
  const handleMinimize = () => {
    setIsMinimized(prev => !prev);
    if (isMaximized) setIsMaximized(false); // Exit maximized mode if active
  };

  /**
   * Handler function for maximize button - toggles maximized state
   * Wrapped in useCallback to prevent recreation on each render
   */
  const handleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
    if (isMinimized) setIsMinimized(false); // Exit minimized mode if active
  }, [isMinimized]); // Add dependencies

  // Effect for handling Escape key and click outside when maximized
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMaximized) {
        handleMaximize(); // Close maximized view on Escape
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Check if maximized and the click is outside the windowRef element
      if (isMaximized && windowRef.current && !windowRef.current.contains(event.target as Node)) {
        handleMaximize(); // Close maximized view
      }
    };

    if (isMaximized) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside); // Use mousedown like Terminal
    }

    // Cleanup function
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMaximized, handleMaximize]); // Dependencies

  // Effect for SVG transform fixes
  useEffect(() => {
    if (codeElementRef.current) {
      // Ensure any SVG elements in code blocks have proper transforms
      const svgs = codeElementRef.current.querySelectorAll("svg");
      for (const svg of svgs) {
        const transform = svg.getAttribute("transform");
        if (transform && !transform.includes("(") && !transform.includes(")")) {
          const match = transform.match(/^(\w+)(.+)$/);
          if (match) {
            svg.setAttribute("transform", `${match[1]}(${match[2]})`);
          }
        }
      }
    }
  });

  // Extract the text content
  const content = Array.isArray(children) ? children.map(getTextContent).join("") : getTextContent(children);

  // Preserve original content for display but filter comments for copy functionality
  const filteredContent = filterComments(content);

  // Prepare display content: remove leading/trailing blank lines that add invisible space
  const displayContent = typeof children === "string" ? children.replace(/^\n+|\n+$/g, "") : children;

  // Count lines from the actually displayed text content
  const visibleText = typeof displayContent === "string" ? displayContent : content;
  const lineCount = visibleText ? visibleText.split(/\r?\n/).length : 0;
  const isLongCode = lineCount > COLLAPSE_LINE_THRESHOLD;
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => isLongCode);

  // Return early if code block is closed
  if (!isVisible) {
    // Common content for both button and div versions
    const contentSection = (
      <div className={cn("text-gray-400", embeddedInTabFrame ? "w-full text-center" : "ml-1.5 sm:ml-2.5 md:ml-3.5")}>
        <span>Code block hidden (click to show)</span>
        {language && !embeddedInTabFrame && (
          <span style={{ fontSize: "12px" }} className="not-prose ml-1 sm:ml-2 opacity-75">
            - {language}
          </span>
        )}
      </div>
    );

    return (
      <div className="relative group overflow-hidden my-6 w-full flex justify-center">
        <div
          className={cn("relative max-w-full w-full", !embeddedInTabFrame && "shadow-md")}
          style={{
            overflow: "hidden",
            borderRadius: embeddedInTabFrame ? "0px" : "8px",
          }}
        >
          {/* Conditionally render button or div based on whether WindowControls will be present */}
          {embeddedInTabFrame ? (
            // When embedded, no WindowControls are rendered, so we can use a proper button
            <button
              type="button"
              className={cn(
                "flex items-center bg-[#1a2a35] border border-gray-700/50 rounded-lg",
                "px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 md:py-1.5",
                "w-full text-left",
              )}
              onClick={handleClose}
            >
              {contentSection}
            </button>
          ) : (
            // When not embedded, WindowControls are present and handle interaction
            <div
              className={cn(
                "flex items-center bg-[#1a2a35] border border-gray-700/50 rounded-lg",
                "px-2 sm:px-3 md:px-4 py-0.5 sm:py-1 md:py-1.5",
                "w-full text-left",
              )}
            >
              <WindowControls
                onClose={handleClose}
                onMinimize={handleMinimize}
                onMaximize={handleMaximize}
                size={controlSize}
              />
              {contentSection}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full",
        !embeddedInTabFrame && "my-6",
        isMaximized &&
          !embeddedInTabFrame &&
          "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8",
      )}
    >
      <div
        ref={windowRef}
        className={cn(
          "max-w-full w-full overflow-auto",
          !embeddedInTabFrame
            ? "bg-[#f5f2f0] dark:bg-[#282a36] rounded-lg shadow-sm md:shadow-md border border-gray-200/80 dark:border-gray-800/80 ring-1 ring-black/5 dark:ring-white/5"
            : "!bg-transparent !shadow-none !border-0 !rounded-none",
          isMaximized &&
            !embeddedInTabFrame &&
            "w-full max-w-[95vw] sm:max-w-5xl max-h-[90vh] sm:max-h-[80vh] flex flex-col",
        )}
      >
        {/* Header: Rendered differently based on embeddedInTabFrame */}
        {
          !embeddedInTabFrame ? (
            // Full header for standalone CodeBlock
            <div className="flex items-center bg-[#1a2a35] dark:bg-[#1a1b26] px-3 py-2 rounded-t-lg border-b border-black/10 dark:border-white/10">
              <WindowControls
                onClose={handleClose}
                onMinimize={handleMinimize}
                onMaximize={handleMaximize}
                size={controlSize}
                isMaximized={isMaximized}
              />
              {language && (
                <div className="not-prose ml-auto flex-shrink min-w-0 px-1.5 py-0.5 font-mono rounded-md bg-gray-600/70 text-gray-200 uppercase tracking-wide truncate text-[10px] sm:text-[11px]">
                  {language}
                </div>
              )}
            </div>
          ) : // Minimal or no header for embedded CodeBlock, primarily for CopyButton positioning context
          // The parent div for <pre> and <CopyButton> is already "relative group"
          // So CopyButton will position itself correctly relative to that.
          // We don't need a visible header bar here if embedded.
          null // Or an empty div if CopyButton needed a specific height container: <div className="h-8"></div>
        }

        {/* Content (pre + CopyButton) */}
        {/* Ensure this div is present and `relative group` for CopyButton positioning */}
        {!isMinimized && (
          <div className={cn("relative group", isMaximized && !embeddedInTabFrame && "flex-1 overflow-hidden")}>
            <pre
              id={collapsibleRegionId}
              role="region"
              aria-label={language ? `${language} code` : "Code block"}
              tabIndex={0}
              className={cn(
                "not-prose max-w-full",
                "whitespace-pre-wrap",
                "break-words",
                "overflow-x-auto",
                embeddedInTabFrame
                  ? "!p-0 !m-0 !bg-transparent !border-0 !rounded-none text-gray-900 dark:text-gray-100"
                  : "p-4 text-gray-900 dark:text-gray-100",
                "text-[13px] leading-relaxed",
                "custom-scrollbar",
                "![text-shadow:none] [&_*]:![text-shadow:none]",
                "[&_*]:!bg-transparent [&_*]:!leading-relaxed font-mono",
                isMaximized && !embeddedInTabFrame && "overflow-auto max-h-full",
                // Auto-collapse long code blocks unless maximized
                isCollapsed && !isMaximized && isLongCode && "overflow-hidden max-h-64 sm:max-h-72 md:max-h-80",
                className, // From MDX (e.g., language-bash)
              )}
              {...props}
            >
              {isValidElement(children) ? (
                children
              ) : (
                <code ref={codeElementRef} className={className}>
                  {displayContent}
                </code>
              )}
            </pre>
            {/* CopyButton is always rendered. It uses group-hover on the parent div. */}
            <CopyButton content={filteredContent} parentIsPadded={!embeddedInTabFrame} />
            {/* Collapsed overlay with gradient and expand/collapse control */}
            {isCollapsed && isLongCode && !isMaximized && (
              <>
                {/* Gradient fade from container background to transparent for visual cue */}
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0",
                    "h-16 sm:h-20",
                    // Match the container background colors for a seamless fade
                    "bg-gradient-to-t from-[#f5f2f0]/95 to-transparent dark:from-[#282a36]/95",
                    // Respect rounded corners in standalone mode
                    !embeddedInTabFrame && "rounded-b-lg",
                  )}
                />
                {/* Expand button */}
                <div className="absolute inset-x-0 bottom-2 sm:bottom-3 flex justify-center">
                  <button
                    type="button"
                    aria-label="Show all code"
                    aria-expanded={!isCollapsed}
                    aria-controls={collapsibleRegionId}
                    onClick={() => setIsCollapsed(false)}
                    className={cn(
                      "px-3 py-1 text-xs sm:text-sm rounded-full",
                      "bg-white/85 dark:bg-black/40 backdrop-blur",
                      "text-gray-900 dark:text-gray-100",
                      "shadow-sm ring-1 ring-black/10 dark:ring-white/10",
                      "hover:bg-white/95 dark:hover:bg-black/50 motion-safe:transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
                      // Visible by default on mobile; reveal on hover for sm+ viewports
                      "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 motion-safe:transition-opacity",
                      !embeddedInTabFrame && "border border-black/5 dark:border-white/5",
                    )}
                  >
                    Show all code
                  </button>
                </div>
              </>
            )}
            {/* Collapse control when expanded (appears as a subtle inline action) */}
            {!isCollapsed && isLongCode && !isMaximized && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  aria-label="Collapse code"
                  aria-expanded={!isCollapsed}
                  aria-controls={collapsibleRegionId}
                  onClick={() => setIsCollapsed(true)}
                  className={cn(
                    "mt-1 px-3 py-1 text-xs sm:text-sm rounded-full",
                    "bg-gray-100/80 dark:bg-gray-800/60",
                    "text-gray-800 dark:text-gray-100",
                    "shadow-sm ring-1 ring-black/10 dark:ring-white/10",
                    "hover:bg-gray-100 dark:hover:bg-gray-800 motion-safe:transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
                  )}
                >
                  Collapse
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = "CodeBlock";
