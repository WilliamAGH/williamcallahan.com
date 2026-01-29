/**
 * Context for managing the shared state of the main terminal window.
 * Allows different components (like the terminal itself and a floating button)
 * to access and modify the window state (normal, minimized, maximized, closed).
 */

"use client";

import { useWindowState } from "@/lib/hooks/use-window-state.client";
import React, { createContext, useContext } from "react";
import type {
  TerminalWindowStateContextType,
  TerminalWindowStateProviderProps,
} from "@/types/ui/terminal";

// Create the context with a default undefined value
// This ensures consumers must be wrapped in a provider
const TerminalWindowStateContext = createContext<TerminalWindowStateContextType | undefined>(
  undefined,
);

// Define the provider component
export const TerminalWindowStateProvider = ({
  children,
  terminalId,
  initialState = "normal", // Default initial state
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
    // Restore specifically to 'normal' state
    setWindowState("normal");
  }, [setWindowState]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = React.useMemo(
    () => ({
      windowState,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow, // Provide the restore function
      isReady,
    }),
    [windowState, closeWindow, minimizeWindow, maximizeWindow, restoreWindow, isReady],
  );

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
    throw new Error("useTerminalWindow must be used within a TerminalWindowStateProvider");
  }
  return context;
};
