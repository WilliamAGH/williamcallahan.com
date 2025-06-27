/**
 * Window Component Types
 *
 * SCOPE: Types for windowed UI components, like macOS-style windows and frames.
 */
import type { ImageProps } from "next/image";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface MacOSWindowProps {
  /** Window content */
  children: ReactNode;
  /** Window title */
  title?: string;
  /** Whether window is active/focused */
  isActive?: boolean;
  /** Whether window can be closed */
  closable?: boolean;
  /** Whether window can be minimized */
  minimizable?: boolean;
  /** Whether window can be maximized */
  maximizable?: boolean;
  /** Close callback */
  onClose?: () => void;
  /** Minimize callback */
  onMinimize?: () => void;
  /** Maximize callback */
  onMaximize?: () => void;
  /** Custom CSS classes */
  className?: string;
  isMaximized?: boolean;
}

export interface WindowTab {
  id: string;
  label: string;
}

export interface MacOSWindowExtendedProps extends MacOSWindowProps {
  contentClassName?: string;
  tabs?: WindowTab[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  /** To control traffic light appearance */
  showTrafficLights?: boolean;
  /** Whether window is maximized */
  isMaximized?: boolean;
}

export interface WindowControlsProps {
  /** Whether window is active */
  isActive?: boolean;
  /** Whether close button is enabled */
  closable?: boolean;
  /** Whether minimize button is enabled */
  minimizable?: boolean;
  /** Whether maximize button is enabled */
  maximizable?: boolean;
  /** Close callback */
  onClose?: () => void;
  /** Minimize callback */
  onMinimize?: () => void;
  /** Maximize callback */
  onMaximize?: () => void;
  /** Additional CSS classes to apply to the container */
  className?: string;
  /** Size variant for responsive controls */
  size?: "sm" | "md" | "lg";
  /** Flag to indicate if window is currently maximized (affects button icon) */
  isMaximized?: boolean;
}

export interface ImageWindowProps extends ImageProps {
  /** Optional className override for the main wrapper */
  wrapperClassName?: string;
  /** Control vertical spacing */
  noMargin?: boolean;
  /** Window title */
  title?: string;
  /** Whether window is active */
  isActive?: boolean;
  /** Close callback */
  onClose?: () => void;
  isMaximized?: boolean;
}

export type WindowStateValue = "normal" | "minimized" | "maximized" | "closed";

export interface WindowInstanceInfo {
  id: string;
  state: WindowStateValue;
  icon: LucideIcon;
  title: string;
}

export interface GlobalWindowRegistryContextType {
  windows: Record<string, WindowInstanceInfo>;
  registerWindow: (id: string, icon: LucideIcon, title: string, initialState?: WindowStateValue) => void;
  unregisterWindow: (id: string) => void;
  setWindowState: (id: string, state: WindowStateValue) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  getWindowState: (id: string) => WindowInstanceInfo | undefined;
}

export interface GlobalWindowRegistryProviderProps {
  children: ReactNode;
}

export interface RegisteredWindowState {
  windowState: WindowStateValue;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  restore: () => void;
  setState: (state: WindowStateValue) => void;
  isRegistered: boolean;
}
