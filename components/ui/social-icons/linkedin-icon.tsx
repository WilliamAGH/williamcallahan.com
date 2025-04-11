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
      transform="translateY(0.5)" // Adjust vertical alignment
    />
  );
});

LinkedIn.displayName = 'LinkedIn';