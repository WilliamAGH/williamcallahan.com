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
}

export interface HistoryProps {
  /** Command history to display */
  history: TerminalCommand[];
  /** Maximum number of commands to show */
  maxItems?: number;
}

/** Section key type for terminal navigation sections */
export type SectionKey =
  | "home"
  | "investments"
  | "experience"
  | "education"
  | "skills"
  | "blog"
  | "bookmarks"
  | "bookmark"
  | "aventure"
  | "tsbank"
  | "seekinvest"
  | "callahan-financial"
  | "mutual-first"
  | "morningstar";

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
