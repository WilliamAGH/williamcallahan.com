"use client";

import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { SocialListClient } from "./social-list.client";
import { WindowControls } from "@/components/ui/navigation/window-controls";

import type { SocialWindowContentProps } from "@/types";

export function SocialWindowContent({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  hasMounted,
}: SocialWindowContentProps) {
  // If not mounted yet, return a skeleton with the exact same structure
  if (!hasMounted) {
    return (
      <div
        className="relative max-w-5xl mx-auto mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden h-[600px]"
        suppressHydrationWarning
      />
    );
  }

  const isMaximized = windowState === "maximized";

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        // Maximize: Use fixed positioning, take full screen except header/footer space
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40"
          : // Normal: Default flow, maybe some margin
            "relative max-w-5xl mx-auto mt-8",
      )}
    >
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
          <h1 className="text-xl font-mono ml-4">~/contact</h1>
        </div>
      </div>

      <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
        <Suspense
          fallback={
            <div className="animate-pulse space-y-4 p-6">
              {Array.from({ length: 3 }, () => (
                <div
                  key={crypto.randomUUID()}
                  className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg"
                />
              ))}
            </div>
          }
        >
          {children}
          <SocialListClient />
        </Suspense>
      </div>
    </div>
  );
}
