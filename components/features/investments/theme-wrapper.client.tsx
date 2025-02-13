"use client";

/**
 * Theme Wrapper Client Component
 * @module components/features/investments/theme-wrapper.client
 * @description
 * Client component that handles theme context and passes theme state to child components.
 * This wrapper ensures theme-related hooks are only used in client components.
 */

import { useTheme } from "next-themes";
import type { Investment } from "../../../types/investment";
import { InvestmentCardClient } from "./investment-card.client";
import type { LogoData } from "../../../types/logo";

/**
 * Props for the ThemeWrapper component
 * @interface
 */
interface ThemeWrapperProps {
  /** Investment data to display */
  investment: Investment;
  /** Pre-fetched logo data from server */
  logoData: LogoData;
}

/**
 * Theme Wrapper Component
 * @param {ThemeWrapperProps} props - Component properties
 * @returns {JSX.Element} Wrapped investment card with theme context
 */
export function ThemeWrapper({ investment, logoData }: ThemeWrapperProps): JSX.Element {
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';

  return (
    <InvestmentCardClient
      {...investment}
      logoData={logoData}
      isDarkTheme={isDarkTheme}
    />
  );
}
