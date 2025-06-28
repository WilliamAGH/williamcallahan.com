/**
 * Terminal Context Provider
 *
 * Provides terminal state management across components.
 */

"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { TerminalCommand } from "@/types/terminal";
import type { TerminalContextType } from "@/types/ui/terminal";
import { isTerminalCommandArray } from "@/types/terminal";

// Define default context value
const defaultContext: TerminalContextType = {
  clearHistory: () => {},
  resetTerminal: () => {},
  history: [],
  addToHistory: () => {},
  addCommand: () => {},
  currentInput: "",
  setCurrentInput: () => {},
  removeFromHistory: () => {},
};

export const TerminalContext = createContext<TerminalContextType>(defaultContext);

const INITIAL_WELCOME_MESSAGE: TerminalCommand = {
  type: "text",
  input: "",
  output: 'Welcome! Type "help" for available commands.',
  id: "initial-welcome-message",
  timestamp: Date.now(),
};

const HISTORY_STORAGE_KEY = "terminal_history";
const MAX_HISTORY_SIZE = 100; // Limit history to prevent unbounded growth

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [currentInput, setCurrentInput] = useState<string>("");

  // Initialize state lazily to read from sessionStorage only on the client
  const [history, setHistory] = useState<TerminalCommand[]>((): TerminalCommand[] => {
    if (typeof window === "undefined") {
      // Server-side rendering: start with empty history
      return [INITIAL_WELCOME_MESSAGE];
    }
    try {
      // Client-side: try loading from sessionStorage
      const saved = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsedData = JSON.parse(saved) as unknown; // Explicitly type as unknown

        if (isTerminalCommandArray(parsedData)) {
          // Check if welcome message exists, add if not
          const hasWelcome = parsedData.some((cmd) => cmd.id === INITIAL_WELCOME_MESSAGE.id);
          let loadedHistory = hasWelcome ? parsedData : [INITIAL_WELCOME_MESSAGE, ...parsedData];
          
          // Trim history if it exceeds max size
          if (loadedHistory.length > MAX_HISTORY_SIZE) {
            const welcomeMsg = loadedHistory.find(cmd => cmd.id === INITIAL_WELCOME_MESSAGE.id);
            const otherCommands = loadedHistory.filter(cmd => cmd.id !== INITIAL_WELCOME_MESSAGE.id);
            const trimmedCommands = otherCommands.slice(-(MAX_HISTORY_SIZE - 1));
            loadedHistory = welcomeMsg ? [welcomeMsg, ...trimmedCommands] : trimmedCommands;
          }
          
          return loadedHistory;
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

  // Add command to history with size limit
  const addToHistory = useCallback((command: TerminalCommand): void => {
    setHistory((prev: TerminalCommand[]): TerminalCommand[] => {
      const newHistory = [...prev, command];
      // Keep only the most recent MAX_HISTORY_SIZE items
      if (newHistory.length > MAX_HISTORY_SIZE) {
        // Always keep the welcome message at index 0
        const welcomeMsg = newHistory.find(cmd => cmd.id === INITIAL_WELCOME_MESSAGE.id);
        const otherCommands = newHistory.filter(cmd => cmd.id !== INITIAL_WELCOME_MESSAGE.id);
        const trimmedCommands = otherCommands.slice(-(MAX_HISTORY_SIZE - 1));
        return welcomeMsg ? [welcomeMsg, ...trimmedCommands] : trimmedCommands;
      }
      return newHistory;
    });
  }, []);

  // Alias for addToHistory to match interface
  const addCommand = useCallback(
    (command: TerminalCommand): void => {
      addToHistory(command);
    },
    [addToHistory],
  );

  // Remove a specific command from history by ID
  const removeFromHistory = useCallback((commandId: string): void => {
    setHistory((prev: TerminalCommand[]): TerminalCommand[] => {
      return prev.filter(cmd => cmd.id !== commandId);
    });
  }, []);

  // Memoize context value for performance
  const contextValue = useMemo(
    () => ({
      clearHistory,
      resetTerminal,
      history,
      addToHistory,
      addCommand,
      currentInput,
      setCurrentInput,
      removeFromHistory,
    }),
    [clearHistory, resetTerminal, history, addToHistory, addCommand, currentInput, removeFromHistory],
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
