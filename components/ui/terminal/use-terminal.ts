/**
 * Terminal Hook
 * 
 * Custom hook for terminal state and command handling.
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { handleCommand } from './commands';
import type { TerminalCommand, SelectionItem } from '@/types/terminal';

const MAX_HISTORY = 100;

export function useTerminal() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type "help" for available commands.'
  }]);
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const clearHistory = useCallback(() => {
    setHistory([{
      input: '',
      output: 'Welcome! Type "help" for available commands.'
    }]);
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setHistory(prev => [...prev, { input: input.trim(), output: '' }]);
    
    try {
      const result = await handleCommand(input);
      
      if (result.clear) {
        clearHistory();
      } else {
        if (result.selectionItems) {
          setSelection(result.selectionItems);
        } else {
          setHistory(prev => {
            const newHistory = [...prev];
            result.results.forEach(item => {
              newHistory.push({ input: '', output: item.output });
            });
            return newHistory.slice(-MAX_HISTORY);
          });
          
          if (result.navigation) {
            router.push(result.navigation);
          }
        }
      }
    } catch {
      setHistory(prev => [...prev, { 
        input: '', 
        output: 'An error occurred while processing the command.' 
      }]);
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
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    clearHistory,
    inputRef,
    focusInput
  };
}