// app/client-components/providers/appState.tsx

"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes/dist/types";

/**
 * Terminal Context Type
 * Defines the shape of the terminal context value
 */
interface TerminalContextType {
  clearHistory: () => Promise<void>;
  isReady: boolean;
}

/**
 * Terminal Context
 * Provides terminal state and methods across components
 */
export const TerminalContext = React.createContext<TerminalContextType | null>(null);

/**
 * App State Provider Component
 *
 * Unified provider that manages all client-side state following Next.js 14 patterns.
 * Implements proper cleanup and state isolation.
 *
 * @component
 * @example
 * ```tsx
 * <AppStateProvider>
 *   <App />
 * </AppStateProvider>
 * ```
 */
export function AppStateProvider({
  children,
  ...themeProps
}: ThemeProviderProps) {
  // Terminal state
  const [isReady, setIsReady] = React.useState(false);

  const clearHistory = React.useCallback(async () => {
    // History management is handled in the terminal component
    return Promise.resolve();
  }, []);

  // Theme initialization effect
  React.useEffect(() => {
    setIsReady(true);
    return () => {
      setIsReady(false);
    };
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem={true}
      disableTransitionOnChange
      storageKey="theme"
      {...themeProps}
    >
      <TerminalContext.Provider
        value={{
          clearHistory,
          isReady
        }}
      >
        {children}
      </TerminalContext.Provider>
    </ThemeProvider>
  );
}

/**
 * Terminal Context Hook
 *
 * Custom hook to access terminal context with proper type safety
 * and error handling for usage outside provider.
 */
export function useTerminalContext() {
  const context = React.useContext(TerminalContext);
  if (!context) {
    throw new Error("useTerminalContext must be used within AppStateProvider");
  }
  return context;
}
