// __tests__/components/ui/copyCodeButton.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '../../../lib/test/setup';
import { CopyButton } from '../../../components/ui/copyButton';

describe('CopyButton', () => {
  const mockClipboard = {
    writeText: jest.fn()
  };

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true
    });
    mockClipboard.writeText.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders correctly', () => {
    render(<CopyButton content="test" />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('copies content and shows success state', async () => {
    mockClipboard.writeText.mockResolvedValueOnce(undefined);
    render(<CopyButton content="test" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(mockClipboard.writeText).toHaveBeenCalledWith('test');
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Copied!');
  });

  it('handles clipboard errors', async () => {
    mockClipboard.writeText.mockRejectedValueOnce(new Error('Failed'));
    render(<CopyButton content="test" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      // Let the error propagate
      await Promise.resolve();
    });

    expect(console.error).toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Copy code');
  });

  it('handles missing clipboard API', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
    render(<CopyButton content="test" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      // Let any error handling complete
      await Promise.resolve();
    });

    expect(console.error).toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Copy code');
  });
});
