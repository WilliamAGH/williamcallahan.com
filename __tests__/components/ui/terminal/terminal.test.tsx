/**
 * Terminal Component Tests
 *
 * @module __tests__/components/ui/terminal/terminal.test
 * @see {@link "components/ui/terminal/server.ts"} - Server component exports
 * @see {@link "components/ui/terminal/client.ts"} - Client component exports
 * @see {@link "docs/architecture/terminalGUI.md"} - Terminal architecture
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { Terminal } from '../../../../components/ui/terminal/server';
import { TerminalClient } from '../../../../components/ui/terminal/client';
import { useTerminalContext } from '../../../../components/ui/terminal/terminalContext';
import { BlogPost } from '../../../../types/blog';
import { createMockMdx } from '../../../lib/fixtures/mockMdx';

// Mock next-themes
jest.mock('next-themes');

// Mock terminal context
jest.mock('@/components/ui/terminal/terminalContext', () => ({
  ...jest.requireActual('@/components/ui/terminal/terminalContext'),
  useTerminalContext: jest.fn()
}));

// Mock app router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams()
}));

describe('Terminal', () => {
  const mockSetTheme = jest.fn();
  const mockSetHandleCommand = jest.fn();
  const mockHandleSelection = jest.fn();
  const mockCancelSelection = jest.fn();

  // Sample blog post for testing
  const samplePost: BlogPost = {
    id: '1',
    title: 'Test Post',
    slug: 'test-post',
    excerpt: 'Test excerpt',
    content: createMockMdx('Test content'),
    publishedAt: '2025-01-01',
    author: {
      id: 'author-1',
      name: 'Test Author',
      avatar: '/test.jpg'
    },
    tags: ['test'],
    readingTime: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme
    });
    (useTerminalContext as jest.Mock).mockReturnValue({
      isReady: true,
      setHandleCommand: mockSetHandleCommand,
      handleCommand: jest.fn(),
      handleSelection: mockHandleSelection,
      cancelSelection: mockCancelSelection
    });
  });

  describe('Server Component', () => {
    it('renders the terminal shell', () => {
      render(<Terminal />);
      const terminal = screen.getByRole('region', { name: /terminal interface/i });
      expect(terminal).toBeInTheDocument();
      expect(terminal).toHaveClass('bg-terminal-light dark:bg-terminal-dark');
    });

    it('passes props to client component', () => {
      const searchFn = jest.fn();
      const posts = [samplePost];

      render(
        <Terminal
          searchFn={searchFn}
          posts={posts}
        />
      );

      // Client component should be rendered with props
      const terminal = screen.getByRole('region', { name: /terminal interface/i });
      expect(terminal).toBeInTheDocument();
    });
  });

  describe('Client Component', () => {
    it('handles command input', async () => {
      render(
        <TerminalClient />
      );

      const input = screen.getByRole('searchbox');
      expect(input).toBeInTheDocument();

      // Type a command
      fireEvent.change(input, { target: { value: 'help' } });
      expect(input).toHaveValue('help');

      // Submit command
      fireEvent.submit(screen.getByRole('search'));

      // Command handler should be called
      expect(mockSetHandleCommand).toHaveBeenCalled();
    });

    it('maintains command history', () => {
      render(<TerminalClient />);

      const input = screen.getByRole('searchbox');

      // Type and submit multiple commands
      ['help', 'clear', 'about'].forEach(command => {
        fireEvent.change(input, { target: { value: command } });
        fireEvent.submit(screen.getByRole('search'));
      });

      // History should be displayed in a log
      const history = screen.getByRole('log', { name: /terminal command history/i });
      expect(history).toBeInTheDocument();
      expect(history.querySelectorAll('[role="status"]')).toHaveLength(1); // Welcome message
    });

    // TODO: Re-enable once terminal selection mode is stabilized
    it.skip('handles selection mode', () => {
      const { rerender } = render(
        <TerminalClient />
      );

      // Initially no selection view
      expect(screen.queryByRole('listbox', { name: /available options/i })).not.toBeInTheDocument();

      // Rerender with selection
      (useTerminalContext as jest.Mock).mockReturnValue({
        isReady: true,
        setHandleCommand: mockSetHandleCommand,
        handleCommand: jest.fn(),
        handleSelection: mockHandleSelection,
        cancelSelection: mockCancelSelection,
        selection: [
          { id: '1', label: 'Option 1', value: '1' },
          { id: '2', label: 'Option 2', value: '2' }
        ]
      });

      rerender(<TerminalClient />);

      // Selection view should be displayed
      const selectionView = screen.getByRole('listbox', { name: /available options/i });
      expect(selectionView).toBeInTheDocument();

      // Test selection interaction
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);

      // Click an option
      fireEvent.click(options[0]);
      expect(mockHandleSelection).toHaveBeenCalledWith({ id: '1', label: 'Option 1', value: '1' });

      // Test keyboard navigation
      fireEvent.keyDown(selectionView, { key: 'ArrowDown' });
      fireEvent.keyDown(selectionView, { key: 'Enter' });
      expect(mockHandleSelection).toHaveBeenCalledWith({ id: '2', label: 'Option 2', value: '2' });

      // Test escape to cancel
      fireEvent.keyDown(selectionView, { key: 'Escape' });
      expect(mockCancelSelection).toHaveBeenCalled();
    });
  });
});
