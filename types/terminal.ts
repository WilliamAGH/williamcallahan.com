/**
 * Terminal Types
 */

export interface TerminalCommand {
  input: string;
  output: string;
}

export interface SearchResult {
  label?: string;
  title?: string;
  description?: string;
  excerpt?: string;
  path?: string;
  slug?: string;
}

export interface SelectionItem {
  label: string;
  description: string;
  path: string;
}

export interface CommandResult {
  results: TerminalCommand[];
  shouldClear?: boolean;
  selectionItems?: SelectionItem[];
  navigation?: string;
}