/**
 * Terminal History Component
 *
 * Displays terminal command history with proper accessibility support.
 * Implements proper state isolation and cleanup.
 */

"use client";

import { memo } from "react";
import type { TerminalCommand } from "@/types/terminal";

interface HistoryProps {
  history: TerminalCommand[];
}

export const History = memo(function History({ history }: HistoryProps) {
  return (
    <div
      role="log"
      aria-label="Terminal command history"
      aria-live="polite"
      aria-atomic="false"
    >
      {history.map((command, index) => (
        <div
          key={`${command.input || command.output}-${index}`}
          className="mb-2"
        >
          {command.input && (
            <div className="flex items-center">
              <span className="text-green-500 mr-2">$</span>
              <span className="text-gray-300">{command.input}</span>
            </div>
          )}
          {command.output && (
            <div
              className="text-gray-300 whitespace-pre-wrap"
              role="status"
              aria-label={`Output for ${command.input || "command"}`}
            >
              {command.output}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

History.displayName = "History";
