/**
 * Terminal Hook
 */

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { handleCommand } from './commands';
import type { TerminalCommand, SelectionItem } from '@/types/terminal';

export function useTerminal() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type "help" for available commands.'
  }]);
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const clearHistory = useCallback(() => {
    setHistory([{
      input: '',
      output: 'Welcome! Type "help" for available commands.'
    }]);
    setSelection(null);
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add command to history immediately
    setHistory(prev => [...prev, { input: input.trim(), output: '' }]);
    
    try {
      const result = await handleCommand(input.trim());
      
      // Update history with command results
      setHistory(prev => {
        const newHistory = [...prev];
        result.results.forEach(item => {
          newHistory.push({ input: '', output: item.output });
        });
        return newHistory;
      });

      // Handle selection items if present
      if (result.selectionItems) {
        setSelection(result.selectionItems);
      }

      // Handle navigation if present
      if (result.navigation) {
        router.push(result.navigation);
      }
    } catch (error) {
      setHistory(prev => [...prev, { 
        input: '', 
        output: 'An error occurred while processing the command.' 
      }]);
    }
    
    setInput('');
  }, [input, router]);

  const handleSelection = useCallback((item: SelectionItem) => {
    setSelection(null);
    if (item.path) {
      router.push(item.path);
      setHistory(prev => [...prev, { 
        input: '', 
        output: `Navigating to ${item.label}...` 
      }]);
    }
  }, [router]);

  const cancelSelection = useCallback(() => {
    setSelection(null);
    setHistory(prev => [...prev, { 
      input: '', 
      output: 'Selection cancelled.' 
    }]);
  }, []);

  return {
    input,
    setInput,
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    focusInput,
    inputRef,
    clearHistory
  };
}