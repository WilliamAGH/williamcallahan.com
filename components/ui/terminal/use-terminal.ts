/**
 * Terminal Hook
 *
 * Custom hook for terminal state and command handling.
 */

import { useState, useCallback, useRef, useEffect } from 'react'; // Added useEffect
import { useRouter } from 'next/navigation';
import { handleCommand } from './commands';
import type { SelectionItem } from '@/types/terminal'; // Removed TerminalCommand import here
import { useTerminalContext } from './terminalContext'; // Import context hook

const MAX_HISTORY = 100;

export function useTerminal() {
  const {
    history,
    addToHistory,
    clearHistory,
    isReady // Get context state and functions
  } = useTerminalContext();
  const [input, setInput] = useState('');
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
   const router = useRouter();
   const inputRef = useRef<HTMLInputElement>(null);
   const welcomeMessageAdded = useRef(false); // Ref to track if welcome message was added

    // Add initial welcome message only once after mount if history is empty
    useEffect(() => {
      console.log(`useTerminal Mount Effect: history.length=${history.length}, welcomeAdded=${welcomeMessageAdded.current}`);
      // Check history length *inside* the mount effect
      // Only add if history is empty AND we haven't added it before in this component instance
      if (history.length === 0 && !welcomeMessageAdded.current) {
        console.log("useTerminal Mount Effect: Adding welcome message.");
        addToHistory({ input: '', output: 'Welcome! Type "help" for available commands.' });
        welcomeMessageAdded.current = true; // Set the ref flag
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only ONCE after initial mount

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
