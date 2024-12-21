/**
 * Accelerator Badge Component
 * 
 * Displays an accelerator badge with logo and name.
 * Used to showcase participation in startup accelerator programs.
 */

import Image from 'next/image';
import type { Accelerator } from '@/types/accelerator';

interface AcceleratorBadgeProps {
  readonly accelerator: Accelerator;
  readonly className?: string;
}

export function AcceleratorBadge({ accelerator, className = '' }: AcceleratorBadgeProps) {
  const programName = accelerator.program === 'techstars' ? 'Techstars' : 'Y Combinator';
  const programClass = accelerator.program === 'techstars' 
    ? 'bg-[#0C9EE0]/10 border-[#0C9EE0]/20 text-[#0C9EE0]' 
    : 'bg-[#FF6600]/10 border-[#FF6600]/20 text-[#FF6600]';

  // Default logo paths for each program
  const defaultLogo = accelerator.program === 'techstars' 
    ? '/images/techstars-logo.svg'
    : '/images/ycombinator-logo.svg';

  return (
    <div 
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${programClass} border ${className}`}
      aria-label={`${programName} Accelerator Badge`}
    >
      <Image
        src={accelerator.logo ?? defaultLogo}
        alt={`${programName} logo`}
        width={16}
        height={16}
        className="h-4 w-4"
      />
      <span className="text-xs font-medium whitespace-nowrap">
        {programName} • {accelerator.batch} • {accelerator.location}
      </span>
    </div>
  );
}