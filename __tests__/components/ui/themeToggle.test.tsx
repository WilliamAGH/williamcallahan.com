// __tests__/components/ui/themeToggle.test.tsx

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ui/themeToggle';
import { act } from '@testing-library/react';
import { THEMES } from '@/types/theme';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('ThemeToggle', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    cleanup();
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
      theme: THEMES.SYSTEM,
      setTheme: mockSetTheme,
      systemTheme: THEMES.LIGHT,
      mounted: true,
      resolvedTheme: THEMES.SYSTEM
    };

    (useTheme as jest.Mock).mockReturnValue({
      ...defaultProps,
      ...themeProps
    });

    return render(<ThemeToggle />);
  };

  describe('Theme Initialization', () => {
    it('shows light theme by default before mounting', () => {
      renderWithTheme({ mounted: false });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently System theme)');
      const sun = screen.getByTestId('sun-icon');
      expect(sun).toHaveClass('rotate-0', 'scale-100');
    });

    it('updates theme after mounting', () => {
      renderWithTheme({ mounted: true, theme: THEMES.DARK });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently Dark theme)');
      const moon = screen.getByTestId('moon-icon');
      expect(moon).toHaveClass('rotate-0', 'scale-100');
    });
  });

  describe('Theme Switching', () => {
    it('cycles through themes correctly', () => {
      // Test light to dark
      renderWithTheme({ theme: THEMES.LIGHT });
      let button = screen.getByRole('button');
      fireEvent.click(button);
      expect(mockSetTheme).toHaveBeenCalledWith(THEMES.DARK);

      // Test dark to system
      cleanup();
      mockSetTheme.mockClear();
      renderWithTheme({ theme: THEMES.DARK });
      button = screen.getByRole('button');
      fireEvent.click(button);
      expect(mockSetTheme).toHaveBeenCalledWith(THEMES.SYSTEM);

      // Test system to light
      cleanup();
      mockSetTheme.mockClear();
      renderWithTheme({ theme: THEMES.SYSTEM });
      button = screen.getByRole('button');
      fireEvent.click(button);
      expect(mockSetTheme).toHaveBeenCalledWith(THEMES.LIGHT);
    });

    it('responds to system theme changes', () => {
      // Test light system theme
      renderWithTheme({
        theme: THEMES.SYSTEM,
        systemTheme: THEMES.LIGHT
      });
      expect(screen.getByTestId('sun-icon')).toHaveClass('rotate-0', 'scale-100');
      expect(screen.getByTestId('moon-icon')).toHaveClass('-rotate-90', 'scale-0');

      // Test dark system theme
      cleanup();
      renderWithTheme({
        theme: THEMES.SYSTEM,
        systemTheme: THEMES.DARK
      });
      expect(screen.getByTestId('sun-icon')).toHaveClass('-rotate-90', 'scale-0');
      expect(screen.getByTestId('moon-icon')).toHaveClass('rotate-0', 'scale-100');
    });
  });

  describe('Accessibility', () => {
    it('provides correct aria labels', () => {
      renderWithTheme({ theme: THEMES.LIGHT });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Toggle theme (currently Light theme)');
      expect(button).toHaveAttribute('title', 'Switch to dark theme');
    });

    it('responds to keyboard events', () => {
      renderWithTheme({ theme: THEMES.LIGHT });
      const button = screen.getByRole('button');

      // Test Enter key
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(mockSetTheme).toHaveBeenCalledWith(THEMES.DARK);

      // Test Space key
      mockSetTheme.mockClear();
      fireEvent.keyDown(button, { key: ' ' });
      expect(mockSetTheme).toHaveBeenCalledWith(THEMES.DARK);

      // Test other keys (should not trigger theme change)
      mockSetTheme.mockClear();
      fireEvent.keyDown(button, { key: 'Tab' });
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });
});
