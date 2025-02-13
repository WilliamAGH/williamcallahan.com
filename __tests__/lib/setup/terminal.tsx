/**
 * Terminal Test Setup Module
 *
 * Provides test utilities for terminal components.
 * Focuses on UI testing with synchronous responses.
 *
 * CRITICAL TEST RULES:
 * 1. ALWAYS use real app data over mocks where possible
 * 2. ALL tests must be read-only
 * 3. NEVER use React hooks directly in test files
 * 4. Use TestTerminalProvider for consistent test environment
 *
 * Common Terminal Testing Mistakes to Avoid:
 * 1. Using overly simple mocks that don't match real behavior
 * 2. Not handling async state updates properly
 * 3. Not cleaning up after tests
 */

import { FC, ReactNode, useCallback } from 'react';
import { TerminalProvider } from '@/components/ui/terminal/terminalContext';
import { AppRouterProvider } from './appRouter';
import type { CommandResult, SelectionItem } from '@/types/terminal';

/**
 * Synchronous command handler for testing
 * Returns predefined responses for each command type
 */
const mockHandler = (input: string | undefined | null): Promise<CommandResult> => {
  if (!input?.trim()) {
    return Promise.resolve({
      results: [{ output: "Please enter a command. Type 'help' for available commands." }]
    });
  }

  const command = input.trim().toLowerCase();

  // Handle core commands
  switch (command) {
    case 'help':
      return Promise.resolve({
        results: [{ output: `Available commands:
  help     - Show this help message
  clear    - Clear terminal history
  search   - Search across content
  home     - Go to home page
  blog     - Go to blog
  experience - Go to experience page
  skills    - Go to skills page` }]
      });

    case 'clear':
      return Promise.resolve({ results: [] });

    case 'blog':
      return Promise.resolve({
        navigation: '/blog',
        results: [{ output: 'Navigating to blog page...' }]
      });

    case 'menu':
      const items: SelectionItem[] = [
        { label: 'Home', value: 'home', action: 'navigate', path: '/' },
        { label: 'Blog', value: 'blog', action: 'navigate', path: '/blog' },
        { label: 'Experience', value: 'experience', action: 'navigate', path: '/experience' },
        { label: 'Skills', value: 'skills', action: 'navigate', path: '/skills' }
      ];
      return Promise.resolve({
        results: [{ output: 'Select a page to navigate to:' }],
        selectionItems: items
      });

    default:
      return Promise.resolve({
        results: [{ output: `Unknown command: ${command}. Type 'help' for available commands.` }]
      });
  }
};

/**
 * Simple test wrapper that provides terminal context
 * Use this wrapper for all terminal component tests
 */
export const TestTerminalProvider: FC<{ children: ReactNode; pathname?: string }> = ({ children, pathname = '/' }) => {
  // Create a stable handler that matches the expected type
  const handler = async (command: string | undefined | null): Promise<CommandResult> => {
    if (!command) return { results: [] };
    return mockHandler(command);
  };

  return (
    <AppRouterProvider pathname={pathname}>
      <TerminalProvider
        initialState={{
          isReady: true,
          handleCommand: handler
        }}
      >
        {children}
      </TerminalProvider>
    </AppRouterProvider>
  );
};

/**
 * Creates a mock form event for testing
 */
export function createMockFormEvent(): React.FormEvent {
  return {
    preventDefault: () => {}
  } as React.FormEvent;
}

/**
 * Sets up terminal test environment
 * Handles cleanup of event listeners and DOM elements
 */
export function setupTerminalTest(): () => void {
  // Create container for focus management
  const container = document.createElement('div');
  document.body.appendChild(container);

  // Return cleanup function
  return () => {
    container.remove();
    jest.clearAllMocks();
  };
}
