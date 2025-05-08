/**
 * Context for managing the shared state of the main terminal window.
 * Allows different components (like the terminal itself and a floating button)
 * to access and modify the window state (normal, minimized, maximized, closed).
 */

"use client";

import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useWindowState, type WindowState } from '@/lib/hooks/use-window-state.client';

// Re-export the WindowState type so consumers can use it
export type { WindowState };

// Define the shape of the context data
interface TerminalWindowStateContextType {
  windowState: WindowState;
  closeWindow: () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  restoreWindow: () => void; // Add a specific function to restore
  isReady: boolean;
}

// Create the context with a default undefined value
// This ensures consumers must be wrapped in a provider
const TerminalWindowStateContext = createContext<TerminalWindowStateContextType | undefined>(undefined);

// Define the props for the provider component
interface TerminalWindowStateProviderProps {
  children: ReactNode;
  terminalId: string; // Require a unique ID for the terminal instance
  initialState?: WindowState; // Optional initial state
}

// Define the provider component
export const TerminalWindowStateProvider = ({
  children,
  terminalId,
  initialState = 'normal', // Default initial state
}: TerminalWindowStateProviderProps) => {
  // Use the existing hook to manage the actual state
  const {
    windowState,
    setWindowState, // Get the raw setter
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady,
  } = useWindowState(terminalId, initialState);

  // Define a specific restore function
  const restoreWindow = React.useCallback(() => {
     console.log(`TerminalWindowStateContext (${terminalId}): Restoring window to normal`);
    // Restore specifically to 'normal' state
    setWindowState('normal');
  }, [terminalId, setWindowState]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = React.useMemo(() => ({
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow, // Provide the restore function
    isReady,
  }), [windowState, closeWindow, minimizeWindow, maximizeWindow, restoreWindow, isReady]);

  return (
    <TerminalWindowStateContext.Provider value={value}>
      {children}
    </TerminalWindowStateContext.Provider>
  );
};

// Define a custom hook for easy consumption of the context
export const useTerminalWindow = (): TerminalWindowStateContextType => {
  const context = useContext(TerminalWindowStateContext);
  if (context === undefined) {
    throw new Error('useTerminalWindow must be used within a TerminalWindowStateProvider');
  }
  return context;
};