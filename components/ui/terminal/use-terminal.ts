/**
 * Terminal Hook
 *
 * Custom hook for terminal state and command handling.
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { handleCommand } from './commands';
import type { SelectionItem } from '@/types/terminal';
import { useTerminalContext } from './terminalContext';

const MAX_HISTORY = 100;

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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const commandInput = input.trim();
    addToHistory({ input: commandInput, output: '' }); // Use context addToHistory

    try {
      const result = await handleCommand(commandInput); // Use trimmed input

      if (result.clear) {
        clearHistory(); // Use context clearHistory
      } else {
        if (result.selectionItems) {
          setSelection(result.selectionItems);
        } else {
          // Update the last history entry's output or add new ones
          result.results.forEach((item, index) => {
            if (index === 0 && history.length > 0 && history[history.length - 1].input === commandInput) {
               // This logic might need refinement depending on how handleCommand structures results
               // For now, just add new entries for simplicity
               addToHistory({ input: '', output: item.output });
            } else {
               addToHistory({ input: '', output: item.output });
            }
          });
          // History slicing should ideally happen within the context provider if MAX_HISTORY is enforced globally

          if (result.navigation) {
            router.push(result.navigation);
          }
        }
      }
    } catch (error) {
      console.error("Command execution error:", error); // Log error
      addToHistory({ // Use context addToHistory
        input: '',
        output: 'An error occurred while processing the command.'
      });
    }

    setInput('');
  };

  const handleSelection = useCallback((item: SelectionItem) => {
    setSelection(null);
    if (item.path) {
      router.push(item.path);
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
