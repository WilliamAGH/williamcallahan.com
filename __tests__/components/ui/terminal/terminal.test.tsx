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

import React from 'react'; // Ensure React is imported first
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Terminal } from '../../../../components/ui/terminal/terminal';
import { TerminalProvider } from '../../../../components/ui/terminal/terminalContext';
import { TerminalWindowStateProvider } from '../../../../lib/context/TerminalWindowStateContext';
// GlobalWindowRegistryProvider is mocked below, so no need to import it here
import { useRouter } from 'next/navigation';
import { setupTests } from '../../../../lib/test/setup';
import { GlobalWindowRegistryContextType } from '../../../../lib/context/GlobalWindowRegistryContext'; // Import type for mocking

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}));

// Define mockWindowState outside the factory scope so it persists but can be reset
let mockWindowState: 'normal' | 'minimized' | 'maximized' | 'closed' = 'normal';

// Mock GlobalWindowRegistryContext related hooks
jest.mock('../../../../lib/context/GlobalWindowRegistryContext', () => {
  // Mock LucideIcon component type using forwardRef to satisfy the type system
  const MockIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
    <svg ref={ref} {...props} data-testid="mock-icon" /> // Simple SVG mock
  ));
  MockIcon.displayName = 'MockIcon'; // Good practice for debugging

  // Functions to modify the shared mockWindowState
  const setMockState = (newState: typeof mockWindowState) => { mockWindowState = newState; };
  const minimizeMock = () => setMockState('minimized');
  const maximizeMock = () => setMockState(mockWindowState === 'maximized' ? 'normal' : 'maximized');
  const closeMock = () => setMockState('closed');
  const restoreMock = () => setMockState('normal');

  return {
    GlobalWindowRegistryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    // Mock the general registry hook (simplified as Terminal uses the specific one)
    useWindowRegistry: jest.fn((): Partial<GlobalWindowRegistryContextType> => ({
      windows: { 'test-terminal': { id: 'test-terminal', state: mockWindowState, icon: MockIcon, title: 'Test Terminal' } },
      registerWindow: jest.fn(),
      unregisterWindow: jest.fn(),
      setWindowState: jest.fn((id, state) => { if (id === 'test-terminal') setMockState(state); }),
      minimizeWindow: jest.fn((id) => { if (id === 'test-terminal') minimizeMock(); }),
      maximizeWindow: jest.fn((id) => { if (id === 'test-terminal') maximizeMock(); }),
      closeWindow: jest.fn((id) => { if (id === 'test-terminal') closeMock(); }),
      restoreWindow: jest.fn((id) => { if (id === 'test-terminal') restoreMock(); }),
      getWindowState: jest.fn((id) => id === 'test-terminal'
        ? { id: 'test-terminal', state: mockWindowState, icon: MockIcon, title: 'Test Terminal' }
        : undefined
      ),
    })),
    // Mock the specific hook used by the Terminal component
    useRegisteredWindowState: jest.fn().mockImplementation(() => ({
      windowState: mockWindowState, // Return the current state
      isRegistered: true,
      minimize: jest.fn(minimizeMock), // Return functions that modify the state
      maximize: jest.fn(maximizeMock),
      close: jest.fn(closeMock),
      restore: jest.fn(restoreMock),
      setState: jest.fn(setMockState),
    })),
  };
});


// Mock search functions
jest.mock('../../../../lib/search', () => ({
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

// Helper function to render with providers (GlobalWindowRegistryProvider is no longer needed due to the hook mock)
const renderTerminal = () => {
  return render(
    <TerminalWindowStateProvider terminalId="test-terminal">
      <TerminalProvider>
        <Terminal />
      </TerminalProvider>
    </TerminalWindowStateProvider>
  );
};


describe('Terminal Component', () => {
  const { mockRouter } = setupTests();

  beforeEach(() => {
    // Reset Next.js router mock
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    // Reset the window state mock directly
    mockWindowState = 'normal';
    // Clear all Jest mocks (including call counts)
    jest.clearAllMocks();
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
      fireEvent.submit(input);

      await waitFor(() => {
        // Updated expectation to match actual error message
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
        expect(mockRouter.push).toHaveBeenCalledWith('/blog');
      });
    });
  });

  describe('Search', () => {
    it('displays search results', async () => {
      renderTerminal();
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'blog test' } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText('Test Post')).toBeInTheDocument();
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

  // Add tests for minimize/maximize/close if needed
  describe('Window Controls Integration', () => {
    it('minimizes the terminal', () => {
      // Get rerender function
      const { rerender } = renderTerminal();
      const minimizeButton = screen.getByRole('button', { name: /minimize/i });

      // Click minimize
      fireEvent.click(minimizeButton);

      // Force re-render to reflect state change in the mock
      rerender(
        <TerminalWindowStateProvider terminalId="test-terminal">
          <TerminalProvider>
            <Terminal />
          </TerminalProvider>
        </TerminalWindowStateProvider>
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });

    it('maximizes and restores the terminal', () => {
      const { rerender } = renderTerminal();
      const maximizeButton = screen.getByRole('button', { name: /maximize/i }); // Assuming this targets the correct button

      // Initial state check (optional but good practice)
      expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).toHaveClass('sm:max-w-3xl');
      expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).not.toHaveClass('sm:max-w-full');

      // Maximize
      fireEvent.click(maximizeButton);
      rerender(
        <TerminalWindowStateProvider terminalId="test-terminal">
          <TerminalProvider>
            <Terminal />
          </TerminalProvider>
        </TerminalWindowStateProvider>
      );
      // Assert maximized state: Check for fixed positioning and max-width override
      const maximizedElement = screen.getByText(/Welcome!/i).closest('div[class*="fixed"]'); // Find the outer div
      expect(maximizedElement).toHaveClass('fixed');
      expect(maximizedElement).toHaveClass('max-w-none'); // Key class for maximized state

      // Restore (click maximize again)
      fireEvent.click(maximizeButton);
       rerender(
        <TerminalWindowStateProvider terminalId="test-terminal">
          <TerminalProvider>
            <Terminal />
          </TerminalProvider>
        </TerminalWindowStateProvider>
      );
      // Assert restored (normal) state: Check for default max-width and absence of max-width override
      const restoredElement = screen.getByText(/Welcome!/i).closest('div[class*="max-w-"]'); // Find the outer div
      expect(restoredElement).toHaveClass('sm:max-w-3xl'); // Key class for normal state
      expect(restoredElement).not.toHaveClass('fixed');
      expect(restoredElement).not.toHaveClass('max-w-none'); // Ensure override is removed
    });

    it('closes the terminal', () => {
      const { rerender } = renderTerminal();
      const closeButton = screen.getByRole('button', { name: /close/i });

      // Click close
      fireEvent.click(closeButton);

      // Force re-render
      rerender(
        <TerminalWindowStateProvider terminalId="test-terminal">
          <TerminalProvider>
            <Terminal />
          </TerminalProvider>
        </TerminalWindowStateProvider>
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });
  });
});
