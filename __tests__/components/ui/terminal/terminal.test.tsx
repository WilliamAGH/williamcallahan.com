/**
 * Terminal Component Tests
 *
 * Tests the interactive terminal interface including:
 * 1. Core Functionality
 *    - Command input and processing
 *    - Command history management
 *    - Navigation between sections
 *
 * 2. Search Features
 *    - Content search across sections
 *    - Results display and selection
 *    - No results handling
 *
 * 3. UI/UX Elements
 *    - Welcome message display
 *    - Input focus management
 *    - Mobile responsiveness
 *
 * Test Environment:
 * - Mocks Next.js router for navigation
 * - Mocks search functionality
 * - Uses React Testing Library for DOM interactions
 */

import { mock, jest, spyOn, describe, beforeEach, it, expect, afterEach } from 'bun:test';
import React from 'react'; // Ensure React is imported first
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Terminal } from '../../../../components/ui/terminal/terminal-implementation.client';
import { TerminalProvider } from '../../../../components/ui/terminal/terminal-context.client';
import { TerminalWindowStateProvider } from '../../../../lib/context/terminal-window-state-context.client';
import { useRouter } from 'next/navigation';
import { setupTests } from '../../../../lib/test/setup';
import { GlobalWindowRegistryContextType, WindowState } from '../../../../lib/context/global-window-registry-context.client'; // Import types for mocking
import type { SearchResult } from '@/types/search'; // Import SearchResult type

// --- Mock TerminalHeader ---
mock.module('../../../../components/ui/terminal/terminal-header', () => ({
  TerminalHeader: ({ onClose, onMinimize, onMaximize, isMaximized }: any) => (
    <div data-testid="mock-terminal-header">
      <button title="Close" onClick={onClose} disabled={!onClose}>Close</button>
      <button title="Minimize" onClick={onMinimize} disabled={!onMinimize}>Minimize</button>
      <button title={isMaximized ? "Restore" : "Maximize"} onClick={onMaximize} disabled={!onMaximize}>
        {isMaximized ? "Restore" : "Maximize"}
      </button>
    </div>
  )
}));
// --- End Mock ---

// Mock next/navigation using mock.module
mock.module('next/navigation', () => ({ // Use mock.module
  useRouter: jest.fn(() => ({ push: jest.fn() })) // Provide default mock implementation
}));

// --- Mock GlobalWindowRegistryContext using mock.module ---
// Keep state external for potential modification by mocked actions if needed,
// but primarily control return values via mockImplementationOnce in tests.
let mockWindowState: WindowState = 'normal';
const MockIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg ref={ref} {...props} data-testid="mock-icon" />
));
MockIcon.displayName = 'MockIcon';

// Define actions - they modify the external state, but tests will primarily use mockImplementationOnce
const setMockState = (newState: typeof mockWindowState) => { mockWindowState = newState; };
const minimizeMock = () => setMockState('minimized');
const maximizeMock = () => setMockState(mockWindowState === 'maximized' ? 'normal' : 'maximized');
const closeMock = () => setMockState('closed');
const restoreMock = () => setMockState('normal');

mock.module('../../../../lib/context/global-window-registry-context.client', () => { // Use mock.module
  // Functions defined above
  return {
    GlobalWindowRegistryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useWindowRegistry: jest.fn((): Partial<GlobalWindowRegistryContextType> => ({
      windows: { 'main-terminal': { id: 'main-terminal', state: mockWindowState, icon: MockIcon, title: 'Terminal' } },
      registerWindow: jest.fn(),
      unregisterWindow: jest.fn(),
      setWindowState: jest.fn((id, state) => { if (id === 'main-terminal') setMockState(state as WindowState); }), // Cast state
      minimizeWindow: jest.fn((id) => { if (id === 'main-terminal') minimizeMock(); }),
      maximizeWindow: jest.fn((id) => { if (id === 'main-terminal') maximizeMock(); }),
      closeWindow: jest.fn((id) => { if (id === 'main-terminal') closeMock(); }),
      restoreWindow: jest.fn((id) => { if (id === 'main-terminal') restoreMock(); }),
      getWindowState: jest.fn((id) => id === 'main-terminal'
        ? { id: 'main-terminal', state: mockWindowState, icon: MockIcon, title: 'Terminal' }
        : undefined
      ),
    })),
    useRegisteredWindowState: jest.fn(), // Mock the hook used by the component
  };
});
// --- End Mock ---

// Get handles *after* mocking
import { useRouter as useRouterImported } from 'next/navigation';
import { useRegisteredWindowState as useRegisteredWindowStateImported } from '../../../../lib/context/global-window-registry-context.client';
const mockUseRegisteredWindowState = useRegisteredWindowStateImported as jest.Mock;
const mockUseRouter = useRouterImported as jest.Mock;

