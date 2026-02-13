# Tool Registry + OpenAI Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-tool AI chat (bookmarks only) with a registry-driven multi-tool system covering all 10 RAG content scopes, and create a general-purpose OpenAI SDK skill for Claude Code.

**Architecture:** A `tool-registry.ts` centralizes tool definitions (name, searcher, schema, force-pattern) and auto-generates schemas for both Chat Completions and Responses APIs. A generic `tool-dispatch.ts` replaces the hardcoded bookmark dispatch. Existing searcher functions are unchanged — the registry only wires them into the tool-calling pipeline.

**Tech Stack:** TypeScript, OpenAI SDK v6.18.0, Zod v4, Vitest, Next.js 16

---

## Workstream A: Tool Registry (Codebase)

### Task 1: Create shared tool types in `types/features/ai-chat.ts`

**Files:**

- Modify: `src/types/features/ai-chat.ts:77-92`

**Step 1: Write the failing test**

Create test for new types (type-level, compile-time check):

```typescript
// __tests__/types/ai-chat-tool-types.test.ts
import type {
  ExecutedToolCall,
  ToolDispatchResult,
  ToolSearchResult,
} from "@/types/features/ai-chat";

describe("AI Chat tool types", () => {
  it("ExecutedToolCall accepts generic search results", () => {
    const call: ExecutedToolCall = {
      callId: "call_1",
      failed: false,
      parsed: { query: "test", results: [{ title: "T", url: "/t" }], totalResults: 1 },
      links: [{ title: "T", url: "/t" }],
    };
    expect(call.failed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test __tests__/types/ai-chat-tool-types.test.ts`
Expected: FAIL — `ToolSearchResult` not exported, `parsed` type mismatch

**Step 3: Update types**

In `src/types/features/ai-chat.ts`, replace the bookmark-specific `ExecutedToolCall.parsed` type with a generic tool result shape:

1. Add a new `ToolSearchResult` type (replacing `SearchBookmarksToolResult` dependency):

```typescript
/** Generic tool search result — used by all registered tools */
export type ToolSearchResult = {
  query: string;
  results: Array<{ title: string; url: string; description?: string }>;
  totalResults: number;
  error?: string;
};
```

2. Update `ExecutedToolCall.parsed` from `SearchBookmarksToolResult` to `ToolSearchResult`
3. Remove the `SearchBookmarksToolResult` import

**Step 4: Run test to verify it passes**

Run: `bun run test __tests__/types/ai-chat-tool-types.test.ts`
Expected: PASS

**Step 5: Run full type check**

