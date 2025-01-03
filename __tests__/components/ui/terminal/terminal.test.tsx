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

describe('Terminal Component', () => {
  const { mockRouter } = setupTests();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  describe('Rendering', () => {
    it('renders with welcome message', () => {
      render(<Terminal />);
      expect(screen.getByText(/Welcome!/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  });

  describe('Command Processing', () => {
    it('processes help command', async () => {
      render(<Terminal />);
      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 'help' } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText(/Available commands/i)).toBeInTheDocument();
      });
    });

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
    it('maintains proper text wrapping', () => {
      render(<Terminal />);
      const terminal = screen.getByText(/Welcome!/i).closest('.whitespace-pre-wrap');
      expect(terminal).toHaveClass('break-words');
    });
  });
});
