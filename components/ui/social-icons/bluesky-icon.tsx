/**
 * Bluesky Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { baseIconProps } from './base-icon';

export const Bluesky = forwardRef<SVGSVGElement, LucideProps>(function Bluesky(props, ref) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      {...props}
      className={`${props.className || ''} bluesky-icon`}
      viewBox="0 0 24 24"
      data-transform-fix="true"
    >
      <path
        d="M12.02 3.125a8.904 8.904 0 0 0-8.895 8.872v.007a8.855 8.855 0 0 0 2.058 5.694.439.439 0 0 0 .442.132l7.326-2.374a.432.432 0 0 0 .138-.056l3.648-2.146a.436.436 0 0 0 .152-.655 8.905 8.905 0 0 0-4.87-9.474Zm2.258 10.717-2.99 1.8a.438.438 0 0 0-.148.613 5.534 5.534 0 0 0 8.837-3.753.437.437 0 0 0-.704-.36l-4.995 1.7Z"
        fill="currentColor"
      />
    </svg>
  );
});

Bluesky.displayName = 'Bluesky';
