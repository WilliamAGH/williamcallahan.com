/**
 * Terminal Commands Module
 *
 * Handles command processing and navigation for the terminal interface.
 * Provides search functionality across different content categories.
 *
 * @module components/ui/terminal/navigationCommands
 * @see {@link Terminal} - Main terminal component
 * @see {@link useTerminal} - Terminal state management hook
 * @see {@link TerminalContext} - Terminal context provider
 * @see {@link search} - Search functionality implementation
 */

import type { CommandResult, SelectionItem, SelectionAction } from "@/types/terminal";
import { searchPosts, searchInvestments, searchExperience, searchEducation } from "@/lib/search";
import type { BlogPost } from '@/types/blog';

export type SearchFunction = (query: string, posts: BlogPost[]) => Promise<SelectionItem[]>;

interface CommandHandlers {
  search?: SearchFunction;
  posts?: BlogPost[];
}

/**
 * Navigation command interface
 */
export interface NavigationCommand {
  command: string;
  path: string;
  description: string;
}

/**
 * Core navigation commands
 * These are the only direct navigation commands available.
 * All other navigation should happen through search.
 */
export const navigationCommands: NavigationCommand[] = [
  {
    command: 'home',
    path: '/',
    description: 'Navigate to home page'
  },
  {
    command: 'blog',
    path: '/blog',
    description: 'Navigate to blog'
  },
  {
    command: 'experience',
    path: '/experience',
    description: 'Navigate to experience page'
  },
  {
    command: 'skills',
    path: '/skills',
    description: 'Navigate to skills page'
  }
];

/**
 * Help text displayed when user types 'help'
 */
const HELP_TEXT = `Available commands:
  help     - Show this help message
  clear    - Clear terminal history
  search   - Search across content
    Usage: search <category> <query>
    Categories: blog, experience, investments, education
    Example: search experience software engineer

  Navigation:
    home     - Go to home page
    blog     - Go to blog
    experience - Go to experience page
    skills    - Go to skills page`;

/**
 * Creates menu items from navigation commands
 */
function createMenuItems(): SelectionItem[] {
  return navigationCommands.map(nav => ({
    label: nav.command.charAt(0).toUpperCase() + nav.command.slice(1).replace(/-/g, ' '),
    value: nav.command,
    action: 'navigate' as SelectionAction,
    path: nav.path
  }));
}

/**
 * Generates help text for navigation commands
 */
export function getNavigationHelpText(): string {
  return navigationCommands
    .map(nav => `  ${nav.command.padEnd(8)} - ${nav.description}`)
    .join('\n');
}

/**
 * Normalizes command string for matching
 */
function normalizeCommand(command: string): string {
  return command.toLowerCase().replace(/[\s-]+/g, '-');
}

/**
 * Checks if command is a valid navigation command
 */
export function isNavigationCommand(command: string): boolean {
  const normalized = normalizeCommand(command);
  return navigationCommands.some(nav => normalizeCommand(nav.command) === normalized);
}

/**
 * Gets navigation command object
 */
export function getNavigationCommand(command: string): NavigationCommand | undefined {
  const normalized = normalizeCommand(command);
  return navigationCommands.find(nav => normalizeCommand(nav.command) === normalized);
}

/**
 * Handles navigation command
 */
export function handleNavigationCommand(command: string): CommandResult {
  const navCommand = getNavigationCommand(command);
  if (!navCommand) {
    return {
      results: [{
        output: `Unknown navigation command: ${command}`
      }]
    };
  }

  const displayName = navCommand.command.replace(/-/g, ' ');
  const output = `Navigating to ${displayName} page...`;

  return {
    navigation: navCommand.path,
    results: [{ output }]
  };
}

/**
 * Handles search command for a specific category
 */
async function handleSearch(
  category: string,
  query: string,
  { search, posts = [] }: CommandHandlers
): Promise<SelectionItem[]> {
  switch (category) {
    case 'blog':
      return search ? await search(query, posts) : await searchPosts(query, posts);
    case 'investments':
      return await searchInvestments(query);
    case 'experience':
      return await searchExperience(query);
    case 'education':
      return await searchEducation(query);
    default:
      throw new Error(`Invalid search category: ${category}`);
  }
}

/**
 * Searches across all categories
 */
async function searchAllCategories(
  query: string,
  handlers: CommandHandlers
): Promise<SelectionItem[]> {
  const results = await Promise.all([
    handleSearch('blog', query, handlers),
    handleSearch('experience', query, handlers),
    handleSearch('investments', query, handlers),
    handleSearch('education', query, handlers)
  ]);

  return results.flat();
}

/**
 * Main command handler
 */
export async function handleCommand(
  input: string | undefined | null,
  { search, posts = [] }: CommandHandlers = {}
): Promise<CommandResult> {
  // Handle empty/invalid input
  if (!input?.trim()) {
    return {
      results: [{
        output: "Please enter a command. Type 'help' for available commands."
      }]
    };
  }

  const trimmedInput = input.trim().toLowerCase();
  const [command, ...args] = trimmedInput.split(' ');

  // Handle core commands first
  switch (command) {
    case 'help':
      return { results: [{ output: HELP_TEXT }] };
    case 'clear':
      return { results: [] };
    case 'menu':
      return {
        results: [{ output: 'Select a page to navigate to:' }],
        selectionItems: createMenuItems()
      };
  }

  // Handle search commands
  if (command === 'search') {
    const [category, ...searchTerms] = args;
    const query = searchTerms.join(' ');

    if (!category) {
      return {
        results: [{
          output: `Search requires a category and query.
Example: search experience software engineer

Available categories:
- blog
- experience
- investments
- education`
        }]
      };
    }

    if (!['blog', 'experience', 'investments', 'education'].includes(category)) {
      return {
        results: [{
          output: `Invalid search category: "${category}"
Available categories: blog, experience, investments, education
Example: search experience software engineer`
        }]
      };
    }

    if (!query) {
      return {
        results: [{
          output: `Please provide a search query after the category.
Example: search ${category} keyword`
        }]
      };
    }

    try {
      const results = await handleSearch(category, query, { search, posts });
      return {
        selectionItems: results,
        results: [{
          output: `${category.charAt(0).toUpperCase() + category.slice(1)} search results for "${query}":`
        }]
      };
    } catch (error) {
      return {
        results: [{
          output: `Error: ${error instanceof Error ? error.message : 'Search failed'}`
        }]
      };
    }
  }

  // Check if it's a navigation command
  const navCommand = getNavigationCommand(command);
  if (navCommand) {
    return handleNavigationCommand(command);
  }

  // If not a recognized command, treat it as a search query
  try {
    const results = await searchAllCategories(trimmedInput, { search, posts });
    return {
      selectionItems: results,
      results: [{
        output: `We automatically searched for "${trimmedInput}". Type 'help' to see all available commands.`
      }]
    };
  } catch (error) {
    return {
      results: [{
        output: `Error searching for "${trimmedInput}": ${error instanceof Error ? error.message : 'Search failed'}`
      }]
    };
  }
}
