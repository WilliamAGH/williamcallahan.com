/**
 * Terminal Domain Types
 *
 * SCOPE: Core terminal functionality, commands, and business logic.
 * BOUNDARY: Domain types only - component props belong in types/ui/terminal.ts
 */

// Base interfaces for terminal items
export interface SelectionItem {
  label: string;
  description: string;
  path: string;
}

/**
 * A more specific type for terminal search results.
 * It is compatible with SelectionItem but provides a clearer name.
 */
export type TerminalSearchResult = SelectionItem;

// Discriminated union types for terminal commands
export interface BaseTerminalCommand {
  id: string;
  input: string;
  timestamp: number;
}

export interface TextOutputCommand extends BaseTerminalCommand {
  type: "text";
  output: string;
}

export interface SelectionCommand extends BaseTerminalCommand {
  type: "selection";
  items: SelectionItem[];
  selectedIndex?: number;
}

export interface NavigationCommand extends BaseTerminalCommand {
  type: "navigation";
  targetPath: string;
  output: string;
}

export interface ErrorCommand extends BaseTerminalCommand {
  type: "error";
  error: string;
  details?: string;
}

export interface ClearCommand extends BaseTerminalCommand {
  type: "clear";
  output: "";
}

export interface HelpCommand extends BaseTerminalCommand {
  type: "help";
  commands: Array<{
    name: string;
    description: string;
    usage?: string;
  }>;
}

/**
 * Discriminated union for all terminal command types
 */
export type TerminalCommand =
  | TextOutputCommand
  | SelectionCommand
  | NavigationCommand
  | ErrorCommand
  | ClearCommand
  | HelpCommand;

/**
 * Legacy terminal command interface for backward compatibility
 * @deprecated Use discriminated TerminalCommand types instead
 */
export interface LegacyTerminalCommand {
  input: string;
  output: string;
  timestamp?: number;
}

export interface CommandResult {
  results: TerminalCommand[];
  selectionItems?: SelectionItem[];
  navigation?: string;
  clear?: boolean;
}

/**
 * Type guards for terminal commands
 */
export function isSelectionCommand(command: TerminalCommand): command is SelectionCommand {
  return command.type === "selection";
}

export function isNavigationCommand(command: TerminalCommand): command is NavigationCommand {
  return command.type === "navigation";
}

export function isErrorCommand(command: TerminalCommand): command is ErrorCommand {
  return command.type === "error";
}

export function isTextCommand(command: TerminalCommand): command is TextOutputCommand {
  return command.type === "text";
}

export function isClearCommand(command: TerminalCommand): command is ClearCommand {
  return command.type === "clear";
}

export function isHelpCommand(command: TerminalCommand): command is HelpCommand {
  return command.type === "help";
}

export function isTerminalCommand(item: unknown): item is TerminalCommand {
  if (typeof item !== "object" || item === null) return false;

  const cmd = item as TerminalCommand;

  // Basic validation for common fields
  if (
    typeof cmd.id !== "string" ||
    typeof cmd.input !== "string" ||
    typeof cmd.timestamp !== "number" ||
    typeof cmd.type !== "string"
  ) {
    return false;
  }

  // Type-specific validation
  switch (cmd.type) {
    case "text":
      return isTextCommand(cmd);
    case "selection":
      return isSelectionCommand(cmd);
    case "navigation":
      return isNavigationCommand(cmd);
    case "error":
      return isErrorCommand(cmd);
    case "clear":
      return isClearCommand(cmd);
    case "help":
      return isHelpCommand(cmd);
    default:
      return false;
  }
}

export function isTerminalCommandArray(data: unknown): data is TerminalCommand[] {
  return Array.isArray(data) && data.every(isTerminalCommand);
}
