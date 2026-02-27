"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { SectionBreakProps } from "@/types/features/bookmarks";

export function SectionBreak({ category }: Readonly<SectionBreakProps>) {
  return (
    <div className="flex items-center gap-4 my-8 px-2 md:col-span-2">
      <Separator className="flex-1" />
      <Badge variant="outline" className="uppercase tracking-[0.16em] text-[10px]">
        More about {category}
      </Badge>
      <Separator className="flex-1" />
    </div>
  );
}
