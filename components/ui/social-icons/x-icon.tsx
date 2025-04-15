/**
 * X (Twitter) Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { baseIconProps } from './base-icon';

export const X = forwardRef<SVGSVGElement, LucideProps>(function X(props, ref) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      {...props}
      style={{ transform: 'translateY(0.5px)' }} // Use CSS transform instead of SVG attribute
    >
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  );
});

X.displayName = 'X';