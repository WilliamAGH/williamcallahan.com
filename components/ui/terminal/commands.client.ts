/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import type { CommandResult, TerminalSearchResult } from "@/types/terminal";
import { searchResultsSchema, type SearchResult } from "@/types/search";

// Transform SearchResult from API to TerminalSearchResult format
function transformSearchResultToSelectionItem(result: SearchResult): TerminalSearchResult {
  // Ensure we have a valid ID - SearchResult.id is required by the interface
  const id = result.id;
  if (!id) {
    console.warn("Search result is missing a stable ID. This may cause rendering issues.", result);
    // Generate a fallback ID if somehow missing
    return {
      id: crypto.randomUUID(),
      label: result.title || "Untitled",
      description: result.description || "",
      path: result.url || "#",
    };
  }

  return {
    id: `${result.type}-${id}`,
    label: result.title || "Untitled",
    description: result.description || "",
    path: result.url || "#",
  };
}

// Factory function to create searchByScopeImpl
function createSearchByScopeImpl() {
  return async (scope: string, query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
    try {
      const response = await fetch(`/api/search/${scope}?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) {
        console.error(`Search API returned ${response.status} for scope ${scope}`);
        // Return empty array instead of throwing to prevent terminal from breaking
        return [];
      }
      const data: unknown = await response.json();

      // Handle the different response format from scoped search API
      // The API returns { results: SearchResult[], meta: {...} }
      let searchResults: SearchResult[];
      if (data && typeof data === "object" && "results" in data) {
        // Type guard for scoped search response
        const typedData = data as { results: unknown; meta?: unknown };
        // Parse the results array from the response object
        searchResults = searchResultsSchema.parse(typedData.results);
      } else {
        // Fallback: try parsing the data directly as an array
        searchResults = searchResultsSchema.parse(data);
      }

      return searchResults.map(transformSearchResultToSelectionItem);
    } catch (error: unknown) {
      console.error(
        `Search API call failed for scope ${scope}:`,
        error instanceof Error ? error.message : "Unknown error",
      );
      // Return empty array instead of throwing
      return [];
    }
  };
}

// Lazy-loaded search function - only loads when first search is performed
let searchByScopeImpl:
  | ((scope: string, query: string, signal?: AbortSignal) => Promise<TerminalSearchResult[]>)
  | null = null;

// Helper function to call the consolidated search API with lazy loading
async function searchByScope(scope: string, query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> {
  // Lazy load the implementation on first use
  if (!searchByScopeImpl) {
    searchByScopeImpl = createSearchByScopeImpl();
  }

  return searchByScopeImpl(scope, query, signal);
}

// Factory function to create performSiteWideSearchImpl
function createPerformSiteWideSearchImpl() {
  return async (query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
    try {
      const response = await fetch(`/api/search/all?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) {
        console.error(`Site-wide search API returned ${response.status}`);
        // Return empty array instead of throwing to prevent terminal from breaking
        return [];
      }
      const data: unknown = await response.json();

      // The site-wide search API may return either an array or
      // an object of shape { results: SearchResult[] }. Handle both.
      const rawArray = Array.isArray(data) ? data : ((data as { results?: unknown[] })?.results ?? []);

      const searchResults: SearchResult[] = searchResultsSchema.parse(rawArray);
      return searchResults.map(transformSearchResultToSelectionItem);
    } catch (error: unknown) {
      console.error(
        "Search API call failed for site-wide search:",
        error instanceof Error ? error.message : "Unknown error",
      );
      // Return empty array instead of throwing
      return [];
    }
  };
}

// Lazy-loaded site-wide search function
let performSiteWideSearchImpl: ((query: string, signal?: AbortSignal) => Promise<TerminalSearchResult[]>) | null = null;

