/**
 * Terminal Context Provider
 *
 * Provides terminal state management across components.
 */

"use client";

import React, { createContext, useContext, useCallback, useEffect, useState, Dispatch, SetStateAction, useMemo } from 'react';
import type { TerminalCommand } from './types';

export type TerminalMode = 'normal' | 'minimized' | 'maximized' | 'closed';
const SESSION_STORAGE_KEY = 'terminalMode';

// Helper function to safely access sessionStorage
const getSessionStorageMode = (): TerminalMode | null => {
  try {
    // Ensure window is defined (client-side)
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(SESSION_STORAGE_KEY) as TerminalMode | null;
    }
  } catch (error) {
    console.warn('sessionStorage is not available:', error);
  }
  return null;
};

// Helper function to safely set sessionStorage
const setSessionStorageMode = (mode: TerminalMode) => {
  try {
    // Ensure window is defined (client-side)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, mode);
    }
  } catch (error) {
    console.warn('sessionStorage is not available:', error);
  }
};

// Define the context type based on state and functions
interface TerminalContextType {
  clearHistory: () => void;
  isReady: boolean; // Flag indicating client-side readiness
  history: TerminalCommand[];
  addToHistory: (command: TerminalCommand) => void;
  terminalMode: TerminalMode;
  setTerminalMode: Dispatch<SetStateAction<TerminalMode>>;
}

// Define default context value matching the type
const defaultContext: TerminalContextType = {
  clearHistory: () => {},
  isReady: false, // Default to false, set true after mount
  history: [],
  addToHistory: () => {},
  terminalMode: 'normal',
  setTerminalMode: () => {}
};

// Initialize state directly from sessionStorage if available, otherwise 'normal'
// This function runs when the useState hook initializes
const getInitialMode = (): TerminalMode => {
  if (typeof window !== 'undefined') {
    const storedMode = getSessionStorageMode();
    // console.log(`TerminalProvider Initial State Check: Found stored mode "${storedMode}"`);
    return storedMode || 'normal';
  }
  // console.log("TerminalProvider Initial State Check: SSR, defaulting to 'normal'");
  return 'normal'; // Default for SSR
};

export const TerminalContext = createContext<TerminalContextType>(defaultContext);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  console.log("--- TerminalProvider Instance Mounting/Rendering ---"); // Add log here
  const [isClientReady, setIsClientReady] = useState(false); // State to track client mount
  const [history, setHistory] = useState<TerminalCommand[]>([]);
  // Initialize state using the function to read storage safely
  const [terminalMode, setTerminalModeState] = useState<TerminalMode>(getInitialMode);

  // Effect to mark client as ready after mount
  useEffect(() => {
    setIsClientReady(true);
    // Optional: Re-read storage on mount if initial read might have issues
    const currentStoredMode = getSessionStorageMode();
    if (currentStoredMode && currentStoredMode !== terminalMode) {
       console.log("TerminalProvider: Correcting mode from storage on mount effect.");
       setTerminalModeState(currentStoredMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Function to update state and sessionStorage
  const setTerminalMode: Dispatch<SetStateAction<TerminalMode>> = useCallback((modeOrFn) => {
    setTerminalModeState(prevMode => {
      const newMode = typeof modeOrFn === 'function' ? modeOrFn(prevMode) : modeOrFn;
      // Only update sessionStorage if window is available (client-side)
      if (typeof window !== 'undefined') {
        setSessionStorageMode(newMode);
        console.log(`Terminal mode set to: ${newMode} (sessionStorage updated)`);
      } else {
        console.log(`Terminal mode set to: ${newMode} (SSR - sessionStorage skipped)`);
      }
      return newMode;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const addToHistory = useCallback((command: TerminalCommand) => {
    setHistory(prev => [...prev, command]);
  }, []);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    clearHistory,
    isReady: isClientReady, // Use the client ready state
    history,
    addToHistory,
    terminalMode,
    setTerminalMode // Ensure this is the correctly scoped function
  }), [clearHistory, isClientReady, history, addToHistory, terminalMode, setTerminalMode]);

  // console.log("TerminalProvider rendering/re-rendering", { isClientReady, terminalMode });

  // Always render children, consumers can use isReady if needed
  return (
    <TerminalContext.Provider value={contextValue}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminalContext must be used within a TerminalProvider');
  }
  return context;
}
