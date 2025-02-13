/**
 * Terminal Types Module
 *
 * Defines types used throughout the terminal system:
 * - Command results and history
 * - Selection items and actions
 * - Navigation and routing
 * - State management
 *
 * @module types/terminal
 * @see {@link Terminal} - Main terminal component
 * @see {@link useTerminal} - Terminal state management hook
 * @see {@link handleCommand} - Command processing function
 *  * Architecture Overview:
 * - Commands: User input processing and response generation
 * - Selections: Interactive menu system for navigation/actions
 * - State: Terminal history, input, and processing state
 * - Context: Shared terminal state and functionality
 * - Actions: User interaction handlers
 */

/**
 * Represents a single command interaction in the terminal.
 * Each command consists of user input and the system's response.
  */

/**
 * Terminal command result
 */
export interface CommandResult {
  navigation?: string;
  results: { output: string }[];
  selectionItems?: SelectionItem[];
}

/**
 * Terminal command history item
 */
export interface TerminalCommand {
  input: string;
  output: string;
}

/**
 * Selection item action type
 *
 * IMPORTANT: DO NOT MODIFY THIS TYPE TO BE A LITERAL UNION TYPE AGAIN!
 *
 * We tried to define SelectionAction as a union type ('navigate' | 'execute'),
 * but TypeScript's type inference breaks down when mapping over arrays of objects
 * and loses the literal type information, leading to "string is not assignable to SelectionAction" errors.
 *
 * To fix this, we are making SelectionAction a simple string type.
 * This allows for more flexibility and avoids complex type gymnastics and casting.
 *
 * If you want to re-introduce stricter type checking, you will need to
 * revisit the createMenuItems function in components/ui/terminal/navigationCommands.tsx
 * and ensure that TypeScript correctly infers and preserves the literal types
 * when mapping over the navigationCommands array.
 */
// Changed 'SelectionAction' type to 'string' to fix TypeScript type inference issues in createMenuItems
export type SelectionAction = string; // IMPORTANT: DO NOT revert to union type ('navigate' | 'execute')

/**
 * Selection menu item
 */
export interface SelectionItem {
  label: string;
  value: string;
  action: SelectionAction;
  path?: string;
}

/**
 * Terminal context state
 */
export interface TerminalContextState {
  isReady: boolean;
  handleCommand: (command: string | undefined | null) => Promise<CommandResult>;
}

/**
 * Terminal provider props
 */
export interface TerminalProviderProps {
  initialState?: Partial<TerminalContextState>;
  children: React.ReactNode;
}

/**
 * Terminal context value
 */
export interface TerminalContextValue extends TerminalContextState {
  clearHistory: () => Promise<void>;
}
