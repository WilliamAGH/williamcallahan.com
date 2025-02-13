/**
 * Terminal Component
 *
 * @module components/ui/terminal/Terminal
 * @see {@link useTerminal} - Hook for terminal state management
 * @see {@link TerminalContext} - Context provider
 * @see {@link navigationCommands} - Command processing implementation
 *
 * IMPORTANT: State Management & Dependencies
 * - Uses useRef to store searchFn and posts to prevent recreation of handleCommand
 * - handleCommand is defined inside useEffect to break dependency cycle
 * - Proper cleanup is implemented to prevent memory leaks
 *
 * Dependency Cycle Prevention:
 * The component previously had an issue where handleCommand recreation would trigger
 * infinite updates through TerminalContext. This was fixed by:
 * 1. Moving handleCommand inside useEffect
 * 2. Using refs for stable references
 * 3. Implementing proper cleanup
 *
 * @example
 * // Correct usage with search function
 * <Terminal
 *   searchFn={mySearchFunction}
 *   posts={blogPosts}
 * />
 */

"use client";

import { useEffect, useCallback, useRef } from "react";
import { WindowControls } from "../navigation/windowControls";
import { History } from "./history";
import { CommandInput } from "./commandInput";
import { SelectionView } from "./selectionView";
import { useTerminal } from "./useTerminal";
import { BlogPost } from "@/types/blog";
import { SelectionItem, CommandResult } from "@/types/terminal";
import { handleCommand as processCommand } from './navigationCommands';
import { useTerminalContext } from "./terminalContext";

interface TerminalProps {
  searchFn?: (query: string, posts: BlogPost[]) => Promise<SelectionItem[]>;
  posts?: BlogPost[];
}

export const Terminal: React.FC<TerminalProps> = ({ searchFn, posts = [] }) => {
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
    <div
      className="bg-[#1a1b26] rounded-lg p-4 sm:p-6 font-mono text-sm mx-auto mt-8 border border-gray-700 shadow-xl cursor-text w-full max-w-[calc(100vw-2rem)] sm:max-w-5xl"
      onClick={focusInput}
      role="region"
      aria-label="Terminal interface"
    >
      <div className="mb-4">
        <WindowControls />
      </div>
      <div
        className="text-gray-300 max-h-[300px] sm:max-h-[400px] overflow-y-auto custom-scrollbar"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="whitespace-pre-wrap break-words select-text">
          <History history={history} />
          {selection ? (
            <SelectionView
              items={selection}
              onSelect={handleSelection}
              onExit={cancelSelection}
              role="list"
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
    </div>
  );
};
