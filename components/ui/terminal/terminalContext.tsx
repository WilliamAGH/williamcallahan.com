/**
 * Terminal Context Provider
 *
 * Provides terminal state management across components.
 */

"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { TerminalCommand } from './types';

interface TerminalContextType {
  clearHistory: () => void;
  isReady: boolean;
  history: TerminalCommand[];
  addToHistory: (command: TerminalCommand) => void;
}

const defaultContext: TerminalContextType = {
  clearHistory: () => {},
  isReady: false,
  history: [],
  addToHistory: () => {}
};

export const TerminalContext = createContext<TerminalContextType>(defaultContext);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<TerminalCommand[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const addToHistory = useCallback((command: TerminalCommand) => {
    setHistory(prev => [...prev, command]);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <TerminalContext.Provider value={{
      clearHistory,
      isReady: mounted,
      history,
      addToHistory
    }}>
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