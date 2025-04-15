/**
 * GitHub Icon Component Wrapper
 *
 * Custom wrapper for the GitHub icon to ensure proper vertical alignment.
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { Github as GithubOriginal } from 'lucide-react';

export const GitHub = forwardRef<SVGSVGElement, LucideProps>(function GitHub(
  props,
  ref
) {
  return (
    <GithubOriginal
      ref={ref}
      {...props}
      transform="translateY(0.5px)" // Adjust vertical alignment - add 'px' to fix parsing
    />
  );
});

GitHub.displayName = 'GitHub';