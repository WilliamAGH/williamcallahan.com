/**
 * Discord Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { baseIconProps } from './base-icon';

export const Discord = forwardRef<SVGSVGElement, LucideProps>(function Discord(
  props,
  ref
) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      {...props}
      className={`${props.className || ''} discord-icon`}
      viewBox="0 0 24 24"
      data-transform-fix="true"
    >
      <path
        d="M18 9c.6 0 1 .4 1 1v5c0 .6-.4 1-1 1H9l-2 2H5a1 1 0 0 1-1-1V10c0-.6.4-1 1-1h13Zm-5-2.5c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2Zm-6 0c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2Z"
        fill="currentColor"
      />
    </svg>
  );
});

Discord.displayName = 'Discord';