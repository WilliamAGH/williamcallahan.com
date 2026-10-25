"use client";

import { useState, useCallback, useEffect, useEffectEvent, useRef } from "react";
import { aiQueueStatsSchema } from "@/types/schemas/ai-openai-compatible-client";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { parseLlmJson } from "@/lib/ai/analysis-client-utils";
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

  const startedFromCache = Boolean(initialAnalysis?.analysis);
  const [previousInputs, setPreviousInputs] = useState({ entityId, initialAnalysis });
  const [loadingMessage, setLoadingMessage] = useState<string>(
    loadingMessages[0] ?? "Analyzing...",
  );
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const hasTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  if (previousInputs.entityId !== entityId || previousInputs.initialAnalysis !== initialAnalysis) {
    setPreviousInputs({ entityId, initialAnalysis });
    setState(
      initialAnalysis?.analysis
        ? { status: "success", analysis: initialAnalysis.analysis, error: null }
        : { status: "idle", analysis: null, error: null },
    );
    setStreamingText("");
  }

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
            analysisEntityId: entityId,
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

        if (signal?.aborted) throw new DOMException("Analysis aborted", "AbortError");

        // The chat route persists the validated analysis server-side (it finishes a
        // started generation even after this view goes away), so display only.
        setState({ status: "success", analysis: parsedAnalysis, error: null });
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
      extractContext,
      buildSystemPrompt,
      buildUserPrompt,
      responseFormat,
      responseSchema,
    ],
  );

  const activeInputsRef = useRef({ entityId, initialAnalysis });
  const triggerAutoAnalysis = useEffectEvent((requestedEntityId: string, signal: AbortSignal) => {
    if (requestedEntityId === activeInputsRef.current.entityId) void generateAnalysis(signal);
  });

  useEffect(() => {
    activeInputsRef.current = { entityId, initialAnalysis };
    hasTriggered.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [entityId, initialAnalysis]);

  const handleManualTrigger = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    void generateAnalysis(abortControllerRef.current.signal);
  }, [generateAnalysis]);

  useEffect(() => {
    if (activeInputsRef.current.initialAnalysis?.analysis) return;
    if (!autoTrigger || hasTriggered.current) return;

    hasTriggered.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function checkQueueAndTrigger() {
      try {
        const response = await fetch(`/api/ai/queue/${featureName}`, { signal: controller.signal });
        if (response.ok) {
          const queueStatsResponse: unknown = await response.json();
          const parseResult = aiQueueStatsSchema.safeParse(queueStatsResponse);
          if (parseResult.success && parseResult.data.pending > AUTO_TRIGGER_QUEUE_THRESHOLD) {
            hasTriggered.current = false;
            return;
          }
        }
        triggerAutoAnalysis(entityId, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        triggerAutoAnalysis(entityId, controller.signal);
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
    if (state.status !== "loading") return undefined;

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
    startedFromCache,
    handleManualTrigger,
  };
}
