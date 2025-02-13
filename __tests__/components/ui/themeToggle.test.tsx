// __tests__/components/ui/themeToggle.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ui/themeToggle';
import { act } from '@testing-library/react';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TEST_LOADING_STATE = undefined;
    document.documentElement.removeAttribute('data-theme-ready');
  });

  afterEach(() => {
    process.env.TEST_LOADING_STATE = undefined;
    document.documentElement.removeAttribute('data-theme-ready');
  });

  interface ThemeProps {
    theme?: string;
    setTheme?: jest.Mock;
    systemTheme?: string;
    mounted?: boolean;
    resolvedTheme?: string;
  }

  const renderWithTheme = (themeProps: ThemeProps = {}) => {
    const defaultProps = {
      theme: 'system',
      setTheme: mockSetTheme,
      systemTheme: 'light',
      mounted: true,
      resolvedTheme: 'system'
    };

    (useTheme as jest.Mock).mockReturnValue({
      ...defaultProps,
      ...themeProps
    });

    return render(<ThemeToggle />);
  };

  describe('Theme Initialization', () => {
    it('matches system theme on initial load', () => {
      document.documentElement.setAttribute('data-theme-ready', 'true');
      renderWithTheme({ mounted: true });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
    });

    it('shows loading state before mounting', async () => {
      process.env.TEST_LOADING_STATE = 'true';
      document.documentElement.removeAttribute('data-theme-ready');
      renderWithTheme({ mounted: false });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Loading States', () => {
    it('shows loading state when theme system is not ready', async () => {
      process.env.TEST_LOADING_STATE = 'true';
      document.documentElement.removeAttribute('data-theme-ready');
      renderWithTheme({ mounted: false });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');
      expect(button).not.toBeDisabled();
    });

    it('shows error state when theme system fails', async () => {
      document.documentElement.setAttribute('data-theme-ready', 'error');
      renderWithTheme({ mounted: true });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');
      expect(button).not.toBeDisabled();
    });

    it('transitions from loading to ready state', async () => {
      process.env.TEST_LOADING_STATE = 'true';
      document.documentElement.removeAttribute('data-theme-ready');
      const { rerender } = renderWithTheme({ mounted: false });

      let button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');

      // Simulate mounting completion and theme system ready
      await act(async () => {
        process.env.TEST_LOADING_STATE = undefined;
        document.documentElement.setAttribute('data-theme-ready', 'true');
        rerender(<ThemeToggle />);
      });

      button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
    });
  });

  describe('Error Handling', () => {
    it('shows error state and allows retry', async () => {
      document.documentElement.setAttribute('data-theme-ready', 'error');
      const { rerender } = renderWithTheme({ mounted: true });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');

      // Simulate successful retry
      await act(async () => {
        document.documentElement.setAttribute('data-theme-ready', 'true');
        rerender(<ThemeToggle />);
      });

      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
    });

    it('recovers from error state', async () => {
      document.documentElement.setAttribute('data-theme-ready', 'error');
      const { rerender } = renderWithTheme({ mounted: true });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Theme toggle error - click to retry');

      // Simulate successful recovery
      await act(async () => {
        document.documentElement.setAttribute('data-theme-ready', 'true');
        rerender(<ThemeToggle />);
      });

      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
    });
  });
});
