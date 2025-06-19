/**
 * Tabs Component Types
 *
 * SCOPE: Types for tabbed interfaces, including shell tabs and macOS-style frame tabs.
 */
import type { ReactNode } from "react";

// Shell Parent Tabs Component Types
export interface TabItem {
  /** Tab identifier */
  id: string;
  /** Tab label */
  label: string;
  /** Tab content */
  content: ReactNode;
  /** Whether tab is disabled */
  disabled?: boolean;
  /** Tab icon */
  icon?: ReactNode;
}

export interface ShellTabProps {
  /** The label to display for the tab. */
  label: string;
  /** The content to render within the tab. */
  children: ReactNode;
  /** Whether this tab should be selected by default. */
  isDefault?: boolean;
}

export interface ShellParentTabsContextProps {
  /** The label of the currently active tab. */
  activeTab: string;
  /** Function to set the active tab. */
  setActiveTab: (label: string) => void;
  /** Array of tab labels and their generated IDs. */
  tabs: Array<{ label: string; id: string }>;
  /** Base ID used for generating unique IDs for tab elements. */
  baseId: string;
}

export interface ShellParentTabsProps {
  /** Array of tabs */
  tabs: TabItem[];
  /** Currently active tab ID */
  activeTab?: string;
  /** Callback when tab changes */
  onTabChange?: (tabId: string) => void;
  /** Custom CSS classes */
  className?: string;
  /** Tab orientation */
  orientation?: "horizontal" | "vertical";
}

export interface TabsContentProps {
  /** Tab content */
  children: ReactNode;
  /** Tab ID */
  value: string;
  /** Whether content is active */
  isActive?: boolean;
}

// Instruction macOS Frame Tabs Component Types
export interface FrameTab {
  /** Tab identifier */
  id: string;
  /** Tab title */
  title: string;
  /** Tab content */
  content: ReactNode;
  /** Tab URL (for browser-like tabs) */
  url?: string;
  /** Whether tab is active */
  active?: boolean;
  /** Whether tab can be closed */
  closable?: boolean;
}

export interface InstructionMacOSFrameTabsProps {
  /** One or more InstructionMACOSTab components */
  children: ReactNode;
  /** Optional CSS class names to apply to the main window container */
  className?: string;
}

export interface InstructionMACOSTabProps {
  /** The label displayed on the tab button. Required. */
  label: string;
  /** The content to be rendered when this tab is active. Required. */
  children: ReactNode;
  /** If true, this tab will be selected by default when the component mounts. Optional. */
  isDefault?: boolean;
}

export interface InstructionMacOSFrameTabsContextProps {
  /** The label of the currently active tab, or null if none is active. */
  activeTab: string | null;
  /** Function to set the active tab by its label. */
  setActiveTab: (label: string) => void;
  /** An array of objects, each representing a tab with its label and unique ID. */
  tabs: Array<{ label: string; id: string }>;
  /** A base ID string used for generating unique, accessible IDs for tab elements. */
  baseId: string;
}

export interface MacOSFrameProps {
  /** Frame content */
  children: ReactNode;
  /** Frame title */
  title?: string;
  /** Whether frame is active */
  isActive?: boolean;
  /** Custom CSS classes */
  className?: string;
}

export interface BrowserTabProps {
  /** Tab data */
  tab: FrameTab;
  /** Whether tab is active */
  isActive?: boolean;
  /** Click callback */
  onClick?: () => void;
  /** Close callback */
  onClose?: () => void;
}
