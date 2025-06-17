/**
 * Terminal History Component
 *
 * Displays command history with proper word wrapping and
 * prevents unwanted text truncation on mobile devices.
 *
 * This is a shared component that can be used in both client and server contexts.
 */

import type { TerminalCommand } from "@/types/terminal";

interface HistoryProps {
  history: TerminalCommand[];
}

export function History({ history }: HistoryProps) {
  return (
    <div className="space-y-1 mb-4">
      {history.map((line, i) => (
        <div key={`${line.input}-${line.output}-${i}`}>
          {line.input && (
            <div className="flex items-start">
              <span className="text-[#7aa2f7] select-none mr-2 shrink-0">$</span>
              <span className="text-gray-300 break-words">{line.input}</span>
            </div>
          )}
          {line.output && (
            <div className="text-gray-300 whitespace-pre-wrap break-words">{line.output}</div>
          )}
        </div>
      ))}
    </div>
  );
}
