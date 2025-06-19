/**
 * Terminal Header Component
 *
 * Renders the decorative header of the terminal interface with
 * macOS-style window control buttons.
 *
 * This is a shared component that can be used in both client and server contexts.
 */

// No "use client" directive needed as it doesn't use client-side hooks directly
import { WindowControls } from "@/components/ui/navigation/window-controls";
import type { TerminalHeaderProps } from "@/types/ui/terminal";

export function TerminalHeader(props: TerminalHeaderProps) {
  // Remove internal handlers and context usage

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Pass the received handlers directly to WindowControls */}
      <WindowControls {...props} />
      {/* Add any other header elements here if needed */}
    </div>
  );
}
