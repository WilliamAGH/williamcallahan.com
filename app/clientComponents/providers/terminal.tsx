// app/client-components/providers/terminal.tsx

"use client";

import { createContext, useContext, useCallback } from "react";

/**
 * Terminal Context Type
 * Defines the shape of the terminal context value
 */
interface TerminalContextType {
  clearHistory: () => Promise<void>;
}

/**
 * Terminal Context
 * Provides terminal state and methods across components
 */
export const TerminalContext = createContext<TerminalContextType | null>(null);

/**
 * Terminal Provider Component
 *
 * Provides terminal state management across components.
 * Uses React context for state sharing and method distribution.
 */
export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const clearHistory = useCallback(async () => {
    // History management is handled in the terminal component
    // Return a promise to maintain async interface
    return Promise.resolve();
  }, []);

  return (
    <TerminalContext.Provider value={{ clearHistory }}>
      {children}
    </TerminalContext.Provider>
  );
}

/**
 * Terminal Context Hook
 *
 * Custom hook to access terminal context with proper type safety
 * and error handling for usage outside provider.
 */
export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalContext must be used within a TerminalProvider");
  }
  return context;
}
