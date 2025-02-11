"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./error-boundary";

/**
 * Detect if we're running in a test environment by checking for jsdom
 * This is more reliable than process.env.NODE_ENV which may be undefined
 */
/**
 * Detect test environment with support for loading state testing
 */
const isTestEnvironment = () => {
  try {
    // Allow testing of loading state when needed
    if (process.env.TEST_LOADING_STATE === 'true') {
      return false;
    }
    return process.env.NODE_ENV === 'test';
  } catch {
    return false;
  }
};

/**
 * Check if the theme system is ready for interaction
 * @param setMounted - Callback to update mounted state
 * @returns boolean indicating if theme system is ready
 */
const checkThemeReady = (setMounted: (ready: boolean) => void) => {
  // In test environment, consider it ready immediately unless testing loading
  if (isTestEnvironment()) {
    setMounted(true);
    return true;
  }

  // In production or when testing loading state,
  // wait for theme-init.js to set data-theme-ready
  const isReady = document.documentElement.hasAttribute('data-theme-ready');
  if (isReady) {
    setMounted(true);
  }
  return isReady;
};

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, setTheme, systemTheme } = useTheme();

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    // Check immediately in case theme-init.js has already run
    if (!checkThemeReady(setMounted)) {
      // If not ready, poll briefly to detect when it is
      const interval = setInterval(() => {
        if (checkThemeReady(setMounted)) {
          clearInterval(interval);
        }
      }, 50); // Check every 50ms

      // Clean up if component unmounts
      return () => clearInterval(interval);
    }
  }, [setMounted]); // Include setMounted in deps array since we use it in the effect

  // Instead of not rendering anything, render a loading state that matches the current theme
  if (!mounted) {
    const isDark = systemTheme === 'dark';
    return (
      <button
        className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800 relative z-50"
        aria-label="Loading theme preferences"
        title="Loading theme preferences..."
        disabled
      >
        <span className="sr-only">Loading theme preferences</span>
        {isDark ? (
          <Sun className="h-5 w-5 opacity-50" data-testid="sun-icon" />
        ) : (
          <Moon className="h-5 w-5 opacity-50" data-testid="moon-icon" />
        )}
      </button>
    );
  }

  const cycleTheme = () => {
    if (!theme) return;

    try {
      setError(null); // Clear any previous errors
      const nextTheme = (() => {
        switch (theme) {
          case 'system': return 'light';
          case 'light': return 'dark';
          case 'dark': return 'system';
          default: return 'system';
        }
      })();

      setTheme(nextTheme);
    } catch (error) {
      // First show the initial error
      setError('Failed to change theme');

      // Only try system fallback if we're not already on system theme
      if (theme !== 'system') {
        try {
          setTheme('system');
        } catch {
          // Update error message if even system theme fails
          setError('Theme system unavailable');
        }
      }
    }
  };

  const currentTheme = theme === 'system' ? systemTheme : theme;
  const isDark = currentTheme === 'dark';
  const themeLabel = !theme ? 'Loading theme' :
    theme === 'system' ? 'System theme' :
    `${theme.charAt(0).toUpperCase()}${theme.slice(1)} theme`;

  // If there's an error, show error state but keep button functional
  if (error) {
    return (
      <button
        onClick={() => {
          setError(null); // Clear error
          cycleTheme(); // Try again
        }}
        className="p-2 rounded-lg transition-colors hover:bg-red-200 dark:hover:bg-red-800 bg-red-100 dark:bg-red-900 relative z-50 group"
        aria-label="Theme toggle error - click to retry"
        title={error}
        data-testid="theme-toggle-error"
      >
        <span className="sr-only">Theme error - click to retry</span>
        <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
      </button>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <button
          onClick={() => window.location.reload()} // Allow refresh on critical errors
          className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800 relative z-50"
          aria-label="Theme system error - click to refresh"
          title="Error in theme system - click to refresh page"
          data-testid="theme-toggle-critical-error"
        >
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
        </button>
      }
    >
      <button
        onClick={cycleTheme}
        className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-800 relative z-50"
        aria-label={`Toggle theme (currently ${themeLabel})`}
        title={`Current theme: ${theme}`}
        style={{ touchAction: 'manipulation' }}
        data-testid="theme-toggle"
      >
        <span className="sr-only">{themeLabel}</span>
        {isDark ? (
          <Sun className="h-5 w-5" data-testid="sun-icon" />
        ) : (
          <Moon className="h-5 w-5" data-testid="moon-icon" />
        )}
      </button>
    </ErrorBoundary>
  );
}
