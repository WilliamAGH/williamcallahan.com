/**
 * Terminal Header Component
 *
 * Renders the decorative header of the terminal interface with
 * macOS-style window control buttons on the left and a clear button on the right.
 *
 * This is a shared component that can be used in both client and server contexts.
 */

// No "use client" directive needed as it doesn't use client-side hooks directly
import { WindowControls } from "@/components/ui/navigation/window-controls";
import type { TerminalHeaderProps } from "@/types/ui/terminal";

export function TerminalHeader({ onClear, ...windowControlProps }: TerminalHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      {/* Window controls on the left */}
      <WindowControls {...windowControlProps} />

      {/* Clear button on the right - always visible */}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors text-xs"
          aria-label="Clear terminal"
          title="Clear terminal (Esc)"
        >
          Clear
        </button>
      )}
    </div>
  );
}
