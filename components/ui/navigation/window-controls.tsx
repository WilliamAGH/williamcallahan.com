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
  size?: 'sm' | 'md' | 'lg'; // Add size prop for responsive controls
}

// Helper component for the hover icons
const HoverIcon = ({ icon, size = 'md' }: { icon: string; size?: 'sm' | 'md' | 'lg' }) => {
  // Smaller text sizes across all breakpoints
  const textSizeClass = size === 'sm' ? 'text-[4px]' : size === 'lg' ? 'text-[7px]' : 'text-[5px]';

  return (
    <span className={`absolute inset-0 flex items-center justify-center text-black ${textSizeClass} font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none`}>
      {icon}
    </span>
  );
};

export function WindowControls({
  className = '',
  // Revert to original prop names
  onClose,
  onMinimize,
  onMaximize,
  size = 'md', // Default to medium size
}: WindowControlsProps) {
  // Slightly smaller button sizes
  const buttonSize = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  const spacingClass = size === 'sm' ? 'space-x-1' : size === 'lg' ? 'space-x-2' : 'space-x-1.5';
  const marginClass = size === 'sm' ? 'mr-1.5' : size === 'lg' ? 'mr-3.5' : 'mr-2.5';

  return (
    <div className={`flex items-center ${spacingClass} ${marginClass} ${className}`}>
      {/* Close Button */}
      <button
        aria-label="Close"
        title="Close"
        className={`relative group ${buttonSize} rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center`}
        onClick={onClose}
        disabled={!onClose} // Disable based solely on prop presence
      >
        <HoverIcon icon="✕" size={size} />
      </button>
      {/* Minimize Button */}
      <button
        aria-label="Minimize"
        title="Minimize"
        className={`relative group ${buttonSize} rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors flex items-center justify-center`}
        onClick={onMinimize}
        disabled={!onMinimize} // Disable based solely on prop presence
      >
        <HoverIcon icon="−" size={size} />
      </button>
      {/* Maximize/Restore Button */}
      <button
        aria-label="Maximize/Restore" // Keep updated label
        title="Maximize/Restore" // Keep updated title
        className={`relative group ${buttonSize} rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center`}
        onClick={onMaximize}
        disabled={!onMaximize} // Disable based solely on prop presence
      >
        <HoverIcon icon="+" size={size} /> {/* Icon remains static for now */}
      </button>
    </div>
  );
}
