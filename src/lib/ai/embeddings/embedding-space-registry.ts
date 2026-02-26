import type { EmbeddingSpaceId } from "@/types/schemas/embedding-space";

function normalizeProviderModelId(value: string): string {
  return value.trim().toLowerCase();
}

const QWEN3_EMBEDDING_4B_SPACE_ID: EmbeddingSpaceId = "qwen3-embedding-4b";

const PROVIDER_MODEL_ID_ALIASES_BY_SPACE_ID: Readonly<Record<EmbeddingSpaceId, Set<string>>> = {
  "qwen3-embedding-4b": new Set<string>([
    // PopOS/LM Studio-style
    "text-embedding-qwen3-embedding-4b",
    // OpenRouter-style
    "qwen/qwen3-embedding-4b",
  ]),
};

export function resolveEmbeddingSpaceIdForProviderModelId(
  providerModelId: string,
): EmbeddingSpaceId | null {
  const normalized = normalizeProviderModelId(providerModelId);

  for (const [spaceId, aliases] of Object.entries(PROVIDER_MODEL_ID_ALIASES_BY_SPACE_ID) as Array<
    [EmbeddingSpaceId, Set<string>]
  >) {
    if (aliases.has(normalized)) {
      return spaceId;
    }
  }

  return null;
}

export function requireEmbeddingSpaceIdForProviderModelId(
  providerModelId: string,
): EmbeddingSpaceId {
  const resolved = resolveEmbeddingSpaceIdForProviderModelId(providerModelId);
  if (resolved) {
    return resolved;
  }

  const knownAliases = [...PROVIDER_MODEL_ID_ALIASES_BY_SPACE_ID[QWEN3_EMBEDDING_4B_SPACE_ID]]
    .toSorted()
    .map((alias) => `"${alias}"`)
    .join(", ");

  throw new Error(
    [
      "AI_DEFAULT_EMBEDDING_MODEL is set to an unsupported provider model id.",
      `Received: "${providerModelId}"`,
      `Known aliases for ${QWEN3_EMBEDDING_4B_SPACE_ID}: ${knownAliases}`,
    ].join(" "),
  );
}
