/**
 * External Link Component
 * A React component that renders an external link with proper SEO metadata and accessibility attributes
 *
 * @module components/ui/external-link
 */

"use client";

import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import type { ExternalLinkProps } from "@/types/ui/forms";
import { cn } from "@/lib/utils";

import React, { Children, isValidElement, type AnchorHTMLAttributes, type JSX } from "react";

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
  icon,
  target,
  rel,
  ...attributes
}: Readonly<
  ExternalLinkProps & Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "target">
>): JSX.Element {
  void target;
  void rel;
  // Plain inline flow: `inline-flex` fragments across line breaks and detaches the
  // trailing icon (mobile overflow); an inline icon wraps as a glyph instead.
  if (!href) {
    return (
      <span {...attributes} className={className} title={title}>
        {children}
      </span>
    );
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
      {...attributes}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className, "hover:text-gray-600 dark:hover:text-gray-300 transition-colors")}
      title={rawTitle ? title : title || `Visit ${href} (opens in new tab)`}
    >
      {normalizedChildren}
      {icon ??
        (showIcon ? (
          <ExternalLinkIcon
            className="inline-block h-[1em] w-[1em] ml-0.5 align-[-0.125em]"
            aria-hidden="true"
          />
        ) : null)}
    </a>
  );
}
