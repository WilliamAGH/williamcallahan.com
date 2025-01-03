import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyButton } from '../../../components/ui/copy-button';

describe('CopyButton', () => {
  // Mock clipboard API
  const mockClipboard = {
    writeText: jest.fn()
  };
  Object.defineProperty(navigator, 'clipboard', {
    value: mockClipboard,
    writable: true
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockClipboard.writeText.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders with initial copy icon', () => {
      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      // Should show copy icon
      expect(button.querySelector('svg')).toHaveClass('text-gray-300');
      expect(button).toHaveAttribute('aria-label', 'Copy code');
    });

    it('has correct styling', () => {
      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      expect(button).toHaveClass(
        'absolute',
        'top-2',
        'right-2',
        'p-2',
        'rounded-lg',
        'bg-gray-700',
        'hover:bg-gray-600',
        'transition-colors'
      );
    });
  });

  describe('Copy Functionality', () => {
    it('copies content to clipboard on click', async () => {
      const content = 'test content';
      mockClipboard.writeText.mockResolvedValueOnce(undefined);

      render(<CopyButton content={content} />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(content);
    });

    it('shows success state after copying', async () => {
      mockClipboard.writeText.mockResolvedValueOnce(undefined);

      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      // Should show check icon
      expect(button.querySelector('svg')).toHaveClass('text-green-400');
      expect(button).toHaveAttribute('aria-label', 'Copied!');
    });

    it('reverts to initial state after timeout', async () => {
      mockClipboard.writeText.mockResolvedValueOnce(undefined);

      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      // Initially in success state
      expect(button.querySelector('svg')).toHaveClass('text-green-400');

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Should revert to copy icon
      expect(button.querySelector('svg')).toHaveClass('text-gray-300');
      expect(button).toHaveAttribute('aria-label', 'Copy code');
    });
  });

  describe('Error Handling', () => {
    it('handles clipboard errors gracefully', async () => {
      const error = new Error('Clipboard error');
      mockClipboard.writeText.mockRejectedValueOnce(error);

      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      // Should log error
      expect(console.error).toHaveBeenCalledWith('Failed to copy text:', error);

      // Should stay in initial state
      expect(button.querySelector('svg')).toHaveClass('text-gray-300');
      expect(button).toHaveAttribute('aria-label', 'Copy code');
    });

    it('stays in initial state if clipboard API is not available', async () => {
      // Remove clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true
      });

      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      await act(async () => {
        fireEvent.click(button);
      });

      // Should stay in initial state
      expect(button.querySelector('svg')).toHaveClass('text-gray-300');
      expect(button).toHaveAttribute('aria-label', 'Copy code');
    });
  });

  describe('Multiple Interactions', () => {
    it('handles rapid clicks correctly', async () => {
      // Mock clipboard API
      const clipboardPromise = Promise.resolve();
      mockClipboard.writeText.mockReturnValue(clipboardPromise);

      render(<CopyButton content="test content" />);
      const button = screen.getByRole('button');

      // First click and wait for state update
      await act(async () => {
        fireEvent.click(button);
        await clipboardPromise;
        // Ensure state updates are processed
        await new Promise(resolve => setImmediate(resolve));
      });

      // Should be in success state
      expect(button).toHaveAttribute('aria-label', 'Copied!');
      expect(button.querySelector('svg')).toHaveClass('text-green-400');

      // Second click before timeout
      await act(async () => {
        fireEvent.click(button);
        await clipboardPromise;
        // Ensure state updates are processed
        await new Promise(resolve => setImmediate(resolve));
      });

      // Should still be in success state
      expect(button).toHaveAttribute('aria-label', 'Copied!');
      expect(button.querySelector('svg')).toHaveClass('text-green-400');

      // Wait for timeout
      await act(async () => {
        jest.runAllTimers();
        // Ensure state updates are processed
        await new Promise(resolve => setImmediate(resolve));
      });

      // Should be back in initial state
      expect(button).toHaveAttribute('aria-label', 'Copy code');
      expect(button.querySelector('svg')).toHaveClass('text-gray-300');
    });
  });
});