// Helper function to perform site-wide search with lazy loading
async function performSiteWideSearch(query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> {
  // Lazy load the implementation on first use
  if (!performSiteWideSearchImpl) {
    performSiteWideSearchImpl = createPerformSiteWideSearchImpl();
  }

  return performSiteWideSearchImpl(query, signal);
}
import type { SectionKey } from "@/types/ui/terminal";
import { sections } from "./sections";
// Removed unused usePathname import

// Preload search functionality when user starts typing
export function preloadSearch() {
  // This function can be called when the user starts typing to preload search
  // It doesn't actually execute search, just ensures the functions are ready
  // Simply set the implementation references to trigger lazy loading
  if (!searchByScopeImpl) {
    searchByScopeImpl = createSearchByScopeImpl();
  }

  if (!performSiteWideSearchImpl) {
    performSiteWideSearchImpl = createPerformSiteWideSearchImpl();
  }
}

export const terminalCommands = {
  home: "/",
  investments: "/investments",
  experience: "/experience",
  skills: "/skills",
  blog: "/blog",
  aventure: "/experience#aventure",
  tsbank: "/experience#tsbank",
  seekinvest: "/experience#seekinvest",
  "callahan-financial": "/experience#callahan-financial",
  "mutual-first": "/experience#mutual-first",
  morningstar: "/experience#morningstar",
} as const;

const HELP_MESSAGE = `
Available commands:
  help                Show this help message
  clear              Clear terminal history

AI:
  ai | chat          Open search-ai.io in a new tab

Navigation:
  home               Go to home page
  investments        Go to investments page
  experience         Go to experience page
  education          Go to education page
  blog               Go to blog page
  bookmark(s)        Go to bookmarks page

Search:
  <section> <terms>  Search within a section
                     Example: investments fintech
                     Example: bookmarks AI
                     Example: bookmark AI

Examples:
  investments fintech
  experience 2020
  bookmarks AI
  clear
`.trim();

/**
 * Safely open a URL in a new tab using an anchor click. This avoids
 * relying on the return value of window.open and prevents tabnabbing
 * with rel="noopener". Keep this synchronous within the user gesture
 * for best compatibility on mobile browsers.
 */
function openInNewTabSafe(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    console.error("Invalid URL provided to openInNewTabSafe:", rawUrl);
    return;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    console.error("Blocked non-http(s) protocol for openInNewTabSafe:", url.protocol);
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url.toString();
  anchor.target = "_blank";
  anchor.rel = "noopener"; // prevent window.opener access
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

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
    const schemas: unknown[] = Array.from(scripts).map(script => {
      try {
        return JSON.parse(script.textContent ?? "{}") as unknown; // Explicitly cast to unknown
      } catch (err: unknown) {
        return {
          error: "Invalid JSON in schema",
          details: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // Collect OpenGraph metadata (e.g., <meta property="og:title" content="..." />)
    const ogMetaElements = document.querySelectorAll<HTMLMetaElement>('meta[property^="og:"], meta[name^="og:"]');

    const ogMetadata: Record<string, string> = {};
    ogMetaElements.forEach(meta => {
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
    console.error("Error retrieving schema data:", error instanceof Error ? error.message : "Unknown error");
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

  const [command, ...args] = trimmedInput.split(" ");

  // Note: searchModule is no longer needed as we use the API directly

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

  // Open external AI search in a new tab
  if (command === "ai" || command === "chat") {
    try {
      // Open via safe anchor click; avoid Safari's null return behavior with noreferrer
      openInNewTabSafe("https://search-ai.io");
    } catch (err) {
      console.error("Failed to open external URL:", err);
    }
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: "Opening https://search-ai.io in a new tab…",
          timestamp: Date.now(),
        },
      ],
    };
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

  // 2. Check for navigation commands (e.g., "blog")

  // Type guard for valid section
  const isValidSection = (section: string): section is SectionKey => {
    return section in sections;
  };

  // Navigation command without args (e.g., "blog")
  if (command && isValidSection(command) && args.length === 0) {
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
      navigation: sections[command],
    };
  }

  // 3. Check for section-specific search (e.g., "blog javafx")
  if (command && isValidSection(command) && args.length > 0) {
    const searchTerms = args.join(" ");
    const section = command.charAt(0).toUpperCase() + command.slice(1);

    try {
      let results: TerminalSearchResult[] = [];

      switch (command) {
        case "blog": {
          results = await searchByScope("blog", searchTerms, signal);
          break;
        }
        case "experience":
          results = await searchByScope("experience", searchTerms, signal);
          break;
        case "education":
          results = await searchByScope("education", searchTerms, signal);
          break;
        case "investments":
          results = await searchByScope("investments", searchTerms, signal);
          break;
        case "bookmarks":
        case "bookmark": // Support singular form
          results = await searchByScope("bookmarks", searchTerms, signal);
          break;
      }

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
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while searching.";
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
  const searchTerms = [command, ...args].join(" ");

  try {
    // Log search info for debugging (safe logging - no object dumps)
    if (process.env.NODE_ENV === "development") {
      console.log(`[Terminal Search] Performing site-wide search for: "${searchTerms}"`);
    }

    // Lazy-loaded site-wide search
    const allResults = await performSiteWideSearch(searchTerms, signal);

    // Log results for debugging (safe logging - only counts and basic info)
    if (process.env.NODE_ENV === "development") {
      console.log(`[Terminal Search] Found ${allResults.length} results for "${searchTerms}"`);
      if (allResults.length > 0) {
        console.log(
          `[Terminal Search] Sample result titles: ${allResults
            .slice(0, 3)
            .map(r => r.label ?? "Untitled")
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
    console.error("Site-wide search API call failed:", error instanceof Error ? error.message : "Unknown error");
    // Type check for error before accessing message
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during the search.";
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
