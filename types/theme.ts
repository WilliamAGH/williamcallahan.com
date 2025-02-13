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
  /** Data attribute used to indicate theme system ready state */
  DATA_ATTRIBUTE: 'data-theme-ready',
  /** Default theme when no preference is stored */
  DEFAULT_THEME: THEMES.SYSTEM,
  /** HTML attribute used by next-themes to apply theme */
  ATTRIBUTE: 'class',
  /** Whether to disable transitions during theme changes */
  DISABLE_TRANSITIONS: true,
  /** Whether to enable system theme detection */
  ENABLE_SYSTEM: true
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