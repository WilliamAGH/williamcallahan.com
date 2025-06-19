/**
 * Terminal Hook (Client)
 *
 * Custom hook for terminal state and command handling.
 */

"use client";

import type { SelectionItem } from "@/types/terminal";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { handleCommand } from "./commands.client";
import { useTerminalContext } from "./terminal-context.client";

export function useTerminal() {
  // Get only history functions from TerminalContext
  const {
    history,
    addToHistory,
    clearHistory,
    // isReady is no longer part of this context
  } = useTerminalContext();
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback((event?: React.MouseEvent<HTMLDivElement>) => {
    // Only focus if the click target is not a button or inside a button
    if (event && event.target instanceof Element) {
      if (event.target.closest("button")) {
        return; // Don't focus if click was on or inside a button
      }
    }
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const commandInput = input.trim();

    try {
      const result = await handleCommand(commandInput);

      if (result.clear) {
        clearHistory();
      } else {
        if (result.selectionItems) {
          setSelection(result.selectionItems);
        }

        if (result.results && result.results.length > 0) {
          for (const res of result.results) {
            addToHistory(res);
          }
        } else if (!result.selectionItems) {
          // If handleCommand returns no results and no selection, still add the input
          addToHistory({
            type: "text",
            id: crypto.randomUUID(),
            input: commandInput,
            output: "",
            timestamp: Date.now(),
          });
        }

        if (result.navigation) {
          router.push(result.navigation);
        }
      }
    } catch (error: unknown) {
      console.error("Command execution error:", error instanceof Error ? error.message : "Unknown error");
      // Add a generic error to history for unexpected failures
      addToHistory({
        type: "error",
        id: crypto.randomUUID(),
        input: commandInput,
        error: "An unexpected error occurred. Please try again.",
        timestamp: Date.now(),
      });
    }

    setInput("");
  };

  const handleSelection = useCallback(
    (item: SelectionItem) => {
      setSelection(null);
      if (item.path) {
        router.push(item.path);

        // For paths with hash fragments (like /bookmarks#id), scroll to the element
        setTimeout(() => {
          const id = item.path.split("#")[1];
          if (id) {
            const element = document.getElementById(id);
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
            }
          }
        }, 100);
      }
    },
    [router],
  );

  const cancelSelection = useCallback(() => {
    setSelection(null);
  }, []);

  return {
    input,
    setInput,
    history, // Return history from context
    selection,
    handleSubmit,
    handleSelection,
    cancelSelection,
    clearHistory, // Return clearHistory from context
    inputRef,
    focusInput,
  };
}
