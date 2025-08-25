/**
 * External Link Component
 * A React component that renders an external link with proper SEO metadata and accessibility attributes
 *
 * @module components/ui/external-link
 */

"use client";

import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { ExternalLinkProps } from "@/types";

import React, { Children, isValidElement, type JSX } from "react";

/**
 * A component that renders an external link with proper SEO and accessibility attributes
 * If no href is provided, renders a span instead of an anchor
 *
 * @component
 * @example
 * // Basic usage
 * <ExternalLink href="https://example.com">Visit Example</ExternalLink>
 *
 * // With custom title and no icon
 * <ExternalLink href="https://example.com" title="Learn more about Example" showIcon={false}>
 *   Example Site
 * </ExternalLink>
 *
 * // Without href (renders as span)
 * <ExternalLink>Example Text</ExternalLink>
 */
export function ExternalLink({
  href,
  children,
  showIcon = true,
  className = "",
  title,
  rawTitle = false,
}: ExternalLinkProps): JSX.Element {
  const baseClassName = `inline-flex items-center gap-1 ${className}`;

  // If no href is provided, render as span
  if (!href) {
    return <span className={baseClassName}>{children}</span>;
  }

  // Normalize children: if MDX wrapped text in a <p>, unwrap it to avoid invalid <a><p/></a> markup
  const unwrapParagraph = (node: React.ReactNode): React.ReactNode => {
    if (isValidElement<{ children?: React.ReactNode }>(node) && node.type === "p") {
      return node.props.children;
    }
    return node;
  };

  const normalizedChildrenArray = Children.toArray(children).map(unwrapParagraph);
  const normalizedChildren =
    normalizedChildrenArray.length === 1 ? normalizedChildrenArray[0] : normalizedChildrenArray;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`${baseClassName} hover:text-gray-600 dark:hover:text-gray-300 transition-colors`}
      title={rawTitle ? title : title || `Visit ${href} (opens in new tab)`}
    >
      {normalizedChildren}
      {showIcon && <ExternalLinkIcon className="w-4 h-4" aria-label="Opens in new tab" />}
    </a>
  );
}
