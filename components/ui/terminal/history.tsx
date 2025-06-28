/**
 * Terminal History Component
 *
 * Displays command history with proper word wrapping and
 * prevents unwanted text truncation on mobile devices.
 *
 * This is a shared component that can be used in both client and server contexts.
 */

import type { HistoryProps, TerminalCommand } from "@/types";
import {
  isTextCommand,
  isNavigationCommand,
  isClearCommand,
  isErrorCommand,
  isHelpCommand,
  isSelectionCommand,
  isSearchingCommand,
} from "@/types";

export function History({ history }: HistoryProps) {
  const getOutputContent = (line: TerminalCommand): string | null => {
    if (isTextCommand(line) || isNavigationCommand(line) || isClearCommand(line)) {
      return line.output;
    }
    if (isErrorCommand(line)) {
      return line.error + (line.details ? `\n${line.details}` : "");
    }
    if (isHelpCommand(line)) {
      return line.commands
        .map((cmd) => `${cmd.name}: ${cmd.description}${cmd.usage ? ` (${cmd.usage})` : ""}`)
        .join("\n");
    }
    if (isSelectionCommand(line)) {
      return line.items.map((item) => `${item.label}: ${item.description}`).join("\n");
    }
    if (isSearchingCommand(line)) {
      const searchText = line.scope 
        ? `⏳ Searching for ${line.scope} related to "${line.query}"...` 
        : `⏳ Searching website for all results related to "${line.query}"...`;
      return searchText;
    }
    return null;
  };

  return (
    <div className="space-y-1 mb-4">
      {Array.isArray(history) &&
        history.map((line: TerminalCommand, i) => {
          const outputContent = getOutputContent(line);
          return (
            <div key={`${line.input}-${line.id}-${i}`}>
              {line.input && !isSearchingCommand(line) && (
                <div className="flex items-start">
                  <span className="text-[#7aa2f7] select-none mr-2 shrink-0">$</span>
                  <span className="text-gray-300 break-words">{line.input}</span>
                </div>
              )}
              {outputContent && <div className="text-gray-300 whitespace-pre-wrap break-words">{outputContent}</div>}
            </div>
          );
        })}
    </div>
  );
}
