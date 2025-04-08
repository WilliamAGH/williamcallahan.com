/**
 * Terminal Header Component
 *
 * Renders the decorative header of the terminal interface with
 * macOS-style window control buttons.
 */

// No longer needs "use client" if it doesn't use hooks directly
// Removed import { useTerminalContext } from './terminalContext';
import { WindowControls } from '@/components/ui/navigation/window-controls';

// Define props for the handlers
interface TerminalHeaderProps {
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export function TerminalHeader({
  onClose,
  onMinimize,
  onMaximize,
}: TerminalHeaderProps) {
  // Remove internal handlers and context usage

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Pass the received handlers directly to WindowControls */}
      <WindowControls
        onClose={onClose}
        onMinimize={onMinimize}
        onMaximize={onMaximize}
      />
      {/* Add any other header elements here if needed */}
    </div>
  );
}
