import { render, fireEvent, screen } from '@testing-library/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset mock between tests
    (useTheme as jest.Mock).mockReset();
  });

  it('cycles through themes correctly', () => {
    const setTheme = jest.fn();

    // Start with system theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    const button = screen.getByRole('button');

    // System -> Light
    fireEvent.click(button);
    expect(setTheme).toHaveBeenCalledWith('light');

    // Update mock for light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Light -> Dark
    fireEvent.click(button);
    expect(setTheme).toHaveBeenCalledWith('dark');

    // Update mock for dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Dark -> System
    fireEvent.click(button);
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
    expect(screen.getByTitle('Current theme: system')).toBeInTheDocument();

    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });

    rerender(<ThemeToggle />);
    expect(screen.getByTitle('Current theme: light')).toBeInTheDocument();

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });

    rerender(<ThemeToggle />);
    expect(screen.getByTitle('Current theme: dark')).toBeInTheDocument();
  });
});
