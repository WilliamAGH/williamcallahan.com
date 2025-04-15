/**
 * LinkedIn Icon Component Wrapper
 *
 * Custom wrapper for the LinkedIn icon to ensure proper vertical alignment.
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { Linkedin as LinkedinOriginal } from 'lucide-react';
import { baseIconProps } from './base-icon';

export const LinkedIn = forwardRef<SVGSVGElement, LucideProps>(function LinkedIn(
  props,
  ref
) {
  return (
    <LinkedinOriginal
      ref={ref}
      {...props}
      style={{ transform: 'translateY(0.5px)' }} // Use CSS transform instead of SVG attribute
    />
  );
});

LinkedIn.displayName = 'LinkedIn';