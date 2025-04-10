/**
 * Window Controls Component
 *
 * Renders macOS-style window control buttons with optional click handlers.
 *
 * @module components/ui/navigation/window-controls
 * It is a shared component (server and client)
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
  // Unified text sizes - medium now matches large to standardize appearance
  const textSizeClass = size === 'sm' ? 'text-[5px]' : 'text-[8px]'; // 'md' and 'lg' both use text-[8px]

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
  // Unify the 'md' size with 'lg' to make traffic lights consistent across components
  const buttonSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-3.5 h-3.5'; // Both 'md' and 'lg' use w-3.5 h-3.5
  const spacingClass = size === 'sm' ? 'space-x-1' : 'space-x-2'; // Both 'md' and 'lg' use space-x-2
  const marginClass = size === 'sm' ? 'mr-1.5' : 'mr-3.5'; // Both 'md' and 'lg' use mr-3.5

  return (
    <div className={`flex items-center flex-shrink-0 ${spacingClass} ${marginClass} ${className}`}> {/* Added flex-shrink-0 */}
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
