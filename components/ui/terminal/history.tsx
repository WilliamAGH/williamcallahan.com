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
        <div key={i}>
          {line.input && (
            <div className="flex items-start">
              <span className="text-[#7aa2f7] select-none mr-2">$</span>
              <span className="text-gray-300 break-all">{line.input}</span>
            </div>
          )}
          {line.output && (
            <div className="text-gray-300 whitespace-pre-wrap break-all">
              {line.output}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}