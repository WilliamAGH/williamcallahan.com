import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useTheme } from 'next-themes';
import { act } from '../../../lib/test/setup';
import { setupThemeReadiness } from '../../../__tests__/lib/setup/theme';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset mocks between tests
    (useTheme as jest.Mock).mockReset();
    jest.useFakeTimers();
    setupThemeReadiness(false); // Default to light theme
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  const getThemeButton = () => screen.getByRole('button', { name: /toggle theme/i });
  const getLoadingButton = () => screen.getByRole('button', { name: 'Loading theme preferences', hidden: true });
  const getErrorButton = () => screen.getByRole('button', { name: /theme toggle error/i });

  describe('Theme Initialization', () => {
    it('matches system theme on initial load', async () => {
      setupThemeReadiness(true); // Set system theme to dark

      (useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        setTheme: jest.fn(),
        systemTheme: 'dark'
      });

      render(<ThemeToggle />);

      const button = getThemeButton();
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    });

    it('persists theme choice across remounts', async () => {
      const setTheme = jest.fn();

      // Initial render with light theme
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme,
        systemTheme: 'dark' // System prefers dark
      });

      const { unmount } = render(<ThemeToggle />);

      // Change to dark theme
      const button = getThemeButton();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });
      expect(setTheme).toHaveBeenCalledWith('dark');

      // Unmount
      unmount();

      // Fresh render with persisted dark theme
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'dark',
        setTheme,
        systemTheme: 'dark'
      });
      render(<ThemeToggle />);

      // Should show correct theme state
      const remountedButton = getThemeButton();
      expect(remountedButton).toHaveAttribute('aria-label', 'Toggle theme (currently Dark theme)');
      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    });

    it('updates when system theme changes', async () => {
      const setTheme = jest.fn();

      // Initial render with light system theme
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        setTheme,
        systemTheme: 'light'
      });

      const { unmount } = render(<ThemeToggle />);

      // Initially light theme
      const initialButton = getThemeButton();
      expect(initialButton).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();

      // Cleanup first render
      unmount();

      // Fresh render with dark system theme
      setupThemeReadiness(true);
      (useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        setTheme,
        systemTheme: 'dark'
      });
      render(<ThemeToggle />);

      // Should update to dark theme
      const updatedButton = getThemeButton();
      expect(updatedButton).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    // Enable loading state testing and ensure theme is not ready
    process.env.TEST_LOADING_STATE = 'true';
    document.documentElement.removeAttribute('data-theme-ready');

    (useTheme as jest.Mock).mockReturnValue({
      theme: undefined,
      setTheme: jest.fn(),
      systemTheme: 'light'
    });

    render(<ThemeToggle />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', 'Loading theme preferences');
    expect(button).toHaveAttribute('title', 'Loading theme preferences...');

    // Reset for other tests
    process.env.TEST_LOADING_STATE = undefined;
    document.documentElement.setAttribute('data-theme-ready', 'true');
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

    const button = getThemeButton();
    expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');

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

    const lightButton = getThemeButton();
    expect(lightButton).toHaveAttribute('aria-label', 'Toggle theme (currently Light theme)');

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

    const darkButton = getThemeButton();
    expect(darkButton).toHaveAttribute('aria-label', 'Toggle theme (currently Dark theme)');

    // Dark -> System
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('respects system theme preference', async () => {
    setupThemeReadiness(true); // Set system theme to dark

    const setTheme = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'dark'
    });

    render(<ThemeToggle />);

    // Should show sun icon when system theme is dark
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    const button = getThemeButton();
    expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
  });

  it('shows correct icon based on current theme', async () => {
    const setTheme = jest.fn();

    // Test light theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light'
    });

    const { rerender } = render(<ThemeToggle />);

    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    const lightButton = getThemeButton();
    expect(lightButton).toHaveAttribute('aria-label', 'Toggle theme (currently Light theme)');

    // Test dark theme
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'light'
    });
    rerender(<ThemeToggle />);

    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
    const darkButton = getThemeButton();
    expect(darkButton).toHaveAttribute('aria-label', 'Toggle theme (currently Dark theme)');
  });

  describe('Error Handling', () => {
    it('shows initial error without system fallback when already in system theme', async () => {
      const setTheme = jest.fn().mockImplementation(() => {
        throw new Error('Theme error');
      });

      (useTheme as jest.Mock).mockReturnValue({
        theme: 'system',
        setTheme,
        systemTheme: 'light'
      });

      render(<ThemeToggle />);

      const button = getThemeButton();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });

      // Should show error state without attempting system fallback
      const errorButton = getErrorButton();
      expect(errorButton).toHaveAttribute('title', 'Failed to change theme');
      expect(setTheme).toHaveBeenCalledTimes(1); // No fallback attempt
    });

    it('attempts system fallback when not in system theme', async () => {
      const setTheme = jest.fn()
        .mockImplementationOnce(() => { throw new Error('Theme error'); }) // Initial change fails
        .mockImplementationOnce(() => {}); // System fallback succeeds

      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme,
        systemTheme: 'light'
      });

      render(<ThemeToggle />);

      const button = getThemeButton();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });

      // Should show initial error and attempt system fallback
      expect(setTheme).toHaveBeenCalledTimes(2);
      expect(setTheme).toHaveBeenNthCalledWith(1, 'dark'); // Initial attempt
      expect(setTheme).toHaveBeenNthCalledWith(2, 'system'); // Fallback
    });

    it('shows system unavailable error when fallback fails', async () => {
      const setTheme = jest.fn()
        .mockImplementation(() => { throw new Error('Theme error'); }); // All attempts fail

      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme,
        systemTheme: 'light'
      });

      render(<ThemeToggle />);

      const button = getThemeButton();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });

      // Should show critical error after both attempts fail
      const errorButton = getErrorButton();
      expect(errorButton).toHaveAttribute('title', 'Theme system unavailable');
      expect(setTheme).toHaveBeenCalledTimes(2); // Initial + fallback attempt
    });

    it('recovers from error state on retry', async () => {
      const setTheme = jest.fn()
        .mockImplementationOnce(() => { throw new Error('Theme error'); })
        .mockImplementationOnce(() => {}); // Retry succeeds

      (useTheme as jest.Mock).mockReturnValue({
        theme: 'light',
        setTheme,
        systemTheme: 'light'
      });

      render(<ThemeToggle />);

      // First click causes error
      const button = getThemeButton();
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });

      // Click error button to retry
      const errorButton = getErrorButton();
      await act(async () => {
        fireEvent.click(errorButton);
        await Promise.resolve();
      });

      // Should return to normal state
      expect(screen.queryByRole('button', { name: /theme toggle error/i })).not.toBeInTheDocument();
      const recoveredButton = getThemeButton();
      expect(recoveredButton).toHaveAttribute('aria-label', 'Toggle theme (currently Light theme)');
    });
  });
});
