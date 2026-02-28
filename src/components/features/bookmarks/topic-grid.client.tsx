"use client";

import type { ReactNode } from "react";

export function TopicGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>;
}
