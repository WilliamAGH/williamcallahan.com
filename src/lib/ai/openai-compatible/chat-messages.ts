export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Builds the OpenAI-compatible `messages` array from a mixed client payload:
 * - `featureSystemPrompt` is server-injected and always comes first (when provided).
 * - `system` is a client-provided system prompt that should always be respected (when provided),
 *   even if the client also provides a `messages` array.
 * - `messages` (if present) are appended as-is (aside from optional de-dupe of `system`).
 * - If `messages` is absent, `userText` is used to synthesize a single user message.
 *
 * Note: validation (e.g. requiring either `messages` or `userText`) is expected to happen upstream.
 */
export function buildChatMessages(args: {
  featureSystemPrompt?: string | undefined;
  system?: string | undefined;
  messages?: ChatMessage[] | undefined;
  userText?: string | undefined;
}): ChatMessage[] {
  const baseMessages: ChatMessage[] =
    args.messages && args.messages.length > 0 ? args.messages : [{ role: "user", content: args.userText ?? "" }];

  const out: ChatMessage[] = [];

  if (args.featureSystemPrompt) {
    out.push({ role: "system", content: args.featureSystemPrompt });
  }

  if (args.system) {
    const alreadyIncluded = baseMessages.some(m => m.role === "system" && m.content === args.system);
    if (!alreadyIncluded) {
      out.push({ role: "system", content: args.system });
    }
  }

  out.push(...baseMessages);
  return out;
}
