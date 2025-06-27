/**
 * Accelerator Badge Component
 */

import type { Accelerator } from "@/types/accelerator";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import Image from "next/image";

export function AcceleratorBadge({ accelerator }: { accelerator: Accelerator }) {
  const { program, batch, location } = accelerator;

  const programName = program === "techstars" ? "Techstars" : "Y Combinator";
  const programClass =
    program === "techstars"
      ? "bg-[#0C9EE0]/10 border-[#0C9EE0]/20 text-[#0C9EE0]"
      : "bg-[#FF6600]/10 border-[#FF6600]/20 text-[#FF6600]";

  return (
    <div
      className={`inline-flex items-center gap-3 px-5 sm:px-3 py-2.5 sm:py-1.5 rounded-full ${programClass} border w-fit max-w-full`}
    >
      <div className="flex items-center gap-3 min-w-0 px-1">
        <div className="relative w-4 h-4 flex-none">
          <Image
            src={getStaticImageUrl(`/images/${program}-logo.svg`)}
            alt={programName}
            width={16}
            height={16}
            className="object-contain"
            priority
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-1.5 text-xs">
          <span className="font-semibold">{programName}</span>
          <span className="hidden sm:inline opacity-50">•</span>
          <span className="opacity-75">{batch}</span>
          <span className="hidden sm:inline opacity-50">•</span>
          <span className="opacity-75">{location}</span>
        </div>
      </div>
    </div>
  );
}
