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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Terminal } from '../../../../components/ui/terminal/terminal';
import { TerminalProvider } from '../../../../components/ui/terminal/terminalContext';
import { useRouter } from 'next/navigation';
import { setupTests } from '../../../../lib/test/setup';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}));

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

// Helper function to render with provider
const renderTerminal = () => {
  return render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>
  );
};

describe('Terminal Component', () => {
  const { mockRouter } = setupTests();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
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
    it('minimizes the terminal', async () => {
      renderTerminal();
      const minimizeButton = screen.getByRole('button', { name: /minimize/i });
      fireEvent.click(minimizeButton);

      // Wait for the minimized view to appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument();
      });

      // Verify the main terminal content is gone (or check for specific minimized state class/element)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('maximizes and restores the terminal', async () => {
      renderTerminal();
      const maximizeButton = screen.getByRole('button', { name: /maximize/i });

      // Maximize
      fireEvent.click(maximizeButton);
      await waitFor(() => {
        // Check if the maximized class 'sm:max-w-full' is applied
        expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).toHaveClass('sm:max-w-full');
        expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).not.toHaveClass('sm:max-w-3xl'); // Ensure normal class is removed
      });

      // Restore (click maximize again)
      fireEvent.click(maximizeButton);
      await waitFor(() => {
        // Check if the normal class 'sm:max-w-3xl' is applied
        expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).toHaveClass('sm:max-w-3xl');
        expect(screen.getByText(/Welcome!/i).closest('[class*="max-w-"]')).not.toHaveClass('sm:max-w-full'); // Ensure maximized class is removed
      });
    });

    it('closes the terminal', async () => {
      renderTerminal();
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Wait for the component to potentially unmount or render null
      await waitFor(() => {
         // Check that core elements are no longer present
         expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
         expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
      });

      // Or, if the parent controls rendering based on context state,
      // you might need a different approach depending on where the state lives.
    });
  });
});
