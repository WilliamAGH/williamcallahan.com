"use client";

import React from 'react';
import type { LucideProps } from 'lucide-react';

/**
 * IconWrapper - A wrapper component for Lucide icons that works with Dark Reader
 * and ensures proper SVG transform handling
 *
 * This component renders icons with:
 * 1. Suppressed hydration warnings for SSR compatibility
 * 2. Compatibility with Dark Reader browser extension
 * 3. Support for SVG transform fixes via SvgTransformFixer
 *
 * @see {@link components/utils/svg-transform-fixer.client} - For SVG transform fixing
 */
export function IconWrapper({
  icon: Icon,
  ...props
}: {
  icon: React.ComponentType<LucideProps>;
} & LucideProps) {
  return (
    <span
      className="dark-reader-compatible-icon"
      suppressHydrationWarning
      data-honor-dark-reader="true"
      data-transform-fix-container="true"
    >
      <Icon data-transform-fix="true" {...props} />
    </span>
  );
}