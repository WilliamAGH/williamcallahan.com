import { render, act } from '@testing-library/react';
import { ThemeProvider } from '@/app/clientComponents/providers/themeProvider';
import { THEME_CONFIG, THEME_COLORS, THEMES } from '@/types/theme';

describe('ThemeProvider', () => {
  let matchMedia: jest.SpyInstance;
  let localStorage: jest.SpyInstance;

  beforeEach(() => {
    // Mock matchMedia
    matchMedia = jest.spyOn(window, 'matchMedia');
    matchMedia.mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));

    // Mock localStorage
    localStorage = jest.spyOn(window.localStorage, 'getItem');
    localStorage.mockReturnValue(null);

    // Clean up any existing theme state
    document.documentElement.classList.remove('dark');
    document.documentElement.style.removeProperty(THEME_CONFIG.CSS_VARS.BACKGROUND);
    document.documentElement.style.removeProperty(THEME_CONFIG.CSS_VARS.FOREGROUND);
  });

  afterEach(() => {
    matchMedia.mockRestore();
    localStorage.mockRestore();
  });

  it('should apply light theme colors by default', () => {
    render(
      <ThemeProvider>
        <div>Test content</div>
      </ThemeProvider>
    );

    // Allow effects to run
    act(() => {
      jest.runAllTimers();
    });

    // Verify light theme colors are applied
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.LIGHT.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND))
      .toBe(THEME_COLORS.LIGHT.FOREGROUND);
  });

  it('should apply dark theme colors when system prefers dark', () => {
    // Mock system dark mode preference
    matchMedia.mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));

    render(
      <ThemeProvider>
        <div>Test content</div>
      </ThemeProvider>
    );

    // Allow effects to run
    act(() => {
      jest.runAllTimers();
    });

    // Verify dark theme colors are applied
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.DARK.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND))
      .toBe(THEME_COLORS.DARK.FOREGROUND);
  });

  it('should update colors when theme changes', () => {
    const { rerender } = render(
      <ThemeProvider defaultTheme={THEMES.LIGHT}>
        <div>Test content</div>
      </ThemeProvider>
    );

    // Allow initial effects to run
    act(() => {
      jest.runAllTimers();
    });

    // Verify initial light theme
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.LIGHT.BACKGROUND);

    // Change to dark theme
    rerender(
      <ThemeProvider defaultTheme={THEMES.DARK}>
        <div>Test content</div>
      </ThemeProvider>
    );

    // Allow update effects to run
    act(() => {
      jest.runAllTimers();
    });

    // Verify dark theme colors are applied
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.DARK.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND))
      .toBe(THEME_COLORS.DARK.FOREGROUND);
  });

  it('should handle system theme changes', () => {
    // Start with system light mode
    matchMedia.mockImplementation(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    render(
      <ThemeProvider defaultTheme={THEMES.SYSTEM}>
        <div>Test content</div>
      </ThemeProvider>
    );

    // Allow initial effects to run
    act(() => {
      jest.runAllTimers();
    });

    // Verify light theme colors
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.LIGHT.BACKGROUND);

    // Change system preference to dark
    matchMedia.mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    // Simulate media query change
    act(() => {
      window.dispatchEvent(new Event('change'));
      jest.runAllTimers();
    });

    // Verify dark theme colors are applied
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.BACKGROUND))
      .toBe(THEME_COLORS.DARK.BACKGROUND);
    expect(document.documentElement.style.getPropertyValue(THEME_CONFIG.CSS_VARS.FOREGROUND))
      .toBe(THEME_COLORS.DARK.FOREGROUND);
  });
});
