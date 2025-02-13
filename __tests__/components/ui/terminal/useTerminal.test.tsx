/**
 * Terminal Hook Tests
 *
 * @module __tests__/components/ui/terminal/useTerminal
 * @see {@link useTerminal} - Hook being tested
 * @see {@link Terminal} - Component using this hook
 * @see {@link handleCommand} - Command handling function
 *
 * CRITICAL TEST RULES:
 * 1. ALWAYS use real app data over mocks where possible
 * 2. ALL tests must be read-only
 * 3. NEVER use React hooks directly in test files
 * 4. Use TestTerminalProvider for consistent test environment
 *
 * Common Terminal Testing Mistakes to Avoid:
 * 1. Using React hooks in test files (they're for components, not tests)
 * 2. Creating unnecessary mock data (use TEST_POSTS from fixtures)
 * 3. Not cleaning up after tests (use beforeEach/afterEach)
 * 4. Not handling timezone edge cases (test both PST/PDT)
 */

import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '@/components/ui/terminal/useTerminal';
import { TestTerminalProvider } from '@/__tests__/lib/setup/terminal';
import { mockRouter } from '@/__tests__/lib/setup/appRouter';
import type { FormEvent } from 'react';

describe('useTerminal', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    mockRouter.push.mockReset();
    jest.clearAllMocks();

    // Create container for focus management
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    jest.clearAllMocks();
    container.remove();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TestTerminalProvider pathname="/">{children}</TestTerminalProvider>
  );

  const createEvent = () => ({ preventDefault: () => {} } as FormEvent);

  /**
   * Executes a command in the terminal and waits for state updates
   * @param result Hook result from renderHook
   * @param command Command to execute
   */
  const executeCommand = async (result: any, command: string) => {
    // Focus input before command execution
    const input = document.createElement('input');
    container.appendChild(input);
    input.focus();

    console.log(`Before command "${command}" - selection:`, result.current.selection);

    await act(async () => {
      result.current.setInput(command);
      await result.current.handleSubmit(createEvent());
    });

    // Log intermediate state
    console.log(`After handleSubmit for "${command}" - selection:`, result.current.selection);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Log final state
    console.log(`After state updates for "${command}" - selection:`, result.current.selection);

    // Cleanup
    input.remove();
  };

  describe('Initialization', () => {
    it('initializes with welcome message', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.history[0].output).toContain('Welcome to the terminal');
    });
  });

  describe.skip('Command Handling', () => {
    it('shows help text when help command is entered', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await executeCommand(result, 'help');

      const lastOutput = result.current.history[result.current.history.length - 1];
      expect(lastOutput.output).toContain('help');
      expect(lastOutput.output).toContain('clear');
      expect(lastOutput.output).toContain('search');
      expect(lastOutput.output).toContain('home');
      expect(lastOutput.output).toContain('blog');
      expect(lastOutput.output).toContain('experience');
      expect(lastOutput.output).toContain('skills');
    });

    it('navigates to blog when blog command is entered', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await executeCommand(result, 'blog');

      const lastOutput = result.current.history[result.current.history.length - 1];
      expect(lastOutput.output).toContain('Navigating to blog');
      expect(mockRouter.push).toHaveBeenCalledWith('/blog');
    });
  });

  describe.skip('Menu Handling', () => {
    it('shows menu options when menu command is entered', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await executeCommand(result, 'menu');

      expect(result.current.selection).toBeDefined();
      const items = result.current.selection!;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(4); // home, blog, experience, skills

      // Check main navigation items
      expect(items[0]).toEqual({
        label: 'Home',
        value: 'home',
        action: 'navigate',
        path: '/'
      });
      expect(items[1]).toEqual({
        label: 'Blog',
        value: 'blog',
        action: 'navigate',
        path: '/blog'
      });
    });

    it('handles selection cancellation', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await executeCommand(result, 'menu');

      expect(result.current.selection).toBeDefined();
      expect(result.current.selection?.length).toBe(4);

      await act(async () => {
        result.current.cancelSelection();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.selection).toBeNull();
    });
  });

  describe.skip('History Management', () => {
    it('clears history when clear command is entered', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      // Add commands to history
      await executeCommand(result, 'help');
      await executeCommand(result, 'blog');

      const initialLength = result.current.history.length;
      expect(initialLength).toBeGreaterThan(1);

      // Clear history
      await executeCommand(result, 'clear');

      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0]).toEqual({
        input: "",
        output: "Welcome to the terminal. Type 'help' for available commands."
      });
    });

    it('shows error for unknown commands', async () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      await executeCommand(result, 'unknowncommand');

      const lastOutput = result.current.history[result.current.history.length - 1];
      expect(lastOutput.output).toMatch(/unknown command.*unknowncommand/i);
      expect(lastOutput.output).toMatch(/type 'help'.*commands/i);
    });
  });

  describe.skip('Selection Navigation', () => {
    const navigationTests = [
      { path: '/', label: 'Home' },
      { path: '/blog', label: 'Blog' },
      { path: '/experience', label: 'Experience' },
      { path: '/skills', label: 'Skills' }
    ];

    test.each(navigationTests)(
      'handles selection navigation to $label',
      async ({ path, label }) => {
        const { result } = renderHook(() => useTerminal(), { wrapper });

        console.log('Before menu command - selection:', result.current.selection);
        await executeCommand(result, 'menu');
        console.log('After menu command - selection:', result.current.selection);

        expect(result.current.selection).toBeDefined();
        expect(result.current.selection?.length).toBe(4);

        const items = result.current.selection!;
        const item = items.find(i => i.path === path);
        expect(item).toBeDefined();
        expect(item!.label).toBe(label);

        await act(async () => {
          result.current.handleSelection(item!);
          await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockRouter.push).toHaveBeenCalledWith(path);
        expect(result.current.selection).toBeNull();
      }
    );
  });
});
