/**
 * Window Controls Component
 *
 * Renders macOS-style window control buttons with optional click handlers.
 */

// No longer needs "use client" as it's purely presentational again

interface WindowControlsProps {
  className?: string;
  onClose?: () => void; // Revert to original prop types
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
  // Revert to original prop names
  onClose,
  onMinimize,
  onMaximize,
}: WindowControlsProps) {
  // Remove context usage and diagnostic logging

  return (
    <div className={`flex items-center space-x-2 mr-4 ${className}`}>
      {/* Close Button */}
      <button
        aria-label="Close"
        title="Close"
        className="relative group w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center"
        onClick={onClose}
        disabled={!onClose} // Disable based solely on prop presence
      >
        <HoverIcon icon="✕" />
      </button>
      {/* Minimize Button */}
      <button
        aria-label="Minimize"
        title="Minimize"
        className="relative group w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors flex items-center justify-center"
        onClick={onMinimize}
        disabled={!onMinimize} // Disable based solely on prop presence
      >
        <HoverIcon icon="−" />
      </button>
      {/* Maximize/Restore Button */}
      <button
        aria-label="Maximize/Restore" // Keep updated label
        title="Maximize/Restore" // Keep updated title
        className="relative group w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center"
        onClick={onMaximize}
        disabled={!onMaximize} // Disable based solely on prop presence
      >
        <HoverIcon icon="+" /> {/* Icon remains static for now */}
      </button>
    </div>
  );
}
