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

import { type JSX, isValidElement, useCallback, useEffect, useRef, useState } from "react"; // Import useEffect, useRef, useCallback, isValidElement
import type { ReactNode } from "react";
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
    .filter((line) => !line.trim().startsWith("#"))
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
    // node.props.children is ReactNode. We need to recurse on it.
    const props = node.props as { children?: ReactNode };
    return getTextContent(props.children); // Recurse
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
  const language = extractLanguage(className);
  const codeElementRef = useRef<HTMLElement>(null);

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
    setIsVisible((prev) => !prev); // Toggle visibility
  };

  /**
   * Handler function for minimize button - toggles minimized state
   */
  const handleMinimize = () => {
    setIsMinimized((prev) => !prev);
    if (isMaximized) setIsMaximized(false); // Exit maximized mode if active
  };

  /**
   * Handler function for maximize button - toggles maximized state
   * Wrapped in useCallback to prevent recreation on each render
   */
  const handleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
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
            ? "bg-[#f5f2f0] dark:bg-[#282a36] rounded-lg shadow-md"
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
            <div className="flex items-center bg-[#1a2a35] dark:bg-[#1a1b26] px-3 py-1.5 rounded-t-lg">
              <WindowControls
                onClose={handleClose}
                onMinimize={handleMinimize}
                onMaximize={handleMaximize}
                size={controlSize}
                isMaximized={isMaximized}
              />
              {language && (
                <div
                  style={{ fontSize: "8px" }}
                  className="not-prose ml-auto flex-shrink min-w-0 px-1.5 py-0.5 font-mono rounded-md bg-gray-600/70 text-gray-300 uppercase truncate"
                >
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
              className={cn(
                "not-prose max-w-full",
                "whitespace-pre-wrap",
                "break-words",
                "overflow-x-auto",
                embeddedInTabFrame
                  ? "!p-0 !m-0 !bg-transparent !border-0 !rounded-none"
                  : "p-4 text-gray-900 dark:text-gray-100",
                "text-xs",
                "custom-scrollbar",
                "![text-shadow:none] [&_*]:![text-shadow:none]",
                "[&_*]:!bg-transparent",
                isMaximized && !embeddedInTabFrame && "overflow-auto max-h-full",
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
          </div>
        )}
      </div>
    </div>
  );
};

// Type assertion to ensure component type is correct
CodeBlock.displayName = "CodeBlock";
