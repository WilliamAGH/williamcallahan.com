"use client";

import { processSvgTransforms } from "@/lib/image-handling/svg-transform-fix";
import { useEffect, useRef, type DetailedHTMLProps, type HTMLAttributes } from "react";
import { CodeBlock } from "./code-block.client";

/**
 * Server component for initial render
 * This is what gets used during MDX serialization
 */
import { cn } from "@/lib/utils"; // Import cn utility

export function MDXCodeBlockFallback(
  props: DetailedHTMLProps<HTMLAttributes<HTMLPreElement>, HTMLPreElement>,
) {
  // Destructure className and children from props
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
 * Client component that gets hydrated with the CodeBlock component
 * This prevents the useState error during MDX serialization
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
