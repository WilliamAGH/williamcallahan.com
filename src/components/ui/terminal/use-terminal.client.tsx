/**
 * Terminal Hook (Client)
 *
 * Custom hook for terminal state and command handling.
 */

"use client";

import type { SelectionItem } from "@/types/terminal";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useClerkSafe } from "@/hooks/use-clerk-safe.client";
import { handleCommand } from "./commands.client";
import { useTerminalContext } from "./terminal-context.client";
import { sections } from "./sections";
import { useAiChatQueue } from "./use-ai-chat-queue.client";

const ABORT_REASON_USER_CANCEL = "user_cancel";
const ABORT_REASON_SUPERSEDED = "superseded";
const ABORT_REASON_CLEAR_EXIT = "clear_exit";
const ABORT_REASON_UNMOUNT = "unmount";

function isExpectedAbortReason(reason: unknown): boolean {
  return (
    reason === ABORT_REASON_USER_CANCEL ||
    reason === ABORT_REASON_SUPERSEDED ||
    reason === ABORT_REASON_CLEAR_EXIT ||
    reason === ABORT_REASON_UNMOUNT
  );
}

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
  const [activeApp, setActiveApp] = useState<null | "ai-chat">(null);
  const [aiChatConversationId, setAiChatConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  // Flag to indicate whether a selection list is currently active
  const isSelecting = selection !== null;
  const router = useRouter();
  const { signOut } = useClerkSafe();
  const inputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activeCommandController = useRef<AbortController | null>(null);
  const TERMINAL_CHAT_FEATURE = "terminal_chat";
  const {
    queueChatMessage,
    sendImmediateMessage,
    abortChatRequest,
    clearQueue: clearChatQueue,
    isSubmitting: isChatSubmitting,
    queuedCount,
    queueLimit,
    queueNotice,
    aiQueueMessage,
  } = useAiChatQueue({
    history,
    addToHistory,
    removeFromHistory,
    conversationId: aiChatConversationId,
    feature: TERMINAL_CHAT_FEATURE,
  });

  // Ref to always access the latest clearHistory function (avoids stale closure in useCallback)
  const clearHistoryRef = useRef(clearHistory);
  clearHistoryRef.current = clearHistory;

  const focusInput = useCallback((event?: React.MouseEvent<HTMLDivElement>) => {
    // Only focus if the click target is not a button or inside a button
    if (event && event.target instanceof Element) {
      if (event.target.closest("button")) {
        return; // Don't focus if click was on or inside a button
      }
    }
    inputRef.current?.focus();
  }, []);

  const exitActiveApp = useCallback(() => {
    setActiveApp(null);
    inputRef.current?.focus();
  }, []);

  const clearAndExitChat = useCallback(() => {
    activeCommandController.current?.abort(ABORT_REASON_CLEAR_EXIT);
    abortChatRequest(ABORT_REASON_CLEAR_EXIT);
    clearChatQueue();
    flushSync(() => {
      clearHistoryRef.current();
      setSelection(null);
      setInput("");
      setActiveApp(null);
      setAiChatConversationId(crypto.randomUUID());
    });
    inputRef.current?.focus();
  }, [abortChatRequest, clearChatQueue]);

  const cancelActiveRequest = useCallback(() => {
    abortChatRequest(ABORT_REASON_USER_CANCEL);
  }, [abortChatRequest]);

  function parseAiPrefixedCommand(raw: string): { isAiCommand: boolean; userText: string | null } {
    const trimmed = raw.trim();
    if (!trimmed) return { isAiCommand: false, userText: null };

    const firstSpace = trimmed.search(/\s/);
    const cmd = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();

    if (cmd !== "ai" && cmd !== "chat" && cmd !== "ai-chat")
      return { isAiCommand: false, userText: null };

    if (firstSpace === -1) return { isAiCommand: true, userText: null };
    const remainder = trimmed.slice(firstSpace).trim();
    return { isAiCommand: true, userText: remainder || null };
  }

  const sendChatMessage = useCallback(
    async (userText: string): Promise<boolean> => queueChatMessage(userText),
    [queueChatMessage],
  );

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting) return;

    const commandInput = input.trim();
    const trimmedInput = commandInput.toLowerCase().trim();

    const aiParsed = parseAiPrefixedCommand(commandInput);
    if (aiParsed.isAiCommand && !aiParsed.userText) {
      flushSync(() => {
        setInput("");
        setSelection(null);
        setActiveApp("ai-chat");
        setAiChatConversationId(crypto.randomUUID());
      });
      inputRef.current?.focus();
      return;
    }

    // Handle synchronous 'clear' command separately for atomic update
    if (trimmedInput === "clear") {
      flushSync(() => {
        clearHistory();
        setInput("");
        setAiChatConversationId(crypto.randomUUID());
      });
      // After the synchronous update, the DOM is stable. We can safely focus.
      inputRef.current?.focus();
      return;
    }

    // Abort any previous command still in progress
    if (activeCommandController.current) {
      activeCommandController.current.abort(ABORT_REASON_SUPERSEDED);
    }

    // Create new controller for this command
    const controller = new AbortController();
    activeCommandController.current = controller;

    setIsSubmitting(true);

    if (aiParsed.isAiCommand && aiParsed.userText) {
      const pendingId = crypto.randomUUID();
      try {
        flushSync(() => {
          setInput("");
        });
        addToHistory({
          type: "text",
          id: pendingId,
          input: "",
          output: "Thinking…",
          timestamp: Date.now(),
        });
        await sendImmediateMessage(aiParsed.userText, controller.signal);
      } finally {
        removeFromHistory(pendingId);
        if (activeCommandController.current === controller) {
          activeCommandController.current = null;
        }
        setIsSubmitting(false);
        inputRef.current?.focus();
      }
      return;
    }

    const parts = trimmedInput.split(" ");
    const command = parts[0] || "";
    const args = parts.slice(1);

    // Use imported sections for validation
    const isValidSection = (section: string): boolean => section in sections;

    // Check if this is a search command
    const isSearchCommand =
      (command && isValidSection(command) && args.length > 0) || // Section search
      (command &&
        !["help", "clear", "schema", "schema.org"].includes(command) &&
        !isValidSection(command)); // Site-wide search

    // Generate a unique ID for this command/search
    const commandId = crypto.randomUUID();

    // Add temporary "Searching..." message for search commands
    if (isSearchCommand) {
      const searchTerms =
        isValidSection(command) && args.length > 0 ? args.join(" ") : trimmedInput;

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
      // Clear input immediately to provide instant feedback
      flushSync(() => {
        setInput("");
      });

      const result = await handleCommand(commandInput, controller.signal);

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

      // Handle special actions (e.g., signOut)
      if (result.action === "signOut") {
        try {
          await signOut({ redirectUrl: "/" });
        } catch (signOutError) {
          console.error("[Terminal] Sign out failed:", signOutError);
          addToHistory({
            type: "error",
            id: crypto.randomUUID(),
            input: commandInput,
            error: "Failed to sign out. Please try again or refresh the page.",
            timestamp: Date.now(),
          });
        }
      }
    } catch (error: unknown) {
      // Handle abort specifically
      if (error instanceof DOMException && error.name === "AbortError") {
        const reason: unknown = controller.signal.reason;
        if (!isExpectedAbortReason(reason)) {
          addToHistory({
            type: "error",
            id: crypto.randomUUID(),
            input: commandInput,
            error: "Request was aborted unexpectedly.",
            timestamp: Date.now(),
          });
        }
        // Remove the temporary searching message if we added one
        if (isSearchCommand) {
          removeFromHistory(commandId);
        }
        return; // Exit early without setting error message
      }

      console.error(
        "Command execution error:",
        error instanceof Error ? error.message : "Unknown error",
      );

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

      // Ensure focus is maintained after async operations complete
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
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

  // Cancel search selection and clear terminal - EXACT same behavior as "clear" command
  // Uses ref to ensure we always call the latest clearHistory (avoids stale closure)
  const cancelSelection = useCallback(() => {
    flushSync(() => {
      setSelection(null);
      clearHistoryRef.current();
      setInput("");
      setAiChatConversationId(crypto.randomUUID());
    });
    inputRef.current?.focus();
  }, []);

  // Cleanup animation frame and abort controller on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (activeCommandController.current) {
        activeCommandController.current.abort(ABORT_REASON_UNMOUNT);
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
    isChatSubmitting,
    activeApp,
    exitActiveApp,
    clearAndExitChat,
    sendChatMessage,
    cancelActiveRequest,
    aiChatConversationId,
    aiQueueMessage,
    queuedCount,
    queueLimit,
    queueNotice,
  };
}