Run: `bun run type-check`
Expected: 0 errors (may show warnings from downstream files — that's expected, we fix those in later tasks)

**Step 6: Commit**

```bash
git add src/types/features/ai-chat.ts __tests__/types/ai-chat-tool-types.test.ts
git commit -m "feat(ai-chat): add generic ToolSearchResult type for multi-tool support"
```

---

### Task 2: Create tool-registry.ts with schema generators

**Files:**

- Create: `src/app/api/ai/chat/[feature]/tool-registry.ts`
- Test: `__tests__/api/ai/chat-tool-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/api/ai/chat-tool-registry.test.ts
import {
  getRegisteredTools,
  getChatCompletionsTools,
  getResponsesTools,
  getToolByName,
  matchesForcedToolPattern,
} from "@/app/api/ai/chat/[feature]/tool-registry";

describe("Tool Registry", () => {
  it("registers all 10 tools", () => {
    expect(getRegisteredTools()).toHaveLength(10);
  });

  it("generates Chat Completions tool schemas", () => {
    const tools = getChatCompletionsTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeDefined();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it("generates Responses API tool schemas", () => {
    const tools = getResponsesTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.name).toBeDefined();
    }
  });

  it("looks up tools by name", () => {
    const tool = getToolByName("search_bookmarks");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("search_bookmarks");
  });

  it("returns undefined for unknown tool names", () => {
    expect(getToolByName("nonexistent_tool")).toBeUndefined();
  });

  it("detects forced tool patterns", () => {
    expect(matchesForcedToolPattern("search bookmarks for react")).toBe(true);
    expect(matchesForcedToolPattern("find blog articles about AI")).toBe(true);
    expect(matchesForcedToolPattern("hello there")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/ai/chat-tool-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Implement tool-registry.ts**

Create `src/app/api/ai/chat/[feature]/tool-registry.ts`:

- Import all 10 searcher functions from their existing modules
- Define a `ToolRegistration` type with: `name`, `description`, `searcher` (the existing search function), `forcePattern` (RegExp for when to force the tool), `urlPrefix` (for result formatting)
- Create `TOOL_REGISTRATIONS` array with all 10 tools
- Export `getChatCompletionsTools()` — maps registrations to Chat Completions format
- Export `getResponsesTools()` — maps registrations to Responses API format
- Export `getToolByName(name)` — lookup by name
- Export `matchesForcedToolPattern(message)` — checks if any tool's forcePattern matches
- Export `getRegisteredTools()` — returns all registrations

The shared parameter schema for all tools:

```typescript
const SEARCH_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    query: { type: "string", description: "The user search query" },
    maxResults: { type: "number", description: "Maximum results to return (default: 5)" },
  },
  required: ["query", "maxResults"],
  additionalProperties: false,
} as const;
```

Force patterns per tool (derived from `SCOPE_PATTERNS` in `dynamic-retriever.ts:34-45`):

- `search_bookmarks`: `/\b(bookmarks?|links?|resources?|saved)\b/i`
- `search_blog`: `/\b(blog|articles?|posts?)\b/i`
- `search_tags`: `/\b(tags?|topics?|categories)\b/i`
- `search_investments`: `/\b(invest|portfolio|startups?|venture|vc)\b/i`
- `search_projects`: `/\b(projects?|built|apps?|tools?|software)\b/i`
- `search_experience`: `/\b(work|jobs?|experience|career|company)\b/i`
- `search_education`: `/\b(education|degrees?|school|university|cfa|cfp)\b/i`
- `search_books`: `/\b(books?|reading|read|library)\b/i`
- `search_analysis`: `/\b(analysis|summary|insight|overview|themes?)\b/i`
- `search_thoughts`: `/\b(thoughts?|notes?|ruminations?)\b/i`

**Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/ai/chat-tool-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/ai/chat/[feature]/tool-registry.ts __tests__/api/ai/chat-tool-registry.test.ts
git commit -m "feat(ai-chat): add tool registry with 10 content scope tools"
```

---

### Task 3: Create generic tool-dispatch.ts

**Files:**

- Create: `src/app/api/ai/chat/[feature]/tool-dispatch.ts`
- Test: `__tests__/api/ai/chat-tool-dispatch.test.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/api/ai/chat-tool-dispatch.test.ts
vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBookmarks: vi
    .fn()
    .mockResolvedValue([
      { id: "1", type: "bookmark", title: "Test BM", url: "/bookmarks/test", score: 1 },
    ]),
  searchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/blog/server-search", () => ({
  searchBlogPostsServerSide: vi
    .fn()
    .mockResolvedValue([
      { id: "2", type: "page", title: "Test Blog", url: "/blog/test", score: 1 },
    ]),
}));

import { dispatchToolCallsByName } from "@/app/api/ai/chat/[feature]/tool-dispatch";

describe("Generic Tool Dispatch", () => {
  it("dispatches search_bookmarks tool calls", async () => {
    const result = await dispatchToolCallsByName([
      {
        id: "call_1",
        function: { name: "search_bookmarks", arguments: '{"query":"test","maxResults":5}' },
      },
    ]);
    expect(result.observedResults.length).toBeGreaterThan(0);
    expect(result.failedCallIds).toHaveLength(0);
  });

  it("dispatches search_blog tool calls", async () => {
    const result = await dispatchToolCallsByName([
      {
        id: "call_2",
        function: { name: "search_blog", arguments: '{"query":"AI","maxResults":5}' },
      },
    ]);
    expect(result.failedCallIds).toHaveLength(0);
  });

  it("returns error for unknown tool names", async () => {
    const result = await dispatchToolCallsByName([
      { id: "call_3", function: { name: "unknown_tool", arguments: "{}" } },
    ]);
    expect(result.responseMessages[0]?.content).toContain("Unknown tool");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/ai/chat-tool-dispatch.test.ts`
