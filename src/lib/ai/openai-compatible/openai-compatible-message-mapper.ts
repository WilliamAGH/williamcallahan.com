import "server-only";

import type OpenAIClient from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";
import type { EasyInputMessage, ResponseInput } from "openai/resources/responses/responses";
import type { OpenAiCompatibleChatCompletionsRequest } from "@/types/schemas/ai-openai-compatible";

const NON_REASONING_MODEL_PREFIXES = ["gpt-3.5", "gpt-4"] as const;

function supportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  const modelSegments = normalized.split("/");
  let modelName = modelSegments.at(-1);
  if (!modelName) {
    console.warn(
      "[openai-compatible] Empty model name segment; falling back to normalized model id",
      { model, normalized },
    );
    modelName = normalized;
  }
  return !NON_REASONING_MODEL_PREFIXES.some((prefix) => modelName.startsWith(prefix));
}

export function toChatMessage(
  message: OpenAiCompatibleChatCompletionsRequest["messages"][number],
): ChatCompletionMessageParam {
  if (message.role === "system") {
    const systemMessage: ChatCompletionSystemMessageParam = {
      role: "system",
      content: message.content,
    };
    return systemMessage;
  }

  if (message.role === "user") {
    const userMessage: ChatCompletionUserMessageParam = {
      role: "user",
      content: message.content,
    };
    return userMessage;
  }

  if (message.role === "tool") {
    const toolMessage: ChatCompletionToolMessageParam = {
      role: "tool",
      tool_call_id: message.tool_call_id,
      content: message.content,
    };
    return toolMessage;
  }

  const assistantMessage: ChatCompletionAssistantMessageParam = { role: "assistant" };
  assistantMessage.content = typeof message.content === "string" ? message.content : null;
  if ("tool_calls" in message && message.tool_calls?.length) {
    assistantMessage.tool_calls = message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    }));
  }
  return assistantMessage;
}

export function toChatRequest(
  request: OpenAiCompatibleChatCompletionsRequest,
): ChatCompletionCreateParamsNonStreaming {
  const baseRequest: ChatCompletionCreateParamsNonStreaming = {
    model: request.model,
    messages: request.messages.map(toChatMessage),
  };

  if (request.temperature !== undefined) baseRequest.temperature = request.temperature;
  if (request.top_p !== undefined) baseRequest.top_p = request.top_p;
  if (request.max_tokens !== undefined) baseRequest.max_completion_tokens = request.max_tokens;
  if (request.reasoning_effort !== undefined) {
    if (supportsReasoningEffort(request.model)) {
      baseRequest.reasoning_effort = request.reasoning_effort;
    } else {
      console.warn(
        "[openai-compatible] Ignoring reasoning_effort for model family that does not support it",
        { model: request.model, reasoning_effort: request.reasoning_effort },
      );
    }
  }

  if (request.tools) {
    const chatTools: ChatCompletionTool[] = request.tools.map((tool) => {
      let parameters = tool.function.parameters;
      if (parameters === undefined) {
        console.warn("[openai-compatible] Tool parameters missing; defaulting to empty schema", {
          name: tool.function.name,
        });
        parameters = {};
      }
      return {
        type: "function",
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters,
          strict: tool.function.strict,
        },
      };
    });
    baseRequest.tools = chatTools;
  }

  if (request.tool_choice) baseRequest.tool_choice = request.tool_choice;
  if (request.parallel_tool_calls !== undefined)
    baseRequest.parallel_tool_calls = request.parallel_tool_calls;
  if (request.response_format !== undefined) baseRequest.response_format = request.response_format;
  return baseRequest;
}

export function toRequestOptions(args: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): OpenAIClient.RequestOptions {
  const options: OpenAIClient.RequestOptions = {};
  if (typeof args.timeoutMs === "number") options.timeout = args.timeoutMs;
  if (args.signal) options.signal = args.signal;
  return options;
}

export function toResponsesInput(
  messages: OpenAiCompatibleChatCompletionsRequest["messages"],
): ResponseInput {
  const getAssistantRefusal = (
    message: OpenAiCompatibleChatCompletionsRequest["messages"][number],
  ): string | undefined => {
    if (message.role !== "assistant") return undefined;
    const refusalValue = Reflect.get(message, "refusal");
    return typeof refusalValue === "string" && refusalValue.length > 0 ? refusalValue : undefined;
  };

  const items: ResponseInput = [];
  for (const message of messages) {
    if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: message.content,
      });
      continue;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      const assistantContent = typeof message.content === "string" ? message.content : undefined;
      const refusalContent = getAssistantRefusal(message);
      let content = assistantContent;
      if (typeof content !== "string" || content.length === 0) {
        content = refusalContent;
      }
      if (typeof content === "string" && content.length > 0) {
        const assistantText: EasyInputMessage = {
          type: "message",
          role: "assistant",
          content,
        };
        items.push(assistantText);
      }
      for (const toolCall of message.tool_calls) {
        items.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
      continue;
    }

    const role: EasyInputMessage["role"] = message.role;
    if (message.role === "assistant") {
      const refusalContent = getAssistantRefusal(message);
      const assistantContent = typeof message.content === "string" ? message.content : undefined;
      if ((!assistantContent || assistantContent.length === 0) && refusalContent) {
        items.push({ type: "message", role, content: refusalContent });
        continue;
      }
    }
    if (typeof message.content !== "string") {
      console.warn(
        "[openai-compatible] Non-string message content passed to Responses input; coercing to empty string",
        { role },
      );
      items.push({ type: "message", role, content: "" });
      continue;
    }
    items.push({ type: "message", role, content: message.content });
  }

  return items;
}
