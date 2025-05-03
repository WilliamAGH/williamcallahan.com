/**
 * Floating action button to restore the minimized or closed terminal window.
 */

"use client";

import React from 'react';
import { Terminal as TerminalIcon } from 'lucide-react'; // Assuming you use lucide-react for icons
import { useTerminalWindow } from '@/lib/context/terminal-window-state-context.client';
import { cn } from '@/lib/utils';

export function FloatingTerminalButton() {
  const {
    windowState,
    restoreWindow,
    isReady
  } = useTerminalWindow();

  // Don't render anything until the state is ready (hydrated)
  if (!isReady) {
    return null;
  }

  // Only render the button if the window is minimized or closed
  const isVisible = windowState === 'minimized' || windowState === 'closed';

  return (
    <button
      type="button"
      onClick={restoreWindow}
      className={cn(
        "fixed bottom-4 right-4 z-[950] p-3 rounded-full",
        "bg-blue-600 hover:bg-blue-700 text-white",
        "shadow-lg transition-opacity duration-300 ease-in-out",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        isVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      aria-label="Restore Terminal"
      title="Restore Terminal"
      disabled={!isVisible} // Disable button when not visible to prevent accidental interaction
    >
      <TerminalIcon className="h-6 w-6" />
    </button>
  );
}