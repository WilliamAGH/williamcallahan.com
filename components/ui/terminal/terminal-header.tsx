/**
 * Terminal Header Component
 *
 * Renders the decorative header of the terminal interface with
 * macOS-style window control buttons.
 */

"use client";

import { useTerminalContext } from './terminalContext';
import { WindowControls } from '@/components/ui/navigation/window-controls';

export function TerminalHeader() {
  const { setTerminalMode, terminalMode } = useTerminalContext();

  // Define handlers specifically for the terminal context actions
  const handleClose = () => {
    console.log('Terminal Close clicked');
    setTerminalMode('closed');
  };

  const handleMinimize = () => {
    console.log('Terminal Minimize clicked');
    setTerminalMode('minimized');
  };

  const handleMaximize = () => {
    console.log('Terminal Maximize/Restore clicked');
    setTerminalMode(prev => {
      const nextMode = prev === 'maximized' ? 'normal' : 'maximized';
      console.log(`Switching terminal mode from ${prev} to ${nextMode}`);
      return nextMode;
    });
  };

  return (
    <div className="flex items-center gap-2 mb-3">
      {/* Use WindowControls component, passing specific handlers */}
      <WindowControls
        onClose={handleClose}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        // Optionally pass terminalMode if WindowControls needs it for appearance/logic
        // mode={terminalMode}
      />
      {/* Add any other header elements here if needed */}
    </div>
  );
}
