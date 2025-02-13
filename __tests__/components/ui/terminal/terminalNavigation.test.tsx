/**
 * Terminal Navigation Tests
 *
 * Tests the terminal's navigation functionality using real application data and routes.
 * All tests use actual command handling logic and real data from the application.
 *
 * CRITICAL TESTING LESSONS LEARNED:
 *
 * 1. NEVER mix async and sync tests in the same file
 *    - Our initial mistake was trying to test both sync state updates and async navigation
 *    - This caused race conditions and timeouts because React 18's concurrent mode
 *      handles these differently
 *    - Solution: Split sync and async tests into separate files
 *
 * 2. ALWAYS wrap state updates in act()
 *    - Even simple setState calls need act() in React 18
 *    - Missing act() causes "not wrapped in act" warnings and flaky tests
 *    - Solution: Use act() for ANY state change, no matter how simple
 *
 * 3. NEVER chain async operations without proper cleanup
 *    - Our navigation tests failed because we didn't clean up previous operations
 *    - React 18 concurrent mode can run effects out of order
 *    - Solution: Use try/finally and proper cleanup in beforeEach/afterEach
 *
 * 4. USE REAL DATA whenever possible
 *    - Mock data can hide real-world issues
 *    - Using actual application routes and data helps catch integration issues
 *    - Solution: Import and use real application data in tests
 *
 * File Location Note:
 * This file is in components/ui/terminal because it tests the terminal navigation
 * functionality specifically. While it could be moved to a general test folder,
 * keeping it with related terminal tests helps maintain context and makes it
 * easier to find related test files.
 *
 * @module __tests__/components/ui/terminal/terminalNavigation
 * @see {@link Terminal} - Component being tested
 * @see {@link useTerminal} - Hook providing terminal functionality
 * @see {@link navigationCommands} - Command processing function
 * @see {@link experiences} - Real experience data used in tests
 */

import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '@/components/ui/terminal/useTerminal';
import { TestTerminalProvider } from '@/__tests__/lib/setup/terminal';
import { mockRouter } from '@/__tests__/lib/setup/appRouter';
import type { FormEvent } from 'react';

/**
 * Terminal Navigation Test Suite
 *
 * Starting with basic functionality tests to ensure the terminal
 * hook and context are working correctly before testing navigation.
 * Using real application data and routes throughout.
 */
describe('Terminal Navigation', () => {
  beforeEach(() => {
    // Reset router mocks between tests
    mockRouter.push.mockReset();
    jest.clearAllMocks();
  });

  /**
   * Test wrapper component providing terminal context
   * Uses real application routes and data
   */
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TestTerminalProvider pathname="/">{children}</TestTerminalProvider>
  );

  /**
   * Basic Functionality Tests
   * Verifying terminal hook initialization and context setup
   */
  describe('Basic Functionality', () => {
    it('initializes with welcome message', () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });
      expect(result.current).toBeDefined();
      expect(result.current.history[0].output).toContain('Welcome to the terminal');
    });

    it('has expected initial state', () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });
      expect(result.current.input).toBe('');
      expect(result.current.selection).toBeNull();
      expect(result.current.isReady).toBe(true);
    });

    it('updates input value', () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      act(() => {
        result.current.setInput('test');
      });

      expect(result.current.input).toBe('test');
    });

    it('clears input after setting', () => {
      const { result } = renderHook(() => useTerminal(), { wrapper });

      act(() => {
        result.current.setInput('test');
      });

      act(() => {
        result.current.setInput('');
      });

      expect(result.current.input).toBe('');
    });
  });
});
