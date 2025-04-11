"use client";

import React from 'react';
import { LucideProps } from 'lucide-react';

/**
 * IconWrapper - A wrapper component for Lucide icons that works with Dark Reader
 *
 * This component renders icons with suppressed hydration warnings and
 * honors Dark Reader settings instead of fighting against them.
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
    >
      <Icon {...props} />
    </span>
  );
}