// Mock search functions using mock.module
mock.module('../../../../lib/search', () => ({ // Use mock.module
  searchPosts: jest.fn().mockResolvedValue([
    {
      title: 'Test Post',
      excerpt: 'Test excerpt',
      slug: 'test-post'
    }
  ]),
  searchExperience: jest.fn().mockResolvedValue([]),
  searchEducation: jest.fn().mockResolvedValue([]),
  searchInvestments: jest.fn().mockResolvedValue([])
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any; // Use any to avoid type conflict for now

// Helper function to render with providers
const renderTerminal = () => {
  return render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>
  );
};

describe('Terminal Component', () => {
  // Get router push mock handle *inside* describe
  let mockRouterPush: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockFetch.mockClear(); // Clear fetch mock specifically

    // Reset router mock and get push handle
    mockRouterPush = jest.fn();
    mockUseRouter.mockReturnValue({ push: mockRouterPush });

    mockUseRegisteredWindowState.mockClear();
    // Set a default implementation for the hook for tests that don't override it
    mockUseRegisteredWindowState.mockImplementation(() => ({
      windowState: 'normal',
      isRegistered: true,
      minimize: jest.fn(minimizeMock),
      maximize: jest.fn(maximizeMock),
      close: jest.fn(closeMock),
      restore: jest.fn(restoreMock),
      setState: jest.fn(setMockState),
    }));
    // Reset the external state variable
    mockWindowState = 'normal';
  });

  // Add afterEach if needed for global mocks like fetch
  afterEach(() => {
    // Potentially restore global mocks if they were changed
  });

  describe('Rendering', () => {
    it('renders with welcome message', () => {
      renderTerminal();
      expect(screen.getByText(/Welcome! Type "help" for available commands./i)).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  });

  describe('Command Processing', () => {
    it('processes help command', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'help' } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText(/Available commands/i)).toBeInTheDocument();
      });
    });

    it('handles invalid commands', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'invalid-command' } });

      // Mock the fetch call *before* submitting
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [] as SearchResult[], // No results found
      });

      fireEvent.submit(input);

      // Check if fetch was called correctly
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/search/all?q=invalid-command');
      });

      await waitFor(() => {
        // Look for the "command not recognized" message instead of "no site-wide results"
        expect(screen.getByText(/Command not recognized. Type "help" for available commands./i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to correct route', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'blog' } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith('/blog'); // Check the push mock
      });
    });
  });

  describe('Search', () => {
    it('displays search results', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'blog test' } });

      // Mock the fetch call *before* submitting
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ label: '[Blog] Test Post', description: 'Test excerpt', path: '/blog/test-post' }] as SearchResult[],
      });

      fireEvent.submit(input);

      // Check if fetch was called correctly
      await waitFor(() => {
         expect(mockFetch).toHaveBeenCalledWith('/api/search/blog?q=test');
      });

      await waitFor(() => {
        // Expect the prefixed label from the API response
        expect(screen.getByText('[Blog] Test Post')).toBeInTheDocument();
        // Check that the selection view helper text is present
        expect(screen.getByText(/Use ↑↓ to navigate/i)).toBeInTheDocument();
      });
    });

    it('handles no results', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'experience nonexistent' } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText(/No results found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness', () => {
    it('maintains proper text wrapping', () => {
      renderTerminal();
      const terminalContent = screen.getByText(/Welcome!/i).closest('.whitespace-pre-wrap');
      expect(terminalContent).toHaveClass('break-words');
    });
  });

  describe('Window Controls Integration', () => {
    it('minimizes the terminal', () => {
      // Setup initial state for this test
      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: 'normal', isRegistered: true, minimize: jest.fn(minimizeMock), maximize: jest.fn(), close: jest.fn(), restore: jest.fn(), setState: jest.fn(),
      }));

      const { rerender } = renderTerminal();
      const minimizeButton = screen.getByTitle(/minimize/i); // Query by title

      // Setup state for *after* minimize click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: 'minimized', isRegistered: true, minimize: jest.fn(minimizeMock), maximize: jest.fn(), close: jest.fn(), restore: jest.fn(), setState: jest.fn(),
      }));

      fireEvent.click(minimizeButton);
      rerender(
        <TerminalProvider><Terminal /></TerminalProvider>
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });

    it('maximizes and restores the terminal', async () => {
      // --- Define Mock States ---
      const normalState = { windowState: 'normal', isRegistered: true, minimize: jest.fn(), maximize: jest.fn(maximizeMock), close: jest.fn(), restore: jest.fn(), setState: jest.fn() };
      const maximizedState = { windowState: 'maximized', isRegistered: true, minimize: jest.fn(), maximize: jest.fn(maximizeMock), close: jest.fn(), restore: jest.fn(), setState: jest.fn() };

      // --- Setup Initial State ---
      mockUseRegisteredWindowState.mockImplementation(() => normalState);

      const { rerender } = renderTerminal();
      const maximizeButton = screen.getByTitle(/maximize/i); // Query by title
      // Use data-testid for querying the container
      const terminalTestId = 'terminal-container';
      const innerContentSelector = 'div.custom-scrollbar';

      // --- Initial State Check ---
      const initialTerminalElement = screen.getByTestId(terminalTestId);
      expect(initialTerminalElement).toHaveClass('relative', 'mx-auto', 'terminal-reduced-margin', 'w-full', 'max-w-[calc(100vw-2rem)]', 'sm:max-w-3xl');
      const initialInnerElement = screen.getByText(/Welcome! Type "help"/i).closest(innerContentSelector);
      expect(initialInnerElement).toHaveClass('max-h-[300px]', 'sm:max-h-[400px]');
      expect(initialInnerElement).not.toHaveClass('flex-grow');
      expect(screen.queryByTestId('terminal-backdrop')).not.toBeInTheDocument();

      // --- Maximize ---
      // Set state for *after* first click
      mockUseRegisteredWindowState.mockImplementationOnce(() => maximizedState);

      fireEvent.click(maximizeButton); // Click to maximize
      rerender(
        <TerminalProvider><Terminal /></TerminalProvider>
      );

      // --- Assert Maximized State ---
      await waitFor(() => {
         expect(screen.getByTestId('terminal-backdrop')).toBeInTheDocument(); // Check backdrop exists
       });
       const backdrop = screen.getByTestId('terminal-backdrop');
       // Update expectation to match actual implementation classes
       expect(backdrop).toHaveClass('fixed', 'left-0', 'right-0', 'top-14', 'bottom-0', 'z-[59]', 'bg-black/50', 'backdrop-blur-sm');
       // Removed check for non-existent 'maximized-wrapper'
       // Use data-testid for maximized state query
       const maximizedTerminalElement = screen.getByTestId(terminalTestId);
       // Update expectation to match actual layout/positioning classes when maximized
       expect(maximizedTerminalElement).toHaveClass('fixed', 'left-0', 'right-0', 'top-14', 'bottom-0', 'z-[60]', 'w-full', 'h-[calc(100vh-56px)]', 'p-6');
      expect(maximizedTerminalElement).not.toHaveClass('relative', 'mx-auto', 'terminal-reduced-margin', 'w-full', 'max-w-[calc(100vw-2rem)]', 'sm:max-w-3xl');
      const maximizedInnerElement = screen.getByText(/Welcome! Type "help"/i).closest(innerContentSelector);
      expect(maximizedInnerElement).toHaveClass('flex-grow');
      expect(maximizedInnerElement).not.toHaveClass('max-h-[300px]', 'sm:max-h-[400px]');

      // --- Restore ---
      fireEvent.click(maximizeButton); // Click again to restore

      // Set mock state *immediately before* the rerender that should show the restored state
      mockUseRegisteredWindowState.mockImplementationOnce(() => normalState);
      rerender(
        <TerminalProvider><Terminal /></TerminalProvider>
      );

      // --- Assert Restored State ---
       // Wait specifically for the restored element to appear and have the correct classes
       await waitFor(() => {
         // Check maximized elements are gone *within* the same wait
         expect(screen.queryByTestId('terminal-backdrop')).not.toBeInTheDocument(); // Check backdrop is gone
         // Removed check for non-existent 'maximized-wrapper'

         // Query for the element *within* the waitFor
         const restoredElement = screen.getByTestId(terminalTestId);
        expect(restoredElement).not.toBeNull(); // Ensure the element is found by getByTestId

        // Assert classes on the found element
        expect(restoredElement).toHaveClass('relative', 'mx-auto', 'terminal-reduced-margin', 'w-full', 'max-w-[calc(100vw-2rem)]', 'sm:max-w-3xl');
        expect(restoredElement).not.toHaveClass('w-full', 'max-w-6xl', 'h-full', 'p-6');

        // Assert inner element classes
        const restoredInnerElement = restoredElement.querySelector(innerContentSelector);
        expect(restoredInnerElement).not.toBeNull();
        expect(restoredInnerElement).toHaveClass('max-h-[300px]', 'sm:max-h-[400px]');
        expect(restoredInnerElement).not.toHaveClass('flex-grow');
      });
    });

    it('closes the terminal', () => {
      // Setup initial state
      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: 'normal', isRegistered: true, minimize: jest.fn(), maximize: jest.fn(), close: jest.fn(closeMock), restore: jest.fn(), setState: jest.fn(),
      }));

      const { rerender } = renderTerminal();
      const closeButton = screen.getByTitle(/close/i); // Query by title

      // Set state for *after* close click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: 'closed', isRegistered: true, minimize: jest.fn(), maximize: jest.fn(), close: jest.fn(closeMock), restore: jest.fn(), setState: jest.fn(),
      }));

      fireEvent.click(closeButton);
      // Rerender without the provider
      rerender(
        <TerminalProvider><Terminal /></TerminalProvider>
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });
  });
});
