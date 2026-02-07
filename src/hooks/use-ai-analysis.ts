"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { aiQueueStatsSchema } from "@/types/schemas/ai-openai-compatible-client";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { parseLlmJson, persistAnalysisToS3 } from "@/lib/ai/analysis-client-utils";
import type { AnalysisState, UseAiAnalysisArgs, UseAiAnalysisResult } from "@/types/ai-analysis";

const AUTO_TRIGGER_QUEUE_THRESHOLD = 5;
const JSON_SCHEMA_REPAIR_SYSTEM_PROMPT =
  "You repair JSON so it strictly matches the requested schema. Return only valid JSON with no extra text.";

export function useAiAnalysis<TEntity, TAnalysis>(
  args: UseAiAnalysisArgs<TEntity, TAnalysis>,
): UseAiAnalysisResult<TAnalysis> {
  const {
    entity,
    entityId,
    featureName,
    persistenceKey,
    loadingMessages,
    extractContext,
    buildSystemPrompt,
    buildUserPrompt,
    responseFormat,
    responseSchema,
    autoTrigger,
    initialAnalysis,
  } = args;

  const [state, setState] = useState<AnalysisState<TAnalysis>>(() => {
    if (initialAnalysis?.analysis) {
      return { status: "success", analysis: initialAnalysis.analysis, error: null };
    }
    return { status: "idle", analysis: null, error: null };
  });

  const startedFromCache = useRef(!!initialAnalysis?.analysis);
  const [loadingMessage, setLoadingMessage] = useState<string>(
    loadingMessages[0] ?? "Analyzing...",
  );
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const hasTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generateAnalysisRef = useRef<((signal?: AbortSignal) => Promise<void>) | null>(null);

  const generateAnalysis = useCallback(
    async (signal?: AbortSignal) => {
      setState({ status: "loading", analysis: null, error: null });
      setQueueMessage(null);
      setStreamingText("");

      try {
        const context = extractContext(entity);
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(context);
        let streamedText = "";

        const responseText = await aiChat(
          featureName,
          {
            system: systemPrompt,
            userText: userPrompt,
            priority: 0,
            response_format: responseFormat,
          },
          {
            signal,
            onQueueUpdate: (update) => {
              if (update.event === "queued" || update.event === "queue") {
                setQueueMessage(update.position ? `Queued (position ${update.position})` : null);
                return;
              }
              if (update.event === "started") {
                setQueueMessage(null);
              }
            },
            onStreamEvent: (event) => {
              if (event.event === "message_start") {
                streamedText = "";
                setStreamingText("");
                return;
              }
              if (event.event === "message_delta") {
                streamedText += event.data.delta;
                setStreamingText(streamedText);
                return;
              }
              if (event.event === "message_done") {
                streamedText = event.data.message;
                setStreamingText(streamedText);
              }
            },
          },
        );

        setQueueMessage(null);

        const parseAnalysis = (
          rawText: string,
        ): { parsed: unknown; parsedAnalysis: TAnalysis | null } => {
          const parsed = parseLlmJson(rawText);
          const result = responseSchema.safeParse(parsed);
          return { parsed, parsedAnalysis: result.success ? result.data : null };
        };

        let parsed: unknown;
        let parsedAnalysis: TAnalysis | null = null;
        try {
          const initial = parseAnalysis(responseText);
          parsed = initial.parsed;
          parsedAnalysis = initial.parsedAnalysis;
        } catch (error) {
          console.error("Failed to parse AI response:", responseText, error);
          throw new Error("Invalid JSON response from AI service", { cause: error });
        }

        if (!parsedAnalysis) {
          const repairPayload =
            typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed) : responseText;
          const repairedResponseText = await aiChat(
            featureName,
            {
              system: JSON_SCHEMA_REPAIR_SYSTEM_PROMPT,
              userText: `Repair this JSON so it matches the required schema exactly:\n${repairPayload}`,
              priority: 5,
              response_format: responseFormat,
            },
            { signal },
          );

          try {
            const repaired = parseAnalysis(repairedResponseText);
            parsedAnalysis = repaired.parsedAnalysis;
          } catch (error) {
            console.error("Failed to parse repaired AI response:", repairedResponseText, error);
          }
        }

        if (!parsedAnalysis) {
          throw new Error("AI response did not match expected format");
        }

        setState({ status: "success", analysis: parsedAnalysis, error: null });
        void persistAnalysisToS3(persistenceKey, entityId, parsedAnalysis);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to generate analysis";
        setState({ status: "error", analysis: null, error: message });
      }
    },
    [
      entity,
      entityId,
      featureName,
      persistenceKey,
      extractContext,
      buildSystemPrompt,
      buildUserPrompt,
      responseFormat,
      responseSchema,
    ],
  );

  generateAnalysisRef.current = generateAnalysis;

  useEffect(() => {
    if (initialAnalysis?.analysis) {
      setState({ status: "success", analysis: initialAnalysis.analysis, error: null });
      startedFromCache.current = true;
    } else {
      setState({ status: "idle", analysis: null, error: null });
      startedFromCache.current = false;
    }
    hasTriggered.current = false;
    setStreamingText("");
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [entityId, initialAnalysis]);

  const handleManualTrigger = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    void generateAnalysis(abortControllerRef.current.signal);
  }, [generateAnalysis]);

  useEffect(() => {
    if (startedFromCache.current) return;
    if (!autoTrigger || hasTriggered.current) return;

    hasTriggered.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function checkQueueAndTrigger() {
      try {
        const response = await fetch(`/api/ai/queue/${featureName}`, { signal: controller.signal });
        if (response.ok) {
          const data: unknown = await response.json();
          const parseResult = aiQueueStatsSchema.safeParse(data);
          if (parseResult.success && parseResult.data.pending > AUTO_TRIGGER_QUEUE_THRESHOLD) {
            hasTriggered.current = false;
            return;
          }
        }
        void generateAnalysisRef.current?.(controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        void generateAnalysisRef.current?.(controller.signal);
      }
    }

    void checkQueueAndTrigger();
  }, [autoTrigger, entityId, featureName]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (state.status !== "loading") return;

    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      const nextMessage = loadingMessages[messageIndex];
      if (nextMessage) setLoadingMessage(nextMessage);
    }, 1800);

    return () => clearInterval(interval);
  }, [state.status, loadingMessages]);

  return {
    state,
    queueMessage,
    loadingMessage,
    streamingText,
    startedFromCache: startedFromCache.current,
    handleManualTrigger,
  };
}
