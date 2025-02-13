/**
 * Terminal Hook Module
 *
 * This module provides a custom React hook for managing terminal state and interactions.
 * It handles command processing, history management, selection state, and navigation,
 * while ensuring proper cleanup and race condition prevention.
 *
 * @module components/ui/terminal/useTerminal
 * @see {@link Terminal} - Main terminal component
 * @see {@link TerminalProvider} - Context provider
 * @see {@link handleCommand} - Command handler
 *
 * State Management:
 * - Maintains input state and command history
 * - Handles selection mode for interactive menus
 * - Manages terminal readiness state
 * - Prevents race conditions during command processing
 *
 * Cleanup:
 * - Resets history to initial state
 * - Clears selection state
 * - Removes event listeners
 * - Handles input blur
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTerminalContext } from "./terminalContext";
import { handleCommand as navigationHandler } from "./navigationCommands";
import type { TerminalCommand, SelectionItem, CommandResult } from "@/types/terminal";

const INITIAL_COMMAND: TerminalCommand = {
  input: "",
  output: "Welcome to the terminal. Type 'help' for available commands."
};

const MAX_HISTORY = 100;

export function useTerminal() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<TerminalCommand[]>([INITIAL_COMMAND]);
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isReady, clearHistory, handleCommand: contextHandleCommand } = useTerminalContext();
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Initialize history on mount
  useEffect(() => {
    setHistory([INITIAL_COMMAND]);
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processCommand = useCallback(async (command: string): Promise<CommandResult> => {
    if (!command?.trim()) {
      return {
        results: [{ output: "Please enter a command. Type 'help' for available commands." }]
      };
    }

    try {
      // Use context handler if available, fallback to navigation handler
      const handler = contextHandleCommand || navigationHandler;
      return await handler(command);
    } catch (error) {
      return {
        results: [{ output: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}` }]
      };
    }
  }, [contextHandleCommand]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input?.trim() || !isReady || isProcessingRef.current) return;

    const trimmedInput = input.trim();
    isProcessingRef.current = true;

    try {
      // Update history immediately with input
      setHistory(prev => {
        const newHistory = [...prev, { input: trimmedInput, output: "" }];
        return newHistory.length > MAX_HISTORY
          ? newHistory.slice(-MAX_HISTORY)
          : newHistory;
      });

      setInput("");

      // Process command
      const result = await processCommand(trimmedInput);

      if (!isMountedRef.current) return;

      if (result.results.length === 0) {
        // Clear command
        setHistory([INITIAL_COMMAND]);
        setSelection(null);
      } else {
        // Update history with command results
        setHistory(prev => {
          const newHistory = [...prev];
          result.results.forEach(item => {
            if (item.output) {
              newHistory.push({ input: "", output: item.output });
            }
          });

          return newHistory.length > MAX_HISTORY
            ? newHistory.slice(-MAX_HISTORY)
            : newHistory;
        });

        // Handle navigation
        if (result.navigation) {
          await clearHistory();
          router.push(result.navigation);
        }

        // Update selection state
        setSelection(result.selectionItems || null);
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      setHistory(prev => {
        const newHistory = [
          ...prev,
          { input: "", output: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}` }
        ];
        return newHistory.length > MAX_HISTORY
          ? newHistory.slice(-MAX_HISTORY)
          : newHistory;
      });
    } finally {
      if (isMountedRef.current) {
        isProcessingRef.current = false;
      }
    }
  }, [clearHistory, input, isReady, processCommand, router]);

  const handleSelection = useCallback((item: SelectionItem) => {
    if (!isMountedRef.current) return;
    setSelection(null);
    if (item.action === "navigate" && item.path) {
      router.push(item.path);
    }
  }, [router]);

  const cancelSelection = useCallback(() => {
    if (!isMountedRef.current) return;
    setSelection(null);
  }, []);

  const focusInput = useCallback(() => {
    if (inputRef.current && isReady) {
      inputRef.current.focus();
    }
  }, [isReady]);

  return {
    input,
    setInput,
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    inputRef,
    focusInput,
    isReady
  };
}
