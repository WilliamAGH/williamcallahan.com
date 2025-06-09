/**
 * Terminal Hook (Client)
 *
 * Custom hook for terminal state and command handling.
 */

"use client";

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { handleCommand } from './commands.client';
import type { SelectionItem } from '@/types/terminal';
import { useTerminalContext } from './terminal-context.client';

export function useTerminal() {
  // Get only history functions from TerminalContext
  const {
    history,
    addToHistory,
    clearHistory,
    // isReady is no longer part of this context
  } = useTerminalContext();
  const [input, setInput] = useState('');
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
   const router = useRouter();
   const inputRef = useRef<HTMLInputElement>(null);

    const focusInput = useCallback((event?: React.MouseEvent<HTMLDivElement>) => {
    // Only focus if the click target is not a button or inside a button
    if (event && event.target instanceof Element) {
      if (event.target.closest('button')) {
        return; // Don't focus if click was on or inside a button
      }
    }
    inputRef.current?.focus();
  }, []);


  const handleSubmit = async () => {
    if (!input.trim()) return;

    const commandInput = input.trim();
    // Removed immediate addToHistory call here

    try {
      const result = await handleCommand(commandInput); // Use trimmed input

      if (result.clear) {
        clearHistory(); // Use context clearHistory
      } else {
        if (result.selectionItems) {
          setSelection(result.selectionItems);
        } else {
          // Add command and first output line together
          if (result.results.length > 0) {
            addToHistory({ input: commandInput, output: result.results[0]?.output ?? '' });
            // Add subsequent output lines without input
            for (const item of result.results.slice(1)) {
              addToHistory({ input: '', output: item?.output ?? '' });
            }
          } else {
            // If handleCommand returns no results (e.g., unexpected case), still add the input
            addToHistory({ input: commandInput, output: '' });
          }

          if (result.navigation) {
            router.push(result.navigation);
          }
        }
      }
    } catch (error) {
      console.error("Command execution error:", error instanceof Error ? error.message : 'Unknown error'); // Log error safely
      // Add error output associated with the input command
      addToHistory({
        input: commandInput, // Associate error with the command that caused it
        output: 'An error occurred while processing the command.'
      });
    }

    setInput('');
  };

  const handleSelection = useCallback((item: SelectionItem) => {
    setSelection(null);
    if (item.path) {
      router.push(item.path);

      // For paths with hash fragments (like /bookmarks#id), scroll to the element
      setTimeout(() => {
        const id = item.path.split('#')[1];
        if (id) {
          const element = document.getElementById(id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, 100);
    }
  }, [router]);

  const cancelSelection = useCallback(() => {
    setSelection(null);
  }, []);

  return {
    input,
    setInput,
    history, // Return history from context
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    clearHistory, // Return clearHistory from context
    inputRef,
    focusInput
  };
}
