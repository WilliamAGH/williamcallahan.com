/**
 * Container for rendering floating action buttons for minimized/closed windows.
 * Uses the GlobalWindowRegistryContext to find windows that need a restore button.
 */

"use client";

import { useWindowRegistry } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";

export function FloatingRestoreButtons() {
  const { windows, restoreWindow } = useWindowRegistry();

  // Filter for windows that are minimized or closed
  const windowsToRestore = Object.values(windows).filter((win) => win.state === "minimized" || win.state === "closed");

  // If no windows need restoring, render nothing
  if (windowsToRestore.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex items-center space-x-2">
      {windowsToRestore.map((win) => {
        const IconComponent = win.icon; // Get the icon component
        return (
          <button
            key={win.id}
            onClick={() => restoreWindow(win.id)}
            type="button"
            className={cn(
              "p-3 rounded-full",
              "bg-blue-600 hover:bg-blue-700 text-white", // Base style - might want variations
              "shadow-lg transition-opacity duration-300 ease-in-out",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
              // Opacity/pointer-events handled by the conditional rendering above
            )}
            aria-label={win.title || `Restore ${win.id}`}
            title={win.title || `Restore ${win.id}`}
          >
            <IconComponent className="h-6 w-6" />
          </button>
        );
      })}
    </div>
  );
}
