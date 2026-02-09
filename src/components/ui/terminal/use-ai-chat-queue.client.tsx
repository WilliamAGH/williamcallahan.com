/**
 * AI Chat Queue Hook (Client)
 *
 * Manages sequential AI chat dispatch with a capped client-side queue.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import type { AiChatStreamErrorKind } from "@/types/schemas/ai-openai-compatible-client";
import {
  isChatCommand,
  type AiChatQueueConfig,
  type AiChatQueueResult,
  type TerminalChatAbortReason,
} from "@/types";

const ABORT_REASON_USER_CANCEL = "user_cancel";
const ABORT_REASON_SUPERSEDED = "superseded";
const ABORT_REASON_CLEAR_EXIT = "clear_exit";
const ABORT_REASON_UNMOUNT = "unmount";

const TERMINAL_CHAT_QUEUE_LIMIT = 5;
const STREAM_PREVIEW_MAX_CHARS = 240;

function isExpectedAbortReason(reason: unknown): boolean {
  return (
    reason === ABORT_REASON_USER_CANCEL ||
    reason === ABORT_REASON_SUPERSEDED ||
    reason === ABORT_REASON_CLEAR_EXIT ||
    reason === ABORT_REASON_UNMOUNT
  );
}

function buildStreamPreview(text: string): string {
  const condensed = text.replace(/\s+/g, " ").trim();
  if (condensed.length <= STREAM_PREVIEW_MAX_CHARS) return condensed;
  return `...${condensed.slice(-STREAM_PREVIEW_MAX_CHARS)}`;
}

export function useAiChatQueue({
  history,
  addToHistory,
  conversationId,
  feature,
}: AiChatQueueConfig): AiChatQueueResult {
  const historyRef = useRef(history);
  const conversationIdRef = useRef(conversationId);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiQueueMessage, setAiQueueMessage] = useState<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const activeChatController = useRef<AbortController | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const updateQueue = useCallback((nextQueue: string[]) => {
    queueRef.current = nextQueue;
    setQueuedMessages(nextQueue);
  }, []);

  const buildChatMessages = useCallback((userText: string) => {
    const priorChatMessages = historyRef.current.filter(isChatCommand);
    const normalized = priorChatMessages.map((msg) => ({
      role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: msg.content,
    }));
    const recent = normalized.slice(-19);
    return [...recent, { role: "user" as const, content: userText }];
  }, []);

  const sendChatMessageInternal = useCallback(
    async (userText: string, signal?: AbortSignal): Promise<void> => {
      const now = Date.now();
      addToHistory({
        type: "chat",
        id: crypto.randomUUID(),
        input: "",
        role: "user",
        content: userText,
        timestamp: now,
      });

      const messages = buildChatMessages(userText);
      const assistantMessageId = crypto.randomUUID();
      const assistantTimestamp = Date.now();
      const appendAssistantMessage = (content: string) => {
        addToHistory({
          type: "chat",
          id: assistantMessageId,
          input: "",
          role: "assistant",
          content,
          timestamp: assistantTimestamp,
        });
      };

      setAiQueueMessage(null);
      let streamedAssistantText = "";
      const assistantText = await aiChat(
        feature,
        { messages, conversationId: conversationIdRef.current, priority: 10 },
        {
          signal,
          onQueueUpdate: (update) => {
            if (update.event === "queued" || update.event === "queue") {
              if (update.position) {
                setAiQueueMessage(
                  `Queued (position ${update.position}, ${update.running}/${update.maxParallel} running)`,
                );
              } else {
                setAiQueueMessage(null);
              }
              return;
            }

            if (update.event === "started") {
              setAiQueueMessage(null);
            }
          },
          onStreamEvent: (update) => {
            if (update.event === "message_start") {
              setAiQueueMessage("Assistant is responding...");
              return;
            }

            if (update.event === "message_delta") {
              streamedAssistantText += update.data.delta;
              const preview = buildStreamPreview(streamedAssistantText);
              setAiQueueMessage(preview ? `Assistant: ${preview}` : "Assistant is responding...");
              return;
            }

            if (update.event === "message_done") {
              streamedAssistantText = update.data.message;
            }
          },
        },
      );

      if (assistantText.trim().length === 0) {
        throw new Error("AI chat returned an empty response");
      }
      appendAssistantMessage(assistantText);
    },
    [addToHistory, buildChatMessages, feature],
  );

  const handleChatError = useCallback(
    (error: unknown, signal?: AbortSignal): void => {
      if (error instanceof DOMException && error.name === "AbortError") {
        const reason: unknown = signal?.reason;
        if (isExpectedAbortReason(reason)) {
          return;
        }
        addToHistory({
          type: "error",
          id: crypto.randomUUID(),
          input: "",
          error: "AI chat request was aborted.",
          details: "The request was aborted unexpectedly.",
          timestamp: Date.now(),
        });
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      const kind: AiChatStreamErrorKind | undefined =
        error instanceof Error
          ? (error as Error & { kind?: AiChatStreamErrorKind }).kind
          : undefined;

      const headlineByKind: Partial<Record<AiChatStreamErrorKind, string>> = {
        timeout: "Request timed out.",
        rate_limit: "Rate limited.",
      };
      const headline = (kind && headlineByKind[kind]) ?? "AI chat failed.";
      addToHistory({
        type: "error",
        id: crypto.randomUUID(),
        input: "",
        error: headline,
        details: message,
        timestamp: Date.now(),
      });
    },
    [addToHistory],
  );

  const runQueuedMessage = useCallback(
    async (userText: string): Promise<void> => {
      const controller = new AbortController();
      activeChatController.current = controller;

      try {
        await sendChatMessageInternal(userText, controller.signal);
      } catch (error: unknown) {
        handleChatError(error, controller.signal);
      } finally {
        if (activeChatController.current === controller) {
          activeChatController.current = null;
        }
        setAiQueueMessage(null);
      }
    },
    [handleChatError, sendChatMessageInternal],
  );

  const processQueue = useCallback(async (): Promise<void> => {
    if (processingRef.current) return;
    if (queueRef.current.length === 0) return;

    processingRef.current = true;
    setIsSubmitting(true);

    try {
      while (queueRef.current.length > 0) {
        const [nextMessage, ...rest] = queueRef.current;
        if (typeof nextMessage !== "string") {
          updateQueue(rest);
          addToHistory({
            type: "error",
            id: crypto.randomUUID(),
            input: "",
            error: "Queued chat message was missing.",
            details: "The pending chat queue contained an invalid entry.",
            timestamp: Date.now(),
          });
          continue;
        }
        updateQueue(rest);
        await runQueuedMessage(nextMessage);
      }
    } finally {
      processingRef.current = false;
      setIsSubmitting(false);
      setAiQueueMessage(null);
    }
  }, [addToHistory, runQueuedMessage, updateQueue]);

  const queueChatMessage = useCallback(
    (userText: string): boolean => {
      const currentQueue = queueRef.current;
      if (currentQueue.length >= TERMINAL_CHAT_QUEUE_LIMIT) {
        setQueueNotice(`Queue is full (max ${TERMINAL_CHAT_QUEUE_LIMIT} messages).`);
        return false;
      }

      const nextQueue = [...currentQueue, userText];
      updateQueue(nextQueue);
      setQueueNotice(null);
      void processQueue();
      return true;
    },
    [processQueue, updateQueue],
  );

  const sendImmediateMessage = useCallback(
    async (userText: string, signal?: AbortSignal): Promise<void> => {
      try {
        await sendChatMessageInternal(userText, signal);
      } catch (error: unknown) {
        handleChatError(error, signal);
      } finally {
        setAiQueueMessage(null);
      }
    },
    [handleChatError, sendChatMessageInternal],
  );

  const abortChatRequest = useCallback((reason: TerminalChatAbortReason) => {
    activeChatController.current?.abort(reason);
  }, []);

  const clearQueue = useCallback(() => {
    updateQueue([]);
    setQueueNotice(null);
  }, [updateQueue]);

  useEffect(() => {
    return () => {
      abortChatRequest(ABORT_REASON_UNMOUNT);
    };
  }, [abortChatRequest]);

  return {
    queueChatMessage,
    sendImmediateMessage,
    abortChatRequest,
    clearQueue,
    isSubmitting,
    queuedCount: queuedMessages.length,
    queueLimit: TERMINAL_CHAT_QUEUE_LIMIT,
    queueNotice,
    aiQueueMessage,
  };
}
