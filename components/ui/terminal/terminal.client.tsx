/**
 * Terminal Client Component
 *
 * Handles all interactive terminal functionality.
 * Manages state and user interactions.
 *
 * @module components/ui/terminal/terminal.client
 * @see {@link "components/ui/terminal/terminal.server.tsx"} - Server-side shell
 * @see {@link "components/ui/terminal/terminalContext.tsx"} - Terminal state management
 * @see {@link "docs/architecture/terminalGUI.md"} - Terminal architecture documentation
 */

"use client";

import { useEffect, useCallback, useRef } from "react";
import { WindowControls } from "../navigation/windowControls";
import { History } from "./history";
import { CommandInput } from "./commandInput.client";
import { SelectionView } from "./selectionView";
import { useTerminal } from "./useTerminal";
import { BlogPost } from "@/types/blog";
import { SelectionItem, CommandResult } from "@/types/terminal";
import { handleCommand as processCommand } from './navigationCommands';
import { useTerminalContext } from "./terminalContext";

interface TerminalClientProps {
  searchFn?: (query: string, posts: BlogPost[]) => Promise<SelectionItem[]>;
  posts?: BlogPost[];
}

/**
 * Terminal Client Component
 *
 * Handles all interactive functionality and state management.
 * This component is responsible for:
 * - Command processing
 * - Input handling
 * - History management
 * - Selection handling
 */
export function TerminalClient({ searchFn, posts = [] }: TerminalClientProps) {
  const {
    input,
    setInput,
    history,
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    inputRef,
    focusInput,
    isReady
  } = useTerminal();

  const { setHandleCommand } = useTerminalContext();

  // Use refs to maintain stable references
  const searchFnRef = useRef(searchFn);
  const postsRef = useRef(posts);

  // Update refs when props change
  useEffect(() => {
    searchFnRef.current = searchFn;
    postsRef.current = posts;
  }, [searchFn, posts]);

  // Set up command handler inside useEffect to break dependency cycle
  useEffect(() => {
    if (isReady) {
      const handleCommand = async (input: string | undefined | null): Promise<CommandResult> => {
        // Convert input to string and trim, or use empty string if null/undefined
        const trimmedInput = String(input || '').trim();

        if (!trimmedInput) {
          return {
            results: [{ output: "Please enter a command. Type 'help' for available commands." }]
          };
        }
        return await processCommand(trimmedInput, {
          search: searchFnRef.current,
          posts: postsRef.current
        });
      };

      setHandleCommand(handleCommand);

      // Cleanup function to prevent memory leaks
      return () => {
        setHandleCommand(async (cmd) => ({
          results: [{ output: "Command handler not initialized" }]
        }));
      };
    }
  }, [isReady, setHandleCommand]);

  return (
    <>
      <div className="mb-4">
        <WindowControls />
      </div>
      <div
        className="text-gray-600 dark:text-gray-300 max-h-[300px] sm:max-h-[400px] overflow-y-auto custom-scrollbar"
        aria-live="polite"
        aria-atomic="true"
        onClick={focusInput}
      >
        <div className="whitespace-pre-wrap break-words select-text">
          <History history={history} />
          {selection ? (
            <SelectionView
              items={selection}
              onSelect={handleSelection}
              onExit={cancelSelection}
              role="listbox"
              aria-label="Available options"
            />
          ) : (
            <CommandInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              inputRef={inputRef}
              disabled={!isReady}
            />
          )}
        </div>
      </div>
    </>
  );
}
