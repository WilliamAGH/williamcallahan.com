/**
 * Bluesky Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { baseIconProps } from './base-icon';

export const Bluesky = forwardRef<SVGSVGElement, LucideProps>(function Bluesky(
  props,
  ref
) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Centered and scaled version of the actual Bluesky logo */}
      <path
        d="M5.2 1.4c2.7 2.1 5.7 6.3 6.8 8.5 1.1-2.2 4.1-6.4 6.8-8.5 2-1.5 5.2-2.6 5.2 1 0 0.7-0.4 6.2-0.7 7.1-0.9 3.1-4 4-6.8 3.4 4.9 0.8 6.1 3.6 3.4 6.3-5.1 5.2-7.3-1.3-7.9-3-0.1-0.3-0.1-0.4-0.1-0.3 0-0.1-0.1 0-0.2 0.3-0.6 1.7-2.8 8.2-7.9 3-2.7-2.7-1.4-5.5 3.4-6.3-2.8 0.5-5.9-0.3-6.8-3.4-0.2-0.9-0.7-6.4-0.7-7.1 0-3.6 3.2-2.5 5.2-1z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeLinecap="round"
        transform="translate(0.5, 3.5) scale(0.9)" // Adjusted both horizontal (0.5px right) and vertical (3.5px down) positioning
      />
    </svg>
  );
});

Bluesky.displayName = 'Bluesky';
