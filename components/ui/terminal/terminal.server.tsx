/**
 * Terminal Server Component
 *
 * Provides the static shell for the terminal interface.
 * Handles server-side rendering and SEO concerns.
 *
 * @module components/ui/terminal/terminal.server
 * @see {@link "components/ui/terminal/terminal.client.tsx"} - Client-side terminal functionality
 * @see {@link "components/ui/terminal/terminalContext.tsx"} - Terminal state management
 * @see {@link "docs/architecture/terminalGUI.md"} - Terminal architecture documentation
 */

import { BlogPost } from "@/types/blog";
import { SelectionItem } from "@/types/terminal";
import { TerminalClient } from "./terminal.client";

interface TerminalServerProps {
  searchFn?: (query: string, posts: BlogPost[]) => Promise<SelectionItem[]>;
  posts?: BlogPost[];
}

/**
 * Terminal Server Component
 *
 * Provides the static shell and wraps the client-side terminal functionality.
 * This component is responsible for:
 * - Initial server-side rendering
 * - SEO-friendly markup
 * - Wrapping client components
 * - Passing data to client
 */
export function Terminal({ searchFn, posts = [] }: TerminalServerProps) {
  return (
    <div
      className="bg-terminal-light dark:bg-terminal-dark rounded-lg p-4 sm:p-6 font-mono text-sm mx-auto mt-8 border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-[calc(100vw-2rem)] sm:max-w-5xl"
      role="region"
      aria-label="Terminal interface"
    >
      <TerminalClient
        searchFn={searchFn}
        posts={posts}
      />
    </div>
  );
}
