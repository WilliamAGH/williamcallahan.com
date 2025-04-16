/**
 * Terminal Commands Handler (Client)
 *
 * Handles command processing and navigation for the terminal interface.
 */

"use client";

import { searchExperience, searchEducation, searchInvestments } from '@/lib/search'; // Removed searchPosts import
import { sections, type SectionKey } from './sections';
import type { CommandResult, SearchResult } from '@/types/terminal';
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

Search:
  <section> <terms>  Search within a section
                     Example: investments fintech

Examples:
  investments fintech
  experience 2020
  blog investing
  clear

Secret Commands:
  schema.org         Show the structured data for the current page
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
    const schemas = Array.from(scripts).map(script => {
      try {
        return JSON.parse(script.textContent || '{}');
      } catch (err) {
        return { error: 'Invalid JSON in schema' };
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
  const [command, ...args] = input.toLowerCase().trim().split(' ');

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

  // Type guard for valid section
  const isValidSection = (section: string): section is SectionKey => {
    return section in sections;
  };

  // Section-specific search
  if (isValidSection(command) && args.length > 0) {
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
          results = await response.json() as SearchResult[]; // Assume API returns SearchResult[]
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
        results = await searchExperience(searchTerms); // Keep existing logic for other sections
        break;
      case 'education':
        results = await searchEducation(searchTerms);
        break;
      case 'investments':
        results = await searchInvestments(searchTerms);
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

  // Navigation command
  if (isValidSection(command)) {
    return {
      results: [{
        input: '',
        output: `Navigating to ${command}...`
      }],
      navigation: sections[command]
    };
  }

  return {
    results: [{
      input: '',
      output: `Command not recognized. Type "help" for available commands.`
    }]
  };
}
