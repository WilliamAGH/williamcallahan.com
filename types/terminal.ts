/**
 * Terminal Types
 *
 * Type definitions for terminal functionality.
 */


export interface TerminalCommand {
  input: string;
  output: string;
}

export interface SelectionItem {
  label: string;
  description: string;
  path: string;
}

export interface CommandResult {
  results: TerminalCommand[];
  selectionItems?: SelectionItem[];
  navigation?: string;
  clear?: boolean;
}
