/**
 * Terminal History Component
 */

import type { TerminalCommand } from '@/types/terminal';

interface TerminalHistoryProps {
  history: TerminalCommand[];
}

export function TerminalHistory({ history }: TerminalHistoryProps) {
  return (
    <div className="mb-4">
      {history.map((line, i) => (
        <div key={i} className="mb-1">
          {line.input && (
            <div className="flex">
              <span className="text-[#7aa2f7]">$</span>
              <span className="text-gray-300 ml-2">{line.input}</span>
            </div>
          )}
          {line.output && (
            <div className="text-gray-300">{line.output}</div>
          )}
        </div>
      ))}
    </div>
  );
}