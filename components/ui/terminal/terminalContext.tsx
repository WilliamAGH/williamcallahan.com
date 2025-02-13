/**
 * Terminal Context
 *
 * @module components/ui/terminal/terminalContext
 * @see {@link Terminal} - Main terminal component
 * @see {@link useTerminal} - Terminal state management hook
 *
 * IMPORTANT: State Updates & Command Handling
 * - setHandleCommand triggers re-renders
 * - Consumers must prevent command handler recreation
 * - Use refs or effect-scoped functions for handlers
 *
 * Preventing Update Cycles:
 * To prevent infinite update cycles when using this context:
 * 1. Define command handlers inside effects
 * 2. Use refs for stable dependencies
 * 3. Implement proper cleanup
 *
 * @example
 * // Correct usage in consumer
 * useEffect(() => {
 *   const handler = async (cmd) => {...};
 *   setHandleCommand(handler);
 *   return () => setHandleCommand(defaultHandler);
 * }, [setHandleCommand]);
 */

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { FC, ReactNode } from "react";
import type { CommandResult } from "@/types/terminal";

/**
 * Terminal context state interface
 * @interface TerminalContextType
 */
interface TerminalContextType {
  isReady: boolean;
  clearHistory: () => Promise<void>;
  handleCommand?: (command: string | undefined | null) => Promise<CommandResult>;
  setHandleCommand: (handler: (command: string | undefined | null) => Promise<CommandResult>) => void;
}

/**
 * Default command handler
 * Used as fallback and during cleanup
 */
const defaultCommandHandler = async (command: string | undefined | null): Promise<CommandResult> => {
  // Handle undefined, null, or empty string cases
  if (!command || typeof command !== 'string' || command.trim() === '') {
    return {
      results: [{ output: "Please enter a command. Type 'help' for available commands." }]
    };
  }
  return { results: [{ output: "Command handler not initialized" }] };
};

/**
 * Terminal context with proper type checking
 * @internal
 */
const TerminalContext = createContext<TerminalContextType | null>(null);

/**
 * Terminal provider props interface
 * @interface TerminalProviderProps
 */
interface TerminalProviderProps {
  children: ReactNode;
  initialState?: {
    isReady?: boolean;
    handleCommand?: (command: string | undefined | null) => Promise<CommandResult>;
  };
}

/**
 * Terminal provider component
 * Manages terminal state and command handling
 *
 * IMPORTANT: Consumers must handle command handler recreation carefully
 * to prevent infinite update cycles. See documentation above for proper usage.
 *
 * @param props - Provider props including children and initial state
 * @returns Provider component that manages terminal state
 */
export const TerminalProvider: FC<TerminalProviderProps> = ({ children, initialState }) => {
  const [isReady, setIsReady] = useState(initialState?.isReady ?? true);
  const [history, setHistory] = useState<string[]>([]);
  const [commandHandler, setCommandHandler] = useState<(command: string | undefined | null) => Promise<CommandResult>>(
    initialState?.handleCommand ?? defaultCommandHandler
  );

  /**
   * Clear terminal history
   * Safe to call multiple times
   */
  const clearHistory = useCallback(async () => {
    setHistory([]);
  }, []);

  // Initialize terminal if no initial state is provided
  useEffect(() => {
    if (initialState?.isReady === undefined) {
      setIsReady(true);
    }
    return () => {
      setIsReady(false);
      setHistory([]);
      setCommandHandler(defaultCommandHandler); // Reset handler on unmount
    };
  }, [initialState?.isReady]);

  const value = {
    isReady,
    clearHistory,
    handleCommand: commandHandler,
    setHandleCommand: setCommandHandler
  };

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
};

/**
 * Hook to access terminal context
 * Must be used within TerminalProvider
 *
 * @throws Error if used outside TerminalProvider
 * @returns Terminal context value with type safety
 */
export function useTerminalContext(): TerminalContextType {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalContext must be used within TerminalProvider");
  }
  return context;
}
