import { render, fireEvent, screen } from '@testing-library/react';
import { ThemeToggle } from '@/components/ui/theme/theme-toggle';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    // Reset mock between tests
    (useTheme as jest.Mock).mockReset();
    mockSetTheme.mockClear();
  });

  it('cycles between light and dark themes correctly', () => {
    // Start with system theme resolving to light
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    const button = screen.getByRole('button');

    // System (light) -> Dark
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    // Update mock for dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Dark -> Light
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('light');

    // Update mock for light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    // Light -> Dark
    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('respects system theme preference for initial icon', () => {
    // System theme is dark
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
      systemTheme: 'dark'
    });

    render(<ThemeToggle />);

    // Should show sun icon when resolved theme is dark
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('moon-icon')).not.toBeInTheDocument();
  });

  it('shows correct icon based on resolved theme', () => {
    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
      systemTheme: 'light'
    });

    rerender(<ThemeToggle />);
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
  });

  it('displays correct title based on current and resolved theme', () => {
    // Test system theme (resolved light)
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);
    expect(screen.getByTitle('Current theme: system (Resolved: light)')).toBeInTheDocument();

    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      resolvedTheme: 'light',
      systemTheme: 'light'
    });

    rerender(<ThemeToggle />);
    expect(screen.getByTitle('Current theme: light (Resolved: light)')).toBeInTheDocument();

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      resolvedTheme: 'dark',
      systemTheme: 'light'
    });

    rerender(<ThemeToggle />);
    expect(screen.getByTitle('Current theme: dark (Resolved: dark)')).toBeInTheDocument();
  });
});
