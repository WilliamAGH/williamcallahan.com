/**
 * Terminal Domain Types
 *
 * SCOPE: Core terminal functionality, commands, and business logic.
 * BOUNDARY: Domain types only - component props belong in types/ui/terminal.ts
 */

import { z } from "zod";

// Base interfaces for terminal items
export interface SelectionItem {
  id: string;
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

export interface SearchingCommand extends BaseTerminalCommand {
  type: "searching";
  query: string;
  scope?: string;
}

export interface ChatCommand extends BaseTerminalCommand {
  type: "chat";
  role: "user" | "assistant";
  content: string;
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
  | HelpCommand
  | SearchingCommand
  | ChatCommand;

/**
 * Special actions that require client-side handling beyond navigation
 */
export type TerminalAction = "signOut";

export interface CommandResult {
  results: TerminalCommand[];
  selectionItems?: SelectionItem[];
  navigation?: string;
  clear?: boolean;
  /** Special action to execute (e.g., signOut requires Clerk hook) */
  action?: TerminalAction;
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

export function isSearchingCommand(command: TerminalCommand): command is SearchingCommand {
  return command.type === "searching";
}

export function isChatCommand(command: TerminalCommand): command is ChatCommand {
  return command.type === "chat";
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
    case "searching":
      return isSearchingCommand(cmd);
    case "chat":
      return isChatCommand(cmd);
    default:
      return false;
  }
}

export function isTerminalCommandArray(data: unknown): data is TerminalCommand[] {
  return Array.isArray(data) && data.every(isTerminalCommand);
}

/**
 * Zod Schema for Terminal Search API Validation
 * Terminal search returns SelectionItem format, not the general SearchResult format
 */
export const TerminalSearchResultSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string(),
  path: z.string(),
});

// Schema for parsing potentially incomplete data from APIs
const PartialTerminalSearchResultSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  path: z.string().optional(),
});

export const TerminalSearchApiResponseSchema = z.union([
  z.array(PartialTerminalSearchResultSchema),
  z.object({ results: z.array(PartialTerminalSearchResultSchema) }),
]);

export function parseTerminalSearchResponse(data: unknown): TerminalSearchResult[] {
  const parsed = TerminalSearchApiResponseSchema.parse(data);
  const rawResults = Array.isArray(parsed) ? parsed : parsed.results;

  // Transform partial results to complete SelectionItems with fallbacks
  return rawResults
    .filter(
      (item): item is { id?: string; label?: string; description?: string; path?: string } =>
        typeof item === "object" && item !== null,
    )
    .map(
      (item): TerminalSearchResult => ({
        id: item.id || crypto.randomUUID(),
        label: item.label || "Untitled",
        description: item.description || "",
        path: item.path || "#",
      }),
    );
}
