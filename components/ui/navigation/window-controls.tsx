/**
 * Window Controls Component
 *
 * Renders macOS-style window control buttons.
 */

interface WindowControlsProps {
  className?: string;
}

export function WindowControls({ className = '' }: WindowControlsProps) {
  return (
    <div className={`flex items-center space-x-2 mr-4 ${className}`} aria-hidden="true">
      <div className="w-3 h-3 rounded-full bg-red-500" />
      <div className="w-3 h-3 rounded-full bg-yellow-500" />
      <div className="w-3 h-3 rounded-full bg-green-500" />
    </div>
  );
}