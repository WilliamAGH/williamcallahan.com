/**
 * Theme System Types and Constants
 *
 * This module provides the core types and constants for the application's theme system.
 * It works in conjunction with next-themes and our custom theme components:
 *
 * Related files:
 * - {@link ../app/client-components/providers/theme-provider.tsx Theme Provider}
 * - {@link ../app/client-components/theme/theme-initializer.tsx Theme Initializer}
 * - {@link ../components/ui/theme-toggle.tsx Theme Toggle}
 *
 * @module types/theme
 */

import type { ThemeProviderProps } from "next-themes/dist/types";

/**
 * Media query for system dark mode preference
 */
export const DARK_SCHEME = '(prefers-color-scheme: dark)';

/**
 * Theme color configuration
 */
export const THEME_COLORS = {
  LIGHT: {
    BACKGROUND: 'rgb(255, 255, 255)',
    FOREGROUND: 'rgb(10, 10, 10)'
  },
  DARK: {
    BACKGROUND: 'rgb(10, 10, 10)',
    FOREGROUND: 'rgb(255, 255, 255)'
  }
} as const;

/**
 * Available theme options for the application
 *
 * @remarks
 * - 'light' - Forces light theme
 * - 'dark' - Forces dark theme
 * - 'system' - Follows system preferences
 */
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
} as const;

/**
 * Type representing valid theme values
 * @type {('light' | 'dark' | 'system')}
 */
export type Theme = typeof THEMES[keyof typeof THEMES];

/**
 * Theme system configuration constants
 *
 * @remarks
 * These values are used across the theme system components to ensure consistency
 * in how themes are stored, applied, and initialized.
 */
export const THEME_CONFIG = {
  /** Key used in localStorage for theme preference */
  STORAGE_KEY: 'theme',
  /** CSS variables for theme colors */
  CSS_VARS: {
    /** Background color variable */
    BACKGROUND: '--background',
    /** Foreground (text) color variable */
    FOREGROUND: '--foreground',
    /** Theme transition duration */
    TRANSITION_DURATION: '--theme-transition-duration',
    /** Theme transition timing function */
    TRANSITION_TIMING: '--theme-transition-timing'
  },
  /** Data attributes used to indicate theme system state */
  DATA_ATTRIBUTES: {
    /** Theme system is ready for initial render */
    READY: 'data-theme-ready',
    /** Theme system is fully loaded after hydration */
    LOADED: 'data-theme-loaded',
    /** System preference was detected */
    SYSTEM_DETECTED: 'data-system-theme-detected'
  },
  /** Default theme when no preference is stored or localStorage is unavailable */
  DEFAULT_THEME: THEMES.SYSTEM,
  /** Fallback theme if system preference detection fails */
  FALLBACK_THEME: THEMES.LIGHT,
  /** HTML attribute used by next-themes to apply theme */
  ATTRIBUTE: 'class',
  /** Whether to disable transitions during theme changes */
  DISABLE_TRANSITIONS: true,
  /** Whether to enable system theme detection */
  ENABLE_SYSTEM: true,
  /** Transition configuration */
  TRANSITIONS: {
    /** Default transition duration in milliseconds */
    DURATION: 150,
    /** Mobile transition duration in milliseconds */
    MOBILE_DURATION: 100,
    /** Transition timing function */
    TIMING: 'ease-out'
  }
} as const;

/**
 * Theme provider configuration props
 *
 * @extends ThemeProviderProps from next-themes
 *
 * @example
 * ```tsx
 * import { ThemeProvider } from '@/app/client-components/providers/theme-provider';
 *
 * function App({ children }) {
 *   return (
 *     <ThemeProvider
 *       disableTransitionOnChange={true}
 *       storageKey="my-theme-key"
 *     >
 *       {children}
 *     </ThemeProvider>
 *   );
 * }
 * ```
 */
export interface ThemeConfig extends ThemeProviderProps {
  /** Whether to disable CSS transitions during theme changes */
  disableTransitionOnChange?: boolean;
  /** Key used to store theme preference in localStorage */
  storageKey?: string;
}
