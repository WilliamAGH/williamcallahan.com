/**
 * Terminal Context Provider
 *
 * Provides terminal state management across components.
 */

"use client";

import type { TerminalCommand } from "@/types/terminal";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Define the context type including history and mode state
interface TerminalContextType {
  clearHistory: () => void;
  resetTerminal: () => void;
  history: TerminalCommand[];
  addToHistory: (command: TerminalCommand) => void;
}

// Define default context value
const defaultContext: TerminalContextType = {
  clearHistory: () => {},
  resetTerminal: () => {},
  history: [],
  addToHistory: () => {},
};

export const TerminalContext = createContext<TerminalContextType>(defaultContext);

const INITIAL_WELCOME_MESSAGE: TerminalCommand = {
  input: "",
  output: 'Welcome! Type "help" for available commands.',
};

const HISTORY_STORAGE_KEY = "terminal_history";

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  // Initialize state lazily to read from sessionStorage only on the client
  const [history, setHistory] = useState<TerminalCommand[]>(() => {
    if (typeof window === "undefined") {
      // Server-side rendering: start with empty history
      return [];
    }
    try {
      // Client-side: try loading from sessionStorage
      const saved = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsedData = JSON.parse(saved) as unknown; // Explicitly type as unknown
        // Ensure it's an array and assert its type
        if (Array.isArray(parsedData)) {
          const parsedHistory = parsedData as TerminalCommand[]; // Assert type here
          // Check if welcome message exists, add if not
          const hasWelcome = parsedHistory.some(
            (cmd: TerminalCommand) =>
              cmd.input === INITIAL_WELCOME_MESSAGE.input &&
              cmd.output === INITIAL_WELCOME_MESSAGE.output,
          );
          return hasWelcome ? parsedHistory : [INITIAL_WELCOME_MESSAGE, ...parsedHistory]; // Now uses typed parsedHistory
        }
      }
    } catch (e) {
      console.error("Error loading terminal history:", e);
      // Fallback on error
    }
    // Default initial state if nothing loaded or error occurred
    return [INITIAL_WELCOME_MESSAGE];
  });

  // Effect to save history to sessionStorage whenever it changes
  useEffect(() => {
    // Only run on client
    if (typeof window !== "undefined") {
      try {
        // Don't save the initial empty array during SSR/initial client render before state is properly set
        if (history.length > 0 || sessionStorage.getItem(HISTORY_STORAGE_KEY)) {
          sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        }
      } catch (e) {
        console.error("Error saving terminal history:", e);
      }
    }
    // Run whenever history state changes
  }, [history]);

  // Clear history, leaving only welcome message
  const clearHistory = useCallback(() => {
    setHistory([INITIAL_WELCOME_MESSAGE]);
  }, []);

  // Reset terminal (clear storage and reset history)
  const resetTerminal = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(HISTORY_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Error clearing terminal history storage:", e);
    }
    setHistory([INITIAL_WELCOME_MESSAGE]);
  }, []);

  // Add command to history
  const addToHistory = useCallback((command: TerminalCommand) => {
    setHistory((prev) => [...prev, command]);
  }, []);

  // Memoize context value for performance
  const contextValue = useMemo(
    () => ({
      clearHistory,
      resetTerminal,
      history,
      addToHistory,
    }),
    [clearHistory, resetTerminal, history, addToHistory],
  );

  return <TerminalContext.Provider value={contextValue}>{children}</TerminalContext.Provider>;
}

// Hook to access terminal context
export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalContext must be used within a TerminalProvider");
  }
  return context;
}
