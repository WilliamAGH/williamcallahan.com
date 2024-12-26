/**
 * Terminal Context Provider
 * 
 * Provides terminal state management across components.
 */

"use client";

import { createContext, useContext, useCallback } from 'react';

interface TerminalContextType {
  clearHistory: () => void;
}

export const TerminalContext = createContext<TerminalContextType | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const clearHistory = useCallback(() => {
    // History management is handled in the terminal component
  }, []);

  return (
    <TerminalContext.Provider value={{ clearHistory }}>
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