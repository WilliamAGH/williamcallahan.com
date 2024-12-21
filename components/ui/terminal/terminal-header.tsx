/**
 * Terminal Header Component
 * 
 * Renders the decorative header of the terminal interface with
 * macOS-style window control buttons.
 */

export function TerminalHeader() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-3 h-3 rounded-full bg-red-500"></div>
      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
      <div className="w-3 h-3 rounded-full bg-green-500"></div>
    </div>
  );
}