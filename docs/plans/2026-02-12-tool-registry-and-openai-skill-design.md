# Design: Tool Registry for AI Chat + OpenAI Skill

**Date**: 2026-02-12
**Status**: Approved

## Problem

The AI chat terminal has a single tool (`search_bookmarks`) while the RAG system
supports 10 content scopes. When users ask about blog articles, tags, or
investments, the model either falls back to bookmark search (wrong domain) or
answers only from passive RAG context (no active search). Tool calls for
non-bookmark content types effectively fail silently.

Separately, the codebase uses `openai` SDK v6.18.0 with both Chat Completions
and Responses APIs against OpenAI-compatible providers (LM Studio 0.4.2 with
gpt-oss models). This knowledge is tribal and undocumented.

## Solution

### Part 1: Tool Registry

Create a `tool-registry.ts` module that:

1. Defines a `ToolRegistration` type: name, description, parameter schema,
   searcher function, result formatter, force-pattern regex, optional URL
   sanitizer
2. Auto-generates tool schemas in both Chat Completions and Responses API
   formats from a single registration
3. Dispatches tool calls by name lookup (replaces hardcoded bookmark dispatch)
4. Supports per-tool forced invocation patterns

#### Tool Registrations (10 scopes)

| Tool Name            | Searcher Function           | Source Module             |
| -------------------- | --------------------------- | ------------------------- |
| `search_bookmarks`   | `searchBookmarks`           | `dynamic-searchers.ts`    |
| `search_blog`        | `searchBlogPostsServerSide` | `blog/server-search.ts`   |
| `search_tags`        | `searchTags`                | `tag-search.ts`           |
| `search_investments` | `searchInvestments`         | `static-searchers.ts`     |
| `search_projects`    | `searchProjects`            | `static-searchers.ts`     |
| `search_experience`  | `searchExperience`          | `static-searchers.ts`     |
| `search_education`   | `searchEducation`           | `static-searchers.ts`     |
| `search_books`       | `searchBooks`               | `dynamic-searchers.ts`    |
| `search_analysis`    | `searchAiAnalysis`          | `ai-analysis-searcher.ts` |
| `search_thoughts`    | `searchThoughts`            | `thoughts-search.ts`      |

All searchers already exist and return `SearchResult[]`. The registry wraps them
with tool calling mechanics.

#### File Changes

- **NEW**: `tool-registry.ts` -- Tool registrations, schema generators
- **NEW**: `tool-dispatch.ts` -- Generic dispatch by tool name (replaces
  bookmark-specific dispatch)
- **MODIFY**: `bookmark-tool.ts` -- Keep bookmark-specific helpers (URL
  sanitization, deterministic fallback, search pattern matching). Remove tool
  schema constants (moved to registry).
- **DELETE**: `bookmark-tool-dispatch.ts` -- Functionality moves to
  `tool-dispatch.ts`
- **MODIFY**: `upstream-turn.ts` -- Use registry-generated tool arrays instead
  of hardcoded `SEARCH_BOOKMARKS_TOOL`
- **MODIFY**: `upstream-runner.ts` -- Use generic dispatch; generalize bookmark
  fallback to any forced tool
- **MODIFY**: `feature-defaults.ts` -- Update system prompt to describe all
  tools; generalize `resolveToolChoice` for multi-tool forcing
- **MODIFY**: `upstream-pipeline.ts` -- Use registry for force-pattern detection

#### System Prompt Update

Generalize the tool-call instructions to cover all registered tools:

- List each tool and its purpose
- Tool-call procedure: identify scope, call appropriate tool, answer from results
- URL format per tool (bookmarks -> `/bookmarks/slug`, blog -> `/blog/slug`, etc.)
- Fallback: if no tool matches, answer from RAG context

#### URL Sanitization

Generalize the existing bookmark URL allowlist pattern:

- Each tool registration optionally provides a `sanitizeLinks` function
- For tools returning internal URLs, only allow URLs the tool actually returned
- Prevents model-hallucinated URLs in responses

### Part 2: OpenAI Skill

Create a general-purpose Claude Code skill for OpenAI SDK reference.

#### Directory Structure

```
/Users/williamcallahan/.claude/skills/openai/
  SKILL.md                          -- Main skill
  references/
    provider-compatibility.md       -- LM Studio, Ollama, vLLM
    tool-calling-patterns.md        -- Strict mode, parallel calls, schemas
    streaming-patterns.md           -- SSE, deltas, think-tag parsing
    open-source-models.md           -- gpt-oss, Harmony format, thinking tokens
```

#### SKILL.md Sections

1. **Essentials**: SDK v6.x, client instantiation, `baseURL` override
2. **API Endpoints**: `v1/chat/completions`, `v1/responses`, `v1/models`
3. **Tool Calling**: Function schemas, `strict: true`, `tool_choice`, dispatch
4. **Streaming**: `stream: true`, delta events, `finalChatCompletion()`
5. **Reasoning/Thinking**: `reasoning_effort`, thinking token fields
6. **Common Pitfalls**: Links to reference docs

#### Provider Compatibility Reference

- LM Studio 0.4.2: Harmony format limitations, `tool_choice: "required"` issues
- gpt-oss-120b: Thinking tokens via `<think>` tags and `reasoning` field
- llama.cpp: `json_schema` structured output conflicts with Harmony models

## Dependencies

- All searcher functions already exist and are tested
- OpenAI SDK v6.18.0 already installed
- Tool schemas use the same Zod validation pipeline as `search_bookmarks`

## Testing Strategy

- Unit tests for tool-registry schema generation (both API formats)
- Unit tests for generic dispatch routing
- Integration test: mock upstream returning tool_calls for each registered tool
- Existing bookmark tool tests must continue passing (regression)
