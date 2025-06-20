"use client";
/**
 * Theme Wrapper Client Component
 * @module components/features/investments/theme-wrapper.client
 * @description
 * Client component that handles theme context and passes theme state to child components.
 * This wrapper ensures theme-related hooks are only used in client components.
 */

import { useTheme } from "next-themes";
import type { ThemeWrapperProps } from "../../../types/investment";
import { InvestmentCardClient } from "./investment-card.client";

import type { JSX } from "react";

/**
 * Theme Wrapper Component
 * @param {ThemeWrapperProps} props - Component properties
 * @returns {JSX.Element} Wrapped investment card with theme context
 */
export function ThemeWrapper({ investment, logoData, renderedMetrics }: ThemeWrapperProps): JSX.Element {
  const { theme } = useTheme();
  const isDarkTheme = theme === "dark";

  return (
    <InvestmentCardClient
      {...investment}
      logoData={logoData}
      isDarkTheme={isDarkTheme}
      renderedMetrics={renderedMetrics}
    />
  );
}
