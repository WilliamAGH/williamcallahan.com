/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import type { CommandResult, TerminalSearchResult } from "@/types/terminal";
import type { SearchResult } from "@/types/search";
import { searchResultsSchema } from "@/types/search";

// Transform SearchResult from API to TerminalSearchResult format
function transformSearchResultToSelectionItem(result: SearchResult): TerminalSearchResult {
  if (!result.id) {
    console.warn("Search result is missing a stable ID. This may cause rendering issues.", result);
  }
  return {
    id: result.id ? `${result.type}-${result.id}` : crypto.randomUUID(),
    label: result.title,
    description: result.description || "",
    path: result.url,
  };
}

// Lazy-loaded search function - only loads when first search is performed
let searchByScopeImpl: ((scope: string, query: string, signal?: AbortSignal) => Promise<TerminalSearchResult[]>) | null = null;

// Helper function to call the consolidated search API with lazy loading
async function searchByScope(scope: string, query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> {
  // Lazy load the implementation on first use
  if (!searchByScopeImpl) {
    searchByScopeImpl = async (scope: string, query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
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
        if (data && typeof data === 'object' && 'results' in data) {
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

  return searchByScopeImpl(scope, query, signal);
}

// Lazy-loaded site-wide search function
let performSiteWideSearchImpl: ((query: string, signal?: AbortSignal) => Promise<TerminalSearchResult[]>) | null = null;

// Helper function to perform site-wide search with lazy loading
async function performSiteWideSearch(query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> {
  // Lazy load the implementation on first use
  if (!performSiteWideSearchImpl) {
    performSiteWideSearchImpl = async (query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
      try {
        const response = await fetch(`/api/search/all?q=${encodeURIComponent(query)}`, { signal });
        if (!response.ok) {
          console.error(`Site-wide search API returned ${response.status}`);
          // Return empty array instead of throwing to prevent terminal from breaking
          return [];
        }
        const data: unknown = await response.json();
        // Parse as SearchResult array and transform to TerminalSearchResult
        const searchResults: SearchResult[] = searchResultsSchema.parse(data);
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
    searchByScopeImpl = async (scope: string, query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
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
        if (data && typeof data === 'object' && 'results' in data) {
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

  if (!performSiteWideSearchImpl) {
    performSiteWideSearchImpl = async (query: string, signal?: AbortSignal): Promise<TerminalSearchResult[]> => {
      try {
        const response = await fetch(`/api/search/all?q=${encodeURIComponent(query)}`, { signal });
        if (!response.ok) {
          console.error(`Site-wide search API returned ${response.status}`);
          // Return empty array instead of throwing to prevent terminal from breaking
          return [];
        }
        const data: unknown = await response.json();
        // Parse as SearchResult array and transform to TerminalSearchResult
        const searchResults: SearchResult[] = searchResultsSchema.parse(data);
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
 * Get the Schema.org data for the current page
 * @returns Schema.org JSON-LD data as a formatted string
 */
function getSchemaOrgData(): string {
  try {
    // Find all script tags with type application/ld+json
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    if (!scripts || scripts.length === 0) {
      return "No Schema.org data found on this page.";
    }

    // Collect all JSON-LD data from scripts
    const schemas: unknown[] = Array.from(scripts).map((script) => {
      // Typed schemas as unknown[]
      try {
        return JSON.parse(script.textContent || "{}") as unknown; // Explicitly cast to unknown
      } catch (err: unknown) {
        // Renamed err to _err and used it
        return {
          error: "Invalid JSON in schema",
          details: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // Get the current path to include in the diagnostics
    const path = window.location.pathname;

    // Format the diagnostics output
    const output = {
      path,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      schemas,
    };

    // Return formatted JSON
    return `Schema.org Diagnostics for ${path}:\n\n${JSON.stringify(output, null, 2)}`;
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

  // Schema.org easter egg command
  if (command === "schema.org") {
    return {
      results: [
        {
          type: "text",
          id: crypto.randomUUID(),
          input: "",
          output: getSchemaOrgData(),
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
