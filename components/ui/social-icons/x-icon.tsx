/**
 * X (Twitter) Icon Component
 * 
 * Custom SVG icon component for X (formerly Twitter) logo.
 * Maintains consistent sizing and styling with other social icons.
 */

import { forwardRef } from 'react';
import { baseIconProps } from './base-icon';
import type { LucideProps } from 'lucide-react';

export const X = forwardRef<SVGSVGElement, LucideProps>(function X(props, ref) {
  return (
    <svg 
      {...baseIconProps} 
      {...props}
      ref={ref}
      aria-hidden="true"
      focusable="false"
    >
      <title>X (formerly Twitter)</title>
      <desc>X logo (formerly Twitter)</desc>
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M20 4h-4.267l-11.733 16h4.267l11.733 -16z" />
    </svg>
  );
});

X.displayName = 'X';