/**
 * Accelerator Badge Component
 */

import Image from 'next/image';
import type { Accelerator } from '@/types/accelerator';

export function AcceleratorBadge({ accelerator }: { accelerator: Accelerator }) {
  const { program, batch, location } = accelerator;
  
  const programName = program === 'techstars' ? 'Techstars' : 'Y Combinator';
  const programClass = program === 'techstars' 
    ? 'bg-[#0C9EE0]/10 border-[#0C9EE0]/20 text-[#0C9EE0]' 
    : 'bg-[#FF6600]/10 border-[#FF6600]/20 text-[#FF6600]';
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${programClass} border`}>
      <div className="relative w-4 h-4 flex-shrink-0">
        <Image
          src={`/images/${program}-logo.svg`}
          alt={programName}
          width={16}
          height={16}
          className="object-contain"
        />
      </div>
      <span className="text-xs font-medium whitespace-nowrap">
        {programName} • {batch} • {location}
      </span>
    </div>
  );
}