/**
 * Tool Registry for AI Chat
 *
 * Centralizes tool definitions for all RAG content scopes. Each tool is
 * registered once; schema generators produce both Chat Completions and
 * Responses API formats from the same registration. Force-patterns
 * determine when a tool call should be required on the first turn.
 *
 * @module api/ai/chat/tool-registry
 */

import "server-only";

import type { FunctionTool } from "openai/resources/responses/responses";
import type { ToolRegistration } from "@/types/features/ai-chat";
import { searchBookmarks, searchBooks } from "@/lib/search/searchers/dynamic-searchers";
import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchTags } from "@/lib/search/searchers/tag-search";
import {
  searchInvestments,
  searchExperience,
  searchEducation,
  searchProjects,
} from "@/lib/search/searchers/static-searchers";
import { searchAiAnalysis } from "@/lib/search/searchers/ai-analysis-searcher";
import { searchThoughts } from "@/lib/search/searchers/thoughts-search";

/** Shared parameter schema used by all search tools */
const SEARCH_TOOL_PARAMETERS = {
  type: "object",
  properties: {
    query: { type: "string", description: "The user search query" },
    maxResults: {
      type: "number",
      description: "Maximum number of matches to return (1-10, default: 5)",
    },
  },
  required: ["query", "maxResults"],
  additionalProperties: false,
} as const;

/**
 * All tool registrations. Force patterns are consistent with SCOPE_PATTERNS
 * in dynamic-retriever.ts for parity between passive RAG and active tool calls.
 */
const TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: "search_bookmarks",
    description: "Searches saved bookmark entries by natural-language query",
    searcher: searchBookmarks,
    forcePattern: /\b(?:bookmarks?|links?|resources?|saved|favorites?)\b/i,
  },
  {
    name: "search_blog",
    description: "Searches blog articles and posts by topic or keyword",
    searcher: searchBlogPostsServerSide,
    forcePattern: /\b(?:blog|articles?|posts?)\b/i,
  },
  {
    name: "search_tags",
    description: "Searches tags and topics across all content types",
    searcher: searchTags,
    forcePattern: /\b(?:tags?|topics?|categories)\b/i,
  },
  {
    name: "search_investments",
    description: "Searches investment portfolio entries (startups, ventures, funds)",
    searcher: searchInvestments,
    forcePattern: /\b(?:invest|portfolio|startups?|fund|venture|vc|backed|seed)\b/i,
  },
  {
    name: "search_projects",
    description: "Searches software projects and applications",
    searcher: searchProjects,
    forcePattern: /\b(?:projects?|built|apps?|software|github)\b/i,
  },
  {
    name: "search_experience",
    description: "Searches work experience and career history",
    searcher: searchExperience,
    forcePattern: /\b(?:work\s+(?:experience|history)|jobs?|roles?|experience|employ|career)\b/i,
  },
  {
    name: "search_education",
    description: "Searches education, degrees, and certifications",
    searcher: searchEducation,
    forcePattern: /\b(?:education|degrees?|certs?|certif|school|university|cfa|cfp|mba)\b/i,
  },
  {
    name: "search_books",
    description: "Searches books and reading list entries",
    searcher: searchBooks,
    forcePattern: /\b(?:books?|reading\s+list|authors?|bookshelf)\b/i,
  },
  {
    name: "search_analysis",
    description: "Searches AI-generated analysis summaries and insights",
    searcher: searchAiAnalysis,
    forcePattern: /\b(?:analysis|summaries|ai\s*generated)\b/i,
  },
  {
    name: "search_thoughts",
    description: "Searches personal thoughts and notes",
    searcher: searchThoughts,
    forcePattern: /\b(?:thoughts?|ruminations?)\b/i,
  },
];

/** Name-indexed lookup for O(1) dispatch */
const TOOL_MAP = new Map<string, ToolRegistration>(
  TOOL_REGISTRATIONS.map((reg) => [reg.name, reg]),
);

export function getRegisteredTools(): readonly ToolRegistration[] {
  return TOOL_REGISTRATIONS;
}

export function getToolByName(name: string): ToolRegistration | undefined {
  return TOOL_MAP.get(name);
}

/** Generate tool definitions in Chat Completions API format */
export function getChatCompletionsTools(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    strict: boolean;
    parameters: typeof SEARCH_TOOL_PARAMETERS;
  };
}> {
  return TOOL_REGISTRATIONS.map((reg) => ({
    type: "function" as const,
    function: {
      name: reg.name,
      description: reg.description,
      strict: true,
      parameters: SEARCH_TOOL_PARAMETERS,
    },
  }));
}

/** Generate tool definitions in Responses API format */
export function getResponsesTools(): FunctionTool[] {
  return TOOL_REGISTRATIONS.map((reg) => ({
    type: "function" as const,
    name: reg.name,
    description: reg.description,
    strict: true,
    parameters: SEARCH_TOOL_PARAMETERS,
  }));
}

/**
 * Check if any tool's force-pattern matches the user message.
 * Returns the name of the first matching tool, or undefined if none match.
 */
export function getForcedToolName(message: string | undefined): string | undefined {
  if (typeof message !== "string") return undefined;
  for (const reg of TOOL_REGISTRATIONS) {
    if (reg.forcePattern.test(message)) return reg.name;
  }
  return undefined;
}
