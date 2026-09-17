/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import type { CommandResult, SelectionEntry } from "@/types/terminal";
import { searchResultsSchema } from "@/types/schemas/search";
import { transformSearchResultToTerminalResult } from "@/lib/utils/search-helpers";
import { aiChat } from "@/lib/ai/openai-compatible/browser-client";
import { isSectionKey, sections, terminalNavigationHelp } from "./sections";

async function fetchSearchResults(path: string, signal?: AbortSignal): Promise<SelectionEntry[]> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many searches in the last minute. Wait a moment and try again."
        : `Search API returned ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  // Routes return { results, meta }; a bare array is accepted for older callers/tests.
  const raw = body && typeof body === "object" && "results" in body ? body.results : body;
  return searchResultsSchema.parse(raw).map(transformSearchResultToTerminalResult);
}

const searchByScope = (scope: string, query: string, signal?: AbortSignal) =>
  fetchSearchResults(`/api/search/${scope}?q=${encodeURIComponent(query)}`, signal);

const performSiteWideSearch = (query: string, focus: string | null, signal?: AbortSignal) =>
  fetchSearchResults(
    `/api/search/all?q=${encodeURIComponent(query)}${focus ? `&focus=${focus}` : ""}`,
    signal,
  );

const BOOKMARK_FOCUS_FLAGS = new Set(["--bookmarks", "-b"]);

/**
 * Splits a site-wide search input into the query and the focused scope.
 * Bookmarks are focused by an explicit flag anywhere in the input, or implicitly
 * while the reader is on a bookmarks page.
 */
function resolveSiteWideSearch(terms: string[]): { query: string; focus: string | null } {
  const query = terms.filter((term) => !BOOKMARK_FOCUS_FLAGS.has(term));
  const flagged = query.length !== terms.length;
  const onBookmarksPage = /^\/bookmarks(\/|$)/.test(window.location.pathname);
  return { query: query.join(" "), focus: flagged || onBookmarksPage ? "bookmarks" : null };
}

// fetch() rejects with signal.reason verbatim, and every terminal abort passes a
// string reason (use-terminal.client.tsx), so the thrown value is not a
// DOMException. The signal is the reliable witness; the DOMException arm still
// covers an abort() called with no reason.
const isAbortError = (error: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");

const HELP_MESSAGE = `
Available commands:
  help               Show this help message
  clear              Clear terminal history
  ai | chat | ai-chat AI chat (modal or one-shot)

Navigate:
  ${terminalNavigationHelp.navigate}

Search:
  <section> <query>  Search within a section
  <query> --bookmarks  Site-wide search keeping up to 50 bookmark hits (-b also works)
  ai <message>       One-shot AI reply (no modal)

  e.g.  investments AI       blog claude
        projects java        books ai safety
        ai explain cache components

Quick jumps:
  ${terminalNavigationHelp.quickJumps}

