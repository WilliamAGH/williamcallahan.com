/**
 * Terminal Command Interface Component
 *
 * Provides the main terminal interface with input handling.
 */

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { handleCommand } from './navigationCommands';
import { TerminalHeader } from './terminalHeader';
import { TerminalHistory } from './terminalHistory';
import type { TerminalCommand } from '@/types/terminal';

export function CommandInterface() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type "help" for available commands.'
  }]);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const result = await handleCommand(input.trim());

    if (result.results.length === 0) {
      // Clear command
      setHistory([{
        input: '',
        output: 'Welcome! Type "help" for available commands.'
      }]);
    } else {
      setHistory(prev => [
        ...prev,
        {
          input: input.trim(),
          output: result.results.map(r => r.output).join('\n')
        }
      ]);

      if (result.navigation) {
        router.push(result.navigation);
      }
    }

    setInput('');
  };

  return (
    <div className="bg-[#1a1b26] rounded-lg p-4 font-mono text-sm max-w-2xl mx-auto mt-8 border border-gray-700 shadow-xl">
      <TerminalHeader />
      <div className="text-gray-300">
        <TerminalHistory history={history} />
        <form onSubmit={handleSubmit}>
          <div className="flex items-center">
            <span className="text-[#7aa2f7] mr-2">$</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-transparent flex-1 focus:outline-none text-gray-300"
              autoFocus
              aria-label="Terminal command input"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
