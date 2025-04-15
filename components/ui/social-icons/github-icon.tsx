/**
 * GitHub Icon Component Wrapper
 *
 * Custom wrapper for the GitHub icon to ensure proper vertical alignment.
 */

import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { Github as GithubOriginal } from 'lucide-react';
import { cn } from '@/lib/utils';

export const GitHub = forwardRef<SVGSVGElement, LucideProps>(function GitHub(
  props,
  ref
) {
  return (
    <GithubOriginal
      ref={ref}
      {...props}
      className={cn(
        'translate-y-[0.5px]',
        props.className
      )}
    />
  );
});

GitHub.displayName = 'GitHub';