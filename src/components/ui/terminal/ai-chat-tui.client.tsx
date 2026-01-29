/**
 * AI Chat TUI Components (Client)
 *
 * Inline chat interface components rendered within the terminal's existing scroll container.
 * Chat history is rendered by the History component (via terminal context).
 * These components provide only the "chrome": header, input field, and thinking indicator.
 *
 * KEY ARCHITECTURE: No nested scroll container. The terminal's single scroll
 * container handles all scrolling, eliminating broken scroll patterns.
 *
 * Components:
 * - AiChatHeader: Exit button bar (renders at top of chat mode)
 * - AiChatInput: Input field + thinking indicator (renders at bottom)
 * - ThinkingIndicator: Loading animation during AI response
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AiChatHeaderProps, AiChatInputProps } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Loading Animation - Claude Code inspired
// ─────────────────────────────────────────────────────────────────────────────

/** Braille spinner frames for smooth terminal-native animation */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Contextual loading messages that cycle - idiomatic for AI/terminal UX */
const LOADING_MESSAGES = [
  "Thinking",
  "Processing",
  "Reasoning",
  "Composing response",
  "Almost there",
  "Generating",
  "Working on it",
];

/** Terminal-native loading indicator with cycling spinner and messages */
export function ThinkingIndicator({ queueMessage }: { queueMessage?: string | null }) {
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  // Fast spinner animation (80ms per frame)
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIndex(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  // Slower message cycling (3s per message)
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Animated dots (500ms per dot)
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const spinner = SPINNER_FRAMES[spinnerIndex] ?? "⠋";
  const message = LOADING_MESSAGES[messageIndex] ?? "Thinking";

  return (
    <div className="rounded-md border border-[#7aa2f7]/30 bg-[#7aa2f7]/5 px-3 py-2 my-2">
      <div className="flex items-center gap-2">
        <span className="text-[#7aa2f7] font-mono flex-shrink-0">{spinner}</span>
        <span className="text-[#7aa2f7] text-sm whitespace-nowrap">
          {message}
          <span className="inline-block font-mono" style={{ width: "2em" }}>
            {dots}
          </span>
        </span>
      </div>
      {queueMessage ? <div className="text-[#7aa2f7]/80 text-xs mt-1">{queueMessage}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AiChatHeader - Exit button bar
// ─────────────────────────────────────────────────────────────────────────────

/** Header bar with exit button for AI chat mode */
export function AiChatHeader({ onClearAndExit }: AiChatHeaderProps) {
  return (
    <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
      <div className="text-gray-500">AI Chat Mode</div>
      <button
        type="button"
        onClick={onClearAndExit}
        className="px-2 py-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        aria-label="Exit AI chat"
      >
        (Escape) Exit
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AiChatEmptyState - Shown when no chat messages exist
// ─────────────────────────────────────────────────────────────────────────────

/** Empty state shown when no chat messages exist yet */
export function AiChatEmptyState() {
  return (
    <div className="text-gray-400 text-sm whitespace-pre-wrap mb-4">
      Type a message to start chatting. Use `ai {"<"}message{">"}` for one-shot replies from the normal prompt.
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AiChatInput - Input field with thinking indicator
// ─────────────────────────────────────────────────────────────────────────────

/** Input field and thinking indicator for AI chat mode */
export function AiChatInput({ isSubmitting, queueMessage, onSend, onClearAndExit, onCancelRequest }: AiChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSubmitting) return;
    setInput("");
    await onSend(trimmed);
    inputRef.current?.focus();
  }, [input, isSubmitting, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape - exit chat mode
      if (e.key === "Escape") {
        e.preventDefault();
        onClearAndExit();
        return;
      }

      // Ctrl+C - cancel current request (if no text selected)
      const isCtrlC = e.ctrlKey && e.key.toLowerCase() === "c";
      if (isCtrlC) {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        e.preventDefault();
        onCancelRequest();
        return;
      }

      // Ctrl+Z - exit chat mode
      const isCtrlZ = e.ctrlKey && e.key.toLowerCase() === "z";
      if (isCtrlZ) {
        e.preventDefault();
        onClearAndExit();
        return;
      }

      // Enter - submit message
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    },
    [onClearAndExit, onCancelRequest, submit],
  );

  return (
    <div data-testid="ai-chat-input" onKeyDown={handleKeyDown}>
      {/* Thinking indicator while waiting for response */}
      {isSubmitting && <ThinkingIndicator queueMessage={queueMessage} />}

      {/* Input field */}
      <div className="flex items-center gap-2">
        <span className="text-[#7aa2f7] select-none shrink-0">&gt;</span>
        <div className="relative flex-1 transform-gpu">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isSubmitting}
            className="bg-transparent w-full focus:outline-none text-gray-200 caret-gray-200
                text-[16px] transform-gpu scale-[0.875] origin-left disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              /* Offset the larger font size to maintain layout */
              margin: "-0.125rem 0",
            }}
            placeholder={isSubmitting ? "Waiting for response..." : "Send a message"}
            aria-label="AI chat message input"
          />
        </div>
      </div>
    </div>
  );
}
