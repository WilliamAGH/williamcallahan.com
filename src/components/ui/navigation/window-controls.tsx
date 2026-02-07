/**
 * Window Controls Component
 *
 * Renders macOS-style window control buttons with optional click handlers.
 * Provides close, minimize, and maximize/restore functionality with responsive sizing.
 *
 * @module components/ui/navigation/window-controls
 * @description Shared component that works in both server and client contexts
 */

// No longer needs "use client" as it's purely presentational again

import type { WindowControlsProps } from "@/types/ui/window";

/**
 * Helper component for rendering hover icons on window control buttons
 * @param props - The component props
 * @param props.icon - The icon character to display on hover
 * @param props.size - The size variant affecting text size
 * @returns JSX element with the hover icon
 */
const HoverIcon = ({ icon, size = "md" }: { icon: string; size?: "sm" | "md" | "lg" }) => {
  // Unified text sizes - medium now matches large to standardize appearance
  const textSizeClass = size === "sm" ? "text-[5px]" : "text-[8px]"; // 'md' and 'lg' both use text-[8px]

  return (
    <span
      className={`absolute inset-0 flex items-center justify-center text-black ${textSizeClass} font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none`}
    >
      {icon}
    </span>
  );
};

/**
 * WindowControls component that renders macOS-style traffic light buttons
 * @param props - The component props
 * @returns JSX element with the window control buttons
 */
export function WindowControls({
  className = "",
  onClose,
  onMinimize,
  onMaximize,
  size = "md",
  isMaximized = false,
}: Readonly<WindowControlsProps>) {
  // Unify the 'md' size with 'lg' to make traffic lights consistent across components
  const buttonSize = size === "sm" ? "w-1.5 h-1.5" : "w-3.5 h-3.5"; // Both 'md' and 'lg' use w-3.5 h-3.5
  const spacingClass = size === "sm" ? "space-x-1" : "space-x-2"; // Both 'md' and 'lg' use space-x-2
  const marginClass = size === "sm" ? "mr-1.5" : "mr-3.5"; // Both 'md' and 'lg' use mr-3.5

  return (
    <div className={`flex items-center flex-shrink-0 ${spacingClass} ${marginClass} ${className}`}>
      {" "}
      {/* Added flex-shrink-0 */}
      {/* Close Button */}
      <button
        type="button"
        data-testid="close-button"
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
        type="button"
        data-testid="minimize-button"
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
        type="button"
        data-testid="maximize-button"
        aria-label={isMaximized ? "Restore" : "Maximize"}
        title={isMaximized ? "Restore" : "Maximize"}
        className={`relative group ${buttonSize} rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center`}
        onClick={onMaximize}
        disabled={!onMaximize}
      >
        <HoverIcon icon={isMaximized ? "□" : "+"} size={size} />
      </button>
    </div>
  );
}