Expected: FAIL — module not found

**Step 3: Implement tool-dispatch.ts**

Create `src/app/api/ai/chat/[feature]/tool-dispatch.ts`:

- Import `getToolByName` from `./tool-registry`
- Import types from `@/types/features/ai-chat` and `@/types/schemas/ai-openai-compatible`
- Implement `dispatchToolCallsByName()` — generic version of existing `dispatchToolCalls()`:
  1. For each tool call, look up the registration by name
  2. If not found, push error response message
  3. If found, call the registration's searcher with parsed args
  4. Format results as `{ title, url, description? }` links
  5. Return `ToolDispatchResult` (same shape as existing)
- Also implement `dispatchResponseToolCallsByName()` for Responses API format
- Also implement `extractToolCallsFromResponseOutput()` — generic version of `extractSearchBookmarkToolCalls`

This replaces `bookmark-tool-dispatch.ts` entirely.

**Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/ai/chat-tool-dispatch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/ai/chat/[feature]/tool-dispatch.ts __tests__/api/ai/chat-tool-dispatch.test.ts
git commit -m "feat(ai-chat): add generic tool dispatch supporting all registered tools"
```

---

### Task 4: Wire registry into upstream-turn.ts

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/upstream-turn.ts`

**Step 1: Run existing tests as baseline**

Run: `bun run test __tests__/api/ai/chat-upstream-pipeline-tools.test.ts`
Expected: PASS (all existing tests pass before our change)

**Step 2: Update imports in upstream-turn.ts**

Replace:

```typescript
import { SEARCH_BOOKMARKS_RESPONSE_TOOL, SEARCH_BOOKMARKS_TOOL } from "./bookmark-tool";
import {
  dispatchResponseToolCalls,
  dispatchToolCalls,
  extractSearchBookmarkToolCalls,
} from "./bookmark-tool-dispatch";
```

With:

```typescript
import { getChatCompletionsTools, getResponsesTools } from "./tool-registry";
import {
  dispatchToolCallsByName,
  dispatchResponseToolCallsByName,
  extractToolCallsFromResponseOutput,
} from "./tool-dispatch";
```

**Step 3: Update tool arrays in executeChatCompletionsTurn**

Replace `[SEARCH_BOOKMARKS_TOOL]` with `getChatCompletionsTools()` (line 43).
Replace `dispatchToolCalls(toolCalls)` with `dispatchToolCallsByName(toolCalls)` (line 125).

**Step 4: Update tool arrays in executeResponsesTurn**

Replace `[SEARCH_BOOKMARKS_RESPONSE_TOOL]` with `getResponsesTools()` (line 141).
Replace `extractSearchBookmarkToolCalls` with `extractToolCallsFromResponseOutput` (line 190).
Replace `dispatchResponseToolCalls` with `dispatchResponseToolCallsByName` (line 215).

**Step 5: Run existing tests to verify regression-free**

Run: `bun run test __tests__/api/ai/chat-upstream-pipeline-tools.test.ts`
Expected: PASS — all existing bookmark tool tests still pass

**Step 6: Run type check**

Run: `bun run type-check`
Expected: 0 errors

**Step 7: Commit**

```bash
git add src/app/api/ai/chat/[feature]/upstream-turn.ts
git commit -m "refactor(ai-chat): wire tool registry into upstream turn executors"
```

---

### Task 5: Update upstream-runner.ts for multi-tool support

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/upstream-runner.ts`

**Step 1: Update imports**

Replace bookmark-tool imports with generic equivalents. The `resolveBookmarkContent` function needs to be generalized to `resolveToolContent` that works with any tool's observed results.

**Step 2: Generalize `resolveBookmarkContent` to `resolveToolContent`**

The existing function sanitizes model-authored links against tool-observed URLs. The generic version does the same but for any tool's results — the allowlist is built from `toolObservedResults` regardless of which tool produced them.

**Step 3: Generalize `resolveBookmarkFallback`**

Currently only fires for bookmark searches. Generalize to fire for any forced tool that produced no results — call the registry's deterministic fallback (run the matched tool's searcher directly with the user message).

**Step 4: Update `UpstreamRunnerConfig`**

In `src/types/features/ai-chat.ts:128-141`, rename `forceBookmarkTool` to `forcedToolName` (string | undefined). This signals which specific tool was force-matched, or undefined if none.

**Step 5: Run existing tests**

Run: `bun run test __tests__/api/ai/chat-upstream-pipeline-tools.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/ai/chat/[feature]/upstream-runner.ts src/types/features/ai-chat.ts
git commit -m "refactor(ai-chat): generalize upstream runner for multi-tool dispatch"
```

---

### Task 6: Update feature-defaults.ts system prompt and tool choice

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/feature-defaults.ts`

