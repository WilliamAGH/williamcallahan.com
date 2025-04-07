/**
 * Window Controls Component
 *
 * Renders macOS-style window control buttons with optional click handlers.
 */

interface WindowControlsProps {
  className?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

// Helper component for the hover icons
const HoverIcon = ({ icon }: { icon: string }) => (
  <span className="absolute inset-0 flex items-center justify-center text-black text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
    {icon}
  </span>
);

export function WindowControls({
  className = '',
  onClose,
  onMinimize,
  onMaximize,
}: WindowControlsProps) {
  return (
    <div className={`flex items-center space-x-2 mr-4 ${className}`}>
      {/* Close Button */}
      <button
        aria-label="Close"
        title="Close"
        className="relative group w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center"
        onClick={onClose}
        disabled={!onClose} // Disable if no handler provided
      >
        <HoverIcon icon="✕" />
      </button>
      {/* Minimize Button */}
      <button
        aria-label="Minimize"
        title="Minimize"
        className="relative group w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors flex items-center justify-center"
        onClick={onMinimize}
        disabled={!onMinimize}
      >
        <HoverIcon icon="−" />
      </button>
      {/* Maximize/Restore Button */}
      <button
        aria-label="Maximize"
        title="Maximize"
        className="relative group w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center"
        onClick={onMaximize}
        disabled={!onMaximize}
      >
        <HoverIcon icon="+" />
      </button>
    </div>
  );
}