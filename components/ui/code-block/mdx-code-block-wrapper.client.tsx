/**
 * MDX Code Block Wrapper Components
 *
 * This file contains two components that work together to render code blocks in MDX:
 *
 * 1. BasicMDXCodeBlock: A lightweight server-side fallback that renders during SSR
 *    - Provides basic styling without interactive features
 *    - Gets replaced by MDXCodeBlock on client hydration
 *
 * 2. MDXCodeBlock: The main client-side wrapper used by MDX content
 *    - Integrates with the full-featured CodeBlock component
 *    - Handles context-aware rendering (e.g., inside tabs)
 *    - Processes SVG transforms and manages code content
 */

"use client";

import { cn } from "@/lib/utils";
import { processSvgTransforms } from "@/lib/image-handling/svg-transform-fix";
import { useEffect, useRef } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import { CodeBlock } from "./code-block.client";

/**
 * MDXCodeBlockFallback - SSR fallback renderer for code blocks
 *
 * Renders a basic styled <pre> element during server-side rendering
 * before the full-featured MDXCodeBlock hydrates on the client.
 * This ensures proper styling and layout during initial page load.
 *
 * @param props - Standard HTML pre element props
 * @returns A minimally styled pre element wrapped in a div
 */
export function MDXCodeBlockFallback(props: DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>) {
  const { children, className, ...rest } = props;

  // Define default classes for the PRE tag - make sure they match the CodeBlock component
  const preClasses = cn(
    "not-prose",
    "text-gray-100",
    "text-xs",
    "whitespace-pre-wrap",
    "break-words",
    "custom-scrollbar",
    "border-t-0",
  );

  // Define classes for the wrapping DIV
  const wrapperClasses = cn(
    "relative group w-full",
    // No border, rounded corners handled by CodeBlock on client hydration
  );

  return (
    // Keep a simple wrapper structure for server-side rendering
    // The full styling will be applied when CodeBlock hydrates
    <div className={wrapperClasses}>
      {/* Merge incoming className (from rehypePrism) with default pre classes */}
      <pre className={cn(preClasses, className)} {...rest}>
        {children}
      </pre>
    </div>
  );
}

/**
 * Client-side MDX code block wrapper component
 *
 * This is the primary component used by MDX content to render code blocks.
 * It wraps the CodeBlock component and handles:
 * - Context detection (e.g., if inside a tab frame)
 * - SVG transform processing
 * - Code content extraction for copy functionality
 *
 * @param props - Pre element props plus optional embeddedInTabFrame flag
 * @param props.embeddedInTabFrame - If true, renders without window chrome (for use inside tabs)
 * @returns The full-featured CodeBlock component with proper context
 */
export function MDXCodeBlock(
  props: DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement> & {
    embeddedInTabFrame?: boolean;
  },
) {
  const { children, className, embeddedInTabFrame, ...rest } = props;
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Client-side only code
    if (codeRef.current) {
      const codeContent = codeRef.current.textContent || "";
      codeRef.current.setAttribute("data-code-content", codeContent);

      // Fix SVG transform attributes in any SVGs within code blocks
      const svgs = codeRef.current.querySelectorAll("svg");
      for (const svg of svgs) {
        processSvgTransforms(svg);
      }
    }
  }, []);

  return (
    <div ref={codeRef} data-mdx-code className="group w-full">
      <CodeBlock className={className} embeddedInTabFrame={embeddedInTabFrame} {...rest}>
        {children}
      </CodeBlock>
    </div>
  );
}
