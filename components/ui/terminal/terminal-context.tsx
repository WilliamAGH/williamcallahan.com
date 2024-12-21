/**
 * Terminal Context Provider
 */

"use client";

import { createContext, useContext, useCallback, useState } from 'react';
import type { TerminalCommand } from '@/types/terminal';

interface TerminalContextType {
  clearHistory: () => void;
}

export const TerminalContext = createContext<TerminalContextType | null>(null);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type "help" for available commands.'
  }]);

  const clearHistory = useCallback(() => {
    setHistory([{
      input: '',
      output: 'Welcome! Type "help" for available commands.'
    }]);
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