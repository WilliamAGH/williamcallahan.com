/**
 * Terminal Command Interface Component
 */

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { terminalCommands } from './terminal-commands';
import { TerminalHeader } from './terminal-header';
import { TerminalHistory } from './terminal-history';
import { CommandInput } from './command-input';
import type { TerminalCommand } from '@/types/terminal';

type CommandKey = keyof typeof terminalCommands;

export function CommandInterface() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type a section name to navigate:'
  }]);
  const router = useRouter();
  
  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const command = input.toLowerCase().trim() as CommandKey;
    
    if (command in terminalCommands) {
      setHistory(prev => [...prev, 
        { input: command, output: '' },
        { input: '', output: `Navigating to ${command}...` }
      ]);
      router.push(terminalCommands[command]);
    } else {
      const availableCommands = Object.keys(terminalCommands).join(', ');
      setHistory(prev => [...prev,
        { input: command, output: '' },
        { input: '', output: `Command not found. Available sections: ${availableCommands}` }
      ]);
    }
    
    setInput('');
  };

  return (
    <div className="bg-[#1a1b26] rounded-lg p-4 font-mono text-sm max-w-2xl mx-auto mt-8 border border-gray-700 shadow-xl">
      <TerminalHeader />
      <div className="text-gray-300">
        <TerminalHistory history={history} />
        <form onSubmit={handleCommand} className="flex items-center">
          <label htmlFor="command-input" className="text-[#7aa2f7] mr-2">$</label>
          <input
            id="command-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-transparent flex-1 focus:outline-none text-gray-300 caret-transparent"
            placeholder="Type a command..."
            aria-label="Terminal command input"
            // Only autoFocus on client-side to avoid hydration issues
            {...(typeof window !== 'undefined' ? { autoFocus: true } : {})}
          />
          <span className="w-2 h-5 bg-gray-300 animate-pulse" />
        </form>
      </div>
    </div>
  );
}