**Step 1: Update system prompt**

Replace the bookmark-only tool instructions with a comprehensive multi-tool prompt. The new prompt should:

- List all available tools and their purposes
- Describe the tool-call procedure (identify scope → call tool → answer from results)
- Specify URL formats per tool type
- Include fallback instruction

**Step 2: Update `resolveToolChoice`**

Replace `forceBookmarkTool` param with `forcedToolName` (string | undefined). Logic stays the same: if a tool is forced and turn is 0, return "required" (or "auto" for Harmony models).

**Step 3: Run existing pattern matching tests**

Run: `bun run test __tests__/api/ai/chat-bookmark-tool-patterns.test.ts`
Expected: The `resolveToolChoice` tests need parameter updates to match new signature

**Step 4: Update tests for new signature**

Update `__tests__/api/ai/chat-bookmark-tool-patterns.test.ts` to use `forcedToolName: "search_bookmarks"` instead of `forceBookmarkTool: true`.

**Step 5: Run updated tests**

Run: `bun run test __tests__/api/ai/chat-bookmark-tool-patterns.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/ai/chat/[feature]/feature-defaults.ts __tests__/api/ai/chat-bookmark-tool-patterns.test.ts
git commit -m "feat(ai-chat): update system prompt and tool choice for multi-tool support"
```

---

### Task 7: Update upstream-pipeline.ts for registry-based force detection

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/upstream-pipeline.ts`

**Step 1: Replace `matchesBookmarkSearchPattern` with registry lookup**

Replace:

```typescript
import { matchesBookmarkSearchPattern } from "./bookmark-tool";
// ...
const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);
```

With:

```typescript
import { matchesForcedToolPattern, getForcedToolName } from "./tool-registry";
// ...
const forcedToolName = hasToolSupport ? getForcedToolName(latestUserMessage) : undefined;
```

**Step 2: Update createUpstreamRunner call**

Pass `forcedToolName` instead of `forceBookmarkTool`.

**Step 3: Run full pipeline tests**

Run: `bun run test __tests__/api/ai/chat-upstream-pipeline-tools.test.ts __tests__/api/ai/chat-upstream-pipeline-streaming.test.ts`
Expected: PASS (may need test harness updates — see next step)

**Step 4: Update test harness if needed**

`__tests__/api/ai/upstream-pipeline-test-harness.ts` likely references `forceBookmarkTool`. Update to `forcedToolName`.

**Step 5: Commit**

```bash
git add src/app/api/ai/chat/[feature]/upstream-pipeline.ts __tests__/api/ai/upstream-pipeline-test-harness.ts
git commit -m "refactor(ai-chat): use tool registry for force-pattern detection in pipeline"
```

---

### Task 8: Clean up bookmark-tool.ts and delete bookmark-tool-dispatch.ts

**Files:**

- Modify: `src/app/api/ai/chat/[feature]/bookmark-tool.ts`
- Delete: `src/app/api/ai/chat/[feature]/bookmark-tool-dispatch.ts`

**Step 1: Remove tool schema constants from bookmark-tool.ts**

Remove `SEARCH_BOOKMARKS_TOOL` and `SEARCH_BOOKMARKS_RESPONSE_TOOL` exports (now in registry). Keep:

- `matchesBookmarkSearchPattern` (still used for backward compat in tests)
- `executeSearchBookmarksTool`
- `formatBookmarkResultsAsLinks`
- `sanitizeBookmarkLinksAgainstAllowlist`
- `extractSearchQueryFromMessage`
- `runDeterministicBookmarkFallback`

**Step 2: Delete bookmark-tool-dispatch.ts**

All its functionality is now in `tool-dispatch.ts`. Remove the file.

**Step 3: Update all remaining imports**

Search for any remaining imports of `bookmark-tool-dispatch` and update them.

Run: `bun run type-check`
Expected: 0 errors

**Step 4: Run full test suite**

Run: `bun run test __tests__/api/ai/`
Expected: PASS

**Step 5: Commit**

```bash
git add -u src/app/api/ai/chat/[feature]/bookmark-tool.ts
git rm src/app/api/ai/chat/[feature]/bookmark-tool-dispatch.ts
git commit -m "refactor(ai-chat): remove bookmark-specific dispatch; tool-dispatch.ts handles all tools"
```

---

### Task 9: Add Zod schema for generic tool args and results

**Files:**

- Modify: `src/types/schemas/ai-chat.ts`

**Step 1: Add generic tool schemas**

The existing `searchBookmarksToolArgsSchema` and `searchBookmarksToolResultSchema` are bookmark-specific names but the shapes are generic. Add aliases or replace:

```typescript
/** Generic tool call arguments — all search tools share this shape */
export const searchToolArgsSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export type SearchToolArgs = z.infer<typeof searchToolArgsSchema>;

