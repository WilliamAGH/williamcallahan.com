/**
 * Terminal Hook (Client)
 *
 * Custom hook for terminal state and command handling.
 */

"use client";

import type { SelectionItem } from "@/types/terminal";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const animationFrameRef = useRef<number | null>(null);

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

        // For paths with hash fragments (like /bookmarks#id)
        const id = item.path.split("#")[1];
        if (id) {
          // Cancel any existing animation frame
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          let attempts = 0;
          const MAX_ATTEMPTS = 20; // ~333ms at 60fps
          
          const checkElement = () => {
            const element = document.getElementById(id);
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
              animationFrameRef.current = null;
            } else if (attempts < MAX_ATTEMPTS) {
              attempts++;
              animationFrameRef.current = requestAnimationFrame(checkElement);
            } else {
              // Max attempts reached, cleanup
              animationFrameRef.current = null;
            }
          };
          
          // Start checking after navigation
          animationFrameRef.current = requestAnimationFrame(checkElement);
        }
      }
    },
    [router],
  );

  const cancelSelection = useCallback(() => {
    setSelection(null);
  }, []);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
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