Or just type anything to search the entire site.
On /bookmarks, site-wide searches focus bookmarks without the flag.
`.trim();

/**
 * Get the Schema.org data for the current page
 * @param includeDebug - Whether to include debug information (path, URL, timestamp)
 * @returns Schema.org JSON-LD data as a formatted string
 */
function getSchemaOrgData(includeDebug = false): string {
  try {
    // Find all script tags with type application/ld+json
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    if (!scripts || scripts.length === 0) {
      return "No Schema.org data found on this page.";
    }

    // Collect all JSON-LD data from scripts
    const schemas: unknown[] = Array.from(scripts).map((script) => {
      try {
        const parsed: unknown = JSON.parse(script.textContent ?? "{}");
        return parsed;
      } catch (err: unknown) {
        return {
          error: "Invalid JSON in schema",
          details: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // Collect OpenGraph metadata (e.g., <meta property="og:title" content="..." />)
    const ogMetaElements = document.querySelectorAll<HTMLMetaElement>(
      'meta[property^="og:"], meta[name^="og:"]',
    );

    const ogMetadata: Record<string, string> = {};
    ogMetaElements.forEach((meta) => {
      const key = meta.getAttribute("property") ?? meta.getAttribute("name");
      const value = meta.getAttribute("content") ?? "";
      if (key && value) {
        ogMetadata[key] = value;
      }
    });

    // For non-debug mode, just return the clean output
    if (!includeDebug) {
      const output = {
        schemas,
        opengraph: ogMetadata,
      };
      return JSON.stringify(output, null, 2);
    }

    // Debug mode includes additional information
    const path = window.location.pathname;
    const debugOutput = {
      path,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      schemas,
      opengraph: ogMetadata,
    };

    // Return formatted JSON with debug header
    return `Schema.org Diagnostics for ${path}:\n\n${JSON.stringify(debugOutput, null, 2)}`;
  } catch (error: unknown) {
    console.error(
      "Error retrieving schema data:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return "Error retrieving Schema.org data. Check the console for details.";
  }
}

export async function handleCommand(input: string, signal?: AbortSignal): Promise<CommandResult> {
  // Process the input
  const trimmedInput = input.toLowerCase().trim();

  // Short-circuit: do nothing if the user entered only whitespace
  if (trimmedInput.length === 0) {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: 'No command entered. Type "help" for available commands.',
          timestamp: Date.now(),
        },
      ],
    };
  }

  // The bookmarks flag is meaningful on every path: strip it before dispatch.
  const { query: flaglessInput, focus } = resolveSiteWideSearch(trimmedInput.split(" "));
  if (flaglessInput.length === 0) {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: "The bookmarks flag needs search terms, e.g. `--bookmarks postgres`.",
          timestamp: Date.now(),
        },
      ],
    };
  }
  const [command, ...args] = flaglessInput.split(" ");

  // 1. First check for direct commands that take precedence

  // Support both "schema" and "schema.org" for the schema diagnostics command
  if (command === "schema" || command === "schema.org") {
    // Check if --debug flag was passed
    const includeDebug = args.includes("--debug");

    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: getSchemaOrgData(includeDebug),
          timestamp: Date.now(),
        },
      ],
    };
  }

  if (command === "ai" || command === "chat" || command === "ai-chat") {
    if (args.length === 0) {
      return {
        results: [
          {
            type: "text",
            id: crypto.randomUUID(),
            input: "",
            output: "Entering AI chat… (Tip: use `ai <message>` for a one-shot reply.)",
            timestamp: Date.now(),
          },
        ],
      };
    }

    const userText = args.join(" ").trim();
    if (!userText) {
      return {
        results: [
          {
            type: "text",
            id: crypto.randomUUID(),
            input: "",
            output: "No message provided.",
            timestamp: Date.now(),
          },
        ],
      };
    }

    try {
      const assistantText = await aiChat(
        "terminal_chat",
        {
          messages: [{ role: "user", content: userText }],
          priority: 10,
          apiMode: "chat_completions",
        },
        { signal },
      );

      return {
        results: [
          {
            type: "chat",
            id: crypto.randomUUID(),
            input: "",
            role: "user",
            content: userText,
            timestamp: Date.now(),
          },
          {
            type: "chat",
            id: crypto.randomUUID(),
            input: "",
            role: "assistant",
            content: assistantText,
            timestamp: Date.now(),
          },
        ],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        results: [
          {
            type: "error",
            id: crypto.randomUUID(),
            input: "",
            error: "AI chat failed.",
            details: message,
            timestamp: Date.now(),
          },
        ],
      };
    }
  }

  // Clear command
  if (command === "clear") {
    return {
      results: [],
      clear: true,
    };
  }

  // Help command
  if (command === "help") {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: HELP_MESSAGE,
          timestamp: Date.now(),
        },
      ],
    };
  }

  // Auth commands: sign-in / auth / login
  if (command === "auth" || command === "sign-in" || command === "signin" || command === "login") {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: "Redirecting to sign in...",
          timestamp: Date.now(),
        },
      ],
      navigation: "/sign-in",
    };
  }

  // Sign-out command: sign-out / signout / logout
  if (command === "sign-out" || command === "signout" || command === "logout") {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: "Signing out...",
          timestamp: Date.now(),
        },
      ],
      action: "signOut",
    };
  }

  // 2. Check for navigation commands (e.g., "blog")

  const sectionDefinition = command && isSectionKey(command) ? sections[command] : null;

  // Navigation command without args (e.g., "blog")
  if (command && sectionDefinition && args.length === 0) {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: `Navigating to ${command}...`,
          timestamp: Date.now(),
        },
      ],
      navigation: sectionDefinition.path,
    };
  }

  // 3. Check for section-specific search (e.g., "blog javafx")
  if (
    command &&
    sectionDefinition !== null &&
    sectionDefinition.searchScope !== null &&
    args.length > 0
  ) {
    const searchTerms = args.join(" ");
    const section = command.charAt(0).toUpperCase() + command.slice(1);
    const scope = sectionDefinition.searchScope;

    try {
      const results = await searchByScope(scope, searchTerms, signal);

      if (results.length === 0) {
        return {
          results: [
            {
              type: "text",
              id: crypto.randomUUID(),
              input: "",
              output: `No results found in ${section} for "${searchTerms}"`,
              timestamp: Date.now(),
            },
          ],
        };
      }

      return {
        results: [
          {
            type: "text",
            id: crypto.randomUUID(),
            input: "",
            output: `Found ${results.length} results in ${section} for "${searchTerms}"`,
            timestamp: Date.now(),
          },
        ],
        selectionItems: results,
      };
    } catch (error: unknown) {
      if (isAbortError(error, signal)) throw error;
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred while searching.";
      console.error(`Error searching in section ${command}:`, errorMessage);
      return {
        results: [
          {
            type: "text",
            id: crypto.randomUUID(),
            input: "",
            output: `Error searching ${command}: ${errorMessage}`,
            timestamp: Date.now(),
          },
        ],
      };
    }
  }

  // 4. If not a direct command or section command, perform site-wide search
  // IMPORTANT: This now takes precedence over "command not recognized" to fix the multi-word search issue
  const searchTerms = flaglessInput;

  try {
    // Log search info for debugging (safe logging - no object dumps)
    if (process.env.NODE_ENV === "development") {
      console.log(`[Terminal Search] Performing site-wide search for: "${searchTerms}"`);
    }

    const allResults = await performSiteWideSearch(searchTerms, focus, signal);

    // Log results for debugging (safe logging - only counts and basic info)
    if (process.env.NODE_ENV === "development") {
      console.log(`[Terminal Search] Found ${allResults.length} results for "${searchTerms}"`);
      if (allResults.length > 0) {
        console.log(
          `[Terminal Search] Sample result titles: ${allResults
            .slice(0, 3)
            .map((r) => r.label ?? "Untitled")
            .join(", ")}`,
        );
      }
    }

    // Check if we got any results
    if (allResults.length === 0) {
      // Only now do we return "command not recognized" if no search results found
      return {
        results: [
          {
            type: "text",
            id: crypto.randomUUID(),
            input: "",
            output: `Command not recognized. Type "help" for available commands.`,
            timestamp: Date.now(),
          },
        ],
      };
    }

    // Otherwise, return search results
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: `Found ${allResults.length} site-wide results for "${searchTerms}"`,
          timestamp: Date.now(),
        },
      ],
      selectionItems: allResults,
    };
  } catch (error: unknown) {
    if (isAbortError(error, signal)) throw error;
    console.error(
      "Site-wide search API call failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred during the search.";
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: searchTerms,
          output: `Error during site-wide search: ${errorMessage}`,
          timestamp: Date.now(),
        },
      ],
    };
  }
}
