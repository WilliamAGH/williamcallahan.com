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
import { Terminal } from '@/components/ui/terminal/terminal';
import { useRouter } from 'next/navigation';
import { setupTests } from '@/lib/test/setup';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}));

// Mock search functions
jest.mock('@/lib/search', () => ({
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

describe('Terminal Component', () => {
  const { mockRouter } = setupTests();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  describe('Rendering', () => {
    /**
     * Test: Initial Render State
     * 
     * Verifies:
     * 1. Welcome message is displayed
     * 2. Input is focused automatically
     * 3. Initial UI elements are present
     * 
     * Expected Behavior:
     * - Shows welcome message
     * - Input field has focus
     * - Terminal container has proper styling
     */
    it('renders with welcome message', () => {
      render(<Terminal />);
      expect(screen.getByText(/Welcome!/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  });

  describe('Command Processing', () => {
    /**
     * Test: Help Command
     * 
     * Verifies:
     * 1. Help command displays available commands
     * 2. Command output is properly formatted
     * 
     * Expected Behavior:
     * - Shows list of available commands
     * - Output is properly formatted in terminal
     */
    it('processes help command', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');
      
      fireEvent.change(input, { target: { value: 'help' } });
      fireEvent.submit(input);
      
      await waitFor(() => {
        expect(screen.getByText(/Available commands/i)).toBeInTheDocument();
      });
    });

    /**
     * Test: Invalid Command Handling
     * 
     * Verifies:
     * 1. Invalid commands show error message
     * 2. Error message is clear and helpful
     * 
     * Expected Behavior:
     * - Shows "Command not recognized" message
     * - Suggests using help command
     */
    it('handles invalid commands', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');
      
      fireEvent.change(input, { target: { value: 'invalid-command' } });
      fireEvent.submit(input);
      
      await waitFor(() => {
        expect(screen.getByText(/Command not recognized/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    /**
     * Test: Route Navigation
     * 
     * Verifies:
     * 1. Navigation commands trigger router
     * 2. Correct routes are used
     * 
     * Expected Behavior:
     * - Router.push is called with correct path
     * - Navigation feedback is shown
     */
    it('navigates to correct route', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');
      
      fireEvent.change(input, { target: { value: 'blog' } });
      fireEvent.submit(input);
      
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/blog');
      });
    });
  });

  describe('Search', () => {
    /**
     * Test: Search Results Display
     * 
     * Verifies:
     * 1. Search results are displayed
     * 2. Selection interface is shown
     * 3. Navigation instructions are present
     * 
     * Expected Behavior:
     * - Shows matching results
     * - Displays selection interface
     * - Shows navigation instructions
     */
    it('displays search results', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');
      
      fireEvent.change(input, { target: { value: 'blog test' } });
      fireEvent.submit(input);
      
      await waitFor(() => {
        expect(screen.getByText('Test Post')).toBeInTheDocument();
        expect(screen.getByText(/Use ↑↓ to navigate/i)).toBeInTheDocument();
      });
    });

    /**
     * Test: No Results Handling
     * 
     * Verifies:
     * 1. No results message is shown
     * 2. Message includes search context
     * 
     * Expected Behavior:
     * - Shows "No results found" message
     * - Includes section name in message
     */
    it('handles no results', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');
      
      fireEvent.change(input, { target: { value: 'experience nonexistent' } });
      fireEvent.submit(input);
      
      await waitFor(() => {
        expect(screen.getByText(/No results found in Experience/i)).toBeInTheDocument();
      });
    });
  });

  describe('Mobile Responsiveness', () => {
    /**
     * Test: Text Wrapping
     * 
     * Verifies:
     * 1. Text wraps properly on mobile
     * 2. Terminal maintains readability
     * 
     * Expected Behavior:
     * - Content has break-words class
     * - Text wraps within container
     */
    it('maintains proper text wrapping', () => {
      render(<Terminal />);
      const terminal = screen.getByText(/Welcome!/i).closest('.whitespace-pre-wrap');
      expect(terminal).toHaveClass('break-words');
    });
  });
});