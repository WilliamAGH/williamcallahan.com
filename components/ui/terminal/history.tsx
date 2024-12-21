/**
 * Terminal History Component
 */

import type { TerminalCommand } from '@/types/terminal';

interface HistoryProps {
  history: TerminalCommand[];
}

export function History({ history }: HistoryProps) {
  return (
    <div className="space-y-1 mb-4">
      {history.map((line, i) => (
        <div key={i} className="select-text">
          {line.input && (
            <div className="flex">
              <span className="text-[#7aa2f7] select-none">$</span>
              <span className="text-gray-300 ml-2">{line.input}</span>
            </div>
          )}
          {line.output && (
            <div className="whitespace-pre-wrap text-gray-300 ml-2">
              {line.output}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}