/** Generic tool call result — all search tools return this shape */
export const searchToolResultSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      description: z.string().optional(),
    }),
  ),
  totalResults: z.number().int().min(0),
  error: z.string().optional(),
});

export type SearchToolResult = z.infer<typeof searchToolResultSchema>;
```

Keep the bookmark-specific schemas as aliases for backward compatibility with existing tests:

```typescript
export const searchBookmarksToolArgsSchema = searchToolArgsSchema;
export const searchBookmarksToolResultSchema = searchToolResultSchema;
```

**Step 2: Run type check and tests**

Run: `bun run type-check && bun run test __tests__/api/ai/`
Expected: PASS

**Step 3: Commit**

```bash
git add src/types/schemas/ai-chat.ts
git commit -m "feat(ai-chat): add generic SearchToolArgs and SearchToolResult Zod schemas"
```

---

### Task 10: Validate with full test suite and lint

**Files:** None (verification only)

**Step 1: Run full validation**

Run: `bun run validate`
Expected: 0 errors, 0 warnings

**Step 2: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 3: Check file sizes**

Run: `bun run check:file-size`
Expected: No new violations (all new files <= 350 lines)

**Step 4: Commit any fixups**

If validation surfaced issues, fix and commit.

---

## Workstream B: OpenAI Skill (Claude Code)

### Task 11: Create OpenAI skill directory and SKILL.md

**Files:**

- Create: `/Users/williamcallahan/.claude/skills/openai/SKILL.md`

**Step 1: Create the skill directory**

```bash
mkdir -p /Users/williamcallahan/.claude/skills/openai/references
```

**Step 2: Write SKILL.md**

Write the main skill file with YAML frontmatter and content sections. The skill should be grounded in verified facts from:

- `node_modules/openai/package.json` (version: 6.18.0)
- `src/lib/ai/openai-compatible/openai-compatible-client.ts` (real usage patterns)
- `src/lib/ai/openai-compatible/think-tag-parser.ts` (thinking token handling)
- `src/app/api/ai/chat/[feature]/feature-defaults.ts` (Harmony format detection)

Sections: Essentials, API Endpoints, Tool Calling, Streaming, Reasoning/Thinking, Common Pitfalls.

**Step 3: Verify skill loads**

Open a new Claude Code session and check that `openai` appears in the skill list.

**Step 4: Commit**

```bash
git add /Users/williamcallahan/.claude/skills/openai/SKILL.md
git commit -m "feat(skill): add OpenAI SDK reference skill for Claude Code"
```

---

### Task 12: Write provider-compatibility.md reference

**Files:**

- Create: `/Users/williamcallahan/.claude/skills/openai/references/provider-compatibility.md`

Content covers:

- LM Studio 0.4.2: `baseURL` override, supported endpoints, Harmony format limitations
- Ollama: endpoint differences, model naming
- vLLM: high-throughput serving, tool calling support
- General: `tool_choice: "required"` behavior differences across providers

**Step 1: Write the reference doc**

**Step 2: Commit**

```bash
git add /Users/williamcallahan/.claude/skills/openai/references/provider-compatibility.md
git commit -m "feat(skill): add OpenAI provider compatibility reference"
```

---

### Task 13: Write tool-calling-patterns.md reference

**Files:**

- Create: `/Users/williamcallahan/.claude/skills/openai/references/tool-calling-patterns.md`

Content covers:

- Function tool schema shape (Chat Completions vs Responses API)
- `strict: true` mode and `additionalProperties: false` requirement
- `tool_choice` values: `"none"`, `"auto"`, `"required"`, specific function
- `parallel_tool_calls` behavior
- Multi-turn tool calling flow
- Dispatching tool results back to the model
- Common mistakes: missing `additionalProperties: false`, wrong arg types

**Step 1: Write the reference doc**

**Step 2: Commit**

```bash
git add /Users/williamcallahan/.claude/skills/openai/references/tool-calling-patterns.md
git commit -m "feat(skill): add OpenAI tool calling patterns reference"
```

---

### Task 14: Write streaming-patterns.md reference

**Files:**

- Create: `/Users/williamcallahan/.claude/skills/openai/references/streaming-patterns.md`

Content covers:

- Chat Completions streaming: `stream: true`, `client.chat.completions.stream()`, delta events
- Responses streaming: `client.responses.stream()`, event types
- `finalChatCompletion()` and `finalResponse()` for assembled results
- SSE event format for frontend consumption
- Think-tag parsing for streaming reasoning models

**Step 1: Write the reference doc**

**Step 2: Commit**

```bash
git add /Users/williamcallahan/.claude/skills/openai/references/streaming-patterns.md
git commit -m "feat(skill): add OpenAI streaming patterns reference"
```

---

### Task 15: Write open-source-models.md reference

**Files:**

- Create: `/Users/williamcallahan/.claude/skills/openai/references/open-source-models.md`

Content covers:

- gpt-oss-120b: Harmony response format, recommended temperature=1.0/topP=1.0
- Thinking tokens: `reasoning_content` (DeepSeek format), `reasoning` (llama.cpp auto), `<think>` tags
- llama.cpp `json_schema` conflicts with Harmony-format models
- `tool_choice: "required"` ignored by llama.cpp for Harmony models (must use "auto" + deterministic fallback)
- Model fallback pattern: comma-separated model list, `isModelLoadFailure` detection

**Step 1: Write the reference doc**

**Step 2: Commit**

```bash
git add /Users/williamcallahan/.claude/skills/openai/references/open-source-models.md
git commit -m "feat(skill): add open-source model reference (gpt-oss, Harmony, thinking tokens)"
```

---

## Final Verification

### Task 16: End-to-end verification

**Step 1: Run full validation suite**

Run: `bun run validate`
Expected: 0 errors, 0 warnings

**Step 2: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 3: Run type check**

Run: `bun run type-check`
Expected: 0 errors

**Step 4: Check file sizes**

Run: `bun run check:file-size`
Expected: No new violations

**Step 5: Verify skill files exist**

```bash
ls -la /Users/williamcallahan/.claude/skills/openai/
ls -la /Users/williamcallahan/.claude/skills/openai/references/
```

**Step 6: Final commit (if any fixups)**

---

## Task Dependencies

```
Task 1 (types) ──→ Task 2 (registry) ──→ Task 3 (dispatch) ──→ Task 4 (upstream-turn)
                                                                       │
                                                                       ↓
Task 5 (upstream-runner) ──→ Task 6 (feature-defaults) ──→ Task 7 (pipeline)
                                                                       │
                                                                       ↓
Task 8 (cleanup) ──→ Task 9 (schemas) ──→ Task 10 (validate)

Task 11 (SKILL.md) ──→ Task 12 (providers) ──→ Task 13 (tool-calling)
                                                       │
                                                       ↓
                    Task 14 (streaming) ──→ Task 15 (open-source) ──→ Task 16 (verify)
```

Workstream A (Tasks 1-10) and Workstream B (Tasks 11-15) are independent and can run in parallel. Task 16 depends on both.
