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
import { sections } from "./sections";

export function useTerminal() {
  // Get only history functions from TerminalContext
  const {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
    // isReady is no longer part of this context
  } = useTerminalContext();
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<SelectionItem[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Flag to indicate whether a selection list is currently active
  const isSelecting = selection !== null;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeCommandController = useRef<AbortController | null>(null);

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
    if (!input.trim() || isSubmitting) return;

    // Abort any previous command still in progress
    if (activeCommandController.current) {
      activeCommandController.current.abort();
    }

    // Create new controller for this command
    const controller = new AbortController();
    activeCommandController.current = controller;
    
    setIsSubmitting(true);

    const commandInput = input.trim();
    const trimmedInput = commandInput.toLowerCase().trim();
    const parts = trimmedInput.split(" ");
    const command = parts[0] || "";
    const args = parts.slice(1);

    // Use imported sections for validation
    const isValidSection = (section: string): boolean => section in sections;

    // Check if this is a search command
    const isSearchCommand = 
      (command && isValidSection(command) && args.length > 0) || // Section search
      (command && !["help", "clear", "schema.org"].includes(command) && !isValidSection(command)); // Site-wide search

    // Generate a unique ID for this command/search
    const commandId = crypto.randomUUID();

    // Add temporary "Searching..." message for search commands
    if (isSearchCommand) {
      const searchTerms = isValidSection(command) && args.length > 0 
        ? args.join(" ") 
        : trimmedInput;
      
      const scope = isValidSection(command) && args.length > 0 ? command : undefined;
      
      addToHistory({
        type: "searching",
        id: commandId,
        input: commandInput,
        query: searchTerms,
        scope,
        timestamp: Date.now(),
      });
    }

    try {
      const result = await handleCommand(commandInput, controller.signal);

      if (result.clear) {
        clearHistory();
        // Refocus input after clearing to maintain keyboard interaction
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      } else {
        // Remove the temporary searching message if we added one
        if (isSearchCommand) {
          removeFromHistory(commandId);
        }

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
      // Handle abort specifically
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Command execution was aborted.');
        // Remove the temporary searching message if we added one
        if (isSearchCommand) {
          removeFromHistory(commandId);
        }
        return; // Exit early without setting error message
      }
      
      console.error("Command execution error:", error instanceof Error ? error.message : "Unknown error");
      
      // Remove the temporary searching message if we added one
      if (isSearchCommand) {
        removeFromHistory(commandId);
      }
      
      // Add a generic error to history for unexpected failures
      addToHistory({
        type: "error",
        id: crypto.randomUUID(),
        input: commandInput,
        error: "An unexpected error occurred. Please try again.",
        timestamp: Date.now(),
      });
    } finally {
      // Clear the controller ref if this is the command that finished
      if (activeCommandController.current === controller) {
        activeCommandController.current = null;
      }
      setIsSubmitting(false);
      setInput("");
    }
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

  // Cleanup animation frame and abort controller on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (activeCommandController.current) {
        activeCommandController.current.abort();
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
    isSelecting,
    isSubmitting,
  };
}
