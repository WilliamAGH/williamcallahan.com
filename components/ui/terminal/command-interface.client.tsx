/**
 * Terminal Command Interface Component
 *
 * Provides the main terminal interface with input handling.
 */

"use client";

import type { TerminalCommand } from "@/types/terminal";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { handleCommand } from "./commands.client";
import { History } from "./history";
import { TerminalHeader } from "./terminal-header";

export function CommandInterface() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<TerminalCommand[]>([
    {
      type: "text",
      id: "welcome",
      input: "",
      output: 'Welcome! Type "help" for available commands.',
      timestamp: Date.now(),
    },
  ]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when component mounts
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const result = await handleCommand(input.trim());

    if (result.clear) {
      setHistory([
        {
          type: "text",
          id: "welcome-reset",
          input: "",
          output: 'Welcome! Type "help" for available commands.',
          timestamp: Date.now(),
        },
      ]);
    } else {
      setHistory((prev) => [...prev, ...result.results]);

      if (result.navigation) {
        router.push(result.navigation);
      }
    }

    setInput("");
  };

  return (
    <div className="bg-[#1a1b26] rounded-lg p-4 font-mono text-sm max-w-2xl mx-auto mt-8 border border-gray-700 shadow-xl">
      <TerminalHeader />
      <div className="text-gray-300">
        <div className="flex-1 overflow-y-auto">
          <History history={history} />
        </div>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <div className="flex items-center">
            <span className="text-[#7aa2f7] mr-2">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-transparent flex-1 focus:outline-none text-gray-300"
              aria-label="Terminal command input"
              placeholder="Type a command..."
            />
          </div>
        </form>
      </div>
    </div>
  );
}
