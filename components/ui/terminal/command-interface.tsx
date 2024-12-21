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

export function CommandInterface() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalCommand[]>([{
    input: '',
    output: 'Welcome! Type a section name to navigate:'
  }]);
  const router = useRouter();
  
  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const command = input.toLowerCase().trim();
    
    if (terminalCommands[command]) {
      setHistory(prev => [...prev, 
        { input: command, output: '' },
        { input: '', output: `Navigating to ${command}...` }
      ]);
      router.push(terminalCommands[command]);
    } else {
      setHistory(prev => [...prev,
        { input: command, output: '' },
        { input: '', output: 'Command not found. Available sections: ' + Object.keys(terminalCommands).join(', ') }
      ]);
    }
    
    setInput('');
  };

  return (
    <div className="bg-[#1a1b26] rounded-lg p-4 font-mono text-sm max-w-2xl mx-auto mt-8 border border-gray-700 shadow-xl">
      <TerminalHeader />
      <div className="text-gray-300">
        <TerminalHistory history={history} />
        <div className="flex items-center">
          <span className="text-[#7aa2f7] mr-2">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-transparent flex-1 focus:outline-none text-gray-300 caret-transparent"
            autoFocus
          />
          <span className="w-2 h-5 bg-gray-300 animate-pulse" />
        </div>
      </div>
    </div>
  );
}