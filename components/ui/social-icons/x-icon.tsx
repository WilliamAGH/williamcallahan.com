/**
 * X (Twitter) Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
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
      className={`${props.className || ''} x-icon`}
      viewBox="0 0 24 24"
      data-transform-fix="true"
    >
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  );
});

X.displayName = 'X';