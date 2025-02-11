import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useTheme } from 'next-themes';
import { act } from '../../../lib/test/setup';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset mock between tests
    (useTheme as jest.Mock).mockReset();
  });

  it('cycles through themes correctly', async () => {
    const setTheme = jest.fn();

    // Start with system theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /toggle theme/i });

    // System -> Light
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(setTheme).toHaveBeenCalledWith('light');
    setTheme.mockClear();

    // Update mock for light theme and re-render
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Light -> Dark
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(setTheme).toHaveBeenCalledWith('dark');
    setTheme.mockClear();

    // Update mock for dark theme and re-render
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Dark -> System
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('respects system theme preference', () => {
    const setTheme = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'dark'
    });

    render(<ThemeToggle />);

    // Should show sun icon when system theme is dark
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
  });

  it('shows correct icon based on current theme', () => {
    const setTheme = jest.fn();

    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
  });

  it('displays correct title based on current theme', () => {
    const setTheme = jest.fn();

    // Test system theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toHaveAttribute('title', 'Current theme: system');

    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toHaveAttribute('title', 'Current theme: light');

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toHaveAttribute('title', 'Current theme: dark');
  });
});
