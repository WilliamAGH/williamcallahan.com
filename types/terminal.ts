/**
 * Terminal Types
 */

export interface TerminalCommand {
  input: string;
  output: string;
}

export interface SelectionItem {
  label: string;
  path?: string;
  value?: string;
}

export interface CommandResult {
  results: TerminalCommand[];
  selectionItems?: SelectionItem[];
  navigation?: string;
}