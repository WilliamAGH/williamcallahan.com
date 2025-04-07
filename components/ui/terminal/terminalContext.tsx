/**
 * Terminal Context Provider
 *
 * Provides terminal state management across components.
 */

"use client";

import React, { createContext, useContext, useCallback, useState, useMemo, useEffect } from 'react';
import type { TerminalCommand } from '@/types/terminal';

// Define the context type including history and mode state
interface TerminalContextType {
  clearHistory: () => void;
  history: TerminalCommand[];
  addToHistory: (command: TerminalCommand) => void;
  // terminalMode: TerminalMode; // Removed
  // setTerminalMode: Dispatch<SetStateAction<TerminalMode>>; // Removed
  // isReady: boolean; // Removed - readiness handled by useWindowState hook
}

// Define default context value
const defaultContext: TerminalContextType = {
  clearHistory: () => {},
  history: [],
  addToHistory: () => {},
  // terminalMode: 'normal', // Removed
  // setTerminalMode: () => {}, // Removed
  // isReady: false, // Removed
};

// Function to get initial mode, safely checking sessionStorage
export const TerminalContext = createContext<TerminalContextType>(defaultContext);

const INITIAL_WELCOME_MESSAGE: TerminalCommand = {
  input: '',
  output: 'Welcome! Type "help" for available commands.'
};

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  console.log("--- TerminalProvider Instance Mounting/Rendering ---");
  // Initialize history with the welcome message if it's truly empty initially
  const [history, setHistory] = useState<TerminalCommand[]>(() => {
    // Check if history is truly empty on initial render
    // This avoids adding the message multiple times if the provider re-renders
    // but retains state.
    // Note: This assumes the initial state is always empty. If hydration from
    // storage were added here, this logic would need adjustment.
    return [INITIAL_WELCOME_MESSAGE];
  });

  // Function to update state AND sessionStorage
  // Removed setTerminalMode function

  const clearHistory = useCallback(() => {
    console.log("TerminalProvider: Clearing history");
    setHistory([]);
  }, []);

  const addToHistory = useCallback((command: TerminalCommand) => {
    console.log("TerminalProvider: Adding to history:", command.input);
    setHistory(prev => [...prev, command]);
  }, []);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    clearHistory,
    history,
    addToHistory,
  }), [clearHistory, history, addToHistory]);

  // Log history changes for debugging
  useEffect(() => {
    console.log("TerminalProvider History Updated:", history);
  }, [history]);

  return (
    <TerminalContext.Provider value={contextValue}>
      {children}
    </TerminalContext.Provider>
  );
}

// Restore original hook name - but it only provides history now
export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminalContext must be used within a TerminalProvider');
  }
  return context;
}
