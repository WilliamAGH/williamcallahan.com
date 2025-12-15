/**
 * Terminal Component Types
 *
 * SCOPE: Types for the interactive terminal component and its sub-components.
 */

// Import discriminated union types from domain
import type { TerminalCommand } from "../terminal";

// Terminal Component Types
export interface TerminalProps {
  /** Optional callback when navigation occurs */
  onNavigate?: (path: string) => void;
  /** Initial command history */
  initialHistory?: TerminalCommand[];
  maxItems?: number;
}

export interface CommandInputProps {
  /** Current input value */
  value: string;
  /** Callback when input changes */
  onChange: (value: string) => void;
  /** Callback when command is submitted */
  onSubmit: (command: string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
}

export interface TerminalContextValue {
  /** Current command history */
  history: TerminalCommand[];
  /** Add a command to history */
  addCommand: (command: TerminalCommand) => void;
  /** Clear command history */
  clearHistory: () => void;
  /** Current input value */
  currentInput: string;
  /** Set current input value */
  setCurrentInput: (input: string) => void;
}

export interface TerminalContextType extends TerminalContextValue {
  resetTerminal: () => void;
  addToHistory: (command: TerminalCommand) => void;
  removeFromHistory: (commandId: string) => void;
}

export interface TerminalHeaderProps {
  /** Window title */
  title?: string;
  /** Whether the terminal is active */
  isActive?: boolean;
  /** Optional close callback */
  onClose?: () => void;
  /** Optional minimize callback */
  onMinimize?: () => void;
  /** Optional maximize callback */
  onMaximize?: () => void;
  /** Whether window is maximized */
  isMaximized?: boolean;
}

export interface SelectionViewProps {
  items: Array<{
    id: string;
    label: string;
    description: string;
    path: string;
  }>;
  onSelectAction: (item: { id: string; label: string; description: string; path: string }) => void;
  onExitAction: () => void;
  /** Ref to the scrollable container that should be kept in sync */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export interface HistoryProps {
  /** Command history to display */
  history: TerminalCommand[];
  /** Maximum number of commands to show */
  maxItems?: number;
  /**
   * Display mode for filtering history
   * - "default": Show all command types (standard terminal mode)
   * - "chat": Show only chat messages (AI chat mode)
   */
  mode?: "default" | "chat";
}

/**
 * Section keys for terminal navigation - single source of truth
 * Add new sections here and they'll automatically be available in SectionKey type
 */
export const SECTION_KEYS = [
  "home",
  "investments",
  "experience",
  "education",
  "projects",
  "blog",
  "bookmarks",
  "bookmark",
  "books",
  "thoughts",
  "aventure",
  "tsbank",
  "seekinvest",
  "callahan-financial",
  "mutual-first",
  "morningstar",
] as const;

/** Section key type for terminal navigation sections - derived from SECTION_KEYS */
export type SectionKey = (typeof SECTION_KEYS)[number];

import type { WindowStateValue } from "./window";

export interface TerminalWindowStateContextType {
  windowState: WindowStateValue;
  closeWindow: () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  restoreWindow: () => void;
  isReady: boolean;
}

export interface TerminalWindowStateProviderProps {
  children: React.ReactNode;
  terminalId: string;
  initialState?: WindowStateValue;
}

/**
 * Props for the TerminalSearchHint component
 * Displays a keyboard shortcut badge to hint users to use ⌘K/Ctrl+K
 */
export interface TerminalSearchHintProps {
  /** Context determines the content type referenced in the hint text */
  context?: "bookmarks" | "blog" | "projects" | "books" | "thoughts";
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Chat TUI Component Props
// ─────────────────────────────────────────────────────────────────────────────

/** Props for the AI Chat header bar with exit button */
export interface AiChatHeaderProps {
  /** Callback to clear chat history and exit chat mode */
  onClearAndExit: () => void;
}

/** Props for the AI Chat input field and thinking indicator */
export interface AiChatInputProps {
  /** Whether a request is currently in progress */
  isSubmitting: boolean;
  /** Optional queue status message */
  queueMessage?: string | null;
  /** Callback to send a chat message */
  onSend: (userText: string) => Promise<void> | void;
  /** Callback to clear and exit chat mode */
  onClearAndExit: () => void;
  /** Callback to cancel the current request */
  onCancelRequest: () => void;
}
