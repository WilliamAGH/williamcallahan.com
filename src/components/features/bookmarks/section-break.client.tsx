"use client";

import type { SectionBreakProps } from "@/types/features/bookmarks";

export function SectionBreak({ category }: Readonly<SectionBreakProps>) {
  return (
    <div className="flex items-center gap-4 my-8 px-2 md:col-span-2">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        More about {category}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
