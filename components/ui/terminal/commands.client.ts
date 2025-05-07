/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import type { CommandResult, SearchResult } from '@/types/terminal';

// TODO: Move TerminalSearchModule to @/types/terminal.ts
interface TerminalSearchModule {
  searchExperience: (terms: string) => Promise<SearchResult[]>;
  searchEducation: (terms: string) => Promise<SearchResult[]>;
  searchInvestments: (terms: string) => Promise<SearchResult[]>;
  searchBookmarks: (terms: string) => Promise<SearchResult[]>;
}

// Import search functions but allow mocking them in tests
let searchModule: TerminalSearchModule; // Typed searchModule
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  searchModule = require('@/lib/search') as TerminalSearchModule;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
} catch (_error) { // Renamed error to _error
  // Fallback for tests
  searchModule = {
    searchExperience: () => Promise.resolve([] as SearchResult[]),
    searchEducation: () => Promise.resolve([] as SearchResult[]),
    searchInvestments: () => Promise.resolve([] as SearchResult[]),
    searchBookmarks: () => Promise.resolve([] as SearchResult[]),
  };
}

const { searchExperience, searchEducation, searchInvestments, searchBookmarks } = searchModule;
import { sections, type SectionKey } from './sections';
// Removed unused usePathname import

export const terminalCommands = {
  home: '/',
  investments: '/investments',
  experience: '/experience',
  skills: '/skills',
  blog: '/blog',
  aventure: '/experience#aventure',
  tsbank: '/experience#tsbank',
  seekinvest: '/experience#seekinvest',
  'callahan-financial': '/experience#callahan-financial',
  'mutual-first': '/experience#mutual-first',
  morningstar: '/experience#morningstar'
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
  bookmarks          Go to bookmarks page

Search:
  <section> <terms>  Search within a section
                     Example: investments fintech
                     Example: bookmarks AI

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
      return 'No Schema.org data found on this page.';
    }

    // Collect all JSON-LD data from scripts
    const schemas: unknown[] = Array.from(scripts).map(script => { // Typed schemas as unknown[]
      try {
        return JSON.parse(script.textContent || '{}') as unknown; // Explicitly cast to unknown
      } catch (_err) { // Renamed err to _err and used it
        return { error: 'Invalid JSON in schema', details: _err instanceof Error ? _err.message : String(_err) };
      }
    });

    // Get the current path to include in the diagnostics
    const path = window.location.pathname;

    // Format the diagnostics output
    const output = {
      path,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      schemas
    };

    // Return formatted JSON
    return `Schema.org Diagnostics for ${path}:\n\n${JSON.stringify(output, null, 2)}`;
  } catch (error) {
    console.error('Error retrieving schema data:', error);
    return 'Error retrieving Schema.org data. Check the console for details.';
  }
}

export async function handleCommand(input: string): Promise<CommandResult> {
  // Process the input
  const trimmedInput = input.toLowerCase().trim();

  // Short-circuit: do nothing if the user entered only whitespace
  if (trimmedInput.length === 0) {
    return {
      results: [{
        input: '',
        output: 'No command entered. Type "help" for available commands.'
      }]
    };
  }

  const [command, ...args] = trimmedInput.split(' ');

  // 1. First check for direct commands that take precedence

  // Schema.org easter egg command
  if (command === 'schema.org') {
    return {
      results: [{
        input: '',
        output: getSchemaOrgData()
      }]
    };
  }

  // Clear command
  if (command === 'clear') {
    return {
      results: [],
      clear: true
    };
  }

  // Help command
  if (command === 'help') {
    return {
      results: [{
        input: '',
        output: HELP_MESSAGE
      }]
    };
  }

  // 2. Check for navigation commands (e.g., "blog")

  // Type guard for valid section
  const isValidSection = (section: string): section is SectionKey => {
    return Object.hasOwn(sections, section);
  };

  // Navigation command without args (e.g., "blog")
  if (command && isValidSection(command) && args.length === 0) {
    return {
      results: [{
        input: '',
        output: `Navigating to ${command}...`
      }],
      navigation: sections[command]
    };
  }

  // 3. Check for section-specific search (e.g., "blog javafx")
  if (command && isValidSection(command) && args.length > 0) {
    const searchTerms = args.join(' ');
    const section = command.charAt(0).toUpperCase() + command.slice(1);

    let results: SearchResult[] = [];

    switch (command) {
      case 'blog': {
        try {
          const response = await fetch(`/api/search/blog?q=${encodeURIComponent(searchTerms)}`);
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          results = await response.json() as SearchResult[];
        } catch (error) {
          console.error("Blog search API call failed:", error);
          return {
            results: [{
              input: '',
              output: `Error searching blog: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
        break;
      }
      case 'experience':
        results = await searchExperience(searchTerms);
        break;
      case 'education':
        results = await searchEducation(searchTerms);
        break;
      case 'investments':
        results = await searchInvestments(searchTerms);
        break;
      case 'bookmarks':
        results = await searchBookmarks(searchTerms);
        break;
    }

    if (results.length === 0) {
      return {
        results: [{
          input: '',
          output: `No results found in ${section} for "${searchTerms}"`
        }]
      };
    }

    return {
      results: [{
        input: '',
        output: `Found ${results.length} results in ${section} for "${searchTerms}"`
      }],
      selectionItems: results
    };
  }

  // 4. If not a direct command or section command, perform site-wide search
  // IMPORTANT: This now takes precedence over "command not recognized" to fix the multi-word search issue
  const searchTerms = [command, ...args].join(' ');

  try {
    // Log search info for debugging
    console.log('%c[Terminal Search]%c Performing site-wide search',
      'color: #4CAF50; font-weight: bold', 'color: inherit');
    console.log('Search terms:', searchTerms);
    console.log('Search URL:', `/api/search/all?q=${encodeURIComponent(searchTerms)}`);

    const response = await fetch(`/api/search/all?q=${encodeURIComponent(searchTerms)}`);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const allResults = await response.json() as SearchResult[];

    // Log results for debugging
    console.log('%c[Terminal Search]%c Results received',
      'color: #4CAF50; font-weight: bold', 'color: inherit');
    console.log(`Found ${allResults.length} results for "${searchTerms}"`);
    if (allResults.length > 0) {
      console.log('Sample results:', allResults.slice(0, 3));
    }

    // Check if we got any results
    if (allResults.length === 0) {
      // Only now do we return "command not recognized" if no search results found
      return {
        results: [{
          input: '',
          output: `Command not recognized. Type "help" for available commands.`
        }]
      };
    }

    // Otherwise, return search results
    return {
      results: [{
        input: '',
        output: `Found ${allResults.length} site-wide results for "${searchTerms}"`
      }],
      selectionItems: allResults
    };

  } catch (error) {
    console.error("Site-wide search API call failed:", error);
    // Type check for error before accessing message
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during the search.';
    return {
      results: [{
        input: '',
        output: `Error during site-wide search: ${errorMessage}`
      }]
    };
  }
}